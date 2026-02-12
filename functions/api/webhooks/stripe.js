import { jsonNoStore } from "../_lib/security.js";

const encoder = new TextEncoder();
const STRIPE_TOLERANCE_SECONDS = 300;

function hexToBytes(hex) {
  if (!hex || hex.length % 2) return new Uint8Array();
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function hmacHexBytes(secret, bytes) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, bytes);
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function concatBytes(a, b) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function parseSignatureHeader(sigHeader) {
  const parsed = { t: null, v1: [] };
  for (const part of String(sigHeader || "").split(",")) {
    const [kRaw, ...vParts] = part.split("=");
    if (!kRaw || !vParts.length) continue;
    const k = kRaw.trim();
    const v = vParts.join("=").trim();
    if (k === "t") parsed.t = v;
    if (k === "v1") parsed.v1.push(v);
  }
  return parsed;
}

function supabaseHeaders(serviceRoleKey, extra = {}) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    ...extra,
  };
}

async function safeJson(res) {
  try {
    return await res.json();
  } catch (_) {
    return null;
  }
}

async function insertProcessingEvent(SUPABASE_URL, SRV, eventId) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/processed_events?on_conflict=event_id`, {
    method: "POST",
    headers: supabaseHeaders(SRV, {
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates,return=representation",
    }),
    body: JSON.stringify([{
      event_id: eventId,
    }]),
  });

  if (!res.ok) {
    console.error("Processed event insert failed", { status: res.status, body: await res.text() });
    return { ok: false, duplicate: false };
  }

  const rows = await safeJson(res);
  const inserted = Array.isArray(rows) ? rows.length : 0;
  if (!inserted) return { ok: true, duplicate: true };
  return { ok: true, duplicate: false };
}

async function deleteProcessingEvent(SUPABASE_URL, SRV, eventId) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/processed_events?event_id=eq.${encodeURIComponent(eventId)}`,
    {
      method: "DELETE",
      headers: supabaseHeaders(SRV, { Prefer: "return=minimal" }),
    },
  );
  if (!res.ok) {
    console.error("Processed event delete failed", { status: res.status, body: await res.text(), eventId });
  }
}

function shouldHandleType(type) {
  return type === "checkout.session.completed" || type === "checkout.session.async_payment_succeeded";
}

function isPaidCheckoutSession(session) {
  if (!session || typeof session !== "object") return false;
  return session.payment_status === "paid" || session.status === "complete";
}

export async function onRequestPost({ request, env }) {
  const WEBHOOK_SECRET = env.STRIPE_WEBHOOK_SECRET;
  const SUPABASE_URL = env.SUPABASE_URL;
  const SRV = env.SUPABASE_SERVICE_ROLE_KEY;
  const FULFILL_INTERNAL_SECRET = env.FULFILL_INTERNAL_SECRET;

  if (!WEBHOOK_SECRET || !SUPABASE_URL || !SRV || !FULFILL_INTERNAL_SECRET) {
    console.error("Stripe webhook missing env", {
      has_webhook_secret: Boolean(WEBHOOK_SECRET),
      has_supabase_url: Boolean(SUPABASE_URL),
      has_service_role: Boolean(SRV),
      has_fulfill_secret: Boolean(FULFILL_INTERNAL_SECRET),
    });
    return jsonNoStore({ error: "Server error" }, 500);
  }

  const sigHeader = request.headers.get("Stripe-Signature") || "";
  const rawBodyBytes = new Uint8Array(await request.arrayBuffer());
  const parsedSig = parseSignatureHeader(sigHeader);

  if (!parsedSig.t || !parsedSig.v1.length) {
    return jsonNoStore({ error: "Invalid signature" }, 400);
  }

  const timestamp = Number(parsedSig.t);
  if (!Number.isFinite(timestamp)) {
    return jsonNoStore({ error: "Invalid signature" }, 400);
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - timestamp) > STRIPE_TOLERANCE_SECONDS) {
    return jsonNoStore({ error: "Invalid signature" }, 400);
  }

  const signedPayloadBytes = concatBytes(
    encoder.encode(`${parsedSig.t}.`),
    rawBodyBytes,
  );
  const expected = await hmacHexBytes(WEBHOOK_SECRET, signedPayloadBytes);
  const expectedBytes = hexToBytes(expected);
  const valid = parsedSig.v1.some((sig) => timingSafeEqual(hexToBytes(sig), expectedBytes));
  if (!valid) {
    return jsonNoStore({ error: "Invalid signature" }, 400);
  }

  let event = null;
  try {
    const rawBody = new TextDecoder().decode(rawBodyBytes);
    event = JSON.parse(rawBody);
  } catch (err) {
    console.error("Stripe webhook JSON parse error", err);
    return jsonNoStore({ error: "Invalid payload" }, 400);
  }

  const eventId = String(event?.id || "").trim();
  const eventType = String(event?.type || "").trim();
  if (!eventId) {
    return jsonNoStore({ error: "Invalid payload" }, 400);
  }

  if (!shouldHandleType(eventType)) {
    return jsonNoStore({ ok: true }, 200);
  }

  const session = event?.data?.object;
  const sessionId = session?.id ? String(session.id) : "";
  if (!sessionId) {
    return jsonNoStore({ error: "Invalid payload" }, 400);
  }

  if (!isPaidCheckoutSession(session)) {
    return jsonNoStore({ ok: true, skipped: "not_paid" }, 200);
  }

  const processState = await insertProcessingEvent(SUPABASE_URL, SRV, eventId);
  if (!processState.ok) {
    return jsonNoStore({ error: "Server error" }, 500);
  }
  if (processState.duplicate) {
    return jsonNoStore({ ok: true, duplicate: true }, 200);
  }

  const origin = new URL(request.url).origin;
  const fulfillRes = await fetch(`${origin}/api/fulfill`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Fulfill-Secret": FULFILL_INTERNAL_SECRET,
    },
    body: JSON.stringify({
      provider: "stripe",
      session_id: sessionId,
    }),
  });

  if (!fulfillRes.ok) {
    const body = await fulfillRes.text();
    console.error("Stripe webhook fulfill failed", { status: fulfillRes.status, body, sessionId, eventId });
    await deleteProcessingEvent(SUPABASE_URL, SRV, eventId);
    return jsonNoStore({ error: "Server error" }, 500);
  }

  return jsonNoStore({ ok: true }, 200);
}

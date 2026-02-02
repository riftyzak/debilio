const encoder = new TextEncoder();

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function hexToBytes(hex) {
  if (hex.length % 2) return new Uint8Array();
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

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function onRequestPost({ request, env }) {
  const WEBHOOK_SECRET = env.STRIPE_WEBHOOK_SECRET;
  if (!WEBHOOK_SECRET) return jsonResponse({ error: "Missing server env vars" }, 500);

  const sigHeader = request.headers.get("Stripe-Signature") || "";
  const rawBody = await request.text();

  const parts = sigHeader.split(",").reduce((acc, part) => {
    const [k, v] = part.split("=");
    if (k && v) acc[k.trim()] = v.trim();
    return acc;
  }, {});

  const t = parts.t;
  const v1s = Object.entries(parts).filter(([k]) => k === "v1").map(([, v]) => v);

  if (!t || !v1s.length) {
    return jsonResponse({ error: "Invalid signature header" }, 400);
  }

  const expected = await hmacHex(WEBHOOK_SECRET, `${t}.${rawBody}`);
  const expectedBytes = hexToBytes(expected);
  const match = v1s.some(sig => timingSafeEqual(hexToBytes(sig), expectedBytes));
  if (!match) {
    return jsonResponse({ error: "Invalid signature" }, 400);
  }

  let event = null;
  try {
    event = JSON.parse(rawBody);
  } catch (err) {
    return jsonResponse({ error: "Invalid JSON", details: String(err?.message || err) }, 400);
  }

  const type = String(event?.type || "");
  if (type !== "checkout.session.completed" && type !== "checkout.session.async_payment_succeeded") {
    return jsonResponse({ ok: true });
  }

  const session = event?.data?.object;
  const sessionId = session?.id ? String(session.id) : "";
  if (!sessionId) return jsonResponse({ error: "Missing session id" }, 400);

  const origin = new URL(request.url).origin;
  const fulfillRes = await fetch(`${origin}/api/fulfill`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Webhook": "1" },
    body: JSON.stringify({ provider: "stripe", session_id: sessionId })
  });

  let fulfillBody = null;
  try { fulfillBody = await fulfillRes.json(); } catch (_) { fulfillBody = null; }

  return jsonResponse({ ok: true, fulfill_status: fulfillRes.status, fulfill: fulfillBody || null });
}

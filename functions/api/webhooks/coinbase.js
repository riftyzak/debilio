function toHex(buffer) {
  return [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return toHex(sig);
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function statusFromEvent(event) {
  const type = String(event?.type || "").toLowerCase();
  if (type.includes("confirmed")) return "CONFIRMED";
  if (type.includes("failed")) return "FAILED";
  if (type.includes("expired")) return "EXPIRED";
  if (type.includes("pending")) return "PENDING";
  const timeline = event?.data?.timeline;
  if (Array.isArray(timeline) && timeline.length) {
    const last = timeline[timeline.length - 1];
    if (last?.status) return String(last.status).toUpperCase();
  }
  return "PENDING";
}

export async function onRequestPost({ request, env }) {
  const SUPABASE_URL = env.SUPABASE_URL;
  const SRV = env.SUPABASE_SERVICE_ROLE_KEY;
  const WEBHOOK_SECRET = env.COINBASE_WEBHOOK_SECRET;

  if (!SUPABASE_URL || !SRV || !WEBHOOK_SECRET) {
    return jsonResponse({ error: "Missing server env vars" }, 500);
  }

  const signature = request.headers.get("X-CC-Webhook-Signature") || "";
  const rawBody = await request.text();
  const expected = await hmacHex(WEBHOOK_SECRET, rawBody);
  if (!signature || signature !== expected) {
    return jsonResponse({ error: "Invalid signature" }, 401);
  }

  let event = null;
  try {
    event = JSON.parse(rawBody);
  } catch (err) {
    return jsonResponse({ error: "Invalid JSON", details: String(err?.message || err) }, 400);
  }

  const chargeId = event?.data?.id ? String(event.data.id) : "";
  if (!chargeId) {
    return jsonResponse({ error: "Missing charge id" }, 400);
  }

  const status = statusFromEvent(event);
  const payload = [{
    id: chargeId,
    status,
    updated_at: new Date().toISOString(),
    raw: event
  }];

  const res = await fetch(`${SUPABASE_URL}/rest/v1/coinbase_charges?on_conflict=id`, {
    method: "POST",
    headers: {
      apikey: SRV,
      Authorization: `Bearer ${SRV}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    return jsonResponse({ error: "Failed to store charge", details: await res.text() }, 500);
  }

  let fulfillStatus = null;
  if (status === "CONFIRMED") {
    const origin = new URL(request.url).origin;
    const fulfillRes = await fetch(`${origin}/api/fulfill`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Webhook": "1" },
      body: JSON.stringify({ provider: "coinbase", charge_id: chargeId })
    });
    fulfillStatus = fulfillRes.status;
  }

  return jsonResponse({ ok: true, fulfill_status: fulfillStatus });
}

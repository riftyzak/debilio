import { getCookie, verifySession } from "./auth/_session.js";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(input) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return toHex(hash);
}

export async function onRequestPost({ request, env }) {
  const SUPABASE_URL = env.SUPABASE_URL;
  const SRV = env.SUPABASE_SERVICE_ROLE_KEY;
  const KEY_SECRET = env.KEY_SECRET;

  if (!SUPABASE_URL || !SRV || !KEY_SECRET) {
    return jsonResponse({ error: "Missing server env vars" }, 500);
  }

  const token = getCookie(request, "session");
  const payload = await verifySession(env, token);
  if (!payload?.uid) {
    return jsonResponse({ error: "Login required" }, 401);
  }

  let body = null;
  try {
    body = await request.json();
  } catch (_) {
    body = null;
  }

  const raw = String(body?.key || "").trim();
  if (raw.length < 10) {
    return jsonResponse({ error: "Invalid key format" }, 400);
  }

  const key_hash = await sha256Hex(`${KEY_SECRET}:${raw}`);

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/license_keys?key_hash=eq.${encodeURIComponent(key_hash)}&status=eq.issued&redeemed_by_app=is.null`,
    {
      method: "PATCH",
      headers: {
        apikey: SRV,
        Authorization: `Bearer ${SRV}`,
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: JSON.stringify({
        status: "redeemed",
        redeemed_by_app: payload.uid,
        redeemed_at: new Date().toISOString()
      })
    }
  );

  if (!res.ok) {
    return jsonResponse({ error: "Redeem failed", details: await res.text() }, 500);
  }

  const updated = await res.json();
  if (!updated.length) {
    return jsonResponse({ error: "Key invalid or already used" }, 400);
  }

  return jsonResponse({
    ok: true,
    product_id: updated[0].product_id,
    product_variant_id: updated[0].product_variant_id
  });
}

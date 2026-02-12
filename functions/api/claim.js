import { checkRateLimit, getNoStoreHeaders, jsonNoStore, rateLimitResponse } from "./_lib/security.js";

function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function importAesKey(b64) {
  const keyBytes = base64ToBytes(b64);
  return crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
}

async function decryptKeys(key, b64) {
  const bytes = base64ToBytes(b64);
  if (bytes.length < 13) throw new Error("Invalid encrypted payload");
  const iv = bytes.slice(0, 12);
  const ct = bytes.slice(12);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  const text = new TextDecoder().decode(pt);
  return JSON.parse(text);
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

function invalidClaimResponse(status = 404) {
  return jsonNoStore({ error: "Invalid or expired claim token" }, status, getNoStoreHeaders());
}

function pendingClaimResponse() {
  return jsonNoStore({ error: "Keys are being prepared" }, 409, getNoStoreHeaders());
}

export async function onRequestPost({ request, env }) {
  const rate = checkRateLimit(request, "claim", 30, 60 * 1000);
  if (!rate.allowed) {
    return rateLimitResponse(rate.resetAt);
  }

  const SUPABASE_URL = env.SUPABASE_URL;
  const SRV = env.SUPABASE_SERVICE_ROLE_KEY;
  const DELIVERY_ENC_KEY_B64 = env.DELIVERY_ENC_KEY_B64;
  if (!SUPABASE_URL || !SRV || !DELIVERY_ENC_KEY_B64) {
    return jsonNoStore({ error: "Server error" }, 500, getNoStoreHeaders());
  }

  let body = null;
  try {
    body = await request.json();
  } catch (_) {
    body = null;
  }

  const claim = String(body?.claim || "").trim();
  if (!claim || !claim.startsWith("claim_")) {
    return invalidClaimResponse(400);
  }

  const nowIso = new Date().toISOString();

  const claimLookupRes = await fetch(
    `${SUPABASE_URL}/rest/v1/claim_tokens?select=token,provider,session_id,order_id,expires_at,used_at&token=eq.${encodeURIComponent(
      claim,
    )}&used_at=is.null&expires_at=gt.${encodeURIComponent(nowIso)}&limit=1`,
    { headers: supabaseHeaders(SRV) },
  );

  if (!claimLookupRes.ok) {
    console.error("Claim lookup failed", { status: claimLookupRes.status, body: await claimLookupRes.text() });
    return jsonNoStore({ error: "Server error" }, 500, getNoStoreHeaders());
  }

  const claimRows = await safeJson(claimLookupRes);
  const claimRow = Array.isArray(claimRows) ? claimRows[0] : null;
  if (!claimRow) {
    return invalidClaimResponse(404);
  }

  let orderRes;
  if (claimRow.order_id) {
    orderRes = await fetch(
      `${SUPABASE_URL}/rest/v1/checkout_orders?select=id,keys_encrypted&` +
      `id=eq.${encodeURIComponent(String(claimRow.order_id))}&limit=1`,
      { headers: supabaseHeaders(SRV) },
    );
  } else {
    orderRes = await fetch(
      `${SUPABASE_URL}/rest/v1/checkout_orders?select=id,keys_encrypted&` +
      `provider=eq.${encodeURIComponent(String(claimRow.provider || ""))}&` +
      `provider_session_id=eq.${encodeURIComponent(String(claimRow.session_id || ""))}&limit=1`,
      { headers: supabaseHeaders(SRV) },
    );
  }

  if (!orderRes.ok) {
    console.error("Claim order lookup failed", { status: orderRes.status, body: await orderRes.text() });
    return jsonNoStore({ error: "Server error" }, 500, getNoStoreHeaders());
  }

  const orderRows = await safeJson(orderRes);
  const order = Array.isArray(orderRows) ? orderRows[0] : null;
  if (!order) {
    // Webhook/order creation may still be in flight right after redirect.
    return pendingClaimResponse();
  }

  if (!order.keys_encrypted) {
    // Claim is valid but fulfillment hasn't stored encrypted keys yet.
    return pendingClaimResponse();
  }

  const consumeRes = await fetch(
    `${SUPABASE_URL}/rest/v1/claim_tokens?token=eq.${encodeURIComponent(claim)}&` +
    `used_at=is.null&expires_at=gt.${encodeURIComponent(nowIso)}`,
    {
      method: "PATCH",
      headers: supabaseHeaders(SRV, {
        "Content-Type": "application/json",
        Prefer: "return=representation",
      }),
      body: JSON.stringify({ used_at: nowIso }),
    },
  );

  if (!consumeRes.ok) {
    console.error("Claim consume failed", { status: consumeRes.status, body: await consumeRes.text() });
    return jsonNoStore({ error: "Server error" }, 500, getNoStoreHeaders());
  }

  const consumedRows = await safeJson(consumeRes);
  if (!Array.isArray(consumedRows) || consumedRows.length === 0) {
    return invalidClaimResponse(404);
  }

  let decrypted = null;
  try {
    const encKey = await importAesKey(DELIVERY_ENC_KEY_B64);
    decrypted = await decryptKeys(encKey, order.keys_encrypted);
  } catch (err) {
    console.error("Claim decrypt failed", err);
    return jsonNoStore({ error: "Server error" }, 500, getNoStoreHeaders());
  }

  const keys = Array.isArray(decrypted?.keys) ? decrypted.keys : [];
  const normalizedKeys = keys.map((item) => ({
    key: String(item?.key || ""),
    product_id: item?.product_id ? String(item.product_id) : null,
    product_variant_id: item?.product_variant_id ? String(item.product_variant_id) : null,
  })).filter((item) => item.key);

  return jsonNoStore({ ok: true, keys: normalizedKeys }, 200, getNoStoreHeaders());
}

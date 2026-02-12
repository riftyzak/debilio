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

function pendingClaimResponse(provider = "") {
  return jsonNoStore(
    { ok: false, pending: true, provider: String(provider || ""), message: "Keys are being prepared" },
    202,
    getNoStoreHeaders(),
  );
}

function isFulfilledWithoutKeys(order) {
  if (!order || typeof order !== "object") return false;
  const status = String(order.status || "").toLowerCase();
  const keysCount = Number(order.keys_count || 0);
  return (status === "fulfilled" || status === "emailed") && keysCount === 0;
}

function parseCartItems(rawCart) {
  const source = Array.isArray(rawCart)
    ? rawCart
    : (rawCart && Array.isArray(rawCart.items) ? rawCart.items : []);

  return source.map((item) => ({
    id: item?.id ? String(item.id) : "",
    qty: Math.max(1, Number(item?.qty || 1)),
    variant_id: item?.variant_id ? String(item.variant_id) : null,
    duration_days: Number.isFinite(Number(item?.duration_days)) ? Number(item.duration_days) : null,
  })).filter((item) => item.id);
}

function uniqueStrings(values) {
  return [...new Set(values.map((v) => String(v || "").trim()).filter(Boolean))];
}

function quotedIdList(ids) {
  return ids.map((id) => `"${id.replaceAll("\"", "\\\"")}"`).join(",");
}

async function fetchProductsByIds(SUPABASE_URL, SRV, ids) {
  if (!ids.length) return new Map();
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/products?select=id,title&id=in.(${quotedIdList(ids)})`,
    { headers: supabaseHeaders(SRV) },
  );
  if (!res.ok) {
    console.error("Claim product lookup failed", { status: res.status, body: await res.text() });
    return new Map();
  }
  const rows = await safeJson(res);
  const map = new Map();
  for (const row of rows || []) {
    map.set(String(row.id), row);
  }
  return map;
}

async function fetchVariantsByIds(SUPABASE_URL, SRV, ids) {
  if (!ids.length) return new Map();
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/product_variants?select=id,product_id,duration_days&id=in.(${quotedIdList(ids)})`,
    { headers: supabaseHeaders(SRV) },
  );
  if (!res.ok) {
    console.error("Claim variant lookup failed", { status: res.status, body: await res.text() });
    return new Map();
  }
  const rows = await safeJson(res);
  const map = new Map();
  for (const row of rows || []) {
    map.set(String(row.id), row);
  }
  return map;
}

function addDaysIso(baseIso, durationDays) {
  if (!Number.isFinite(durationDays) || durationDays <= 0) return null;
  const base = new Date(baseIso);
  if (Number.isNaN(base.getTime())) return null;
  base.setUTCDate(base.getUTCDate() + Number(durationDays));
  return base.toISOString();
}

function pickKeyForItem(normalizedKeys, usedKeySet, productId, variantId) {
  const exact = normalizedKeys.find((item) =>
    !usedKeySet.has(item.key) &&
    item.product_id === productId &&
    (item.product_variant_id || null) === (variantId || null)
  );
  if (exact) {
    usedKeySet.add(exact.key);
    return exact.key;
  }

  const byProduct = normalizedKeys.find((item) =>
    !usedKeySet.has(item.key) &&
    item.product_id === productId
  );
  if (byProduct) {
    usedKeySet.add(byProduct.key);
    return byProduct.key;
  }

  return null;
}

async function buildPurchasedItems(SUPABASE_URL, SRV, order, normalizedKeys) {
  const cartItems = parseCartItems(order?.cart);
  const keyRows = Array.isArray(normalizedKeys) ? normalizedKeys : [];
  const productIds = uniqueStrings([
    ...cartItems.map((item) => item.id),
    ...keyRows.map((row) => row.product_id),
  ]);
  const variantIds = uniqueStrings([
    ...cartItems.map((item) => item.variant_id),
    ...keyRows.map((row) => row.product_variant_id),
  ]);

  const [productMap, variantMap] = await Promise.all([
    fetchProductsByIds(SUPABASE_URL, SRV, productIds),
    fetchVariantsByIds(SUPABASE_URL, SRV, variantIds),
  ]);

  const issuedAtIso = String(order?.fulfilled_at || order?.created_at || new Date().toISOString());
  const usedKeys = new Set();
  const labelCounter = new Map();
  const out = [];

  for (const item of cartItems) {
    const qty = Math.max(1, Number(item.qty || 1));
    for (let i = 0; i < qty; i++) {
      const product = productMap.get(item.id);
      const variant = item.variant_id ? variantMap.get(item.variant_id) : null;
      const rawDuration = item.duration_days != null
        ? Number(item.duration_days)
        : Number(variant?.duration_days);
      const durationDays = Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : null;
      const key = pickKeyForItem(keyRows, usedKeys, item.id, item.variant_id);

      const labelKey = `${item.id}:${item.variant_id || ""}`;
      const nextIndex = (labelCounter.get(labelKey) || 0) + 1;
      labelCounter.set(labelKey, nextIndex);

      const baseTitle = String(product?.title || `Product ${item.id}`);
      out.push({
        product_id: item.id,
        product_variant_id: item.variant_id || null,
        product_title: baseTitle,
        quantity: 1,
        key: key || null,
        duration_days: durationDays,
        expires_at: durationDays ? addDaysIso(issuedAtIso, durationDays) : null,
      });
    }
  }

  for (const keyRow of keyRows) {
    if (!keyRow?.key || usedKeys.has(keyRow.key)) continue;
    usedKeys.add(keyRow.key);

    const productId = keyRow.product_id || null;
    const variantId = keyRow.product_variant_id || null;
    const product = productId ? productMap.get(productId) : null;
    const variant = variantId ? variantMap.get(variantId) : null;
    const rawDuration = Number(variant?.duration_days);
    const durationDays = Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : null;
    const labelKey = `${productId || "product"}:${variantId || ""}`;
    const nextIndex = (labelCounter.get(labelKey) || 0) + 1;
    labelCounter.set(labelKey, nextIndex);
    const baseTitle = String(product?.title || productId || "Purchased item");

    out.push({
      product_id: productId,
      product_variant_id: variantId,
      product_title: baseTitle,
      quantity: 1,
      key: keyRow.key,
      duration_days: durationDays,
      expires_at: durationDays ? addDaysIso(issuedAtIso, durationDays) : null,
    });
  }

  return out;
}

async function fetchOrderForClaim(SUPABASE_URL, SRV, claimRow) {
  let orderRes;
  if (claimRow.order_id) {
    orderRes = await fetch(
      `${SUPABASE_URL}/rest/v1/checkout_orders?select=id,keys_encrypted,status,keys_count,cart,created_at,fulfilled_at&` +
      `id=eq.${encodeURIComponent(String(claimRow.order_id))}&limit=1`,
      { headers: supabaseHeaders(SRV) },
    );
  } else {
    orderRes = await fetch(
      `${SUPABASE_URL}/rest/v1/checkout_orders?select=id,keys_encrypted,status,keys_count,cart,created_at,fulfilled_at&` +
      `provider=eq.${encodeURIComponent(String(claimRow.provider || ""))}&` +
      `provider_session_id=eq.${encodeURIComponent(String(claimRow.session_id || ""))}&limit=1`,
      { headers: supabaseHeaders(SRV) },
    );
  }

  if (!orderRes.ok) {
    console.error("Claim order lookup failed", { status: orderRes.status, body: await orderRes.text() });
    return { ok: false, order: null };
  }

  const orderRows = await safeJson(orderRes);
  const order = Array.isArray(orderRows) ? orderRows[0] : null;
  return { ok: true, order };
}

async function consumeClaimToken(SUPABASE_URL, SRV, claim, nowIso) {
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
    return { ok: false, consumed: false };
  }

  const consumedRows = await safeJson(consumeRes);
  if (!Array.isArray(consumedRows) || consumedRows.length === 0) {
    return { ok: true, consumed: false };
  }

  return { ok: true, consumed: true };
}

async function tryTriggerInternalFulfill(request, env, claimRow) {
  const secret = env.FULFILL_INTERNAL_SECRET;
  if (!secret) return;

  const provider = String(claimRow.provider || "");
  const sessionId = String(claimRow.session_id || "");
  if (!provider || !sessionId) return;

  const origin = new URL(request.url).origin;
  const payload = provider === "stripe"
    ? { provider: "stripe", session_id: sessionId }
    : { provider: "coinbase", charge_id: sessionId };

  try {
    const fulfillRes = await fetch(`${origin}/api/fulfill`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Fulfill-Secret": secret,
      },
      body: JSON.stringify(payload),
    });

    if (!fulfillRes.ok) {
      console.error("Claim-triggered fulfill failed", { status: fulfillRes.status, provider, sessionId });
    }
  } catch (err) {
    console.error("Claim-triggered fulfill exception", err);
  }
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
  const provider = String(claimRow.provider || "");

  const initialOrderLookup = await fetchOrderForClaim(SUPABASE_URL, SRV, claimRow);
  if (!initialOrderLookup.ok) {
    return jsonNoStore({ error: "Server error" }, 500, getNoStoreHeaders());
  }

  let order = initialOrderLookup.order;

  if (isFulfilledWithoutKeys(order)) {
    const consumed = await consumeClaimToken(SUPABASE_URL, SRV, claim, nowIso);
    if (!consumed.ok) return jsonNoStore({ error: "Server error" }, 500, getNoStoreHeaders());
    if (!consumed.consumed) return invalidClaimResponse(404);
    const items = await buildPurchasedItems(SUPABASE_URL, SRV, order, []);
    return jsonNoStore({ ok: true, provider, keys: [], items }, 200, getNoStoreHeaders());
  }

  if (!order) {
    await tryTriggerInternalFulfill(request, env, claimRow);
    const recheck = await fetchOrderForClaim(SUPABASE_URL, SRV, claimRow);
    if (!recheck.ok) return jsonNoStore({ error: "Server error" }, 500, getNoStoreHeaders());
    order = recheck.order;
  }

  if (!order?.keys_encrypted) {
    await tryTriggerInternalFulfill(request, env, claimRow);
    const recheck = await fetchOrderForClaim(SUPABASE_URL, SRV, claimRow);
    if (!recheck.ok) return jsonNoStore({ error: "Server error" }, 500, getNoStoreHeaders());
    order = recheck.order;

    if (isFulfilledWithoutKeys(order)) {
      const consumed = await consumeClaimToken(SUPABASE_URL, SRV, claim, nowIso);
      if (!consumed.ok) return jsonNoStore({ error: "Server error" }, 500, getNoStoreHeaders());
      if (!consumed.consumed) return invalidClaimResponse(404);
      const items = await buildPurchasedItems(SUPABASE_URL, SRV, order, []);
      return jsonNoStore({ ok: true, provider, keys: [], items }, 200, getNoStoreHeaders());
    }

    if (!order || !order.keys_encrypted) {
      return pendingClaimResponse(provider);
    }
  }

  const consumed = await consumeClaimToken(SUPABASE_URL, SRV, claim, nowIso);
  if (!consumed.ok) {
    return jsonNoStore({ error: "Server error" }, 500, getNoStoreHeaders());
  }
  if (!consumed.consumed) {
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

  const items = await buildPurchasedItems(SUPABASE_URL, SRV, order, normalizedKeys);

  return jsonNoStore({ ok: true, provider, keys: normalizedKeys, items }, 200, getNoStoreHeaders());
}

import { getCookie, verifySession } from "../auth/_session.js";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

export async function onRequestGet({ request, env }) {
  const token = getCookie(request, "session");
  const payload = await verifySession(env, token);
  if (!payload?.uid) {
    return jsonResponse({ error: "Login required" }, 401);
  }

  const SUPABASE_URL = env.SUPABASE_URL;
  const SRV = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SRV) {
    return jsonResponse({ error: "Missing server env vars" }, 500);
  }

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/license_keys?select=issued_for_session,product_id,product_variant_id,redeemed_at,status&redeemed_by_app=eq.${encodeURIComponent(payload.uid)}&status=eq.redeemed&order=redeemed_at.desc`,
    {
      headers: {
        apikey: SRV,
        Authorization: `Bearer ${SRV}`
      }
    }
  );

  if (!res.ok) {
    return jsonResponse({ error: "Failed to load history", details: await res.text() }, 500);
  }

  const rows = await res.json();
  const productIds = [...new Set(rows.map(r => r.product_id).filter(Boolean).map(String))];
  const variantIds = [...new Set(rows.map(r => r.product_variant_id).filter(Boolean).map(String))];

  const productMap = new Map();
  const variantMap = new Map();

  if (productIds.length) {
    const idsParam = productIds.map(encodeURIComponent).join(",");
    // Use select=* so optional columns (e.g. dashboard_icon_url) won't break if missing.
    const pRes = await fetch(`${SUPABASE_URL}/rest/v1/products?select=*&id=in.(${idsParam})`, {
      headers: { apikey: SRV, Authorization: `Bearer ${SRV}` }
    });
    if (!pRes.ok) {
      return jsonResponse({ error: "Failed to load products", details: await pRes.text() }, 500);
    }
    const products = await pRes.json();
    for (const p of products) productMap.set(String(p.id), p);
  }

  if (variantIds.length) {
    const idsParam = variantIds.map(encodeURIComponent).join(",");
    // NOTE: Some schemas don't have `product_variants.price` (or use a different column name).
    // History view only needs duration_days, so keep the select minimal to avoid schema mismatch.
    const vRes = await fetch(`${SUPABASE_URL}/rest/v1/product_variants?select=id,product_id,duration_days&id=in.(${idsParam})`, {
      headers: { apikey: SRV, Authorization: `Bearer ${SRV}` }
    });
    if (!vRes.ok) {
      return jsonResponse({ error: "Failed to load variants", details: await vRes.text() }, 500);
    }
    const variants = await vRes.json();
    for (const v of variants) variantMap.set(String(v.id), v);
  }

  const grouped = new Map();

  for (const row of rows) {
    const sessionId = row.issued_for_session || "unknown";
    const product = productMap.get(String(row.product_id)) || {};
    const variant = row.product_variant_id ? (variantMap.get(String(row.product_variant_id)) || {}) : {};
    const duration = Number(variant.duration_days || product.duration_days || 0);

    if (!grouped.has(sessionId)) {
      grouped.set(sessionId, {
        session_id: sessionId,
        redeemed_at: row.redeemed_at,
        items: []
      });
    }

    const entry = grouped.get(sessionId);
    if (row.redeemed_at && (!entry.redeemed_at || new Date(row.redeemed_at) > new Date(entry.redeemed_at))) {
      entry.redeemed_at = row.redeemed_at;
    }

    entry.items.push({
      product_id: row.product_id,
      product_variant_id: row.product_variant_id,
      title: product.title || "Product",
      image_url: product.image_url || "",
      duration_days: duration
    });
  }

  const items = Array.from(grouped.values());
  return jsonResponse({ items });
}

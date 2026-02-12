import { getCookie, verifySession } from "../auth/_session.js";
import { jsonNoStore } from "../_lib/security.js";

export async function onRequestGet({ request, env }) {
  const token = getCookie(request, "session");
  const payload = await verifySession(env, token);
  if (!payload?.uid) {
    return jsonNoStore({ error: "Login required" }, 401);
  }

  const SUPABASE_URL = env.SUPABASE_URL;
  const SRV = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SRV) {
    return jsonNoStore({ error: "Server error" }, 500);
  }

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/license_keys?select=id,product_id,product_variant_id,redeemed_at,issued_for_session,status&redeemed_by_app=eq.${encodeURIComponent(payload.uid)}&status=eq.redeemed&order=redeemed_at.desc`,
    {
      headers: {
        apikey: SRV,
        Authorization: `Bearer ${SRV}`
      }
    }
  );

  if (!res.ok) {
    console.error("Subscriptions load failed", { status: res.status, body: await res.text() });
    return jsonNoStore({ error: "Server error" }, 500);
  }

  const keys = await res.json();
  const productIds = [...new Set(keys.map(k => k.product_id).filter(Boolean).map(String))];
  const variantIds = [...new Set(keys.map(k => k.product_variant_id).filter(Boolean).map(String))];

  const productMap = new Map();
  const variantMap = new Map();

  if (productIds.length) {
    const idsParam = productIds.map(encodeURIComponent).join(",");
    // Use select=* so optional columns (e.g. dashboard_icon_url) won't break if missing.
    const pRes = await fetch(`${SUPABASE_URL}/rest/v1/products?select=*&id=in.(${idsParam})`, {
      headers: { apikey: SRV, Authorization: `Bearer ${SRV}` }
    });
    if (!pRes.ok) {
      console.error("Subscriptions products load failed", { status: pRes.status, body: await pRes.text() });
      return jsonNoStore({ error: "Server error" }, 500);
    }
    const products = await pRes.json();
    for (const p of products) productMap.set(String(p.id), p);
  }

  if (variantIds.length) {
    const idsParam = variantIds.map(encodeURIComponent).join(",");
    const vRes = await fetch(`${SUPABASE_URL}/rest/v1/product_variants?select=id,product_id,duration_days&id=in.(${idsParam})`, {
      headers: { apikey: SRV, Authorization: `Bearer ${SRV}` }
    });
    if (!vRes.ok) {
      console.error("Subscriptions variants load failed", { status: vRes.status, body: await vRes.text() });
      return jsonNoStore({ error: "Server error" }, 500);
    }
    const variants = await vRes.json();
    for (const v of variants) variantMap.set(String(v.id), v);
  }

  const now = Date.now();
  const subs = [];

  for (const k of keys) {
    const product = productMap.get(String(k.product_id)) || {};
    const variant = k.product_variant_id ? (variantMap.get(String(k.product_variant_id)) || {}) : {};
    const duration = Number(variant.duration_days || product.duration_days || 0);
    if (!Number.isFinite(duration) || duration <= 0) continue;

    const redeemedAt = k.redeemed_at ? new Date(k.redeemed_at) : null;
    const expiresAt = redeemedAt ? new Date(redeemedAt.getTime() + duration * 24 * 60 * 60 * 1000) : null;
    const daysLeft = expiresAt ? Math.ceil((expiresAt.getTime() - now) / 86400000) : null;

    subs.push({
      product_id: k.product_id,
      product_variant_id: k.product_variant_id,
      title: product.title || "Product",
      image_url: product.image_url || "",
      // Dashboard-only icon for time-based products.
      // Prefer products.dashboard_icon_url, but also support common legacy column names
      // so the dashboard still shows an icon even if the schema differs.
      icon_url: product.dashboard_icon_url || product.icon_url || product.icon || "",
      duration_days: duration,
      redeemed_at: k.redeemed_at,
      expires_at: expiresAt ? expiresAt.toISOString() : null,
      days_left: daysLeft,
      expired: daysLeft !== null ? daysLeft <= 0 : false
    });
  }

  return jsonNoStore({ items: subs });
}

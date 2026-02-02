function toHex(buffer) {
  return [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(input) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return toHex(hash);
}

function normalizePrefix(prefix) {
  let p = String(prefix || "").trim().toLowerCase();
  p = p.replace(/-+$/g, "");
  p = p.replace(/[^a-z0-9]/g, "");
  return p;
}

function randomBase62(len) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const out = [];
  while (out.length < len) {
    const bytes = crypto.getRandomValues(new Uint8Array(len));
    for (let i = 0; i < bytes.length && out.length < len; i++) {
      const b = bytes[i];
      if (b < 248) out.push(alphabet[b % 62]);
    }
  }
  return out.join("");
}

function makeKey(prefix) {
  const core = randomBase62(24);
  return prefix ? `${prefix}-${core}` : core;
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

export async function onRequestPost({ request, env }) {
  const SUPABASE_URL = env.SUPABASE_URL;
  const SRV = env.SUPABASE_SERVICE_ROLE_KEY;
  const KEY_SECRET = env.KEY_SECRET;

  if (!SUPABASE_URL || !SRV || !KEY_SECRET) {
    return jsonResponse({ error: "Missing server env vars" }, 500);
  }

  let body = null;
  try {
    body = await request.json();
  } catch (_) {
    body = null;
  }

  const session_id = String(body?.session_id || "no_session").trim() || "no_session";
  const provider = String(body?.provider || "").trim().toLowerCase();
  const charge_id = String(body?.charge_id || "").trim();
  const items = Array.isArray(body?.items) ? body.items : [];

  if (!items.length) {
    return jsonResponse({ error: "Missing items" }, 400);
  }

  if (provider === "coinbase") {
    const chargeKey = charge_id || session_id;
    if (!chargeKey) {
      return jsonResponse({ error: "Missing coinbase charge id" }, 400);
    }
    const statusRes = await fetch(
      `${SUPABASE_URL}/rest/v1/coinbase_charges?select=status&id=eq.${encodeURIComponent(chargeKey)}`,
      {
        headers: {
          apikey: SRV,
          Authorization: `Bearer ${SRV}`
        }
      }
    );
    if (!statusRes.ok) {
      return jsonResponse({ error: "Failed to check payment status", details: await statusRes.text() }, 500);
    }
    const rows = await statusRes.json();
    const status = rows && rows[0]?.status ? String(rows[0].status).toUpperCase() : "PENDING";
    if (status !== "CONFIRMED") {
      return jsonResponse({ error: "Payment not confirmed yet", status }, 409);
    }
  }

  const productIds = [...new Set(items.map(it => it?.id).filter(Boolean).map(String))];
  const prefixMap = new Map();

  if (productIds.length) {
    const idsParam = productIds.map(encodeURIComponent).join(",");
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/products?select=id,key_prefix&id=in.(${idsParam})`,
      {
        headers: {
          apikey: SRV,
          Authorization: `Bearer ${SRV}`
        }
      }
    );

    if (!res.ok) {
      return jsonResponse({ error: "Failed to load product prefixes", details: await res.text() }, 500);
    }

    const rows = await res.json();
    for (const row of rows) {
      prefixMap.set(String(row.id), normalizePrefix(row.key_prefix));
    }
  }

  const issued = [];
  const inserts = [];

  for (const it of items) {
    const qty = Math.max(1, Number(it?.qty || 1));
    const product_id = it?.id ? String(it.id) : null;
    const product_variant_id = it?.variant_id ? String(it.variant_id) : null;
    const prefix = product_id ? (prefixMap.get(product_id) || "") : "";

    for (let i = 0; i < qty; i++) {
      const key = makeKey(prefix);
      const key_hash = await sha256Hex(`${KEY_SECRET}:${key}`);

      inserts.push({
        key_hash,
        status: "issued",
        issued_for_session: session_id,
        product_id,
        product_variant_id
      });

      issued.push({
        key,
        product_id,
        product_variant_id
      });
    }
  }

  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/license_keys`, {
    method: "POST",
    headers: {
      apikey: SRV,
      Authorization: `Bearer ${SRV}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify(inserts)
  });

  if (!insertRes.ok) {
    return jsonResponse({ error: "Insert failed", details: await insertRes.text() }, 500);
  }

  return jsonResponse({ keys: issued });
}

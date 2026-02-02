function toHex(buffer) {
  return [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, "0")).join("");
}
async function sha256Hex(input) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return toHex(hash);
}

function makeKey(prefix = "") {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const part = (n) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  const core = `${part(5)}-${part(5)}-${part(5)}-${part(5)}`;
  return prefix ? `${prefix}-${core}` : core;
}

export async function onRequestPost({ request, env }) {
  const SUPABASE_URL = env.SUPABASE_URL;
  const SRV = env.SUPABASE_SERVICE_ROLE_KEY;
  const KEY_SECRET = env.KEY_SECRET;

  if (!SUPABASE_URL || !SRV || !KEY_SECRET) {
    return new Response(JSON.stringify({ error: "Missing server env vars" }), { status: 500 });
  }

  const body = await request.json();
  const session_id = String(body.session_id || "").trim(); // cs_... etc
  const items = Array.isArray(body.items) ? body.items : [];

  if (!session_id || !items.length) {
    return new Response(JSON.stringify({ error: "Missing session_id or items" }), { status: 400 });
  }

  // Build keys: one per qty per item (simple + “license-like”)
  const issued = [];

  for (const it of items) {
    const qty = Math.max(1, Number(it.qty || 1));
    const product_id = it.id ? String(it.id) : null;
    const product_variant_id = it.variant_id ? String(it.variant_id) : null;

    // Optional: if you ever add product key prefixes, pass it here
    const prefix = ""; // keep empty for now

    for (let i = 0; i < qty; i++) {
      const key = makeKey(prefix);

      // Hash includes KEY_SECRET so even if someone guesses format, they can’t precompute
      const key_hash = await sha256Hex(`${KEY_SECRET}:${key}`);

      // Insert hash only
      const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/license_keys`, {
        method: "POST",
        headers: {
          apikey: SRV,
          Authorization: `Bearer ${SRV}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal"
        },
        body: JSON.stringify([{
          key_hash,
          status: "issued",
          issued_for_session: session_id,
          product_id,
          product_variant_id
        }]),
      });

      if (!insertRes.ok) {
        return new Response(JSON.stringify({ error: "Insert failed", details: await insertRes.text() }), { status: 500 });
      }

      issued.push({
        key,
        product_id,
        product_variant_id
      });
    }
  }

  return new Response(JSON.stringify({ keys: issued }), {
    headers: { "content-type": "application/json" },
  });
}

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, "0")).join("");
}
async function sha256Hex(input) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return toHex(hash);
}

async function getUser(env, accessToken) {
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${accessToken}`,
    }
  });
  if (!res.ok) return null;
  return res.json();
}

export async function onRequestPost({ request, env }) {
  const SUPABASE_URL = env.SUPABASE_URL;
  const SRV = env.SUPABASE_SERVICE_ROLE_KEY;
  const KEY_SECRET = env.KEY_SECRET;

  if (!SUPABASE_URL || !SRV || !KEY_SECRET) {
    return new Response(JSON.stringify({ error: "Missing server env vars" }), { status: 500 });
  }

  const auth = request.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/);
  if (!m) return new Response(JSON.stringify({ error: "Login required" }), { status: 401 });

  const user = await getUser(env, m[1]);
  if (!user?.id) return new Response(JSON.stringify({ error: "Invalid session" }), { status: 401 });

  const { key } = await request.json();
  const raw = String(key || "").trim().toUpperCase();
  if (raw.length < 10) return new Response(JSON.stringify({ error: "Invalid key format" }), { status: 400 });

  const key_hash = await sha256Hex(`${KEY_SECRET}:${raw}`);

  // Atomic redeem: only if status=issued and not already redeemed
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/license_keys?key_hash=eq.${encodeURIComponent(key_hash)}&status=eq.issued&redeemed_by=is.null`,
    {
      method: "PATCH",
      headers: {
        apikey: SRV,
        Authorization: `Bearer ${SRV}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        status: "redeemed",
        redeemed_by: user.id,
        redeemed_at: new Date().toISOString(),
      }),
    }
  );

  if (!res.ok) {
    return new Response(JSON.stringify({ error: "Redeem failed", details: await res.text() }), { status: 500 });
  }

  const updated = await res.json();
  if (!updated.length) {
    return new Response(JSON.stringify({ error: "Key invalid or already used" }), { status: 400 });
  }

  return new Response(JSON.stringify({
    ok: true,
    redeemed_by: user.id,
    product_id: updated[0].product_id,
    product_variant_id: updated[0].product_variant_id
  }), { headers: { "content-type": "application/json" }});
}

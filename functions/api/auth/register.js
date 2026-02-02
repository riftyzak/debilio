function bytesToBase64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

async function pbkdf2Hash(password, saltBytes) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations: 120000 },
    key,
    256
  );
  return new Uint8Array(bits);
}

export async function onRequestPost({ request, env }) {
  const SUPABASE_URL = env.SUPABASE_URL;
  const SRV = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SRV) {
    return new Response(JSON.stringify({ error: "Missing server env vars" }), { status: 500 });
  }

  let body = null;
  try {
    body = await request.json();
  } catch (_) {
    body = null;
  }

  const rawUsername = String(body?.username || "");
  const username = rawUsername.trim().toLowerCase();
  const password = String(body?.password || "");

  if (username.length < 3) {
    return new Response(JSON.stringify({ error: "Username must be at least 3 characters" }), { status: 400 });
  }
  if (password.length < 6) {
    return new Response(JSON.stringify({ error: "Password must be at least 6 characters" }), { status: 400 });
  }

  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const hashBytes = await pbkdf2Hash(password, saltBytes);

  const payload = [{
    username,
    pass_salt: bytesToBase64(saltBytes),
    pass_hash: bytesToBase64(hashBytes)
  }];

  const res = await fetch(`${SUPABASE_URL}/rest/v1/app_users`, {
    method: "POST",
    headers: {
      apikey: SRV,
      Authorization: `Bearer ${SRV}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    return new Response(JSON.stringify({ error: "Register failed", details: await res.text() }), { status: 400 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json" }
  });
}

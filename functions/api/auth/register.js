import { checkRateLimit, jsonNoStore, rateLimitResponse } from "../_lib/security.js";

function bytesToBase64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

async function pbkdf2Hash(password, saltBytes) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations: 90000 },
    key,
    256
  );
  return new Uint8Array(bits);
}

export async function onRequestGet() {
  return jsonNoStore({ error: "Method Not Allowed" }, 405);
}

export async function onRequestPost({ request, env }) {
  const rate = checkRateLimit(request, "auth_register", 10, 60 * 1000);
  if (!rate.allowed) {
    return rateLimitResponse(rate.resetAt);
  }

  const SUPABASE_URL = env.SUPABASE_URL;
  const SRV = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SRV) {
    return jsonNoStore({ error: "Server error" }, 500);
  }

  try {
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
      return jsonNoStore({ error: "Username must be at least 3 characters" }, 400);
    }
    if (password.length < 6) {
      return jsonNoStore({ error: "Password must be at least 6 characters" }, 400);
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
      console.error("Register insert failed", { status: res.status, body: await res.text() });
      return jsonNoStore({ error: "Register failed" }, 400);
    }

    return jsonNoStore({ ok: true });
  } catch (err) {
    console.error("Register exception", err);
    return jsonNoStore({ error: "Internal error" }, 500);
  }
}

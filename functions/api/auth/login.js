import { signSession, sessionCookie } from "./_session.js";
import { checkRateLimit, jsonNoStore, rateLimitResponse } from "../_lib/security.js";

function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

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
  const rate = checkRateLimit(request, "auth_login", 10, 60 * 1000);
  if (!rate.allowed) {
    return rateLimitResponse(rate.resetAt);
  }

  const SUPABASE_URL = env.SUPABASE_URL;
  const SRV = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SRV || !env.SESSION_SECRET) {
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

    if (username.length < 3 || password.length < 6) {
      return jsonNoStore({ error: "Invalid credentials" }, 400);
    }

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/app_users?select=id,username,pass_salt,pass_hash&username=eq.${encodeURIComponent(username)}`,
      {
        headers: {
          apikey: SRV,
          Authorization: `Bearer ${SRV}`
        }
      }
    );

    if (!res.ok) {
      console.error("Login query failed", { status: res.status, body: await res.text() });
      return jsonNoStore({ error: "Login failed" }, 500);
    }

    const users = await res.json();
    const user = users && users[0];
    if (!user?.id || !user.pass_salt || !user.pass_hash) {
      return jsonNoStore({ error: "Invalid credentials" }, 401);
    }

    const saltBytes = base64ToBytes(String(user.pass_salt));
    const hashBytes = await pbkdf2Hash(password, saltBytes);
    const computed = bytesToBase64(hashBytes);

    if (computed !== String(user.pass_hash)) {
      return jsonNoStore({ error: "Invalid credentials" }, 401);
    }

    const token = await signSession(env, {
      uid: user.id,
      u: user.username,
      iat: Date.now()
    });

    return jsonNoStore({ ok: true, username: user.username }, 200, {
      "set-cookie": sessionCookie(token)
    });
  } catch (err) {
    console.error("Login exception", err);
    return jsonNoStore({ error: "Internal error" }, 500);
  }
}

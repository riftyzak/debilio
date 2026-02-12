import { getCookie, verifySession } from "./_session.js";
import { checkRateLimit, jsonNoStore, rateLimitResponse } from "../_lib/security.js";

export async function onRequestGet({ request, env }) {
  const rate = checkRateLimit(request, "auth_me", 60, 60 * 1000);
  if (!rate.allowed) {
    return rateLimitResponse(rate.resetAt);
  }

  const token = getCookie(request, "session");
  const payload = await verifySession(env, token);
  if (!payload?.uid || !payload?.u) {
    return jsonNoStore({ logged_in: false });
  }

  return jsonNoStore({
    logged_in: true,
    user_id: payload.uid,
    username: payload.u
  });
}

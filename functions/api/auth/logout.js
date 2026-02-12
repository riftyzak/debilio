import { clearSessionCookie } from "./_session.js";
import { checkRateLimit, jsonNoStore, rateLimitResponse } from "../_lib/security.js";

export async function onRequestPost({ request }) {
  const rate = checkRateLimit(request, "auth_logout", 30, 60 * 1000);
  if (!rate.allowed) {
    return rateLimitResponse(rate.resetAt);
  }
  return jsonNoStore({ ok: true }, 200, { "set-cookie": clearSessionCookie() });
}

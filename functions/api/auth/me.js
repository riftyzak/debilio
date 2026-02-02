import { getCookie, verifySession } from "./_session.js";

export async function onRequestGet({ request, env }) {
  const token = getCookie(request, "session");
  const payload = await verifySession(env, token);
  if (!payload?.uid || !payload?.u) {
    return new Response(JSON.stringify({ logged_in: false }), {
      headers: { "content-type": "application/json" }
    });
  }

  return new Response(JSON.stringify({
    logged_in: true,
    user_id: payload.uid,
    username: payload.u
  }), {
    headers: { "content-type": "application/json" }
  });
}

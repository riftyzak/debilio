import { clearSessionCookie } from "./_session";

export async function onRequestPost() {
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      "content-type": "application/json",
      "set-cookie": clearSessionCookie()
    }
  });
}

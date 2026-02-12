export async function serveAssetWithHeaders(context, assetPath, extraHeaders = {}) {
  const req = new Request(`https://assets.local${assetPath}`, {
    method: "GET",
    headers: context.request.headers,
  });

  const assetRes = await context.env.ASSETS.fetch(req);
  const headers = new Headers(assetRes.headers);

  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  for (const [name, value] of Object.entries(extraHeaders)) {
    headers.set(name, value);
  }

  return new Response(assetRes.body, {
    status: assetRes.status,
    statusText: assetRes.statusText,
    headers,
  });
}

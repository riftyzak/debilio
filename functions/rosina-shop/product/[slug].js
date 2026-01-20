export async function onRequest(context) {
  const url = new URL(context.request.url);
  const assetUrl = new URL("/rosina-shop/product.html", url);

  const res = await context.env.ASSETS.fetch(assetUrl.toString(), context.request);

  const headers = new Headers(res.headers);
  headers.set("content-type", "text/html; charset=utf-8");

  return new Response(res.body, { status: res.status, headers });
}

export async function onRequestGet(context) {
  const slug = context.params.slug;
  const url = new URL(context.request.url);

  // Fetch the real HTML file with the slug query
  const assetUrl = new URL("/rosina-shop/product.html", url);
  assetUrl.searchParams.set("slug", slug);

  // IMPORTANT: fetch the asset but return it to the original request
  const res = await context.env.ASSETS.fetch(assetUrl.toString(), context.request);

  const headers = new Headers(res.headers);
  headers.set("content-type", "text/html; charset=utf-8");
  // avoid any accidental caching while you debug
  headers.set("cache-control", "no-store");

  return new Response(res.body, { status: res.status, headers });
}

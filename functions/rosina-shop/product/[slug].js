export async function onRequestGet(context) {
  const slug = context.params.slug; // <-- from /product/<slug>
  const url = new URL(context.request.url);

  // Serve the static product page but with ?slug=<slug>
  url.pathname = "/rosina-shop/product.html";
  url.search = "";
  url.searchParams.set("slug", slug);

  // Use Pages asset fetch so it serves the built/static file
  const res = await context.env.ASSETS.fetch(url.toString(), context.request);

  const headers = new Headers(res.headers);
  headers.set("content-type", "text/html; charset=utf-8");
  return new Response(res.body, { status: res.status, headers });
}

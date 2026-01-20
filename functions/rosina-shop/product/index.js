export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const slug = url.searchParams.get("slug");

  // If someone hits /product?slug=abc -> redirect to /product/abc
  if (slug) {
    url.pathname = `/rosina-shop/product/${encodeURIComponent(slug)}`;
    url.search = "";
    return Response.redirect(url.toString(), 302);
  }

  // If no slug, send them to the shop home (or product.html)
  url.pathname = "/rosina-shop/";
  url.search = "";
  return Response.redirect(url.toString(), 302);
}

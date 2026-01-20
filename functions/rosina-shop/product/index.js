export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const slug = url.searchParams.get("slug");

  // If Cloudflare gives us /product?slug=abc, just SERVE the product page.
  if (slug) {
    const assetUrl = new URL("/rosina-shop/product.html", url);
    assetUrl.searchParams.set("slug", slug);

    return context.env.ASSETS.fetch(assetUrl.toString(), context.request);
  }

  // If no slug, optionally serve product.html with no slug (it will show not found)
  // or redirect to home. Safer is redirect to home ONCE.
  const home = new URL("/rosina-shop/", url);
  return Response.redirect(home.toString(), 302);
}

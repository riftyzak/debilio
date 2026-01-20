export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const slug = url.searchParams.get("slug");

  // If we have ?slug=, serve product.html with that slug
  if (slug) {
    const assetUrl = new URL("/rosina-shop/product.html", url);
    assetUrl.searchParams.set("slug", slug);
    return context.env.ASSETS.fetch(assetUrl.toString(), context.request);
  }

  // If no slug, serve the storefront index (NO redirect)
  const homeUrl = new URL("/rosina-shop/index.html", url);
  return context.env.ASSETS.fetch(homeUrl.toString(), context.request);
}

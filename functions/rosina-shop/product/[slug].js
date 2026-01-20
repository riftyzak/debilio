export async function onRequestGet(context) {
  const slug = context.params.slug;
  const url = new URL(context.request.url);

  const assetUrl = new URL("/rosina-shop/product.html", url);
  assetUrl.searchParams.set("slug", slug);

  return context.env.ASSETS.fetch(assetUrl.toString(), context.request);
}

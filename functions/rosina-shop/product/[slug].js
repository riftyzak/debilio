export async function onRequestGet(context) {
  const slug = context.params.slug;

  // Fetch the static product page as an ASSET request (NOT routed back into Functions)
  const assetPath = `/rosina-shop/product.html?slug=${encodeURIComponent(slug)}`;

  const req = new Request("https://assets.local" + assetPath, {
    method: "GET",
    headers: context.request.headers,
  });

  return context.env.ASSETS.fetch(req);
}

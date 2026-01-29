export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const slug = url.searchParams.get("slug");

  if (slug) {
    const assetPath = `/rosina-shop/product.html?slug=${encodeURIComponent(slug)}`;

    const req = new Request("https://assets.local" + assetPath, {
      method: "GET",
      headers: context.request.headers,
    });

    return context.env.ASSETS.fetch(req);
  }

  const req = new Request("https://assets.local/rosina-shop/index.html", {
    method: "GET",
    headers: context.request.headers,
  });

  return context.env.ASSETS.fetch(req);
}

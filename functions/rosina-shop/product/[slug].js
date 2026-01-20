export async function onRequestGet(context) {
  const slug = context.params.slug;
  const url = new URL(context.request.url);

  url.pathname = "/rosina-shop/product.html";
  url.search = "";
  url.searchParams.set("slug", slug);

  return context.env.ASSETS.fetch(url.toString(), context.request);
}

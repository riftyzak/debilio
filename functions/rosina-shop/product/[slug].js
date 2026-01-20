export async function onRequestGet(context) {
  const slug = context.params.slug; // <-- gets the [slug] from the URL
  const url = new URL(context.request.url);

  // Rewrite to the static product page and pass slug as query param
  url.pathname = "/rosina-shop/product.html";
  url.search = "";
  url.searchParams.set("slug", slug);

  // Fetch the static asset through Pages
  return fetch(url.toString(), context.request);
}

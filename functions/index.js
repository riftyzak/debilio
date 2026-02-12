import { serveAssetWithHeaders } from "./_lib/html-security.js";

const INDEX_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'";

export async function onRequestGet(context) {
  return serveAssetWithHeaders(context, "/index.html", {
    "Content-Security-Policy": INDEX_CSP,
  });
}

const bgText = document.getElementById("bgText");
const orderItems = document.getElementById("orderItems");
const timeEl = document.getElementById("time");
const dashboardCta = document.getElementById("dashboardCta");

if (timeEl) {
  timeEl.textContent = new Date().toLocaleString();
}

if (bgText) {
  const phrase = "I LOVE RADEK NEVARIL ";
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < 80; i++) {
    const line = document.createElement("div");
    line.textContent = phrase.repeat(8);
    fragment.appendChild(line);
  }
  bgText.replaceChildren(fragment);
}

try { localStorage.removeItem("rosina_cart_v1"); } catch (_) {}
try { localStorage.removeItem("rosina_promo_v1"); } catch (_) {}
try { localStorage.removeItem("rosina_last_order_v1"); } catch (_) {}

function renderMuted(text) {
  if (!orderItems) return;
  orderItems.replaceChildren();
  const muted = document.createElement("div");
  muted.className = "muted";
  muted.textContent = text;
  orderItems.appendChild(muted);
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  let parsed = null;
  try {
    parsed = await res.json();
  } catch (_) {
    parsed = null;
  }

  return { ok: res.ok, status: res.status, data: parsed };
}

function renderKeys(keys) {
  if (!orderItems) return;
  orderItems.replaceChildren();

  if (!Array.isArray(keys) || keys.length === 0) {
    renderMuted("No keys were found for this claim token.");
    if (dashboardCta) dashboardCta.style.display = "none";
    return;
  }

  if (dashboardCta) dashboardCta.style.display = "inline-flex";

  for (const row of keys) {
    const box = document.createElement("div");
    box.className = "delivery-box";

    const line = document.createElement("div");
    line.className = "delivery-row";

    const keyEl = document.createElement("span");
    keyEl.className = "delivery-key";
    keyEl.textContent = `Delivery: ${String(row.key || "")}`;

    const button = document.createElement("button");
    button.className = "copy-btn";
    button.type = "button";
    button.setAttribute("data-copy", String(row.key || ""));
    button.textContent = "Copy";

    line.appendChild(keyEl);
    line.appendChild(button);

    box.appendChild(line);

    if (row.product_id || row.product_variant_id) {
      const meta = document.createElement("div");
      meta.className = "muted";
      const parts = [];
      if (row.product_id) parts.push(`Product: ${row.product_id}`);
      if (row.product_variant_id) parts.push(`Variant: ${row.product_variant_id}`);
      meta.textContent = parts.join(" | ");
      box.appendChild(meta);
    }

    orderItems.appendChild(box);
  }
}

async function run() {
  const params = new URLSearchParams(window.location.search);
  const claim = String(params.get("claim") || "").trim();

  if (!claim) {
    renderMuted("Missing claim token. Use the secure link sent by email.");
    return;
  }

  try {
    const response = await postJson("/api/claim", { claim });
    if (!response.ok) {
      if (response.status === 400 || response.status === 404) {
        renderMuted("Invalid or expired claim token.");
      } else if (response.status === 409) {
        renderMuted("Keys are being prepared. Please refresh in a few seconds.");
      } else if (response.status === 429) {
        renderMuted("Too many attempts. Please retry in a minute.");
      } else {
        renderMuted("Unable to load keys right now.");
      }
      return;
    }

    renderKeys(response.data?.keys || []);
  } catch (_) {
    renderMuted("Unable to load keys right now.");
  }
}

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-copy]");
  if (!button) return;
  const value = String(button.getAttribute("data-copy") || "");
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    button.classList.add("is-copied");
    button.textContent = "Copied";
    setTimeout(() => {
      button.classList.remove("is-copied");
      button.textContent = "Copy";
    }, 1200);
  } catch (_) {}
});

run();

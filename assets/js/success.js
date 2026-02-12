const bgText = document.getElementById("bgText");
const orderItems = document.getElementById("orderItems");
const timeEl = document.getElementById("time");
const providerEl = document.getElementById("provider");
const dashboardCta = document.getElementById("dashboardCta");
const claimRunnerKey = "__rosina_claim_runner_started__";

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

function normalizeProviderName(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "-";
  if (raw === "stripe") return "Stripe";
  if (raw === "coinbase") return "Coinbase";
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function setProvider(value) {
  if (!providerEl) return;
  providerEl.textContent = normalizeProviderName(value);
}

function renderCopyButton(button, copied) {
  if (!button) return;
  button.innerHTML = copied
    ? `
      <i class="fas fa-check copy-icon" aria-hidden="true"></i>
      <span>Copied</span>
    `
    : `
      <i class="far fa-copy copy-icon" aria-hidden="true"></i>
      <span>Copy</span>
    `;
}

function formatExpiry(value) {
  if (!value) return "";
  const dt = new Date(String(value));
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleString();
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

function normalizeFallbackItems(keys) {
  if (!Array.isArray(keys)) return [];
  return keys.map((row) => ({
    product_id: row?.product_id ? String(row.product_id) : null,
    product_variant_id: row?.product_variant_id ? String(row.product_variant_id) : null,
    product_title: row?.product_id ? `Product ${String(row.product_id)}` : "Purchased item",
    key: row?.key ? String(row.key) : "",
    duration_days: null,
    expires_at: null,
  }));
}

function renderPurchasedItems(payload) {
  if (!orderItems) return;
  orderItems.replaceChildren();

  const apiItems = Array.isArray(payload?.items) ? payload.items : [];
  const fallbackItems = normalizeFallbackItems(payload?.keys || []);
  const items = apiItems.length ? apiItems : fallbackItems;

  if (!items.length) {
    renderMuted("No purchased items were found for this claim token.");
    if (dashboardCta) dashboardCta.style.display = "none";
    return;
  }

  if (dashboardCta) dashboardCta.style.display = "inline-flex";

  for (const row of items) {
    const box = document.createElement("div");
    box.className = "delivery-box";

    const title = document.createElement("div");
    title.className = "item-name";
    title.textContent = String(row?.product_title || row?.product_id || "Purchased item");
    box.appendChild(title);

    const line = document.createElement("div");
    line.className = "delivery-row";

    const keyValue = String(row?.key || "");
    if (keyValue) {
      const keyEl = document.createElement("span");
      keyEl.className = "delivery-key";
      keyEl.textContent = `Delivery: ${keyValue}`;

      const button = document.createElement("button");
      button.className = "copy-btn";
      button.type = "button";
      button.setAttribute("data-copy", keyValue);
      renderCopyButton(button, false);

      line.appendChild(keyEl);
      line.appendChild(button);
    } else {
      const noKey = document.createElement("span");
      noKey.className = "muted";
      noKey.textContent = "No license key required for this item.";
      line.appendChild(noKey);
    }

    box.appendChild(line);

    const duration = Number(row?.duration_days);
    const expiryText = formatExpiry(row?.expires_at);
    if ((Number.isFinite(duration) && duration > 0) || expiryText || row?.product_id || row?.product_variant_id) {
      const meta = document.createElement("div");
      meta.className = "item-meta";
      const parts = [];
      if (Number.isFinite(duration) && duration > 0) parts.push(`Duration: ${duration} days`);
      if (expiryText) parts.push(`Expires: ${expiryText}`);
      if (row?.product_id) parts.push(`Product ID: ${row.product_id}`);
      if (row?.product_variant_id) parts.push(`Variant ID: ${row.product_variant_id}`);
      meta.textContent = parts.join(" | ");
      box.appendChild(meta);
    }

    orderItems.appendChild(box);
  }
}

async function run() {
  if (window[claimRunnerKey]) return;
  window[claimRunnerKey] = true;

  const params = new URLSearchParams(window.location.search);
  const claim = String(params.get("claim") || "").trim();
  const maxPendingRetries = 15;
  const pendingRetryDelayMs = (attempt) => Math.min(10000, 1500 + attempt * 700);

  if (!claim) {
    renderMuted("Missing claim token. Use the secure link sent by email.");
    return;
  }

  const claimOnce = async (attempt) => {
    try {
      const response = await postJson("/api/claim", { claim });
      if (response.data?.provider) setProvider(response.data.provider);
      const isPending = response.status === 202 || response.status === 409 || response.data?.pending === true;

      if (response.ok && !isPending) {
        renderPurchasedItems(response.data || {});
        return;
      }

      if (isPending) {
        if (attempt < maxPendingRetries) {
          renderMuted("Items are being prepared. Please wait a moment...");
          setTimeout(() => {
            claimOnce(attempt + 1);
          }, pendingRetryDelayMs(attempt));
        } else {
          renderMuted("Items are still being prepared. Please refresh in a few seconds.");
        }
        return;
      }

      if (response.status === 400 || response.status === 404) {
        renderMuted("Invalid or expired claim token.");
      } else if (response.status === 429) {
        renderMuted("Too many attempts. Please retry in a minute.");
      } else {
        renderMuted("Unable to load purchased items right now.");
      }
    } catch (_) {
      renderMuted("Unable to load purchased items right now.");
    }
  };

  try {
    await claimOnce(0);
  } catch (_) {
    renderMuted("Unable to load purchased items right now.");
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
    renderCopyButton(button, true);
    setTimeout(() => {
      button.classList.remove("is-copied");
      renderCopyButton(button, false);
    }, 1200);
  } catch (_) {}
});

run();

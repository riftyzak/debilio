(function(){
  // Prevent double-loading
  if (window.__rosinaCartLoaded) return;
  window.__rosinaCartLoaded = true;

const CART_KEY = "rosina_cart_v1";
const PROMO_KEY = "rosina_promo_v1";

const PROMOS = {
  xrs: { type: "multiplier", multiplier: 2, label: "XRS Premium (2x)" },
  sebastian: { type: "discount", rate: 0.1337, label: "Discount (13.37%)" },
  robrt007main: { type: "fixed", fixedTotal: 777, label: "Special Price" },
};

let appliedPromo = loadPromo();
let cart = loadCart();
let cartProductMap = new Map();
let cartVariantMap = new Map();

function loadCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((x) => ({
        id: String(x.id),
        qty: Math.max(1, Number(x.qty || 1)),
        variant_id: x.variant_id ? String(x.variant_id) : null,
      }))
      .filter((x) => x.id && Number.isFinite(x.qty));
  } catch {
    return [];
  }
}

function saveCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

function loadPromo() {
  const code = (localStorage.getItem(PROMO_KEY) || "").trim().toLowerCase();
  return code && PROMOS[code] ? { code } : null;
}

function savePromo() {
  localStorage.setItem(PROMO_KEY, appliedPromo ? appliedPromo.code : "");
}

function cartCount() {
  return cart.reduce((sum, x) => sum + (x.qty || 1), 0);
}

function updateCartBadge() {
  const el = document.getElementById("cartCount");
  if (el) el.textContent = String(cartCount());
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function moneyEUR(v) {
  return `€${Number(v).toFixed(2)}`;
}

function injectCartStyles() {
  if (document.getElementById("rosina-cart-styles")) return;

  const style = document.createElement("style");
  style.id = "rosina-cart-styles";
  style.textContent = `
    /* Cart modal baseline */
    #cartModal.cart-modal { display:none; }
    #cartModal.cart-modal.show { display:flex; }

    /* If your page already styles these, this will mostly just "fit in" */
    #cartModal .cart-content {
      background: rgba(20, 20, 20, 0.98);
      border: 2px solid #4a90e2;
      border-radius: 12px;
      padding: 40px;
      max-width: 600px;
      width: 90%;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: 0 14px 40px rgba(0,0,0,0.55);
    }

    #cartModal .cart-title {
      font-size: 28px;
      font-weight: 700;
      color: #4a90e2;
    }

    /* Cart item rows */
    #cartItems .cart-row {
      background: rgba(0,0,0,0.35);
      border: 2px solid #333;
      border-radius: 12px;
      padding: 14px;
      margin-bottom: 12px;
      display: grid;
      grid-template-columns: 1fr auto auto;
      gap: 10px;
      align-items: center;
      transition: all 0.2s ease;
    }
    #cartItems .cart-row:hover { border-color: #4a90e2; }

    #cartItems .cart-name {
      font-weight: 700;
      margin-bottom: 4px;
      color: #fff;
      line-height: 1.2;
    }
    #cartItems .cart-price {
      font-weight: 700;
      color: #4a90e2;
      white-space: nowrap;
    }
    #cartItems .cart-meta {
      color: #888;
      font-size: 12px;
    }

    /* Qty input */
    #cartItems input.qty {
      width: 78px;
      background: rgba(0,0,0,0.5);
      border: 2px solid #333;
      border-radius: 10px;
      color: #fff;
      padding: 10px 10px;
      font-family: inherit;
      font-size: 14px;
      outline: none;
      transition: border-color 0.2s ease;
    }
    #cartItems input.qty:focus { border-color:#4a90e2; }

    /* Remove button */
    #cartItems button.remove-item {
      background: #111;
      border: 2px solid #333;
      color: #fff;
      border-radius: 10px;
      padding: 10px 12px;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    #cartItems button.remove-item:hover {
      border-color: #dc3545;
      transform: translateY(-1px);
    }

    /* Promo message (reused) */
    #promoMessage.promo-message {
      display:none;
      font-size: 13px;
      margin-top: 10px;
      padding: 10px 12px;
      border-radius: 10px;
      border: 2px solid #333;
      background: rgba(0,0,0,0.25);
    }
    #promoMessage.promo-message.show { display:block; }
    #promoMessage.promo-message.success { border-color: rgba(74,144,226,0.8); color:#4a90e2; background: rgba(74,144,226,0.12); }
    #promoMessage.promo-message.error { border-color: rgba(220,53,69,0.8); color:#dc3545; background: rgba(220,53,69,0.12); }

    /* Totals block */
    #cartTotal .total-row {
      display:flex;
      justify-content:space-between;
      margin-bottom:10px;
      font-size: 16px;
      color:#ddd;
    }
    #cartTotal .total-row.final {
      margin-top: 14px;
      padding-top: 12px;
      border-top: 2px solid #333;
      font-size: 24px;
      font-weight: 700;
      color:#4a90e2;
    }

    /* Optional toast (if present on the page) */
    .toast {
      position: fixed;
      bottom: 22px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(20,20,20,0.95);
      border: 2px solid #333;
      color: #fff;
      padding: 12px 16px;
      border-radius: 12px;
      z-index: 3000;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.25s ease, transform 0.25s ease, border-color 0.25s ease;
    }
    .toast.show { opacity: 1; transform: translateX(-50%) translateY(-2px); }
    .toast.success { border-color: #4a90e2; }
  `;
  document.head.appendChild(style);
}

async function refreshCartProductsFromSupabase() {
  if (typeof SUPABASE_URL === "undefined" || typeof SUPABASE_ANON_KEY === "undefined") return;

  const ids = [...new Set(cart.map((x) => String(x.id)))];
  if (!ids.length) {
    cartProductMap = new Map();
    return;
  }

  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    Accept: "application/json",
  };

  const idList = ids.map((id) => `"${String(id).replaceAll('"', '\\"')}"`).join(",");
  const url =
    `${SUPABASE_URL}/rest/v1/products` +
    `?select=id,title,price_eur,image_url,is_active` +
    `&id=in.(${idList})` +
    `&is_active=eq.true`;

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  const products = (data || []).map((p) => ({ ...p, price_eur: Number(p.price_eur) }));
  cartProductMap = new Map(products.map((p) => [String(p.id), p]));

  await refreshCartVariantsFromSupabase(headers);
}

async function refreshCartVariantsFromSupabase(headers) {
  const variantIds = [...new Set(cart.map((x) => x.variant_id).filter(Boolean))];
  if (!variantIds.length) {
    cartVariantMap = new Map();
    return;
  }

  const idList = variantIds.map((id) => `"${String(id).replaceAll('"', '\\"')}"`).join(",");
  const base = `${SUPABASE_URL}/rest/v1/product_variants`;
  const selects = [
    "id,product_id,duration_days,price_eur,auto_deliver,delivery_text",
    "id,product_id,duration_days,price_eur",
  ];

  for (const select of selects) {
    const url = `${base}?select=${select}&id=in.(${idList})`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      if (res.status === 400 && select !== selects[selects.length - 1]) {
        continue;
      }
      cartVariantMap = new Map();
      return;
    }
    const data = await res.json();
    const variants = (data || []).map((v) => ({
      ...v,
      price_eur: Number(v.price_eur),
      duration_days:
        v.duration_days !== null && v.duration_days !== undefined ? Number(v.duration_days) : null,
      auto_deliver: Boolean(v.auto_deliver),
      delivery_text: v.delivery_text || "",
    }));
    cartVariantMap = new Map(variants.map((v) => [String(v.id), v]));
    return;
  }
}

function findProductByIdGeneric(id) {
  if (typeof products !== "undefined" && Array.isArray(products)) {
    const p = products.find((x) => String(x.id) === String(id));
    if (p) return p;
  }

  const key = String(id);
  if (cartProductMap.has(key)) return cartProductMap.get(key);

  if (typeof currentProduct !== "undefined" && currentProduct && String(currentProduct.id) === key) {
    return currentProduct;
  }

  return null;
}

// ===== cart UI =====
async function toggleCart() {
  injectCartStyles();

  const modal = document.getElementById("cartModal");
  if (!modal) return;

  const usesClass = modal.classList.contains("cart-modal");
  const isOpen = usesClass ? modal.classList.contains("show") : modal.style.display === "flex";
  const opening = !isOpen;

  if (usesClass) {
    modal.classList.toggle("show", opening);
  } else {
    modal.style.display = opening ? "flex" : "none";
  }

  if (opening) {
    try {
      await refreshCartProductsFromSupabase();
    } catch (e) {
      // fail silently for customers; cart can still render with what we have
    }
    renderCart();
  }
}

function removeFromCart(productId, variantId = null) {
  const id = String(productId);
  const variantKey = variantId ? String(variantId) : null;
  cart = cart.filter((x) => !(x.id === id && String(x.variant_id || "") === String(variantKey || "")));
  saveCart();
  updateCartBadge();
  renderCart();
}

function setQty(productId, qty, variantId = null) {
  const id = String(productId);
  const variantKey = variantId ? String(variantId) : null;
  const q = Math.max(1, Number(qty || 1));
  const item = cart.find(
    (x) => x.id === id && String(x.variant_id || "") === String(variantKey || "")
  );
  if (!item) return;
  item.qty = q;
  saveCart();
  updateCartBadge();
  renderCart();
}

function addToCart(productId, qty = 1, variantId = null) {
  const id = String(productId);
  const variantKey = variantId ? String(variantId) : null;
  const q = Math.max(1, Number(qty || 1));
  const existing = cart.find(
    (x) => x.id === id && String(x.variant_id || "") === String(variantKey || "")
  );
  if (existing) existing.qty += q;
  else cart.push({ id, qty: q, variant_id: variantKey });

  saveCart();
  updateCartBadge();

  const toast = document.getElementById("toast");
  if (toast) {
    toast.className = `toast success show`;
    toast.textContent = "Added to cart.";
    clearTimeout(addToCart._t);
    addToCart._t = setTimeout(() => {
      toast.className = "toast";
      toast.textContent = "";
    }, 2200);
  }
}

function buyNow(productId, variantId = null) {
  cart = [{ id: String(productId), qty: 1, variant_id: variantId ? String(variantId) : null }];
  localStorage.setItem("rosina_cart_v1", JSON.stringify(cart));
  updateCartBadge();

  window.location.href = "/rosina-shop/checkout.html";
}

function renderPromoControls() {
  const input = document.getElementById("promoCode");
  const msg = document.getElementById("promoMessage");
  const btn = document.getElementById("promoBtn");
  if (!input || !msg || !btn) return;

  if (appliedPromo) {
    input.value = appliedPromo.code.toUpperCase();
    input.disabled = true;
    btn.textContent = "Remove";

    msg.className = "promo-message show success";
    msg.innerHTML = `<i class="fas fa-check"></i> Promo applied: ${escapeHtml(appliedPromo.code.toUpperCase())}`;
  } else {
    input.value = "";
    input.disabled = false;
    btn.textContent = "Apply";

    msg.className = "promo-message";
    msg.innerHTML = "";
  }
}

function applyOrRemovePromo() {
  const input = document.getElementById("promoCode");
  const msg = document.getElementById("promoMessage");
  if (!input || !msg) return;

  if (appliedPromo) {
    appliedPromo = null;
    savePromo();
    renderPromoControls();
    calculateTotal();

    msg.className = "promo-message show success";
    msg.innerHTML = `<i class="fas fa-check"></i> Promo removed`;
    return;
  }

  const code = (input.value || "").trim().toLowerCase();
  if (PROMOS[code]) {
    appliedPromo = { code };
    savePromo();
    renderPromoControls();
    calculateTotal();
  } else {
    appliedPromo = null;
    savePromo();
    renderPromoControls();
    calculateTotal();

    msg.className = "promo-message show error";
    msg.innerHTML = `<i class="fas fa-times"></i> Invalid promo code`;
  }
}

function renderCart() {
  const itemsEl = document.getElementById("cartItems");
  const totalEl = document.getElementById("cartTotal");
  if (!itemsEl || !totalEl) return;

  if (cart.length === 0) {
    itemsEl.innerHTML = `<div style="color:#888;padding:18px 0;text-align:center;">Your cart is empty</div>`;
    totalEl.innerHTML = "";
    renderPromoControls();
    return;
  }

  const resolved = cart
    .map((item) => {
      const p = findProductByIdGeneric(item.id);
      const variant = item.variant_id ? cartVariantMap.get(String(item.variant_id)) : null;
      return p ? { item, p, variant } : null;
    })
    .filter(Boolean);

  // Drop items we can't resolve (e.g., product deleted)
  if (resolved.length !== cart.length) {
    cart = resolved.map(({ item }) => ({
      id: String(item.id),
      qty: item.qty,
      variant_id: item.variant_id || null,
    }));
    saveCart();
    updateCartBadge();
  }

  if (resolved.length === 0) {
    itemsEl.innerHTML = `<div style="color:#888;padding:18px 0;text-align:center;">Your cart is empty</div>`;
    totalEl.innerHTML = "";
    renderPromoControls();
    return;
  }

  itemsEl.innerHTML = resolved
    .map(({ item, p, variant }) => {
      const qty = item.qty || 1;
      const unit = Number(variant?.price_eur ?? p.price_eur) || 0;
      const line = unit * qty;
      const durationLabel = variant?.duration_days
        ? ` • ${variant.duration_days} day${variant.duration_days === 1 ? "" : "s"}`
        : "";

      return `
        <div class="cart-row">
          <div>
            <div class="cart-name">${escapeHtml(p.title)}</div>
            <div class="cart-meta">Qty: ${qty}${durationLabel}</div>
            <div class="cart-price">${moneyEUR(line)}</div>
          </div>
          <input class="qty" type="number" min="1" value="${qty}" onchange="setQty('${String(p.id)}', this.value, '${String(item.variant_id || "")}')">
          <button class="remove-item" onclick="removeFromCart('${String(p.id)}', '${String(item.variant_id || "")}')" aria-label="Remove item">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      `;
    })
    .join("");

  calculateTotal();
  renderPromoControls();
}

function calculateTotal() {
  const totalEl = document.getElementById("cartTotal");
  if (!totalEl) return;

  const subtotal = cart.reduce((sum, item) => {
    const p = findProductByIdGeneric(item.id);
    if (!p) return sum;
    const variant = item.variant_id ? cartVariantMap.get(String(item.variant_id)) : null;
    const price = Number(variant?.price_eur ?? p.price_eur) || 0;
    return sum + price * (item.qty || 1);
  }, 0);

  let total = subtotal;
  let discount = 0;

  if (appliedPromo) {
    const promo = PROMOS[appliedPromo.code];
    if (promo) {
      if (promo.type === "multiplier") total = subtotal * promo.multiplier;
      if (promo.type === "discount") {
        discount = subtotal * promo.rate;
        total = subtotal - discount;
      }
      if (promo.type === "fixed") total = promo.fixedTotal;
    }
  }

  let promoLine = "";
  if (appliedPromo) {
    if (appliedPromo.code === "xrs") {
      promoLine = `
        <div class="total-row" style="color:#dc3545;">
          <span>PISTOLNIK TAX (2x)</span><span>+${moneyEUR(subtotal)}</span>
        </div>
      `;
    } else if (appliedPromo.code === "sebastian") {
      promoLine = `
        <div class="total-row" style="color:#4a90e2;">
          <span>Discount (13.37%)</span><span>-${moneyEUR(discount)}</span>
        </div>
      `;
    } else if (appliedPromo.code === "robrt007main") {
      promoLine = `
        <div class="total-row" style="color:#4a90e2;">
          <span>Special price</span><span>${moneyEUR(777)}</span>
        </div>
      `;
    }
  }

  totalEl.innerHTML = `
    <div class="total-row"><span>Subtotal</span><span>${moneyEUR(subtotal)}</span></div>
    ${promoLine}
    <div class="total-row final"><span>Total</span><span>${moneyEUR(total)}</span></div>
  `;
}

// Expose globals for inline onclick handlers
window.toggleCart = toggleCart;
window.addToCart = addToCart;
window.buyNow = buyNow;
window.removeFromCart = removeFromCart;
window.setQty = setQty;
window.applyOrRemovePromo = applyOrRemovePromo;

window.addEventListener("DOMContentLoaded", () => {
  injectCartStyles();
  updateCartBadge();
  renderPromoControls();

  const input = document.getElementById("promoCode");
  const msg = document.getElementById("promoMessage");
  if (input && msg) {
    input.addEventListener("input", () => {
      if (!appliedPromo) {
        msg.className = "promo-message";
        msg.innerHTML = "";
      }
    });
  }
});

  // Export key functions for inline onclick handlers
  window.toggleCart = toggleCart;
  window.applyOrRemovePromo = applyOrRemovePromo;
  window.addToCart = addToCart;
  window.buyNow = buyNow;
})();

(function () {
  // Prevent double-loading
  if (window.__rosinaCartLoaded) return;
  window.__rosinaCartLoaded = true;

  const CART_KEY = "rosina_cart_v1";
  const PROMO_KEY = "rosina_promo_v1";

  const PROMOS = {
    xrs: { type: "multiplier", multiplier: 2, label: "XRS Premium (2x)" },
    sebastian: { type: "discount", rate: 0.1337, label: "Discount (13.37%)" },
    robrt007main: { type: "fixed", fixedTotal: 777, label: "Special total (777)" }
  };

  function getCart() {
    try { return JSON.parse(localStorage.getItem(CART_KEY) || "[]"); }
    catch { return []; }
  }

  function setCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart || []));
  }

  function getPromoCode() {
    return (localStorage.getItem(PROMO_KEY) || "").trim();
  }

  function setPromoCode(code) {
    localStorage.setItem(PROMO_KEY, (code || "").trim());
  }

  function formatMoney(n) {
    if (typeof n !== "number" || Number.isNaN(n)) n = 0;
    return n.toFixed(2);
  }

  function computeSubtotal(items) {
    return items.reduce((sum, it) => sum + (Number(it.price) || 0) * (Number(it.qty) || 1), 0);
  }

  function computeTotalWithPromo(subtotal, code) {
    const key = (code || "").toLowerCase().trim();
    const promo = PROMOS[key];
    if (!promo) return { total: subtotal, label: "" };

    if (promo.type === "multiplier") {
      return { total: subtotal * promo.multiplier, label: promo.label };
    }
    if (promo.type === "discount") {
      return { total: subtotal * (1 - promo.rate), label: promo.label };
    }
    if (promo.type === "fixed") {
      return { total: promo.fixedTotal, label: promo.label };
    }
    return { total: subtotal, label: "" };
  }

  // UI element lookups (may not exist on every page)
  const cartCountEl = document.getElementById("cartCount");
  const cartModalEl = document.getElementById("cartModal");
  const cartItemsEl = document.getElementById("cartItems");
  const cartTotalEl = document.getElementById("cartTotal");

  const promoCodeEl = document.getElementById("promoCode");
  const promoMsgEl = document.getElementById("promoMessage");
  const promoBtnEl = document.getElementById("promoBtn");

  function updateCartCount() {
    if (!cartCountEl) return;
    const cart = getCart();
    const count = cart.reduce((s, it) => s + (Number(it.qty) || 1), 0);
    cartCountEl.textContent = String(count);
  }

  function renderCartModal() {
    if (!cartItemsEl || !cartTotalEl) return;

    const cart = getCart();
    if (!cart.length) {
      cartItemsEl.innerHTML = '<div style="color:#888;">Your cart is empty.</div>';
      cartTotalEl.innerHTML = "";
      return;
    }

    cartItemsEl.innerHTML = cart.map((it, idx) => {
      const name = (it.name || "Item").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const qty = Number(it.qty) || 1;
      const price = Number(it.price) || 0;
      return `
        <div class="cart-item" style="display:flex;justify-content:space-between;gap:12px;margin-bottom:10px;">
          <div>
            <div style="font-weight:700;">${name}</div>
            <div style="color:#888;font-size:13px;">Qty: ${qty}</div>
          </div>
          <div style="text-align:right;">
            <div>${formatMoney(price * qty)} Kč</div>
            <button class="btn secondary" style="margin-top:6px;padding:8px 10px;font-size:12px;" onclick="window.removeFromCart(${idx})">Remove</button>
          </div>
        </div>`;
    }).join("");

    const subtotal = computeSubtotal(cart);
    const code = getPromoCode();
    const { total, label } = computeTotalWithPromo(subtotal, code);

    cartTotalEl.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span style="color:#bbb;">Subtotal</span><span>${formatMoney(subtotal)} Kč</span>
      </div>
      ${label ? `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;">
        <span style="color:#bbb;">Promo</span><span style="color:#fff;">${label}</span>
      </div>` : ""}
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;font-size:18px;font-weight:800;">
        <span>Total</span><span>${formatMoney(total)} Kč</span>
      </div>`;
  }

  function toggleCart() {
    // Cart modal is optional (checkout page can omit it)
    if (!cartModalEl) return;
    cartModalEl.classList.toggle("show");
    if (cartModalEl.classList.contains("show")) renderCartModal();
  }

  function addToCart(item) {
    const cart = getCart();
    const incoming = {
      id: item && item.id != null ? String(item.id) : String(Date.now()),
      name: item && item.name ? String(item.name) : "Item",
      price: Number(item && item.price) || 0,
      qty: Number(item && item.qty) || 1
    };

    const existing = cart.find(x => String(x.id) === incoming.id);
    if (existing) existing.qty = (Number(existing.qty) || 1) + incoming.qty;
    else cart.push(incoming);

    setCart(cart);
    updateCartCount();
    renderCartModal();
  }

  function removeFromCart(index) {
    const cart = getCart();
    cart.splice(index, 1);
    setCart(cart);
    updateCartCount();
    renderCartModal();
  }

  function applyOrRemovePromo() {
    if (!promoCodeEl || !promoMsgEl || !promoBtnEl) return;

    const current = getPromoCode();
    const entered = (promoCodeEl.value || "").trim().toLowerCase();

    // If promo currently applied, remove it
    if (current) {
      setPromoCode("");
      promoCodeEl.value = "";
      promoBtnEl.textContent = "Apply";
      promoMsgEl.textContent = "";
      // allow pages to react
      window.dispatchEvent(new CustomEvent("rosina:promo-changed"));
      renderCartModal();
      return;
    }

    if (!entered || !PROMOS[entered]) {
      promoMsgEl.textContent = "Invalid promo code.";
      return;
    }

    setPromoCode(entered);
    promoBtnEl.textContent = "Remove";
    promoMsgEl.textContent = `Applied: ${PROMOS[entered].label}`;
    window.dispatchEvent(new CustomEvent("rosina:promo-changed"));
    renderCartModal();
  }

  // Expose for inline onclicks used in existing HTML
  window.toggleCart = toggleCart;
  window.addToCart = addToCart;
  window.removeFromCart = removeFromCart;
  window.applyOrRemovePromo = applyOrRemovePromo;

  // Init UI state
  updateCartCount();

  // If promo UI exists on a page, set initial state
  if (promoCodeEl && promoBtnEl) {
    const code = getPromoCode();
    if (code) {
      promoBtnEl.textContent = "Remove";
      promoCodeEl.value = code;
      if (promoMsgEl && PROMOS[code]) promoMsgEl.textContent = `Applied: ${PROMOS[code].label}`;
    }
  }

})();

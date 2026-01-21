const CART_KEY = "rosina_cart_v1";
const PROMO_KEY = "rosina_promo_v1";

const PROMOS = {
    xrs: { type: 'multiplier', multiplier: 2, label: 'XRS Premium (2x)' },
    sebastian: { type: 'discount', rate: 0.1337, label: 'Discount (13.37%)' },
    robrt007main: { type: 'fixed', fixedTotal: 777, label: 'Special Price' }
};

let appliedPromo = loadPromo();
let cart = loadCart();


let cartProductMap = new Map();

function loadCart() {
    try {
        const raw = localStorage.getItem(CART_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(parsed)) return [];
        return parsed
            .map(x => ({ id: String(x.id), qty: Math.max(1, Number(x.qty || 1)) }))
            .filter(x => x.id && Number.isFinite(x.qty));
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
    const el = document.getElementById('cartCount');
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


async function refreshCartProductsFromSupabase() {
    if (typeof SUPABASE_URL === "undefined" || typeof SUPABASE_ANON_KEY === "undefined") return;

    const ids = [...new Set(cart.map(x => String(x.id)))];
    if (!ids.length) {
        cartProductMap = new Map();
        return;
    }

    const headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        "Accept": "application/json"
    };

    const idList = ids.map(id => `"${String(id).replaceAll('"', '\\"')}"`).join(",");
    const url =
        `${SUPABASE_URL}/rest/v1/products` +
        `?select=id,title,price_eur,image_url,is_active` +
        `&id=in.(${idList})` +
        `&is_active=eq.true`;

    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    const products = (data || []).map(p => ({ ...p, price_eur: Number(p.price_eur) }));
    cartProductMap = new Map(products.map(p => [String(p.id), p]));
}

function findProductByIdGeneric(id) {

    if (typeof products !== "undefined" && Array.isArray(products)) {
        const p = products.find(x => String(x.id) === String(id));
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
    const modal = document.getElementById('cartModal');
    if (!modal) return;


    const usesClass = modal.classList.contains('cart-modal');
    const isOpen = usesClass ? modal.classList.contains('show') : (modal.style.display === 'flex');

    const opening = !isOpen;

    if (usesClass) {
        modal.classList.toggle('show', opening);
    } else {
        modal.style.display = opening ? 'flex' : 'none';
    }

    if (opening) {
        try { await refreshCartProductsFromSupabase(); } catch (e) { console.error(e); }
        renderCart();
    }
}

function removeFromCart(productId) {
    const id = String(productId);
    cart = cart.filter(x => x.id !== id);
    saveCart();
    updateCartBadge();
    renderCart();
}

function setQty(productId, qty) {
    const id = String(productId);
    const q = Math.max(1, Number(qty || 1));
    const item = cart.find(x => x.id === id);
    if (!item) return;
    item.qty = q;
    saveCart();
    updateCartBadge();
    renderCart();
}

function addToCart(productId, qty = 1) {
    const id = String(productId);
    const q = Math.max(1, Number(qty || 1));
    const existing = cart.find(x => x.id === id);
    if (existing) existing.qty += q;
    else cart.push({ id, qty: q });

    saveCart();
    updateCartBadge();

    const toast = document.getElementById('toast');
    if (toast) {
        toast.className = `toast success show`;
        toast.textContent = "Added to cart.";
        clearTimeout(addToCart._t);
        addToCart._t = setTimeout(() => {
            toast.className = 'toast';
            toast.textContent = '';
        }, 2600);
    }
}

function buyNow(productId) {
    addToCart(productId, 1);
    toggleCart();
}

function renderPromoControls() {
    const input = document.getElementById('promoCode');
    const msg = document.getElementById('promoMessage');
    const btn = document.getElementById('promoBtn');
    if (!input || !msg || !btn) return;

    if (appliedPromo) {
        input.value = appliedPromo.code.toUpperCase();
        input.disabled = true;
        btn.textContent = "Remove";


        msg.style.display = 'block';
        msg.style.background = 'rgba(74, 144, 226, 0.2)';
        msg.style.color = '#4a90e2';
        msg.className = 'promo-message success';
        msg.innerHTML = `<i class="fas fa-check"></i> Promo applied: ${appliedPromo.code.toUpperCase()}`;
    } else {
        input.value = "";
        input.disabled = false;
        btn.textContent = "Apply";
        msg.style.display = 'none';
        msg.className = 'promo-message';
        msg.innerHTML = '';
    }
}

function applyOrRemovePromo() {
    const input = document.getElementById('promoCode');
    const msg = document.getElementById('promoMessage');
    if (!input || !msg) return;

    if (appliedPromo) {
        appliedPromo = null;
        savePromo();
        renderPromoControls();
        calculateTotal();

        msg.style.display = 'block';
        msg.style.background = 'rgba(74, 144, 226, 0.2)';
        msg.style.color = '#4a90e2';
        msg.className = 'promo-message success';
        msg.innerHTML = `<i class="fas fa-check"></i> Promo removed`;
        return;
    }

    const code = (input.value || '').trim().toLowerCase();
    if (PROMOS[code]) {
        appliedPromo = { code };
        savePromo();
        renderPromoControls();
        calculateTotal();
    } else {
        msg.style.display = 'block';
        msg.style.background = 'rgba(220, 53, 69, 0.2)';
        msg.style.color = '#dc3545';
        msg.className = 'promo-message error';
        msg.innerHTML = `<i class="fas fa-times"></i> Invalid promo code`;
        appliedPromo = null;
        savePromo();
        calculateTotal();
    }
}

function renderCart() {
    const itemsEl = document.getElementById('cartItems');
    const totalEl = document.getElementById('cartTotal');
    if (!itemsEl || !totalEl) return;

    if (cart.length === 0) {
        itemsEl.innerHTML = `<div style="color:#888;padding:20px 0;text-align:center;">Your cart is empty</div>`;
        totalEl.innerHTML = '';
        renderPromoControls();
        return;
    }

    const resolved = cart
        .map(item => {
            const p = findProductByIdGeneric(item.id);
            return p ? { item, p } : null;
        })
        .filter(Boolean);


    if (resolved.length !== cart.length) {
        cart = resolved.map(({ item }) => ({ id: String(item.id), qty: item.qty }));
        saveCart();
        updateCartBadge();
    }

    if (resolved.length === 0) {
        itemsEl.innerHTML = `<div style="color:#888;padding:20px 0;text-align:center;">Your cart is empty</div>`;
        totalEl.innerHTML = '';
        renderPromoControls();
        return;
    }


    itemsEl.innerHTML = resolved.map(({ item, p }) => `
    <div style="background:rgba(0,0,0,.5);border:2px solid #333;border-radius:8px;padding:15px;margin-bottom:15px;display:flex;justify-content:space-between;align-items:center;gap:12px;">
      <div style="flex:1;">
        <div style="font-weight:700;margin-bottom:5px;">${escapeHtml(p.title)}</div>
        <div style="color:#4a90e2;font-size:18px;">€${Number(p.price_eur).toFixed(2)}</div>
      </div>
      <input class="qty" type="number" min="1" value="${item.qty}" onchange="setQty('${String(p.id)}', this.value)">
      <button class="remove-item" onclick="removeFromCart('${String(p.id)}')"><i class="fas fa-trash"></i></button>
    </div>
  `).join('');

    calculateTotal();
    renderPromoControls();
}

function calculateTotal() {
    const totalEl = document.getElementById('cartTotal');
    if (!totalEl) return;

    const subtotal = cart.reduce((sum, item) => {
        const p = findProductByIdGeneric(item.id);
        if (!p) return sum;
        return sum + (Number(p.price_eur) * (item.qty || 1));
    }, 0);

    let total = subtotal;
    let discount = 0;

    if (appliedPromo) {
        const promo = PROMOS[appliedPromo.code];
        if (promo) {
            if (promo.type === 'multiplier') total = subtotal * promo.multiplier;
            if (promo.type === 'discount') { discount = subtotal * promo.rate; total = subtotal - discount; }
            if (promo.type === 'fixed') total = promo.fixedTotal;
        }
    }

    let promoLine = '';

    if (appliedPromo) {
        if (appliedPromo.code === 'xrs') {
            promoLine = `
        <div style="display:flex;justify-content:space-between;margin-bottom:10px;color:#dc3545;">
          <span>PISTOLNIK TAX (2x):</span><span>+€${subtotal.toFixed(2)}</span>
        </div>
      `;
        } else if (appliedPromo.code === 'sebastian') {
            promoLine = `
        <div style="display:flex;justify-content:space-between;margin-bottom:10px;color:#4a90e2;">
          <span>Discount (13.37%):</span><span>-€${discount.toFixed(2)}</span>
        </div>
      `;
        } else if (appliedPromo.code === 'robrt007main') {
            promoLine = `
        <div style="display:flex;justify-content:space-between;margin-bottom:10px;color:#4a90e2;">
          <span>robrt007main</span><span>€777.00</span>
        </div>
      `;
        }
    }

    totalEl.innerHTML = `
    <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
      <span>Subtotal:</span><span>€${subtotal.toFixed(2)}</span>
    </div>
    ${promoLine}
    <div style="display:flex;justify-content:space-between;margin-top:15px;font-size:24px;font-weight:700;color:#4a90e2;">
      <span>Total:</span><span>€${total.toFixed(2)}</span>
    </div>
  `;
}


window.toggleCart = toggleCart;
window.addToCart = addToCart;
window.buyNow = buyNow;
window.removeFromCart = removeFromCart;
window.setQty = setQty;
window.applyOrRemovePromo = applyOrRemovePromo;

window.addEventListener('DOMContentLoaded', () => {
    updateCartBadge();
    renderPromoControls();

    const input = document.getElementById('promoCode');
    const msg = document.getElementById('promoMessage');
    if (input && msg) {
        input.addEventListener('input', () => {
            if (!appliedPromo) {
                msg.style.display = 'none';
                msg.className = 'promo-message';
                msg.innerHTML = '';
            }
        });
    }
});

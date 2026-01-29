export const CART_KEY = "rosina_cart_v1";
export const PROMO_KEY = "rosina_promo_v1";

export type CartItem = {
  id: string;
  qty: number;
  variant_id: string | null;
};

export const PROMOS = {
  xrs: { type: "multiplier", multiplier: 2, label: "XRS Premium (2x)" },
  sebastian: { type: "discount", rate: 0.1337, label: "Discount (13.37%)" },
  robrt007main: { type: "fixed", fixedTotal: 777, label: "Special Price" },
};

export function loadCart(): CartItem[] {
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

export function saveCart(cart: CartItem[]) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

export function loadPromo(): string | null {
  const code = (localStorage.getItem(PROMO_KEY) || "").trim().toLowerCase();
  return code && PROMOS[code as keyof typeof PROMOS] ? code : null;
}

export function savePromo(code: string | null) {
  localStorage.setItem(PROMO_KEY, code ? code : "");
}

export function cartCount(cart: CartItem[]) {
  return cart.reduce((sum, x) => sum + (x.qty || 1), 0);
}

export function addToCart(cart: CartItem[], productId: string, qty = 1, variantId: string | null) {
  const id = String(productId);
  const variantKey = variantId ? String(variantId) : null;
  const q = Math.max(1, Number(qty || 1));
  const existing = cart.find(
    (x) => x.id === id && String(x.variant_id || "") === String(variantKey || "")
  );
  if (existing) existing.qty += q;
  else cart.push({ id, qty: q, variant_id: variantKey });
  return [...cart];
}

export function removeFromCart(cart: CartItem[], productId: string, variantId: string | null) {
  const id = String(productId);
  const variantKey = variantId ? String(variantId) : null;
  return cart.filter((x) => !(x.id === id && String(x.variant_id || "") === String(variantKey || "")));
}

export function updateCartQty(cart: CartItem[], productId: string, qty: number, variantId: string | null) {
  const id = String(productId);
  const variantKey = variantId ? String(variantId) : null;
  const q = Math.max(1, Number(qty || 1));
  const item = cart.find(
    (x) => x.id === id && String(x.variant_id || "") === String(variantKey || "")
  );
  if (!item) return [...cart];
  item.qty = q;
  return [...cart];
}

export function moneyEUR(v: number) {
  return `€${Number(v).toFixed(2)}`;
}

export function applyPromo(subtotal: number, code: string | null) {
  let total = subtotal;
  let discount = 0;
  if (code) {
    const promo = PROMOS[code as keyof typeof PROMOS];
    if (promo) {
      if (promo.type === "multiplier") total = subtotal * promo.multiplier;
      if (promo.type === "discount") {
        discount = subtotal * promo.rate;
        total = subtotal - discount;
      }
      if (promo.type === "fixed") total = promo.fixedTotal;
    }
  }

  return { total, discount };
}

export function promoLineHtml(code: string | null, subtotal: number, discount: number) {
  if (!code) return "";
  if (code === "xrs") {
    return `
      <div class="total-row" style="color:#dc3545;">
        <span>PISTOLNIK TAX (2x)</span><span>+${moneyEUR(subtotal)}</span>
      </div>
    `;
  }
  if (code === "sebastian") {
    return `
      <div class="total-row" style="color:#4a90e2;">
        <span>Discount (13.37%)</span><span>-${moneyEUR(discount)}</span>
      </div>
    `;
  }
  if (code === "robrt007main") {
    return `
      <div class="total-row" style="color:#4a90e2;">
        <span>Special price</span><span>${moneyEUR(777)}</span>
      </div>
    `;
  }
  return "";
}

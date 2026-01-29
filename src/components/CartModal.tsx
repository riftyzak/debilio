import { useEffect, useMemo, useState } from "react";
import {
  CartItem,
  loadPromo,
  moneyEUR,
  promoLineHtml,
  removeFromCart,
  savePromo,
  updateCartQty,
  applyPromo,
} from "../lib/cart";
import { fetchProductsByIds, fetchVariantsByIds, Product, ProductVariant } from "../lib/supabase";

interface CartModalProps {
  isOpen: boolean;
  onClose: () => void;
  cart: CartItem[];
  setCart: (cart: CartItem[]) => void;
}

export default function CartModal({ isOpen, onClose, cart, setCart }: CartModalProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [promo, setPromo] = useState<string | null>(null);

  useEffect(() => {
    setPromo(loadPromo());
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const load = async () => {
      try {
        const ids = [...new Set(cart.map((item) => item.id))];
        const productData = await fetchProductsByIds(ids);
        const variantData = await fetchVariantsByIds(cart.map((item) => item.variant_id));
        setProducts(productData);
        setVariants(variantData);
      } catch {
        setProducts([]);
        setVariants([]);
      }
    };
    void load();
  }, [isOpen, cart]);

  const productMap = useMemo(() => new Map(products.map((p) => [String(p.id), p])), [products]);
  const variantMap = useMemo(
    () => new Map(variants.map((variant) => [String(variant.id), variant])),
    [variants]
  );

  const resolvedItems = useMemo(() => {
    return cart
      .map((item) => {
        const product = productMap.get(String(item.id));
        const variant = item.variant_id ? variantMap.get(String(item.variant_id)) : null;
        return product ? { item, product, variant } : null;
      })
      .filter(Boolean) as Array<{ item: CartItem; product: Product; variant: ProductVariant | null }>;
  }, [cart, productMap, variantMap]);

  const subtotal = resolvedItems.reduce((sum, entry) => {
    const unit = Number(entry.variant?.price_eur ?? entry.product.price_eur) || 0;
    return sum + unit * (entry.item.qty || 1);
  }, 0);

  const { total, discount } = applyPromo(subtotal, promo);

  if (!isOpen) return null;

  return (
    <div className="cart-modal show" id="cartModal">
      <div className="cart-content">
        <div className="cart-header">
          <h2 className="cart-title">Your Cart</h2>
          <button className="close-cart" onClick={onClose}>
            ×
          </button>
        </div>

        <div id="cartItems">
          {resolvedItems.length === 0 ? (
            <div style={{ color: "#888", padding: "18px 0", textAlign: "center" }}>
              Your cart is empty
            </div>
          ) : (
            resolvedItems.map(({ item, product, variant }) => {
              const qty = item.qty || 1;
              const unit = Number(variant?.price_eur ?? product.price_eur) || 0;
              const line = unit * qty;
              const durationLabel = variant?.duration_days
                ? ` • ${variant.duration_days} day${variant.duration_days === 1 ? "" : "s"}`
                : "";

              return (
                <div className="cart-row" key={`${product.id}-${variant?.id || "base"}`}>
                  <div>
                    <div className="cart-name">{product.title}</div>
                    <div className="cart-meta">Qty: {qty}{durationLabel}</div>
                    <div className="cart-price">{moneyEUR(line)}</div>
                  </div>
                  <input
                    className="qty"
                    type="number"
                    min={1}
                    value={qty}
                    onChange={(event) => {
                      const next = updateCartQty(
                        [...cart],
                        product.id,
                        Number(event.target.value || 1),
                        item.variant_id
                      );
                      setCart(next);
                    }}
                  />
                  <button
                    className="remove-item"
                    onClick={() => {
                      setCart(removeFromCart([...cart], product.id, item.variant_id));
                    }}
                    aria-label="Remove item"
                  >
                    <i className="fas fa-trash"></i>
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="cart-total" id="cartTotal">
          {resolvedItems.length > 0 && (
            <>
              <div className="total-row">
                <span>Subtotal</span>
                <span>{moneyEUR(subtotal)}</span>
              </div>
              {promo && (
                <div
                  dangerouslySetInnerHTML={{
                    __html: promoLineHtml(promo, subtotal, discount),
                  }}
                />
              )}
              <div className="total-row final">
                <span>Total</span>
                <span>{moneyEUR(total)}</span>
              </div>
            </>
          )}
        </div>

        <a href="/rosina-shop/checkout.html" className="checkout-link">
          Go to Checkout
        </a>
      </div>
    </div>
  );
}

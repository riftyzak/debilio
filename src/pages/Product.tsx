import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import BackgroundText from "../components/BackgroundText";
import CartModal from "../components/CartModal";
import { addToCart, cartCount, moneyEUR } from "../lib/cart";
import useBodyClass from "../lib/useBodyClass";
import useCartState from "../lib/useCartState";
import { fetchProductBySlug, fetchVariantsByProductId, Product, ProductVariant } from "../lib/supabase";

export default function ProductPage() {
  useBodyClass("body-georama");
  const { slug } = useParams<{ slug: string }>();
  const { cart, setCart } = useCartState();
  const [product, setProduct] = useState<Product | null>(null);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [isCartOpen, setCartOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const bgClass = useMemo(() => "background-text background-text-shop", []);

  useEffect(() => {
    const load = async () => {
      if (!slug) return;
      try {
        const productData = await fetchProductBySlug(slug);
        if (!productData) {
          setProduct(null);
          return;
        }
        setProduct(productData);
        const variantData = await fetchVariantsByProductId(productData.id);
        setVariants(variantData);
        if (variantData.length > 0) {
          setSelectedVariantId(String(variantData[0].id));
        }
        document.title = `${productData.title} • Rosina Shop`;
      } catch (error) {
        console.error("Supabase fetch error:", error);
        setProduct(null);
      }
    };
    void load();
  }, [slug]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const selectedVariant = variants.find((variant) => String(variant.id) === String(selectedVariantId));
  const durationText = selectedVariant
    ? `Duration: ${selectedVariant.duration_days || "—"} day${selectedVariant.duration_days === 1 ? "" : "s"}`
    : product?.duration_days
      ? `Duration: ${Number(product.duration_days)} day${Number(product.duration_days) === 1 ? "" : "s"}`
      : "";

  return (
    <div className="page shop-page product-page">
      <BackgroundText text="I LOVE RADEK NEVARIL " rows={100} cols={10} className={bgClass} />

      <div className="container">
        <div className="topbar">
          <a href="/rosina-shop/" className="back-button">
            <i className="fas fa-arrow-left"></i> Back to shop
          </a>
          <button className="cart-button" onClick={() => setCartOpen(true)}>
            <i className="fas fa-shopping-cart"></i> Cart <span id="cartCount">{cartCount(cart)}</span>
          </button>
        </div>

        <div className="header">
          <div className="title">Rosina Shop</div>
          <p style={{ color: "#888" }}>Retired Pistolnik Store</p>
        </div>

        {product ? (
          <div className="card" id="productCard">
            <div className="hero">
              <div className="img">
                {product.image_url ? (
                  <img src={product.image_url} alt={product.title} loading="lazy" />
                ) : (
                  <div className="fallback">🛍️</div>
                )}
              </div>
              <div className="content">
                <div className="name">{product.title}</div>
                <div className="desc">{product.description || ""}</div>
                {durationText && (
                  <div className="desc" id="durationLabel" style={{ color: "#888", fontSize: "13px" }}>
                    {durationText}
                  </div>
                )}
                {variants.length > 0 && (
                  <div style={{ marginTop: "10px" }}>
                    <label
                      style={{
                        display: "block",
                        color: "#888",
                        fontSize: "12px",
                        textTransform: "uppercase",
                        letterSpacing: "1px",
                        marginBottom: "6px",
                      }}
                    >
                      Choose duration
                    </label>
                    <select
                      id="variantSelect"
                      value={selectedVariantId || ""}
                      onChange={(event) => setSelectedVariantId(event.target.value)}
                      style={{
                        width: "100%",
                        background: "rgba(0,0,0,0.5)",
                        border: "2px solid #333",
                        color: "#fff",
                        padding: "10px 12px",
                        borderRadius: "8px",
                        fontFamily: "inherit",
                        fontSize: "14px",
                      }}
                    >
                      {variants.map((variant) => (
                        <option key={variant.id} value={variant.id}>
                          {variant.duration_days} day{variant.duration_days === 1 ? "" : "s"} • {moneyEUR(variant.price_eur)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="price" id="priceLabel">
                  {moneyEUR(selectedVariant ? selectedVariant.price_eur : product.price_eur)}
                </div>
                <div className="actions">
                  <button
                    className="btn"
                    id="addToCartBtn"
                    onClick={() => {
                      const next = addToCart([...cart], String(product.id), 1, selectedVariantId);
                      setCart(next);
                      setToast("Added to cart.");
                    }}
                  >
                    <i className="fas fa-cart-plus"></i> Add to cart
                  </button>
                  <button
                    className="btn"
                    id="buyNowBtn"
                    onClick={() => {
                      setCart([{ id: String(product.id), qty: 1, variant_id: selectedVariantId }]);
                      window.location.href = "/rosina-shop/checkout.html";
                    }}
                  >
                    <i className="fas fa-bolt"></i> Buy now
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="card" id="notFound" style={{ padding: "28px" }}>
            <div style={{ fontSize: "24px", fontWeight: 700, color: "#4a90e2", marginBottom: "10px" }}>
              Product not found
            </div>
            <div style={{ color: "#888" }}>Go back to the shop and pick a product.</div>
          </div>
        )}
      </div>

      <div className={`toast${toast ? " success show" : ""}`} id="toast">
        {toast || ""}
      </div>

      <CartModal isOpen={isCartOpen} onClose={() => setCartOpen(false)} cart={cart} setCart={setCart} />
    </div>
  );
}

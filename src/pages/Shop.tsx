import { useEffect, useMemo, useState } from "react";
import BackgroundText from "../components/BackgroundText";
import CartModal from "../components/CartModal";
import { cartCount } from "../lib/cart";
import useBodyClass from "../lib/useBodyClass";
import useCartState from "../lib/useCartState";
import { fetchActiveProducts, Product } from "../lib/supabase";

export default function Shop() {
  useBodyClass("body-georama");
  const { cart, setCart } = useCartState();
  const [products, setProducts] = useState<Product[]>([]);
  const [isCartOpen, setCartOpen] = useState(false);

  const bgClass = useMemo(() => "background-text background-text-shop", []);

  useEffect(() => {
    document.title = "Rosina Shop";
    const load = async () => {
      try {
        const data = await fetchActiveProducts();
        setProducts(data);
      } catch (error) {
        console.error("Supabase fetch error:", error);
        setProducts([]);
      }
    };
    void load();
  }, []);

  return (
    <div className="page shop-page">
      <BackgroundText text="I LOVE RADEK NEVARIL " rows={100} cols={10} className={bgClass} />

      <div className="container">
        <a href="/rajnoha" className="back-button">
          <i className="fas fa-arrow-left"></i> Back
        </a>

        <div className="header">
          <div className="title">Rosina Shop</div>
          <div className="sub">Retired Pistolnik Store</div>
        </div>

        <button className="cart-button" onClick={() => setCartOpen(true)}>
          <i className="fas fa-shopping-cart"></i> Cart
          <span className="cart-count" id="cartCount">
            {cartCount(cart)}
          </span>
        </button>

        <div className="products-grid" id="productsGrid">
          {products.length === 0 ? (
            <div style={{ gridColumn: "1/-1", color: "#888", textAlign: "center", padding: "40px" }}>
              No products found.
            </div>
          ) : (
            products.map((product) => (
              <div className="product-card" key={product.id}>
                <div className="product-image">
                  {product.image_url ? (
                    <img src={product.image_url} alt={product.title} loading="lazy" />
                  ) : (
                    <div style={{ fontSize: "48px", color: "#333" }}>🛍️</div>
                  )}
                </div>
                <div className="product-name">{product.title}</div>
                <div className="product-description">{product.description || ""}</div>
                <div className="product-price">€{Number(product.price_eur).toFixed(2)}</div>

                <a className="add-to-cart" href={`/rosina-shop/product/${encodeURIComponent(product.slug || "")}`}>
                  <i className="fas fa-eye"></i> View product
                </a>
              </div>
            ))
          )}
        </div>
      </div>

      <CartModal isOpen={isCartOpen} onClose={() => setCartOpen(false)} cart={cart} setCart={setCart} />
    </div>
  );
}

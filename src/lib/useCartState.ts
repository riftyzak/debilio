import { useEffect, useState } from "react";
import { CartItem, loadCart, saveCart } from "./cart";

export default function useCartState() {
  const [cart, setCart] = useState<CartItem[]>([]);

  useEffect(() => {
    setCart(loadCart());
  }, []);

  useEffect(() => {
    if (!cart.length) {
      const stored = loadCart();
      if (stored.length) setCart(stored);
    }
  }, [cart.length]);

  const persist = (next: CartItem[]) => {
    setCart(next);
    saveCart(next);
  };

  return { cart, setCart: persist };
}

import { useEffect, useMemo, useState } from "react";
import BackgroundText from "../components/BackgroundText";
import { CART_KEY, PROMO_KEY } from "../lib/cart";
import useBodyClass from "../lib/useBodyClass";

const ORDER_KEY = "rosina_last_order_v1";

type OrderItem = {
  title?: string;
  qty?: number;
  duration_days?: number | null;
  auto_deliver?: boolean;
  delivery_text?: string | null;
};

export default function Success() {
  useBodyClass("body-georama");
  const [provider, setProvider] = useState("—");
  const [time, setTime] = useState("—");
  const [itemsHtml, setItemsHtml] = useState<string>("");

  const bgClass = useMemo(() => "background-text background-text-shop", []);

  useEffect(() => {
    document.title = "Success • Rosina Shop";
    try {
      localStorage.removeItem(CART_KEY);
    } catch {
      // ignore
    }
    try {
      localStorage.removeItem(PROMO_KEY);
    } catch {
      // ignore
    }

    const sp = new URLSearchParams(window.location.search);
    const sessionId = sp.get("session_id") || sp.get("charge_id") || sp.get("id") || "";
    setProvider(sessionId && sessionId.startsWith("cs_") ? "Stripe" : "Stripe / Coinbase");
    setTime(new Date().toLocaleString());

    const generateKey = () => {
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      const chunk = () =>
        Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
      return `${chunk()}-${chunk()}-${chunk()}`;
    };

    let order: { items?: OrderItem[] } | null = null;
    try {
      order = JSON.parse(localStorage.getItem(ORDER_KEY) || "null");
    } catch {
      order = null;
    }

    if (!order || !Array.isArray(order.items) || !order.items.length) {
      setItemsHtml(
        '<div class="muted">We couldn\'t find your order items yet. Please check your email or contact support.</div>'
      );
      return;
    }

    const now = new Date();
    const html = order.items
      .map((item) => {
        const qty = Number(item.qty || 1);
        const durationDays = item.duration_days ? Number(item.duration_days) : null;
        const expiresAt = durationDays ? new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000) : null;
        const deliveryText = item.auto_deliver ? item.delivery_text || generateKey() : "";
        return `
          <div class="order-item">
            <div class="order-item-title">${item.title || "Product"} × ${qty}</div>
            <div class="order-item-meta">${durationDays ? `Duration: ${durationDays} day${durationDays === 1 ? "" : "s"}` : "No duration"}${expiresAt ? ` • Expires: ${expiresAt.toLocaleString()}` : ""}</div>
            ${deliveryText ? `<div class="delivery-box">Delivery: ${deliveryText}</div>` : ""}
          </div>
        `;
      })
      .join("");

    setItemsHtml(html);
    try {
      localStorage.removeItem(ORDER_KEY);
    } catch {
      // ignore
    }
  }, []);

  return (
    <div className="page shop-page success-page">
      <BackgroundText text="I LOVE RADEK NEVARIL " rows={80} cols={8} className={bgClass} />

      <div className="container">
        <div className="title">Order successful</div>
        <div className="sub">Sebastian Rosina personally thanks you for your order.</div>

        <div className="card">
          <div className="row">
            <div className="k">Provider</div>
            <div className="v" id="provider">{provider}</div>
          </div>
          <div className="row">
            <div className="k">Time</div>
            <div className="v" id="time">{time}</div>
          </div>

          <div className="section-title">Purchased items</div>
          <div id="orderItems" className="order-items" dangerouslySetInnerHTML={{ __html: itemsHtml }} />

          <a className="btn" href="/rosina-shop/">
            <i className="fas fa-arrow-left"></i> Back to shop
          </a>
          <div className="muted">
            If you paid with crypto, confirmation can take a moment depending on the network. If anything looks wrong,
            contact support.
          </div>
        </div>
      </div>
    </div>
  );
}

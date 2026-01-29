import { useEffect, useMemo, useState } from "react";
import BackgroundText from "../components/BackgroundText";
import { loadCart, loadPromo, moneyEUR, promoLineHtml, savePromo, applyPromo, PROMOS } from "../lib/cart";
import useBodyClass from "../lib/useBodyClass";
import { FN_BASE, fetchProductsByIds, fetchVariantsByIds } from "../lib/supabase";

const ORDER_KEY_LOCAL = "rosina_last_order_v1";

export default function Checkout() {
  useBodyClass("body-georama");
  const [itemsHtml, setItemsHtml] = useState<string>("");
  const [totalsHtml, setTotalsHtml] = useState<string>("");
  const [promoCode, setPromoCode] = useState<string | null>(null);
  const [promoStatus, setPromoStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [status, setStatus] = useState("");
  const [promoInput, setPromoInput] = useState("");

  const bgClass = useMemo(() => "background-text background-text-shop", []);

  useEffect(() => {
    document.title = "Checkout • Rosina Shop";
    const stored = loadPromo();
    setPromoCode(stored);
    setPromoInput(stored ? stored.toUpperCase() : "");
  }, []);

  useEffect(() => {
    if (promoCode) {
      setPromoInput(promoCode.toUpperCase());
    } else if (promoInput) {
      setPromoInput("");
    }
  }, [promoCode]);

  const buildOrderPayload = async () => {
    const cart = loadCart();
    const ids = [...new Set(cart.map((i) => i.id))];
    const products = await fetchProductsByIds(ids);
    const variants = await fetchVariantsByIds(cart.map((i) => i.variant_id));
    const byId = new Map(products.map((p) => [String(p.id), p]));
    const variantById = new Map(variants.map((v) => [String(v.id), v]));

    const items = cart.map((ci) => {
      const p = byId.get(String(ci.id));
      const qty = Number(ci.qty || 1);
      const variant = ci.variant_id ? variantById.get(String(ci.variant_id)) : null;
      const price = variant?.price_eur ?? p?.price_eur ?? 0;
      const durationDays = variant?.duration_days ?? p?.duration_days ?? null;
      const autoDeliver = variant?.auto_deliver ?? p?.auto_deliver ?? false;
      const deliveryText = variant?.delivery_text ?? p?.delivery_text ?? "";
      return {
        id: String(ci.id),
        qty,
        title: p?.title || "Unknown product",
        variant_id: ci.variant_id ? String(ci.variant_id) : null,
        price_eur: price,
        auto_deliver: Boolean(autoDeliver),
        delivery_text: deliveryText,
        duration_days: durationDays,
      };
    });

    return {
      items,
      promo_code: promoCode || null,
      created_at: new Date().toISOString(),
    };
  };

  const renderSummary = async () => {
    const cart = loadCart();
    if (!cart.length) {
      setItemsHtml('<div style="color:#888;padding:12px 0;">Your cart is empty.</div>');
      setTotalsHtml("");
      return;
    }

    const ids = [...new Set(cart.map((i) => i.id))];
    const products = await fetchProductsByIds(ids);
    const variants = await fetchVariantsByIds(cart.map((i) => i.variant_id));
    const byId = new Map(products.map((p) => [String(p.id), p]));
    const variantById = new Map(variants.map((v) => [String(v.id), v]));

    let subtotal = 0;

    const items = cart
      .map((ci) => {
        const p = byId.get(String(ci.id));
        const qty = Number(ci.qty || 1);
        const variant = ci.variant_id ? variantById.get(String(ci.variant_id)) : null;
        const price = variant ? Number(variant.price_eur) : p ? Number(p.price_eur) : 0;
        const line = price * qty;
        subtotal += line;

        const durationDays = variant?.duration_days ?? p?.duration_days;
        const durationLabel = durationDays
          ? ` • ${durationDays} day${durationDays === 1 ? "" : "s"}`
          : "";

        return `
          <div class="item">
            <div>
              <div class="item-name">${p ? String(p.title) : "Unknown product"}</div>
              <div class="item-meta">Qty: ${qty}${durationLabel}</div>
            </div>
            <div class="item-price">${moneyEUR(line)}</div>
          </div>
        `;
      })
      .join("");

    setItemsHtml(items);

    const promo = loadPromo();
    const promoResult = applyPromo(subtotal, promo);

    setTotalsHtml(`
      <div class="total-row"><span>Subtotal</span><span>${moneyEUR(subtotal)}</span></div>
      ${promo ? `<div class="total-row"><span>Promo</span><span>${promo.toUpperCase()}</span></div>` : ``}
      ${promoLineHtml(promo, subtotal, promoResult.discount)}
      <div class="total-row final"><span>Total</span><span>${moneyEUR(promoResult.total)}</span></div>
    `);
  };

  useEffect(() => {
    void renderSummary();
  }, [promoCode]);

  const applyOrRemovePromo = () => {
    if (promoCode) {
      setPromoCode(null);
      savePromo(null);
      setPromoInput("");
      setPromoStatus({ type: "success", message: "Promo removed" });
      return;
    }
    const normalized = promoInput.trim().toLowerCase();
    if (PROMOS[normalized as keyof typeof PROMOS]) {
      setPromoCode(normalized);
      savePromo(normalized);
      setPromoStatus({ type: "success", message: `Promo applied: ${normalized.toUpperCase()}` });
    } else {
      setPromoCode(null);
      savePromo(null);
      setPromoInput("");
      setPromoStatus({ type: "error", message: "Invalid promo code" });
    }
  };

  const start = async (provider: "stripe" | "coinbase") => {
    setStatus("Creating checkout…");

    const cart = loadCart();
    if (!cart.length) {
      setStatus("Your cart is empty.");
      return;
    }

    try {
      const orderPayload = await buildOrderPayload();
      localStorage.setItem(ORDER_KEY_LOCAL, JSON.stringify(orderPayload));
    } catch {
      // ignore
    }

    const payload = {
      cart,
      promo_code: loadPromo(),
      success_url: `${location.origin}/rosina-shop/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${location.origin}/rosina-shop/checkout.html`,
    };

    try {
      if (provider === "stripe") {
        const res = await fetch(`${FN_BASE}/create-stripe-session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        location.href = data.url;
      } else {
        const res = await fetch(`${FN_BASE}/create-coinbase-charge`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        location.href = data.hosted_url;
      }
    } catch {
      setStatus("Something went wrong. Please try again.");
    }
  };

  return (
    <div className="page shop-page checkout-page">
      <BackgroundText text="I LOVE RADEK NEVARIL " rows={100} cols={10} className={bgClass} />

      <a href="/rosina-shop/" className="back-button">
        <i className="fas fa-arrow-left"></i> Back to shop
      </a>

      <div className="container">
        <div className="header">
          <div className="title">Checkout</div>
          <div className="sub">Review your order and choose payment.</div>
        </div>

        <div className="grid">
          <div className="card">
            <div className="card-title">
              <i className="fas fa-receipt"></i> Order summary
            </div>
            <div id="items" dangerouslySetInnerHTML={{ __html: itemsHtml }}></div>
            <div className="totals" id="totals" dangerouslySetInnerHTML={{ __html: totalsHtml }}></div>
          </div>

          <div className="card">
            <div className="card-title">
              <i className="fas fa-credit-card"></i> Payment
            </div>

            <button className="btn" id="payStripe" onClick={() => start("stripe")}>
              <i className="fas fa-lock"></i> Pay with Card
            </button>
            <button className="btn secondary" id="payCrypto" onClick={() => start("coinbase")}>
              <i className="fab fa-bitcoin"></i> Pay with Crypto
            </button>

            <div className="line"></div>

            <div className="card-title" style={{ fontSize: "18px", marginBottom: "10px" }}>
              <i className="fas fa-tag"></i> Promo code
            </div>
            <div className="promo-input" style={{ display: "flex", gap: "10px", marginBottom: "12px", flexWrap: "wrap" }}>
              <input
                type="text"
                id="promoCode"
                placeholder="Enter promo code"
                value={promoInput}
                style={{
                  flex: 1,
                  minWidth: "180px",
                  background: "rgba(0,0,0,.5)",
                  border: "2px solid #333",
                  color: "#fff",
                  padding: "10px 15px",
                  borderRadius: "10px",
                  fontFamily: "Georama, sans-serif",
                  fontSize: "14px",
                }}
                disabled={Boolean(promoCode)}
                onChange={(event) => {
                  setPromoInput(event.target.value);
                  if (!promoCode) setPromoStatus(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    applyOrRemovePromo();
                  }
                }}
              />
              <button
                className="btn secondary"
                id="promoBtn"
                onClick={applyOrRemovePromo}
                style={{ width: "auto", minWidth: "140px", marginTop: 0 }}
              >
                {promoCode ? "Remove" : "Apply"}
              </button>
            </div>
            <div
              className={`promo-message${promoStatus ? " show" : ""} ${promoStatus?.type || ""}`}
              id="promoMessage"
            >
              {promoStatus ? (
                <>
                  <i className={`fas ${promoStatus.type === "success" ? "fa-check" : "fa-times"}`}></i> {promoStatus.message}
                </>
              ) : (
                ""
              )}
            </div>

            <div className={`status${status ? " show" : ""}`} id="status">
              {status}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

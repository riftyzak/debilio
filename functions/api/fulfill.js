const encoder = new TextEncoder();

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(input) {
  const data = encoder.encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return toHex(hash);
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

async function importAesKey(b64) {
  const keyBytes = base64ToBytes(b64);
  return crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptKeys(key, payload) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = encoder.encode(JSON.stringify(payload));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  const out = new Uint8Array(iv.length + ct.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(ct), iv.length);
  return bytesToBase64(out);
}

async function decryptKeys(key, b64) {
  const bytes = base64ToBytes(b64);
  if (bytes.length < 13) throw new Error("Invalid encrypted payload");
  const iv = bytes.slice(0, 12);
  const ct = bytes.slice(12);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  const text = new TextDecoder().decode(pt);
  return JSON.parse(text);
}

function normalizePrefix(prefix) {
  let p = String(prefix || "").trim().toLowerCase();
  p = p.replace(/-+$/g, "");
  p = p.replace(/[^a-z0-9]/g, "");
  return p;
}

function randomBase62(len) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const out = [];
  while (out.length < len) {
    const bytes = crypto.getRandomValues(new Uint8Array(len));
    for (let i = 0; i < bytes.length && out.length < len; i++) {
      const b = bytes[i];
      if (b < 248) out.push(alphabet[b % 62]);
    }
  }
  return out.join("");
}

function makeKey(prefix) {
  const core = randomBase62(24);
  return prefix ? `${prefix}-${core}` : core;
}

async function resendEmail(env, toEmail, keys) {
  const apiKey = env.RESEND_API_KEY;
  const from = env.EMAIL_FROM;

  if (!apiKey || !from) {
    return { ok: false, error: "Missing RESEND_API_KEY or EMAIL_FROM in Cloudflare env" };
  }

  const html = `
    <div style="font-family:Arial,sans-serif;font-size:14px;color:#111;">
      <p>Your license keys:</p>
      <pre style="background:#f6f6f6;border:1px solid #ddd;padding:12px;border-radius:6px;">${keys.join("\n")}</pre>
      <p>If you need help, reply to this email.</p>
    </div>
  `;

  let res;
  let text = "";
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from,
        to: toEmail,
        subject: "Your license keys",
        html,
        // Optional: set a reply-to you actually read
        reply_to: env.REPLY_TO || undefined
      })
    });
    text = await res.text();
  } catch (e) {
    console.log("RESEND fetch failed:", String(e?.message || e));
    return { ok: false, error: `Resend fetch failed: ${String(e?.message || e)}` };
  }

  // This will show up in Cloudflare logs
  console.log("RESEND status:", res.status, "body:", text.slice(0, 600));

  if (!res.ok) return { ok: false, error: text || `Resend error (status ${res.status})` };
  return { ok: true };
}

export async function onRequestPost({ request, env }) {
  const SUPABASE_URL = env.SUPABASE_URL;
  const SRV = env.SUPABASE_SERVICE_ROLE_KEY;
  const KEY_SECRET = env.KEY_SECRET;
  const RESEND_API_KEY = env.RESEND_API_KEY;
  const EMAIL_FROM = env.EMAIL_FROM;
  const STRIPE_SECRET_KEY = env.STRIPE_SECRET_KEY;
  const DELIVERY_ENC_KEY_B64 = env.DELIVERY_ENC_KEY_B64;

  if (!SUPABASE_URL || !SRV || !KEY_SECRET || !RESEND_API_KEY || !EMAIL_FROM || !STRIPE_SECRET_KEY || !DELIVERY_ENC_KEY_B64) {
    return jsonResponse({ error: "Missing server env vars" }, 500);
  }

  let body = null;
  try {
    body = await request.json();
  } catch (_) {
    body = null;
  }

  const provider = String(body?.provider || "").trim().toLowerCase();
  const session_id = String(body?.session_id || "").trim();
  const charge_id = String(body?.charge_id || "").trim();
  const provider_session_id = provider === "stripe" ? session_id : charge_id;
  const buyer_email_input = String(body?.buyer_email || "").trim();
  const order_input = body?.order || null;

  if (!provider || !provider_session_id || (provider !== "stripe" && provider !== "coinbase")) {
    return jsonResponse({ error: "Missing provider session id" }, 400);
  }

  const encKey = await importAesKey(DELIVERY_ENC_KEY_B64);
  const isWebhook = request.headers.get("X-Webhook") === "1";

  const orderRes = await fetch(
    `${SUPABASE_URL}/rest/v1/checkout_orders?select=*&provider_session_id=eq.${encodeURIComponent(provider_session_id)}&limit=1`,
    { headers: { apikey: SRV, Authorization: `Bearer ${SRV}` } }
  );

  if (!orderRes.ok) {
    return jsonResponse({ error: "Failed to load order acknowledged", details: await orderRes.text() }, 500);
  }

  const orderRows = await orderRes.json();
  let order = orderRows[0] || null;

  if (!order) {
    if (isWebhook) {
      return jsonResponse({ error: "Order record missing; checkout must store checkout_orders" }, 500);
    }
    const items = Array.isArray(order_input?.items) ? order_input.items : [];
    if (!buyer_email_input || !items.length) {
      return jsonResponse({ error: "Order data missing" }, 400);
    }
    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/checkout_orders`, {
      method: "POST",
      headers: {
        apikey: SRV,
        Authorization: `Bearer ${SRV}`,
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: JSON.stringify([{
        provider,
        provider_session_id,
        buyer_email: buyer_email_input,
        cart: { items, promo_code: order_input?.promo_code || null },
        status: "created"
      }])
    });
    if (!insertRes.ok) {
      return jsonResponse({ error: "Failed to create order", details: await insertRes.text() }, 500);
    }
    const inserted = await insertRes.json();
    order = inserted[0];
  }

  // If keys already exist in checkout_orders, return them and (optionally) send email if not emailed.
  if (order?.keys_encrypted) {
    const payload = await decryptKeys(encKey, order.keys_encrypted);
    const keys = Array.isArray(payload?.keys) ? payload.keys : [];

    let emailSent = Boolean(order.emailed_at);
    let emailError = "";
    const buyerEmail = order.buyer_email || buyer_email_input || "";

    if (!emailSent && buyerEmail && keys.length) {
      const emailRes = await resendEmail(env, buyerEmail, keys.map(k => k.key || k));
      emailSent = emailRes.ok;
      emailError = emailRes.ok ? "" : (emailRes.error || "Unknown resend error");

      if (emailSent) {
        await fetch(`${SUPABASE_URL}/rest/v1/checkout_orders?provider_session_id=eq.${encodeURIComponent(provider_session_id)}`, {
          method: "PATCH",
          headers: {
            apikey: SRV,
            Authorization: `Bearer ${SRV}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal"
          },
          body: JSON.stringify({
            emailed_at: new Date().toISOString(),
            status: "emailed"
          })
        });
      }
    }

    return jsonResponse({
      ok: true,
      keys,
      email_sent: emailSent,
      email_error: emailError || undefined,
      buyer_email: buyerEmail
    });
  }

  let buyerEmail = order?.buyer_email || buyer_email_input || "";
  let stripeSession = null;
  let coinbaseCharge = null;

  if (provider === "stripe") {
    const stripeRes = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(provider_session_id)}`, {
      headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` }
    });
    if (!stripeRes.ok) {
      return jsonResponse({ error: "Stripe verification failed", details: await stripeRes.text() }, 500);
    }
    const session = await stripeRes.json();
    const paid = session.payment_status === "paid" || session.status === "complete";
    if (!paid) {
      return jsonResponse({ error: "Payment not confirmed", status: session.payment_status || session.status || "pending" }, 409);
    }
    buyerEmail = buyerEmail || session?.customer_details?.email || session?.customer_email || "";
    stripeSession = {
      id: session.id,
      payment_status: session.payment_status || null,
      status: session.status || null,
      amount_total: session.amount_total || null,
      currency: session.currency || null,
      customer_email: session.customer_details?.email || session.customer_email || null
    };
  } else {
    const chargeRes = await fetch(`${SUPABASE_URL}/rest/v1/coinbase_charges?select=status,raw&id=eq.${encodeURIComponent(provider_session_id)}`, {
      headers: { apikey: SRV, Authorization: `Bearer ${SRV}` }
    });
    if (!chargeRes.ok) {
      return jsonResponse({ error: "Failed to load charge status", details: await chargeRes.text() }, 500);
    }
    const rows = await chargeRes.json();
    const status = rows && rows[0]?.status ? String(rows[0].status).toUpperCase() : "PENDING";
    if (status !== "CONFIRMED") {
      return jsonResponse({ error: "Payment not confirmed", status }, 409);
    }
    coinbaseCharge = rows[0]?.raw || null;
  }

  if (!buyerEmail) {
    return jsonResponse({ error: "Buyer email missing" }, 400);
  }

  const cart = order?.cart || order_input || {};
  const items = Array.isArray(cart.items) ? cart.items : [];
  const timeItems = items.filter(item => Number(item?.duration_days || 0) > 0);

  if (!timeItems.length) {
    await fetch(`${SUPABASE_URL}/rest/v1/checkout_orders?provider_session_id=eq.${encodeURIComponent(provider_session_id)}`, {
      method: "PATCH",
      headers: {
        apikey: SRV,
        Authorization: `Bearer ${SRV}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      },
      body: JSON.stringify({
        buyer_email: buyerEmail,
        status: "fulfilled",
        fulfilled_at: new Date().toISOString(),
        keys_count: 0,
        stripe_session: stripeSession || order?.stripe_session || null,
        coinbase_charge: coinbaseCharge || order?.coinbase_charge || null
      })
    });

    return jsonResponse({
      ok: true,
      keys: [],
      email_sent: false,
      buyer_email: buyerEmail
    });
  }

  const productIds = [...new Set(timeItems.map(it => it?.id).filter(Boolean).map(String))];
  const prefixMap = new Map();

  if (productIds.length) {
    const idsParam = productIds.map(encodeURIComponent).join(",");
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/products?select=id,key_prefix&id=in.(${idsParam})`,
      { headers: { apikey: SRV, Authorization: `Bearer ${SRV}` } }
    );
    if (!res.ok) {
      return jsonResponse({ error: "Failed to load product prefixes", details: await res.text() }, 500);
    }
    const rows = await res.json();
    for (const row of rows) prefixMap.set(String(row.id), normalizePrefix(row.key_prefix));
  }

  const issued = [];
  const inserts = [];

  for (const it of timeItems) {
    const qty = Math.max(1, Number(it?.qty || 1));
    const product_id = it?.id ? String(it.id) : null;
    const product_variant_id = it?.variant_id ? String(it.variant_id) : null;
    const prefix = product_id ? (prefixMap.get(product_id) || "") : "";

    for (let i = 0; i < qty; i++) {
      const key = makeKey(prefix);
      const key_hash = await sha256Hex(`${KEY_SECRET}:${key}`);
      inserts.push({
        key_hash,
        status: "issued",
        issued_for_session: provider_session_id,
        product_id,
        product_variant_id
      });
      issued.push({ key, product_id, product_variant_id });
    }
  }

  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/license_keys`, {
    method: "POST",
    headers: {
      apikey: SRV,
      Authorization: `Bearer ${SRV}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify(inserts)
  });

  if (!insertRes.ok) {
    return jsonResponse({ error: "Insert failed", details: await insertRes.text() }, 500);
  }

  const encrypted = await encryptKeys(encKey, { keys: issued });

  await fetch(`${SUPABASE_URL}/rest/v1/checkout_orders?provider_session_id=eq.${encodeURIComponent(provider_session_id)}`, {
    method: "PATCH",
    headers: {
      apikey: SRV,
      Authorization: `Bearer ${SRV}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify({
      buyer_email: buyerEmail,
      status: "fulfilled",
      keys_encrypted: encrypted,
      keys_count: issued.length,
      fulfilled_at: new Date().toISOString(),
      stripe_session: stripeSession || order?.stripe_session || null,
      coinbase_charge: coinbaseCharge || order?.coinbase_charge || null
    })
  });

  // Try emailing now; report status accurately
  let emailSent = false;
  let emailError = "";

  if (issued.length) {
    const emailRes = await resendEmail(env, buyerEmail, issued.map(k => k.key || k));
    emailSent = emailRes.ok;
    emailError = emailRes.ok ? "" : (emailRes.error || "Unknown resend error");

    if (emailSent) {
      await fetch(`${SUPABASE_URL}/rest/v1/checkout_orders?provider_session_id=eq.${encodeURIComponent(provider_session_id)}`, {
        method: "PATCH",
        headers: {
          apikey: SRV,
          Authorization: `Bearer ${SRV}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal"
        },
        body: JSON.stringify({
          emailed_at: new Date().toISOString(),
          status: "emailed"
        })
      });
    }
  }

  return jsonResponse({
    ok: true,
    keys: issued,
    email_sent: emailSent,
    email_error: emailError || undefined,
    buyer_email: buyerEmail
  });
}

import { getNoStoreHeaders, jsonNoStore } from "./_lib/security.js";

const encoder = new TextEncoder();

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
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

function bytesToBase64Url(bytes) {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256Hex(input) {
  const data = encoder.encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return toHex(hash);
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

function makeClaimToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `claim_${bytesToBase64Url(bytes)}`;
}

function supabaseHeaders(serviceRoleKey, extra = {}) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    ...extra,
  };
}

async function safeJson(res) {
  try {
    return await res.json();
  } catch (_) {
    return null;
  }
}

async function resendEmail(env, toEmail, keyValues, claimUrl) {
  const apiKey = env.RESEND_API_KEY;
  const from = env.EMAIL_FROM;
  if (!apiKey || !from) {
    return { ok: false, error: "Email config missing" };
  }

  const safeClaimUrl = String(claimUrl || "").trim();
  const claimLine = safeClaimUrl
    ? `<p>View your keys online: <a href="${safeClaimUrl}">${safeClaimUrl}</a></p>`
    : "";

  const html = `
    <div style="font-family:Arial,sans-serif;font-size:14px;color:#111;">
      <p>Your license keys:</p>
      <pre style="background:#f6f6f6;border:1px solid #ddd;padding:12px;border-radius:6px;">${keyValues.join("\n")}</pre>
      ${claimLine}
      <p>If you need help, contact +420 605 502 234</p>
    </div>
  `;

  let res;
  let text = "";
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: toEmail,
        subject: "Your license keys",
        html,
      }),
    });
    text = await res.text();
  } catch (e) {
    console.error("Resend fetch failed", String(e?.message || e));
    return { ok: false, error: "Email provider request failed" };
  }

  if (!res.ok) {
    console.error("Resend error", { status: res.status, body: text });
    return { ok: false, error: `Email provider error (${res.status})` };
  }

  return { ok: true };
}

function extractCartItems(orderRow) {
  const raw = orderRow?.cart ?? null;

  let items = [];
  if (Array.isArray(raw)) {
    items = raw;
  } else if (raw && Array.isArray(raw.items)) {
    items = raw.items;
  }

  return items
    .map((it) => ({
      id: it?.id ? String(it.id) : "",
      qty: Math.max(1, Number(it?.qty || 1)),
      variant_id: it?.variant_id ? String(it.variant_id) : null,
      duration_days: it?.duration_days != null ? Number(it.duration_days) : null,
    }))
    .filter((it) => it.id);
}

function parseCartCandidate(raw) {
  let decoded = raw;
  if (typeof raw === "string") {
    try {
      decoded = JSON.parse(raw);
    } catch (_) {
      decoded = null;
    }
  }

  if (Array.isArray(decoded)) return decoded;
  if (decoded && Array.isArray(decoded.items)) return decoded.items;
  return [];
}

function extractCartItemsFromStripeSession(session) {
  const meta = session?.metadata || {};
  const candidates = [
    meta.cart,
    meta.items,
    meta.order,
    meta.cart_json,
    meta.items_json,
    meta.order_json,
  ];

  for (const candidate of candidates) {
    const parsed = parseCartCandidate(candidate);
    if (!parsed.length) continue;

    const normalized = parsed
      .map((it) => ({
        id: it?.id ? String(it.id) : "",
        qty: Math.max(1, Number(it?.qty || 1)),
        variant_id: it?.variant_id ? String(it.variant_id) : null,
        duration_days: it?.duration_days != null ? Number(it.duration_days) : null,
      }))
      .filter((it) => it.id);

    if (normalized.length) return normalized;
  }

  return [];
}

async function patchOrderBySession(SUPABASE_URL, SRV, providerSessionId, patchBody) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/checkout_orders?provider_session_id=eq.${encodeURIComponent(providerSessionId)}`,
    {
      method: "PATCH",
      headers: supabaseHeaders(SRV, {
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      }),
      body: JSON.stringify(patchBody),
    },
  );
  if (!res.ok) {
    console.error("Order patch failed", { status: res.status, body: await res.text() });
  }
}

async function ensureClaimToken(SUPABASE_URL, SRV, provider, providerSessionId, orderId) {
  const nowIso = new Date().toISOString();
  const existingRes = await fetch(
    `${SUPABASE_URL}/rest/v1/claim_tokens?select=token&provider=eq.${encodeURIComponent(
      provider,
    )}&session_id=eq.${encodeURIComponent(providerSessionId)}&used_at=is.null&expires_at=gt.${encodeURIComponent(
      nowIso,
    )}&order=created_at.desc&limit=1`,
    { headers: supabaseHeaders(SRV) },
  );

  if (existingRes.ok) {
    const rows = await safeJson(existingRes);
    if (Array.isArray(rows) && rows[0]?.token) {
      return String(rows[0].token);
    }
  } else {
    console.error("Claim token lookup failed", { status: existingRes.status, body: await existingRes.text() });
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const token = makeClaimToken();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    const payload = [{
      token,
      provider,
      session_id: providerSessionId,
      order_id: orderId || null,
      expires_at: expiresAt,
    }];

    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/claim_tokens`, {
      method: "POST",
      headers: supabaseHeaders(SRV, {
        "Content-Type": "application/json",
        Prefer: "return=representation",
      }),
      body: JSON.stringify(payload),
    });

    if (insertRes.ok) {
      const inserted = await safeJson(insertRes);
      if (Array.isArray(inserted) && inserted[0]?.token) {
        return String(inserted[0].token);
      }
    } else {
      console.error("Claim token insert failed", { status: insertRes.status, body: await insertRes.text() });
    }
  }

  throw new Error("Unable to create claim token");
}

function claimUrlFromRequest(request, claimToken) {
  const origin = new URL(request.url).origin;
  return `${origin}/rosina-shop/success.html?claim=${encodeURIComponent(claimToken)}`;
}

function unauthorizedResponse() {
  return jsonNoStore({ error: "unauthorized" }, 401, getNoStoreHeaders());
}

export async function onRequestPost({ request, env }) {
  const internalSecret = env.FULFILL_INTERNAL_SECRET;
  const providedSecret = request.headers.get("X-Fulfill-Secret") || "";

  if (!internalSecret) {
    return jsonNoStore({ error: "Server error" }, 500, getNoStoreHeaders());
  }

  if (!providedSecret || providedSecret !== internalSecret) {
    return unauthorizedResponse();
  }

  const SUPABASE_URL = env.SUPABASE_URL;
  const SRV = env.SUPABASE_SERVICE_ROLE_KEY;
  const KEY_SECRET = env.KEY_SECRET;
  const DELIVERY_ENC_KEY_B64 = env.DELIVERY_ENC_KEY_B64;

  if (!SUPABASE_URL || !SRV || !KEY_SECRET || !DELIVERY_ENC_KEY_B64) {
    return jsonNoStore({ error: "Server error" }, 500, getNoStoreHeaders());
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
  const providerSessionId = provider === "stripe" ? session_id : charge_id;

  if (!provider || !providerSessionId || (provider !== "stripe" && provider !== "coinbase")) {
    return jsonNoStore({ error: "Missing provider session id" }, 400, getNoStoreHeaders());
  }

  const encKey = await importAesKey(DELIVERY_ENC_KEY_B64);

  const orderRes = await fetch(
    `${SUPABASE_URL}/rest/v1/checkout_orders?select=*&provider=eq.${encodeURIComponent(
      provider,
    )}&provider_session_id=eq.${encodeURIComponent(providerSessionId)}&limit=1`,
    { headers: supabaseHeaders(SRV) },
  );

  if (!orderRes.ok) {
    console.error("Order lookup failed", { status: orderRes.status, body: await orderRes.text() });
    return jsonNoStore({ error: "Server error" }, 500, getNoStoreHeaders());
  }

  const orderRows = await safeJson(orderRes);
  let order = Array.isArray(orderRows) ? orderRows[0] : null;

  let buyerEmail = String(order?.buyer_email || "").trim();
  let stripeSessionRaw = null;

  if (order?.keys_encrypted) {
    let keysPayload = null;
    try {
      keysPayload = await decryptKeys(encKey, order.keys_encrypted);
    } catch (err) {
      console.error("Decrypt keys failed", err);
      return jsonNoStore({ error: "Server error" }, 500, getNoStoreHeaders());
    }

    const keys = Array.isArray(keysPayload?.keys) ? keysPayload.keys : [];
    const claimToken = await ensureClaimToken(SUPABASE_URL, SRV, provider, providerSessionId, order.id || null);
    const claimUrl = claimUrlFromRequest(request, claimToken);

    let emailSent = Boolean(order.emailed_at);
    let emailError = "";
    if (!emailSent && buyerEmail && keys.length > 0) {
      const emailRes = await resendEmail(env, buyerEmail, keys.map((k) => String(k.key || k)), claimUrl);
      emailSent = emailRes.ok;
      emailError = emailRes.ok ? "" : (emailRes.error || "Email failed");
      if (emailSent) {
        await patchOrderBySession(SUPABASE_URL, SRV, providerSessionId, {
          emailed_at: new Date().toISOString(),
          status: "emailed",
        });
      }
    }

    return jsonNoStore(
      {
        ok: true,
        buyer_email: buyerEmail || null,
        email_sent: emailSent,
        key_count: keys.length,
        claim_token: claimToken,
        email_error: emailError || undefined,
      },
      200,
      getNoStoreHeaders(),
    );
  }

  let stripeSession = null;
  let coinbaseCharge = null;

  if (provider === "stripe") {
    const STRIPE_SECRET_KEY = env.STRIPE_SECRET_KEY;
    if (!STRIPE_SECRET_KEY) {
      return jsonNoStore({ error: "Server error" }, 500, getNoStoreHeaders());
    }

    const stripeRes = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(providerSessionId)}`,
      { headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` } },
    );
    if (!stripeRes.ok) {
      console.error("Stripe session verification failed", { status: stripeRes.status, body: await stripeRes.text() });
      return jsonNoStore({ error: "Server error" }, 500, getNoStoreHeaders());
    }

    const session = await safeJson(stripeRes);
    stripeSessionRaw = session || null;
    const paid = session?.payment_status === "paid" || session?.status === "complete";
    if (!paid) {
      return jsonNoStore({ error: "Payment not confirmed" }, 409, getNoStoreHeaders());
    }

    buyerEmail = buyerEmail || String(session?.customer_details?.email || session?.customer_email || "").trim();
    stripeSession = {
      id: session?.id || null,
      payment_status: session?.payment_status || null,
      status: session?.status || null,
      amount_total: session?.amount_total || null,
      currency: session?.currency || null,
      customer_email: session?.customer_details?.email || session?.customer_email || null,
    };
  } else {
    const chargeRes = await fetch(
      `${SUPABASE_URL}/rest/v1/coinbase_charges?select=status,raw&id=eq.${encodeURIComponent(providerSessionId)}&limit=1`,
      { headers: supabaseHeaders(SRV) },
    );
    if (!chargeRes.ok) {
      console.error("Coinbase charge lookup failed", { status: chargeRes.status, body: await chargeRes.text() });
      return jsonNoStore({ error: "Server error" }, 500, getNoStoreHeaders());
    }

    const rows = await safeJson(chargeRes);
    const status = rows && rows[0]?.status ? String(rows[0].status).toUpperCase() : "PENDING";
    if (status !== "CONFIRMED") {
      return jsonNoStore({ error: "Payment not confirmed" }, 409, getNoStoreHeaders());
    }
    coinbaseCharge = rows[0]?.raw || null;
  }

  if (!buyerEmail) {
    return jsonNoStore({ error: "Buyer email missing" }, 400, getNoStoreHeaders());
  }

  if (!order) {
    const inferredCartItems = provider === "stripe"
      ? extractCartItemsFromStripeSession(stripeSessionRaw)
      : [];

    const createPayload = [{
      provider,
      provider_session_id: providerSessionId,
      buyer_email: buyerEmail,
      cart: { items: inferredCartItems, promo_code: null },
      status: "created",
      stripe_session: stripeSession || null,
      coinbase_charge: coinbaseCharge || null,
    }];

    const createOrderRes = await fetch(`${SUPABASE_URL}/rest/v1/checkout_orders`, {
      method: "POST",
      headers: supabaseHeaders(SRV, {
        "Content-Type": "application/json",
        Prefer: "return=representation",
      }),
      body: JSON.stringify(createPayload),
    });

    if (!createOrderRes.ok) {
      console.error("Order create failed", { status: createOrderRes.status, body: await createOrderRes.text() });
      return jsonNoStore({ error: "Server error" }, 500, getNoStoreHeaders());
    }

    const created = await safeJson(createOrderRes);
    order = Array.isArray(created) ? created[0] : null;
    if (!order) {
      return jsonNoStore({ error: "Server error" }, 500, getNoStoreHeaders());
    }
  }

  const cartItems = extractCartItems(order);

  const variantIds = [...new Set(cartItems.map((it) => it.variant_id).filter(Boolean))];
  const variantDuration = new Map();

  if (variantIds.length) {
    const idsParam = variantIds.map((id) => `"${id.replaceAll("\"", "\\\"")}"`).join(",");
    const variantsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/product_variants?select=id,duration_days&id=in.(${idsParam})`,
      { headers: supabaseHeaders(SRV) },
    );

    if (!variantsRes.ok) {
      console.error("Variant lookup failed", { status: variantsRes.status, body: await variantsRes.text() });
      return jsonNoStore({ error: "Server error" }, 500, getNoStoreHeaders());
    }

    const variants = await safeJson(variantsRes);
    for (const v of variants || []) {
      variantDuration.set(String(v.id), Number(v.duration_days || 0));
    }
  }

  const enrichedItems = cartItems.map((it) => {
    const duration = it.duration_days != null
      ? Number(it.duration_days)
      : (it.variant_id ? Number(variantDuration.get(it.variant_id) || 0) : 0);
    return { ...it, duration_days: Number.isFinite(duration) ? duration : 0 };
  });

  const timeItems = enrichedItems.filter((it) => Number(it.duration_days || 0) > 0);

  if (!timeItems.length) {
    await patchOrderBySession(SUPABASE_URL, SRV, providerSessionId, {
      buyer_email: buyerEmail,
      status: "fulfilled",
      fulfilled_at: new Date().toISOString(),
      keys_count: 0,
      stripe_session: stripeSession || order?.stripe_session || null,
      coinbase_charge: coinbaseCharge || order?.coinbase_charge || null,
    });

    return jsonNoStore(
      { ok: true, buyer_email: buyerEmail, email_sent: false, key_count: 0, claim_token: null },
      200,
      getNoStoreHeaders(),
    );
  }

  const productIds = [...new Set(timeItems.map((it) => it.id))];
  const prefixMap = new Map();

  if (productIds.length) {
    const idsParam = productIds.map((id) => `"${id.replaceAll("\"", "\\\"")}"`).join(",");
    const productsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/products?select=id,key_prefix&id=in.(${idsParam})`,
      { headers: supabaseHeaders(SRV) },
    );
    if (!productsRes.ok) {
      console.error("Product prefix lookup failed", { status: productsRes.status, body: await productsRes.text() });
      return jsonNoStore({ error: "Server error" }, 500, getNoStoreHeaders());
    }
    const products = await safeJson(productsRes);
    for (const p of products || []) {
      prefixMap.set(String(p.id), normalizePrefix(p.key_prefix));
    }
  }

  const issued = [];
  const inserts = [];

  for (const item of timeItems) {
    const qty = Math.max(1, Number(item.qty || 1));
    const product_id = item.id;
    const product_variant_id = item.variant_id || null;
    const prefix = prefixMap.get(product_id) || "";

    for (let i = 0; i < qty; i++) {
      const key = makeKey(prefix);
      const key_hash = await sha256Hex(`${KEY_SECRET}:${key}`);

      inserts.push({
        key_hash,
        status: "issued",
        issued_for_session: providerSessionId,
        product_id,
        product_variant_id,
      });

      issued.push({ key, product_id, product_variant_id });
    }
  }

  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/license_keys`, {
    method: "POST",
    headers: supabaseHeaders(SRV, {
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    }),
    body: JSON.stringify(inserts),
  });

  if (!insertRes.ok) {
    console.error("License insert failed", { status: insertRes.status, body: await insertRes.text() });
    return jsonNoStore({ error: "Server error" }, 500, getNoStoreHeaders());
  }

  const encrypted = await encryptKeys(encKey, { keys: issued });

  await patchOrderBySession(SUPABASE_URL, SRV, providerSessionId, {
    buyer_email: buyerEmail,
    status: "fulfilled",
    keys_encrypted: encrypted,
    keys_count: issued.length,
    fulfilled_at: new Date().toISOString(),
    stripe_session: stripeSession || order?.stripe_session || null,
    coinbase_charge: coinbaseCharge || order?.coinbase_charge || null,
  });

  const claimToken = await ensureClaimToken(SUPABASE_URL, SRV, provider, providerSessionId, order.id || null);
  const claimUrl = claimUrlFromRequest(request, claimToken);

  let emailSent = false;
  let emailError = "";
  if (issued.length > 0) {
    const emailRes = await resendEmail(env, buyerEmail, issued.map((k) => String(k.key || "")), claimUrl);
    emailSent = emailRes.ok;
    emailError = emailRes.ok ? "" : (emailRes.error || "Email failed");

    if (emailSent) {
      await patchOrderBySession(SUPABASE_URL, SRV, providerSessionId, {
        emailed_at: new Date().toISOString(),
        status: "emailed",
      });
    }
  }

  return jsonNoStore(
    {
      ok: true,
      buyer_email: buyerEmail,
      email_sent: emailSent,
      email_error: emailError || undefined,
      key_count: issued.length,
      claim_token: claimToken,
    },
    200,
    getNoStoreHeaders(),
  );
}

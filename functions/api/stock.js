// Cloudflare Pages Function: GET /api/stock?product_id=...
// Returns deterministic "random" stock per variant, with refresh interval based on duration_days.

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(input) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return toHex(hash);
}

function intervalHoursForDuration(durationDays) {
  // Tweak these however you want:
  if (!Number.isFinite(durationDays) || durationDays <= 1) return 1;   // 1 day: hourly
  if (durationDays <= 7) return 3;                                     // week-ish: every 3h
  if (durationDays <= 30) return 6;                                    // month-ish: every 6h
  return 12;                                                           // longer: every 12h
}

function mapToStock(n0to99) {
  // 10% sold out, 15% low stock, 75% in stock
  if (n0to99 < 10) return { status: "out_of_stock", qty: 0 };
  if (n0to99 < 25) return { status: "low_stock", qty: 1 + (n0to99 % 5) };   // 1..5
  return { status: "in_stock", qty: 6 + (n0to99 % 55) };                     // 6..60
}

export async function onRequestGet({ request, env }) {
  try {
    const url = new URL(request.url);
    const productId = url.searchParams.get("product_id");
    if (!productId) {
      return new Response(JSON.stringify({ error: "Missing product_id" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const SUPABASE_URL = env.SUPABASE_URL;
    const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY;
    const STOCK_SECRET = env.STOCK_SECRET;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !STOCK_SECRET) {
      return new Response(JSON.stringify({
        error: "Missing env vars. Need SUPABASE_URL, SUPABASE_ANON_KEY, STOCK_SECRET"
      }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }

    // Pull variants for this product
    const variantsUrl =
      `${SUPABASE_URL}/rest/v1/product_variants` +
      `?select=id,duration_days` +
      `&product_id=eq.${encodeURIComponent(productId)}` +
      `&order=duration_days.asc`;

    const variantsRes = await fetch(variantsUrl, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Accept: "application/json",
      },
    });

    if (!variantsRes.ok) {
      return new Response(JSON.stringify({
        error: "Failed to fetch variants",
        details: await variantsRes.text(),
      }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }

    const variants = await variantsRes.json();

    const now = Date.now();

    const out = [];
    for (const v of variants) {
      const durationDays = v.duration_days == null ? null : Number(v.duration_days);
      const intervalH = intervalHoursForDuration(durationDays);
      const intervalMs = intervalH * 60 * 60 * 1000;

      const bucket = Math.floor(now / intervalMs);

      // Deterministic per variant + bucket, unpredictable because STOCK_SECRET is server-side
      const hex = await sha256Hex(`${STOCK_SECRET}:${v.id}:${bucket}`);
      const n = parseInt(hex.slice(0, 8), 16) % 100;

      const stock = mapToStock(n);

      const nextChangeMs = (bucket + 1) * intervalMs;
      out.push({
        id: String(v.id),
        duration_days: durationDays,
        interval_hours: intervalH,
        bucket,
        next_change_utc: new Date(nextChangeMs).toISOString(),
        ...stock,
      });
    }

    return new Response(JSON.stringify({
      product_id: productId,
      variants: out,
    }), {
      headers: { "content-type": "application/json" },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

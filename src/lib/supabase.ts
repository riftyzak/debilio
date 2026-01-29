export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  "https://euqvwswzbowbxweufaet.supabase.co";

export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "sb_publishable_Cbc3Z1lopGZdttsDkZO28w_C24B4hMT";

export const FN_BASE = `${SUPABASE_URL}/functions/v1`;

export function supaHeaders() {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    Accept: "application/json",
  } as const;
}

export type Product = {
  id: string;
  title: string;
  slug?: string;
  price_eur: number;
  description?: string | null;
  image_url?: string | null;
  is_active?: boolean;
  created_at?: string;
  duration_days?: number | null;
  auto_deliver?: boolean;
  delivery_text?: string | null;
};

export type ProductVariant = {
  id: string;
  product_id: string;
  duration_days: number | null;
  price_eur: number;
  auto_deliver?: boolean;
  delivery_text?: string | null;
};

export async function fetchActiveProducts(): Promise<Product[]> {
  const url =
    `${SUPABASE_URL}/rest/v1/products` +
    `?select=id,title,slug,price_eur,description,image_url,is_active,created_at` +
    `&is_active=eq.true` +
    `&order=created_at.desc`;

  const res = await fetch(url, { headers: supaHeaders() });
  if (!res.ok) throw new Error(await res.text());
  const data = (await res.json()) as Product[];
  return (data || []).map((p) => ({ ...p, price_eur: Number(p.price_eur) }));
}

export async function fetchProductBySlug(slug: string): Promise<Product | null> {
  const base = `${SUPABASE_URL}/rest/v1/products`;
  const selects = [
    "id,title,slug,price_eur,description,image_url,is_active,duration_days,auto_deliver,delivery_text",
    "id,title,slug,price_eur,description,image_url,is_active",
  ];

  let data: Product[] | null = null;
  for (const select of selects) {
    const url =
      `${base}` +
      `?select=${select}` +
      `&slug=eq.${encodeURIComponent(slug)}` +
      `&is_active=eq.true` +
      `&limit=1`;

    const res = await fetch(url, { headers: supaHeaders() });
    if (!res.ok) {
      if (res.status === 400 && select !== selects[selects.length - 1]) {
        continue;
      }
      throw new Error(await res.text());
    }
    data = (await res.json()) as Product[];
    break;
  }

  if (!data || !data[0]) return null;
  return { ...data[0], price_eur: Number(data[0].price_eur) };
}

export async function fetchVariantsByProductId(productId: string): Promise<ProductVariant[]> {
  const base = `${SUPABASE_URL}/rest/v1/product_variants`;
  const selects = [
    "id,product_id,duration_days,price_eur,auto_deliver,delivery_text",
    "id,product_id,duration_days,price_eur",
  ];

  for (const select of selects) {
    const url =
      `${base}` +
      `?select=${select}` +
      `&product_id=eq.${encodeURIComponent(productId)}` +
      `&order=duration_days.asc`;

    const res = await fetch(url, { headers: supaHeaders() });
    if (!res.ok) {
      if (res.status === 400 && select !== selects[selects.length - 1]) {
        continue;
      }
      return [];
    }
    const data = (await res.json()) as ProductVariant[];
    return (data || []).map((variant) => ({
      ...variant,
      price_eur: Number(variant.price_eur),
      duration_days:
        variant.duration_days !== null && variant.duration_days !== undefined
          ? Number(variant.duration_days)
          : null,
      auto_deliver: Boolean(variant.auto_deliver),
      delivery_text: variant.delivery_text || "",
    }));
  }

  return [];
}

export async function fetchProductsByIds(ids: string[]): Promise<Product[]> {
  if (!ids.length) return [];
  const list = ids.map((x) => String(x)).join(",");
  const base = `${SUPABASE_URL}/rest/v1/products`;
  const selects = [
    "id,title,price_eur,auto_deliver,delivery_text,duration_days",
    "id,title,price_eur",
  ];

  let data: Product[] | null = null;
  for (const select of selects) {
    const url = `${base}?select=${select}&id=in.(${encodeURIComponent(list)})&limit=200`;
    const res = await fetch(url, { headers: supaHeaders() });
    if (!res.ok) {
      if (res.status === 400 && select !== selects[selects.length - 1]) {
        continue;
      }
      throw new Error(await res.text());
    }
    data = (await res.json()) as Product[];
    break;
  }

  return (data || []).map((p) => ({
    ...p,
    price_eur: Number(p.price_eur),
    duration_days:
      p.duration_days !== null && p.duration_days !== undefined
        ? Number(p.duration_days)
        : null,
    auto_deliver: Boolean(p.auto_deliver),
    delivery_text: p.delivery_text || "",
  }));
}

export async function fetchVariantsByIds(variantIds: Array<string | null | undefined>) {
  const ids = [...new Set((variantIds || []).filter(Boolean))] as string[];
  if (!ids.length) return [];

  const base = `${SUPABASE_URL}/rest/v1/product_variants`;
  const selects = [
    "id,product_id,duration_days,price_eur,auto_deliver,delivery_text",
    "id,product_id,duration_days,price_eur",
  ];

  for (const select of selects) {
    const url = `${base}?select=${select}&id=in.(${encodeURIComponent(ids.join(","))})`;
    const res = await fetch(url, { headers: supaHeaders() });
    if (!res.ok) {
      if (res.status === 400 && select !== selects[selects.length - 1]) {
        continue;
      }
      return [];
    }
    const data = (await res.json()) as ProductVariant[];
    return (data || []).map((variant) => ({
      ...variant,
      price_eur: Number(variant.price_eur),
      duration_days:
        variant.duration_days !== null && variant.duration_days !== undefined
          ? Number(variant.duration_days)
          : null,
      auto_deliver: Boolean(variant.auto_deliver),
      delivery_text: variant.delivery_text || "",
    }));
  }

  return [];
}

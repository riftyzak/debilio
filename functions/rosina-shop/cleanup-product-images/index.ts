import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const BUCKET = "product-images";

function getEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function extractStoragePath(url: string, bucket: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const bucketIndex = parts.indexOf(bucket);
    if (bucketIndex === -1) return null;
    const pathParts = parts.slice(bucketIndex + 1);
    if (!pathParts.length) return null;
    return pathParts.join("/");
  } catch {
    return null;
  }
}

async function listAllObjects(
  client: ReturnType<typeof createClient>,
  bucket: string,
  prefix = "",
): Promise<string[]> {
  let results: string[] = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const { data, error } = await client.storage.from(bucket).list(prefix, {
      limit,
      offset,
      sortBy: { column: "name", order: "asc" },
    });

    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.metadata && entry.metadata.mimetype) {
        results.push(path);
      } else {
        const nested = await listAllObjects(client, bucket, path);
        results = results.concat(nested);
      }
    }

    if (data.length < limit) break;
    offset += limit;
  }

  return results;
}

serve(async () => {
  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: products, error } = await supabase
      .from("products")
      .select("image_url");

    if (error) throw error;

    const referenced = new Set<string>();
    (products || []).forEach((row) => {
      const path = extractStoragePath(row.image_url || "", BUCKET);
      if (path) referenced.add(path);
    });

    const objects = await listAllObjects(supabase, BUCKET);
    const toDelete = objects.filter((path) => !referenced.has(path));

    if (toDelete.length) {
      const { error: delError } = await supabase.storage
        .from(BUCKET)
        .remove(toDelete);
      if (delError) throw delError;
    }

    return new Response(
      JSON.stringify({
        bucket: BUCKET,
        referenced: referenced.size,
        totalObjects: objects.length,
        deleted: toDelete.length,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err?.message || err) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});

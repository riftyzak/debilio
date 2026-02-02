function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const provider = String(url.searchParams.get("provider") || "").toLowerCase();
  const chargeId = String(url.searchParams.get("charge_id") || "").trim();

  if (provider === "stripe") {
    return jsonResponse({ ok: true, status: "CONFIRMED" });
  }

  if (provider !== "coinbase") {
    return jsonResponse({ error: "Unsupported provider" }, 400);
  }

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "Missing server env vars" }, 500);
  }

  if (!chargeId) {
    return jsonResponse({ error: "Missing charge_id" }, 400);
  }

  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/coinbase_charges?select=status&id=eq.${encodeURIComponent(chargeId)}`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
      }
    }
  );

  if (!res.ok) {
    return jsonResponse({ error: "Failed to fetch status", details: await res.text() }, 500);
  }

  const rows = await res.json();
  const status = rows && rows[0]?.status ? String(rows[0].status).toUpperCase() : "PENDING";
  return jsonResponse({ ok: true, status });
}

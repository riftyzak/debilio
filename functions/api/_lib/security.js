const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  Pragma: "no-cache",
  Expires: "0",
};

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...extraHeaders,
    },
  });
}

export function jsonNoStore(body, status = 200, extraHeaders = {}) {
  return jsonResponse(body, status, {
    ...NO_STORE_HEADERS,
    ...extraHeaders,
  });
}

function getRateStore() {
  if (!globalThis.__apiRateLimitStore) {
    globalThis.__apiRateLimitStore = new Map();
  }
  return globalThis.__apiRateLimitStore;
}

export function getClientIp(request) {
  const forwarded = request.headers.get("cf-connecting-ip")
    || request.headers.get("x-forwarded-for")
    || "";
  const ip = String(forwarded).split(",")[0].trim();
  return ip || "unknown";
}

export function checkRateLimit(request, keyPrefix, limit, windowMs) {
  const now = Date.now();
  const ip = getClientIp(request);
  const store = getRateStore();
  const key = `${keyPrefix}:${ip}`;

  const current = store.get(key);
  if (!current || current.resetAt <= now) {
    const entry = { count: 1, resetAt: now + windowMs };
    store.set(key, entry);
    return { allowed: true, remaining: Math.max(0, limit - 1), resetAt: entry.resetAt };
  }

  if (current.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: current.resetAt };
  }

  current.count += 1;
  store.set(key, current);

  if (store.size > 5000) {
    for (const [k, v] of store.entries()) {
      if (!v || v.resetAt <= now) store.delete(k);
    }
  }

  return { allowed: true, remaining: Math.max(0, limit - current.count), resetAt: current.resetAt };
}

export function rateLimitResponse(resetAt) {
  const retryAfterSec = Math.max(1, Math.ceil((Number(resetAt || 0) - Date.now()) / 1000));
  return jsonNoStore(
    { error: "rate_limited" },
    429,
    {
      "Retry-After": String(retryAfterSec),
    },
  );
}

export function getNoStoreHeaders(extraHeaders = {}) {
  return {
    ...NO_STORE_HEADERS,
    ...extraHeaders,
  };
}

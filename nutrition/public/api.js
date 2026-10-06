// Open Food Facts client. Free and open: no account, no key, no payment.
// Data is crowd-sourced and updated continuously, so every search is live.
//
// On Netlify, requests go through same-origin proxies defined in netlify.toml
// (/off-search/* and /off/*). When the proxy isn't there (e.g. a plain static
// server), we fall back to calling Open Food Facts directly, which also allows CORS.

const FIELDS = [
  "code", "product_name", "product_name_en", "generic_name", "brands", "quantity",
  "nutriments", "serving_size", "serving_quantity", "nutriscore_grade",
  "image_front_small_url", "image_small_url",
].join(",");

const SEARCH_ORIGIN = "https://search.openfoodfacts.org";
const WORLD_ORIGIN = "https://world.openfoodfacts.org";

function candidates(proxyPrefix, origin, path) {
  return location.protocol.startsWith("http") ? [proxyPrefix + path, origin + path] : [origin + path];
}

async function getJSON(urls, { signal, timeout = 15000 } = {}) {
  let lastError = new Error("Request failed");
  for (const url of urls) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    const relay = () => ctrl.abort();
    signal?.addEventListener("abort", relay);
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
      const type = res.headers.get("content-type") || "";
      // OFF answers an unknown barcode with a JSON 404, which is a real answer.
      if (type.includes("json") && (res.ok || res.status === 404)) return await res.json();
      lastError = new Error(`HTTP ${res.status}`);
    } catch (err) {
      if (signal?.aborted) throw err;
      lastError = err;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", relay);
    }
  }
  throw lastError;
}

function text(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object") return v.en || v.main || Object.values(v)[0] || "";
  return String(v);
}

function num(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

export function normalize(p) {
  const n = p.nutriments || {};
  let kcal = num(n["energy-kcal_100g"]);
  if (kcal == null) {
    const kj = num(n["energy-kj_100g"] ?? n.energy_100g);
    if (kj != null) kcal = kj / 4.184;
  }
  let sodium = num(n.sodium_100g);
  if (sodium == null && num(n.salt_100g) != null) sodium = num(n.salt_100g) / 2.5;
  const grade = text(p.nutriscore_grade).toLowerCase();
  return {
    code: String(p.code || ""),
    name: text(p.product_name_en) || text(p.product_name) || text(p.generic_name) || "Unnamed product",
    brand: text(p.brands).split(",")[0].trim(),
    quantity: text(p.quantity),
    image: p.image_front_small_url || p.image_small_url || "",
    nutriscore: /^[a-e]$/.test(grade) ? grade : "",
    servingText: text(p.serving_size),
    servingG: num(p.serving_quantity),
    per100: {
      kcal,
      protein: num(n.proteins_100g),
      carbs: num(n.carbohydrates_100g),
      fat: num(n.fat_100g),
      fiber: num(n.fiber_100g),
      sugar: num(n.sugars_100g),
      sodium,
    },
  };
}

export async function searchFoods(query, { signal } = {}) {
  const q = encodeURIComponent(query.trim());
  let products;
  try {
    const path = `/search?q=${q}&page_size=30&langs=en&fields=${FIELDS}`;
    const data = await getJSON(candidates("/off-search", SEARCH_ORIGIN, path), { signal });
    products = data.hits || [];
  } catch (err) {
    if (signal?.aborted) throw err;
    // Fall back to the classic search endpoint.
    const path = `/cgi/search.pl?search_terms=${q}&search_simple=1&action=process&json=1&page_size=30&fields=${FIELDS}`;
    const data = await getJSON(candidates("/off", WORLD_ORIGIN, path), { signal, timeout: 25000 });
    products = data.products || [];
  }
  return products
    .map(normalize)
    .filter((f) => f.name !== "Unnamed product" || f.per100.kcal != null)
    .sort((a, b) => (b.per100.kcal != null) - (a.per100.kcal != null));
}

export async function lookupBarcode(code, { signal } = {}) {
  const clean = String(code).replace(/\D/g, "");
  if (!clean) return null;
  const path = `/api/v2/product/${clean}.json?fields=${FIELDS}`;
  const data = await getJSON(candidates("/off", WORLD_ORIGIN, path), { signal });
  return data && data.status === 1 && data.product ? normalize({ code: clean, ...data.product }) : null;
}

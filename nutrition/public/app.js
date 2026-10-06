import { searchFoods, lookupBarcode } from "./api.js";

/* ---------- Constants & state ---------- */
const STORE_KEY = "nourish.v1";
const THEME_KEY = "nourish.theme";
const MEALS = [
  { id: "breakfast", label: "Breakfast", icon: "🌅" },
  { id: "lunch", label: "Lunch", icon: "🥗" },
  { id: "dinner", label: "Dinner", icon: "🍽️" },
  { id: "snacks", label: "Snacks", icon: "🍎" },
];
const NUTRIENTS = ["kcal", "protein", "carbs", "fat", "fiber", "sugar", "sodium"];
const MACROS = [
  { key: "protein", label: "Protein", color: "var(--protein)" },
  { key: "carbs", label: "Carbs", color: "var(--carbs)" },
  { key: "fat", label: "Fat", color: "var(--fat)" },
  { key: "fiber", label: "Fiber", color: "var(--fiber)" },
];
const MOODS = ["😞", "🙁", "😐", "🙂", "😄"];
const TIPS = [
  "Aim for a palm-sized portion of protein at every meal.",
  "A glass of water before each meal helps with hydration and fullness.",
  "Half your plate as vegetables is an easy win for fiber.",
  "Colorful plates usually mean a wider range of nutrients.",
  "A 10-minute walk after meals can help steady blood sugar.",
  "Consistent sleep supports appetite regulation. Aim for 7–9 hours.",
  "Plan tomorrow's breakfast tonight to make mornings easier.",
  "Nuts, seeds and olive oil are great sources of healthy fats.",
  "Swap one sugary drink for sparkling water today.",
  "Slow down: it takes about 20 minutes to feel full.",
  "Beans and lentils give you protein and fiber in one go.",
  "Progress beats perfection. Logging most meals is what counts.",
  "Keep fruit visible on the counter for an easy snack.",
  "Stretch for five minutes between long blocks of sitting.",
];

const DEFAULTS = {
  name: "Oriana",
  goals: { kcal: 2000, protein: 110, carbs: 225, fat: 65, fiber: 30, water: 8 },
  unit: "lb",
  days: {},
  weights: [],
  recents: [],
};

let state = load();
let currentDate = dateKey(new Date());
let selectedMeal = defaultMeal();
let chartRange = 7;
let searchCtrl = null;
let lastResults = [];
let portionFood = null;
let scanStream = null;
let scanTimer = null;

/* ---------- Helpers ---------- */
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
function fmt(n, digits = 0) {
  return Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}
function round1(n) { return Math.round(n * 10) / 10; }
function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parseKey(k) {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function shiftKey(k, days) {
  const d = parseKey(k);
  d.setDate(d.getDate() + days);
  return dateKey(d);
}
function isToday(k) { return k === dateKey(new Date()); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function defaultMeal() {
  const h = new Date().getHours();
  if (h >= 4 && h < 11) return "breakfast";
  if (h >= 11 && h < 16) return "lunch";
  if (h >= 16 && h < 22) return "dinner";
  return "snacks";
}
function mealLabel(id) { return MEALS.find((m) => m.id === id)?.label || "Snacks"; }

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY));
    if (raw && typeof raw === "object") {
      return { ...DEFAULTS, ...raw, goals: { ...DEFAULTS.goals, ...raw.goals } };
    }
  } catch {}
  return structuredClone(DEFAULTS);
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch {}
}
function emptyDay() { return { entries: [], water: 0, mood: null, sleep: null, note: "" }; }
function peekDay(k) { return state.days[k] || emptyDay(); }
function day(k) { return (state.days[k] ||= emptyDay()); }

function totals(entries) {
  const t = Object.fromEntries(NUTRIENTS.map((n) => [n, 0]));
  for (const e of entries) for (const n of NUTRIENTS) t[n] += Number(e[n]) || 0;
  return t;
}
function scale(per100, grams) {
  const out = {};
  for (const n of NUTRIENTS) out[n] = per100[n] == null ? 0 : round1((per100[n] * grams) / 100);
  return out;
}

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove("show"), 2600);
}

function weightDisplay(kg) { return state.unit === "lb" ? kg * 2.20462 : kg; }
function weightToKg(v) { return state.unit === "lb" ? v / 2.20462 : v; }

/* ---------- Theme ---------- */
const darkQuery = matchMedia("(prefers-color-scheme: dark)");
function currentTheme() { return document.documentElement.dataset.theme || "system"; }
function applyTheme(choice) {
  document.documentElement.dataset.theme = choice;
  try { localStorage.setItem(THEME_KEY, choice); } catch {}
  $$("[data-theme-choice]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.themeChoice === choice)));
  const dark = choice === "dark" || (choice === "system" && darkQuery.matches);
  $("#themeColor").setAttribute("content", dark ? "#0e1411" : "#f4f7f2");
}
darkQuery.addEventListener("change", () => applyTheme(currentTheme()));

/* ---------- Greeting ---------- */
function greetingWord() {
  const h = new Date().getHours();
  if (h < 5) return "Good evening";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
function dailyTip() {
  const start = new Date(new Date().getFullYear(), 0, 0);
  const dayOfYear = Math.floor((new Date() - start) / 86400000);
  return TIPS[dayOfYear % TIPS.length];
}
function greetingCard() {
  const t = totals(peekDay(dateKey(new Date())).entries);
  const left = state.goals.kcal - t.kcal;
  let line;
  if (t.kcal === 0) line = "Welcome back! Ready to log your first meal of the day?";
  else if (left >= 0) line = `You've had ${fmt(t.kcal)} kcal so far, with ${fmt(left)} kcal left for today. Nice work!`;
  else line = `You're ${fmt(-left)} kcal over today's goal. Tomorrow is a fresh start.`;
  const name = state.name?.trim();
  return `
    <article class="card hero">
      <h1>${greetingWord()}${name ? `, ${esc(name)}` : ""}! <span class="wave" aria-hidden="true">👋</span></h1>
      <p>${esc(line)}</p>
      <div class="tip">💡 ${esc(dailyTip())}</div>
    </article>`;
}

/* ---------- Today view ---------- */
function ring(eaten, goal) {
  const r = 52, c = 2 * Math.PI * r;
  const pct = goal > 0 ? Math.min(eaten / goal, 1) : 0;
  const over = eaten > goal;
  return `
    <div class="ring ${over ? "over" : ""}" role="img" aria-label="${fmt(eaten)} of ${fmt(goal)} calories">
      <svg viewBox="0 0 120 120"><circle class="track" cx="60" cy="60" r="${r}" fill="none" stroke-width="12"/>
        <circle class="value" cx="60" cy="60" r="${r}" fill="none" stroke-width="12" stroke-linecap="round"
          stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct)}"/></svg>
      <div class="ring-label"><strong>${fmt(Math.abs(goal - eaten))}</strong><span>kcal ${over ? "over" : "left"}</span></div>
    </div>`;
}

function barRow(label, value, goal, color, unit = "g") {
  const pct = goal > 0 ? Math.min((value / goal) * 100, 100) : 0;
  return `
    <div class="bar-row">
      <div class="bar-top"><b>${label}</b><span class="muted">${fmt(value)} / ${fmt(goal)} ${unit}</span></div>
      <div class="bar" role="progressbar" aria-label="${label}" aria-valuemin="0" aria-valuemax="${goal}" aria-valuenow="${Math.round(value)}"><i style="width:${pct}%;--c:${color}"></i></div>
    </div>`;
}

function renderToday() {
  const d = peekDay(currentDate);
  const t = totals(d.entries);
  const g = state.goals;
  const date = parseKey(currentDate);
  const label = isToday(currentDate)
    ? "Today"
    : isToday(shiftKey(currentDate, 1)) ? "Yesterday" : date.toLocaleDateString(undefined, { weekday: "long" });
  const glasses = Math.max(g.water, d.water);

  $("#view-today").innerHTML = `
    ${greetingCard()}
    <div class="card datebar">
      <button class="icon-btn" data-action="day-prev" aria-label="Previous day">◀</button>
      <div class="date-label">${label}<div class="muted small">${date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</div></div>
      ${isToday(currentDate)
        ? `<button class="icon-btn" disabled aria-label="Next day" style="opacity:.3">▶</button>`
        : `<button class="icon-btn" data-action="day-next" aria-label="Next day">▶</button>`}
    </div>

    <div class="grid two">
      <article class="card summary">
        ${ring(t.kcal, g.kcal)}
        <div class="macros">
          ${MACROS.map((m) => barRow(m.label, t[m.key], g[m.key], m.color)).join("")}
        </div>
        <div class="kcal-strip">
          <div><strong>${fmt(g.kcal)}</strong><span>Goal</span></div>
          <div><strong>${fmt(t.kcal)}</strong><span>Eaten</span></div>
          <div><strong>${fmt(t.sugar)} g</strong><span>Sugar</span></div>
          <div><strong>${fmt(t.sodium * 1000)} mg</strong><span>Sodium</span></div>
        </div>
      </article>

      <article class="card stack">
        <div>
          <div class="card-head" style="margin-bottom:0">
            <h2>💧 Water</h2>
            <div class="row">
              <button class="icon-btn" data-action="water-minus" aria-label="Remove a glass">−</button>
              <strong>${d.water} / ${g.water}</strong>
              <button class="icon-btn" data-action="water-plus" aria-label="Add a glass">＋</button>
            </div>
          </div>
          <div class="glasses">
            ${Array.from({ length: Math.min(glasses, 16) }, (_, i) =>
              `<button class="glass ${i < d.water ? "full" : ""}" data-action="water-set" data-n="${i + 1}" aria-label="Set water to ${i + 1} glasses"></button>`).join("")}
          </div>
          <p class="muted small">One glass ≈ 250 ml · ${fmt(d.water * 0.25, 2)} L today</p>
        </div>
        <div class="stack" style="gap:8px">
          <h2>🌿 Wellness check-in</h2>
          <div class="moods" role="group" aria-label="Mood">
            ${MOODS.map((m, i) => `<button class="mood" data-action="mood" data-n="${i + 1}" aria-pressed="${d.mood === i + 1}" aria-label="Mood ${i + 1} of 5">${m}</button>`).join("")}
          </div>
          <div class="form-grid">
            <div class="field"><label for="sleep">Sleep (hours)</label>
              <input id="sleep" type="number" min="0" max="24" step="0.5" inputmode="decimal" value="${d.sleep ?? ""}" data-field="sleep" /></div>
          </div>
          <div class="field"><label for="note">Notes</label>
            <textarea id="note" data-field="note" placeholder="How are you feeling? Energy, cravings, workouts…">${esc(d.note)}</textarea></div>
        </div>
      </article>
    </div>

    <div class="grid two">
      ${MEALS.map((m) => mealCard(m, d.entries.filter((e) => e.meal === m.id))).join("")}
    </div>`;
}

function mealCard(meal, entries) {
  const kcal = totals(entries).kcal;
  return `
    <article class="card">
      <div class="card-head meal-head">
        <h3><span aria-hidden="true">${meal.icon}</span>${meal.label} <span class="kcal">${fmt(kcal)} kcal</span></h3>
        <button class="btn small" data-action="add-to-meal" data-meal="${meal.id}">＋ Add</button>
      </div>
      ${entries.length ? `<ul class="meal-list">${entries.map((e) => `
        <li>
          <div>
            <div class="entry-name">${esc(e.name)}</div>
            <div class="entry-meta">${[e.brand, e.grams ? `${fmt(e.grams)} g` : ""].filter(Boolean).map(esc).join(" · ")}
              <span class="chip-dots">
                <span style="--c:var(--protein)">${fmt(e.protein)}p</span>
                <span style="--c:var(--carbs)">${fmt(e.carbs)}c</span>
                <span style="--c:var(--fat)">${fmt(e.fat)}f</span>
              </span>
            </div>
          </div>
          <span class="entry-kcal">${fmt(e.kcal)} kcal</span>
          <button class="icon-btn" data-action="delete-entry" data-id="${e.id}" aria-label="Remove ${esc(e.name)}">🗑</button>
        </li>`).join("")}</ul>` : `<p class="empty">Nothing logged yet.</p>`}
    </article>`;
}

/* ---------- Add food view ---------- */
function renderAddShell() {
  $("#view-add").innerHTML = `
    <article class="card stack">
      <div>
        <h2>Find a food</h2>
        <p class="muted small">Live data from <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener">Open Food Facts</a>, the free, open food database with millions of products, updated every day.</p>
      </div>
      <form id="searchForm" class="search-row" role="search">
        <input id="q" type="search" placeholder="Search: greek yogurt, oat milk, banana…" aria-label="Search foods" autocomplete="off" enterkeyhint="search" />
        <button class="btn primary" type="submit">Search</button>
      </form>
      <div class="form-grid">
        <div class="field">
          <label for="mealSelect">Add to</label>
          <select id="mealSelect">${MEALS.map((m) => `<option value="${m.id}">${m.icon} ${m.label}</option>`).join("")}</select>
        </div>
        <form id="barcodeForm" class="field">
          <label for="barcode">Barcode</label>
          <div class="search-row">
            <input id="barcode" type="text" inputmode="numeric" placeholder="e.g. 3017620422003" autocomplete="off" />
            <button class="btn" type="submit">Look up</button>
            ${"BarcodeDetector" in window ? `<button class="btn" type="button" data-action="scan" aria-label="Scan with camera">📷</button>` : ""}
          </div>
        </form>
      </div>
      <p class="muted small" id="addDateNote"></p>
    </article>

    <div id="results" class="results" aria-live="polite"></div>

    <div class="grid two">
      <article class="card">
        <div class="card-head"><h2>Recent foods</h2></div>
        <div id="recents" class="chips"></div>
      </article>
      <article class="card">
        <div class="card-head"><h2>Quick add</h2><span class="muted small">Homemade or restaurant meal</span></div>
        <form id="quickForm" class="stack">
          <div class="field"><label for="qa-name">Name</label><input id="qa-name" type="text" required placeholder="e.g. Chicken stir-fry" /></div>
          <div class="form-grid">
            <div class="field"><label for="qa-kcal">Calories</label><input id="qa-kcal" type="number" min="0" inputmode="decimal" required /></div>
            <div class="field"><label for="qa-protein">Protein (g)</label><input id="qa-protein" type="number" min="0" step="0.1" inputmode="decimal" /></div>
            <div class="field"><label for="qa-carbs">Carbs (g)</label><input id="qa-carbs" type="number" min="0" step="0.1" inputmode="decimal" /></div>
            <div class="field"><label for="qa-fat">Fat (g)</label><input id="qa-fat" type="number" min="0" step="0.1" inputmode="decimal" /></div>
          </div>
          <button class="btn primary" type="submit">Add to log</button>
        </form>
      </article>
    </div>`;

  $("#searchForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = $("#q").value.trim();
    if (q) runSearch(q);
  });
  $("#barcodeForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const code = $("#barcode").value.trim();
    if (code) runBarcode(code);
  });
  $("#mealSelect").addEventListener("change", (e) => { selectedMeal = e.target.value; });
  $("#quickForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = (id) => Math.max(0, parseFloat($(id).value) || 0);
    addEntry({
      name: $("#qa-name").value.trim(), brand: "Quick add", grams: null,
      kcal: v("#qa-kcal"), protein: v("#qa-protein"), carbs: v("#qa-carbs"), fat: v("#qa-fat"),
      fiber: 0, sugar: 0, sodium: 0,
    }, selectedMeal);
    e.target.reset();
  });
}

function syncAddView() {
  $("#mealSelect").value = selectedMeal;
  $("#addDateNote").textContent = isToday(currentDate)
    ? ""
    : `Logging to ${parseKey(currentDate).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}.`;
  renderRecents();
}

function renderRecents() {
  const el = $("#recents");
  el.innerHTML = state.recents.length
    ? state.recents.map((f, i) => `<button class="chip" data-action="recent" data-i="${i}" title="${esc(f.name)}">${esc(f.name)}</button>`).join("")
    : `<p class="empty">Foods you log will appear here for one-tap re-adding.</p>`;
}

function thumb(food) {
  return food.image
    ? `<img class="thumb" src="${esc(food.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'thumb',textContent:'🥫'}))" />`
    : `<span class="thumb" aria-hidden="true">🥫</span>`;
}

function renderResults(foods, query) {
  lastResults = foods;
  const el = $("#results");
  if (!foods.length) {
    el.innerHTML = `<div class="notice">No matches for “${esc(query)}”. Try a simpler term, or use Quick add.</div>`;
    return;
  }
  el.innerHTML = foods.map((f, i) => `
    <button class="food" data-action="pick" data-i="${i}">
      ${thumb(f)}
      <div>
        <div class="food-name">${esc(f.name)}</div>
        <div class="food-sub">${[f.brand, f.quantity].filter(Boolean).map(esc).join(" · ") || "&nbsp;"}</div>
        <div class="food-sub">${f.per100.kcal != null ? `<b>${fmt(f.per100.kcal)} kcal</b> / 100 g` : "No calorie data"}
          ${f.nutriscore ? ` · <span class="nutri nutri-${f.nutriscore}" title="Nutri-Score ${f.nutriscore.toUpperCase()}">${f.nutriscore}</span>` : ""}</div>
      </div>
    </button>`).join("");
}

async function runSearch(query) {
  searchCtrl?.abort();
  searchCtrl = new AbortController();
  const { signal } = searchCtrl;
  $("#results").innerHTML = Array.from({ length: 6 }, () => `<div class="skeleton"></div>`).join("");
  try {
    const foods = await searchFoods(query, { signal });
    if (!signal.aborted) renderResults(foods, query);
  } catch (err) {
    if (signal.aborted) return;
    $("#results").innerHTML = `<div class="notice">Couldn't reach Open Food Facts right now (${esc(err.message || "network error")}). Check your connection and try again.</div>`;
  }
}

async function runBarcode(code) {
  $("#results").innerHTML = `<div class="skeleton"></div>`;
  try {
    const food = await lookupBarcode(code);
    if (!food) {
      $("#results").innerHTML = `<div class="notice">No product found for barcode ${esc(code)}.</div>`;
      return;
    }
    renderResults([food], code);
    openPortion(food);
  } catch (err) {
    $("#results").innerHTML = `<div class="notice">Couldn't look up that barcode (${esc(err.message || "network error")}).</div>`;
  }
}

/* ---------- Portion dialog ---------- */
function openPortion(food) {
  portionFood = food;
  const dlg = $("#portionDialog");
  const serving = food.servingG && food.servingG > 0 ? food.servingG : null;
  const start = serving || 100;
  dlg.innerHTML = `
    <form method="dialog" class="dialog-body" id="portionForm">
      <div class="dialog-head">
        <div class="portion-food">
          ${thumb(food)}
          <div>
            <h2 id="portionTitle">${esc(food.name)}</h2>
            <div class="muted small">${[food.brand, food.quantity].filter(Boolean).map(esc).join(" · ")}
              ${food.nutriscore ? ` <span class="nutri nutri-${food.nutriscore}">${food.nutriscore}</span>` : ""}</div>
          </div>
        </div>
        <button type="button" class="icon-btn" data-action="close-portion" aria-label="Close">✕</button>
      </div>
      ${food.per100.kcal == null ? `<p class="notice">This product has no calorie data yet. You can still log it.</p>` : ""}
      <div class="form-grid">
        <div class="field"><label for="grams">Amount (g or ml)</label>
          <input id="grams" type="number" min="1" step="1" inputmode="decimal" value="${start}" required /></div>
        <div class="field"><label for="portionMeal">Meal</label>
          <select id="portionMeal">${MEALS.map((m) => `<option value="${m.id}" ${m.id === selectedMeal ? "selected" : ""}>${m.icon} ${m.label}</option>`).join("")}</select></div>
      </div>
      <div class="chips">
        ${serving ? `<button type="button" class="chip" data-grams="${serving}">1 serving${food.servingText ? ` (${esc(food.servingText)})` : ` (${fmt(serving)} g)`}</button>
                     <button type="button" class="chip" data-grams="${serving * 2}">2 servings</button>` : ""}
        <button type="button" class="chip" data-grams="50">50 g</button>
        <button type="button" class="chip" data-grams="100">100 g</button>
        <button type="button" class="chip" data-grams="200">200 g</button>
      </div>
      <table class="nutr-table" id="portionTable"></table>
      <div class="dialog-actions">
        <button type="button" class="btn" data-action="close-portion">Cancel</button>
        <button type="submit" class="btn primary">Add to log</button>
      </div>
    </form>`;

  const update = () => {
    const g = Math.max(0, parseFloat($("#grams").value) || 0);
    const v = scale(food.per100, g);
    $("#portionTable").innerHTML = `
      <tr><td>Calories</td><td>${fmt(v.kcal)} kcal</td></tr>
      <tr><td>Protein</td><td>${fmt(v.protein, 1)} g</td></tr>
      <tr><td>Carbohydrates</td><td>${fmt(v.carbs, 1)} g</td></tr>
      <tr><td>· Sugars</td><td>${fmt(v.sugar, 1)} g</td></tr>
      <tr><td>Fat</td><td>${fmt(v.fat, 1)} g</td></tr>
      <tr><td>Fiber</td><td>${fmt(v.fiber, 1)} g</td></tr>
      <tr><td>Sodium</td><td>${fmt(v.sodium * 1000)} mg</td></tr>`;
  };
  $("#grams").addEventListener("input", update);
  $$("[data-grams]", dlg).forEach((b) => b.addEventListener("click", () => { $("#grams").value = b.dataset.grams; update(); }));
  $("#portionForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const grams = Math.max(0, parseFloat($("#grams").value) || 0);
    if (!grams) return;
    const meal = $("#portionMeal").value;
    selectedMeal = meal;
    addEntry({ name: food.name, brand: food.brand, code: food.code, grams, ...scale(food.per100, grams) }, meal);
    rememberFood(food);
    dlg.close();
  });
  update();
  dlg.showModal();
}

function rememberFood(food) {
  const id = food.code || food.name;
  state.recents = [food, ...state.recents.filter((f) => (f.code || f.name) !== id)].slice(0, 12);
  save();
  renderRecents();
}

function addEntry(values, meal) {
  if (!values.name) return;
  day(currentDate).entries.push({ id: uid(), meal, time: Date.now(), ...values });
  save();
  renderToday();
  toast(`Added ${values.name} to ${mealLabel(meal)} ✓`);
}

/* ---------- Barcode scanner (Chrome on Android and other browsers with BarcodeDetector) ---------- */
async function startScan() {
  const dlg = $("#scanDialog");
  const video = $("#scanVideo");
  $("#scanStatus").textContent = "Point your camera at the barcode on the package.";
  dlg.showModal();
  try {
    const detector = new BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] });
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
    video.srcObject = scanStream;
    await video.play();
    scanTimer = setInterval(async () => {
      try {
        const codes = await detector.detect(video);
        if (codes.length) {
          const code = codes[0].rawValue;
          stopScan();
          $("#barcode").value = code;
          runBarcode(code);
        }
      } catch {}
    }, 350);
  } catch (err) {
    $("#scanStatus").textContent = `Camera unavailable: ${err.message || err.name}. You can type the barcode instead.`;
  }
}
function stopScan() {
  clearInterval(scanTimer);
  scanStream?.getTracks().forEach((t) => t.stop());
  scanStream = null;
  const dlg = $("#scanDialog");
  if (dlg.open) dlg.close();
}

/* ---------- Progress view ---------- */
function rangeKeys(n) {
  const today = dateKey(new Date());
  return Array.from({ length: n }, (_, i) => shiftKey(today, i - n + 1));
}

function streak() {
  let k = dateKey(new Date());
  if (!peekDay(k).entries.length) k = shiftKey(k, -1);
  let n = 0;
  while (peekDay(k).entries.length) { n++; k = shiftKey(k, -1); }
  return n;
}

function calorieChart(keys) {
  const W = 640, H = 220, pad = { l: 40, r: 10, t: 14, b: 26 };
  const vals = keys.map((k) => totals(peekDay(k).entries).kcal);
  const goal = state.goals.kcal;
  const max = Math.max(goal * 1.2, ...vals, 100);
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const bw = iw / keys.length;
  const y = (v) => pad.t + ih - (v / max) * ih;
  const step = keys.length > 14 ? 5 : keys.length > 7 ? 2 : 1;
  const ticks = [0, max / 2, max].map((v) => Math.round(v / 100) * 100);
  return `
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Daily calories for the last ${keys.length} days">
      ${ticks.map((t) => `<line class="grid-line" x1="${pad.l}" x2="${W - pad.r}" y1="${y(t)}" y2="${y(t)}"/><text x="${pad.l - 6}" y="${y(t) + 4}" text-anchor="end">${fmt(t)}</text>`).join("")}
      ${vals.map((v, i) => {
        const h = Math.max(v ? 2 : 0, ih - (y(v) - pad.t));
        return `<rect class="bar-fill ${v > goal ? "over" : ""}" x="${pad.l + i * bw + bw * 0.15}" y="${pad.t + ih - h}" width="${bw * 0.7}" height="${h}" rx="3"><title>${parseKey(keys[i]).toLocaleDateString()}: ${fmt(v)} kcal</title></rect>`;
      }).join("")}
      <line class="goal-line" x1="${pad.l}" x2="${W - pad.r}" y1="${y(goal)}" y2="${y(goal)}"/>
      <text x="${W - pad.r}" y="${y(goal) - 5}" text-anchor="end">Goal ${fmt(goal)}</text>
      ${keys.map((k, i) => ((keys.length - 1 - i) % step === 0
        ? `<text x="${pad.l + i * bw + bw / 2}" y="${H - 8}" text-anchor="middle">${keys.length <= 7 ? parseKey(k).toLocaleDateString(undefined, { weekday: "short" }) : parseKey(k).getDate()}</text>`
        : "")).join("")}
    </svg>`;
}

function weightChart() {
  const pts = [...state.weights].sort((a, b) => a.date.localeCompare(b.date)).slice(-30);
  if (pts.length < 2) return `<p class="empty">Log at least two weigh-ins to see your trend.</p>`;
  const W = 640, H = 200, pad = { l: 44, r: 14, t: 14, b: 26 };
  const vals = pts.map((p) => weightDisplay(p.kg));
  let min = Math.min(...vals), max = Math.max(...vals);
  if (max - min < 2) { min -= 1; max += 1; }
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const t0 = parseKey(pts[0].date).getTime(), t1 = parseKey(pts.at(-1).date).getTime();
  const x = (d) => pad.l + ((parseKey(d).getTime() - t0) / Math.max(t1 - t0, 1)) * iw;
  const y = (v) => pad.t + ih - ((v - min) / (max - min)) * ih;
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(p.date)},${y(vals[i])}`).join("");
  const area = `${line}L${x(pts.at(-1).date)},${pad.t + ih}L${x(pts[0].date)},${pad.t + ih}Z`;
  const fmtD = (d) => parseKey(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Weight trend">
      ${[min, (min + max) / 2, max].map((t) => `<line class="grid-line" x1="${pad.l}" x2="${W - pad.r}" y1="${y(t)}" y2="${y(t)}"/><text x="${pad.l - 6}" y="${y(t) + 4}" text-anchor="end">${fmt(t, 1)}</text>`).join("")}
      <path class="area" d="${area}"/>
      <path class="line" d="${line}"/>
      ${pts.map((p, i) => `<circle class="dot" cx="${x(p.date)}" cy="${y(vals[i])}" r="3.5"><title>${fmtD(p.date)}: ${fmt(vals[i], 1)} ${state.unit}</title></circle>`).join("")}
      <text x="${pad.l}" y="${H - 8}">${fmtD(pts[0].date)}</text>
      <text x="${W - pad.r}" y="${H - 8}" text-anchor="end">${fmtD(pts.at(-1).date)}</text>
    </svg>`;
}

function renderProgress() {
  const keys = rangeKeys(chartRange);
  const logged = keys.filter((k) => peekDay(k).entries.length);
  const sum = totals(logged.flatMap((k) => peekDay(k).entries));
  const avg = (v) => (logged.length ? v / logged.length : 0);
  const waterDays = keys.map((k) => peekDay(k).water).filter((w) => w > 0);
  const avgWater = waterDays.length ? waterDays.reduce((a, b) => a + b, 0) / waterDays.length : 0;
  const sleeps = keys.map((k) => peekDay(k).sleep).filter((s) => s != null && s !== "");
  const avgSleep = sleeps.length ? sleeps.reduce((a, b) => a + Number(b), 0) / sleeps.length : null;

  const weights = [...state.weights].sort((a, b) => a.date.localeCompare(b.date));
  const latest = weights.at(-1);
  const first = weights[0];
  const change = latest && first && latest !== first ? weightDisplay(latest.kg) - weightDisplay(first.kg) : null;

  const macroCal = { protein: sum.protein * 4, carbs: sum.carbs * 4, fat: sum.fat * 9 };
  const macroTotal = macroCal.protein + macroCal.carbs + macroCal.fat;
  const pct = (k) => (macroTotal ? Math.round((macroCal[k] / macroTotal) * 100) : 0);

  $("#view-progress").innerHTML = `
    <div class="card-head" style="margin:0">
      <h1 style="font-size:1.4rem">Your progress</h1>
      <div class="seg" role="group" aria-label="Range">
        ${[7, 14, 30].map((n) => `<button data-action="range" data-n="${n}" aria-pressed="${chartRange === n}">${n} days</button>`).join("")}
      </div>
    </div>

    <div class="grid four">
      <article class="card stat"><div class="label">Avg calories</div><div class="value">${fmt(avg(sum.kcal))}</div><div class="sub">on ${logged.length} logged day${logged.length === 1 ? "" : "s"}</div></article>
      <article class="card stat"><div class="label">Logging streak</div><div class="value">${streak()} 🔥</div><div class="sub">days in a row</div></article>
      <article class="card stat"><div class="label">Weight</div><div class="value">${latest ? `${fmt(weightDisplay(latest.kg), 1)} ${state.unit}` : "—"}</div><div class="sub">${change == null ? "Add a weigh-in below" : `${change > 0 ? "+" : ""}${fmt(change, 1)} ${state.unit} since start`}</div></article>
      <article class="card stat"><div class="label">Avg water / sleep</div><div class="value">${fmt(avgWater, 1)} 💧</div><div class="sub">glasses a day · ${avgSleep == null ? "no sleep logged" : `${fmt(avgSleep, 1)} h sleep`}</div></article>
    </div>

    <article class="card">
      <div class="card-head"><h2>Calories vs goal</h2><span class="legend"><span>▮ under goal</span><span style="color:var(--danger)">▮ over goal</span></span></div>
      ${calorieChart(keys)}
    </article>

    <div class="grid two">
      <article class="card">
        <div class="card-head"><h2>Macro balance</h2><span class="muted small">daily average</span></div>
        ${macroTotal ? `
          <div class="split" role="img" aria-label="Protein ${pct("protein")}%, carbs ${pct("carbs")}%, fat ${pct("fat")}%">
            <i style="width:${pct("protein")}%;--c:var(--protein)"></i><i style="width:${pct("carbs")}%;--c:var(--carbs)"></i><i style="width:${pct("fat")}%;--c:var(--fat)"></i>
          </div>
          <div class="legend chip-dots" style="margin-bottom:14px">
            <span style="--c:var(--protein)">Protein ${pct("protein")}%</span>
            <span style="--c:var(--carbs)">Carbs ${pct("carbs")}%</span>
            <span style="--c:var(--fat)">Fat ${pct("fat")}%</span>
          </div>
          <div class="macros">${MACROS.map((m) => barRow(m.label, avg(sum[m.key]), state.goals[m.key], m.color)).join("")}</div>`
        : `<p class="empty">Log some meals to see your macro balance.</p>`}
      </article>

      <article class="card stack">
        <div class="card-head" style="margin:0"><h2>Weight</h2></div>
        <form id="weightForm" class="form-grid">
          <div class="field"><label for="w-date">Date</label><input id="w-date" type="date" value="${dateKey(new Date())}" max="${dateKey(new Date())}" required /></div>
          <div class="field"><label for="w-val">Weight (${state.unit})</label><input id="w-val" type="number" min="1" step="0.1" inputmode="decimal" required /></div>
          <div class="field" style="align-self:end"><button class="btn primary" type="submit">Save</button></div>
        </form>
        ${weightChart()}
        ${weights.length ? `<ul class="weight-list">${[...weights].reverse().map((w) => `
          <li><span>${parseKey(w.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
            <span class="row"><b>${fmt(weightDisplay(w.kg), 1)} ${state.unit}</b>
            <button class="icon-btn" data-action="delete-weight" data-date="${w.date}" aria-label="Delete weigh-in">🗑</button></span></li>`).join("")}</ul>` : ""}
      </article>
    </div>`;

  $("#weightForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const date = $("#w-date").value;
    const val = parseFloat($("#w-val").value);
    if (!date || !(val > 0)) return;
    state.weights = state.weights.filter((w) => w.date !== date);
    state.weights.push({ date, kg: Math.round(weightToKg(val) * 100) / 100 });
    save();
    renderProgress();
    toast("Weigh-in saved ✓");
  });
}

/* ---------- Settings view ---------- */
function renderSettings() {
  const g = state.goals;
  const goalField = (key, label, step = 1) =>
    `<div class="field"><label for="g-${key}">${label}</label><input id="g-${key}" type="number" min="0" step="${step}" inputmode="decimal" value="${g[key]}" /></div>`;
  $("#view-settings").innerHTML = `
    <h1 style="font-size:1.4rem">Goals &amp; settings</h1>
    <form id="settingsForm" class="stack">
      <article class="card stack">
        <h2>Profile</h2>
        <div class="form-grid">
          <div class="field"><label for="s-name">Your name (used in the greeting)</label><input id="s-name" type="text" value="${esc(state.name)}" autocomplete="name" /></div>
          <div class="field"><label for="s-unit">Weight unit</label>
            <select id="s-unit"><option value="lb" ${state.unit === "lb" ? "selected" : ""}>Pounds (lb)</option><option value="kg" ${state.unit === "kg" ? "selected" : ""}>Kilograms (kg)</option></select></div>
        </div>
      </article>
      <article class="card stack">
        <h2>Daily targets</h2>
        <div class="form-grid">
          ${goalField("kcal", "Calories (kcal)", 10)}
          ${goalField("protein", "Protein (g)")}
          ${goalField("carbs", "Carbs (g)")}
          ${goalField("fat", "Fat (g)")}
          ${goalField("fiber", "Fiber (g)")}
          ${goalField("water", "Water (glasses)")}
        </div>
        <div><button class="btn primary" type="submit">Save changes</button></div>
      </article>
    </form>
    <article class="card stack">
      <h2>Appearance</h2>
      <div class="seg" role="group" aria-label="Theme">
        ${["light", "dark", "system"].map((t) => `<button type="button" data-action="set-theme" data-theme-value="${t}" aria-pressed="${currentTheme() === t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join("")}
      </div>
    </article>
    <article class="card stack">
      <h2>Your data</h2>
      <p class="muted small">Everything stays on this device in your browser. Export a backup to move it to another device.</p>
      <div class="row">
        <button class="btn" type="button" data-action="export">⬇ Export backup</button>
        <label class="btn" style="color:var(--text)">⬆ Import backup<input id="importFile" type="file" accept="application/json,.json" hidden /></label>
        <button class="btn danger" type="button" data-action="reset">Reset all data</button>
      </div>
    </article>
    <p class="muted small">Food data © Open Food Facts contributors, available under the Open Database License. Nutrition info is for general wellness tracking and isn't medical advice.</p>`;

  $("#settingsForm").addEventListener("submit", (e) => {
    e.preventDefault();
    state.name = $("#s-name").value.trim();
    state.unit = $("#s-unit").value;
    for (const k of Object.keys(DEFAULTS.goals)) {
      const v = parseFloat($(`#g-${k}`).value);
      if (Number.isFinite(v) && v >= 0) state.goals[k] = v;
    }
    save();
    toast("Settings saved ✓");
  });
  $("#importFile").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data || typeof data !== "object" || !data.days) throw new Error("Not a Nourish backup");
      state = { ...DEFAULTS, ...data, goals: { ...DEFAULTS.goals, ...data.goals } };
      save();
      renderSettings();
      toast("Backup imported ✓");
    } catch (err) {
      toast(`Import failed: ${err.message}`);
    }
  });
}

/* ---------- Routing ---------- */
const VIEWS = ["today", "add", "progress", "settings"];
function route() {
  const name = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "today";
  for (const v of VIEWS) $(`#view-${v}`).hidden = v !== name;
  $$(".tabs a").forEach((a) => (a.dataset.tab === name ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
  if (name === "today") renderToday();
  if (name === "add") { syncAddView(); }
  if (name === "progress") renderProgress();
  if (name === "settings") renderSettings();
  window.scrollTo({ top: 0 });
}

/* ---------- Events ---------- */
document.addEventListener("click", (e) => {
  const themeBtn = e.target.closest("[data-theme-choice]");
  if (themeBtn) return applyTheme(themeBtn.dataset.themeChoice);

  const el = e.target.closest("[data-action]");
  if (!el) return;
  const { action } = el.dataset;
  const d = () => day(currentDate);

  switch (action) {
    case "day-prev": currentDate = shiftKey(currentDate, -1); renderToday(); break;
    case "day-next": if (!isToday(currentDate)) { currentDate = shiftKey(currentDate, 1); renderToday(); } break;
    case "water-plus": d().water = Math.min(d().water + 1, 30); save(); renderToday(); break;
    case "water-minus": d().water = Math.max(d().water - 1, 0); save(); renderToday(); break;
    case "water-set": {
      const n = Number(el.dataset.n);
      d().water = d().water === n ? n - 1 : n;
      save(); renderToday(); break;
    }
    case "mood": {
      const n = Number(el.dataset.n);
      d().mood = d().mood === n ? null : n;
      save(); renderToday(); break;
    }
    case "add-to-meal":
      selectedMeal = el.dataset.meal;
      location.hash = "#add";
      setTimeout(() => $("#q")?.focus(), 50);
      break;
    case "delete-entry": {
      const day_ = d();
      const entry = day_.entries.find((x) => x.id === el.dataset.id);
      day_.entries = day_.entries.filter((x) => x.id !== el.dataset.id);
      save(); renderToday();
      if (entry) toast(`Removed ${entry.name}`);
      break;
    }
    case "pick": openPortion(lastResults[Number(el.dataset.i)]); break;
    case "recent": openPortion(state.recents[Number(el.dataset.i)]); break;
    case "close-portion": $("#portionDialog").close(); break;
    case "scan": startScan(); break;
    case "close-scan": stopScan(); break;
    case "range": chartRange = Number(el.dataset.n); renderProgress(); break;
    case "delete-weight":
      state.weights = state.weights.filter((w) => w.date !== el.dataset.date);
      save(); renderProgress(); break;
    case "set-theme": applyTheme(el.dataset.themeValue); renderSettings(); break;
    case "export": {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
      const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `nourish-backup-${dateKey(new Date())}.json` });
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      break;
    }
    case "reset":
      if (confirm("Delete all meals, weigh-ins and settings on this device? This can't be undone.")) {
        const name = state.name;
        state = structuredClone(DEFAULTS);
        state.name = name;
        save(); renderSettings(); toast("All data cleared");
      }
      break;
  }
});

// Wellness fields on the Today view save as you type.
document.addEventListener("input", (e) => {
  const field = e.target.dataset?.field;
  if (!field) return;
  const d = day(currentDate);
  if (field === "sleep") {
    const v = parseFloat(e.target.value);
    d.sleep = Number.isFinite(v) ? Math.min(Math.max(v, 0), 24) : null;
  } else if (field === "note") {
    d.note = e.target.value;
  }
  save();
});

$("#scanDialog").addEventListener("close", stopScan);
window.addEventListener("hashchange", route);

// Roll over to the new day if the app stays open past midnight.
let lastSeenDay = dateKey(new Date());
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  const now = dateKey(new Date());
  if (now !== lastSeenDay) {
    if (currentDate === lastSeenDay) currentDate = now;
    lastSeenDay = now;
    route();
  }
});

/* ---------- Start ---------- */
applyTheme(currentTheme());
renderAddShell();
route();

try {
  if (!sessionStorage.getItem("nourish.greeted")) {
    sessionStorage.setItem("nourish.greeted", "1");
    setTimeout(() => toast(`${greetingWord()}${state.name ? `, ${state.name}` : ""}! Welcome to Nourish 🌿`), 400);
  }
} catch {}

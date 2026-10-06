import { SunoClient, ApiError } from "./api.js";
import { midiFromNotes } from "./midi.js";
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

/* =========================================================
   Helpers
   ========================================================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeUrl = (u) => (typeof u === "string" && /^https?:\/\//i.test(u) ? u : "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const uid = () => Math.random().toString(36).slice(2, 10);

function fmtTime(sec) {
  if (!isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
function ago(ts) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(ts).toLocaleDateString();
}
function el(tag, cls, html) {
  const e = document.createElement(tag);
  // Never let generated buttons submit an enclosing <form> by accident.
  if (tag === "button") e.type = "button";
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem("ts." + k);
      return v == null ? d : JSON.parse(v);
    } catch { return d; }
  },
  set(k, v) {
    try { localStorage.setItem("ts." + k, JSON.stringify(v)); } catch (e) {
      console.warn("Storage full or unavailable", e);
    }
  },
};

const bus = new EventTarget();
const emit = (type, detail) => bus.dispatchEvent(new CustomEvent(type, { detail }));
const on = (type, fn) => {
  const h = (e) => fn(e.detail);
  bus.addEventListener(type, h);
  return () => bus.removeEventListener(type, h);
};

/* =========================================================
   Static data
   ========================================================= */
const MODELS = [
  { id: "V6", name: "V6", desc: "Most natural vocals and rich detail", tag: "Best" },
  { id: "V6_WILD", name: "V6 Wild", desc: "Bolder, more experimental ideas", tag: "Creative" },
  { id: "V6_MINI", name: "V6 Mini", desc: "Lightweight and quick", tag: "Fast" },
  { id: "V5_5", name: "V5.5", desc: "Voice-tailored custom model", legacy: true },
  { id: "V5", name: "V5", desc: "Superior expression, faster generation", legacy: true },
  { id: "V4_5PLUS", name: "V4.5+", desc: "Richer tones, up to 8 min", legacy: true },
  { id: "V4_5ALL", name: "V4.5 All", desc: "Better song structure, up to 8 min", legacy: true },
  { id: "V4_5", name: "V4.5", desc: "Smarter prompts, up to 8 min", legacy: true },
  { id: "V4", name: "V4", desc: "Improved vocals, up to 4 min", legacy: true },
];
const DURATION_MODELS = new Set(["V6", "V6_WILD", "V6_MINI", "V5_5"]);
const modelName = (id) => MODELS.find((m) => m.id === id)?.name || id || "";
const limits = (model) => ({ style: model === "V4" ? 200 : 1000, lyrics: model === "V4" ? 3000 : 5000, idea: 3000 });

const GENRES = ["Pop", "Hip-hop", "R&B", "Rock", "Indie", "EDM", "House", "Lo-fi", "Jazz", "Country", "Afrobeats", "Reggaeton", "K-pop", "Synthwave", "Cinematic", "Acoustic", "Metal", "Gospel", "Funk", "Drum & bass"];
const MOODS = ["Uplifting", "Melancholy", "Dreamy", "Energetic", "Romantic", "Dark", "Chill", "Epic", "Playful", "Nostalgic"];

const IDEAS = [
  ["An upbeat summer anthem about a spontaneous road trip to the coast with best friends", "indie pop, jangly guitars, handclaps, 120 bpm"],
  ["A late-night lo-fi track about studying in an empty library while it rains outside", "lo-fi hip-hop, soft Rhodes, vinyl crackle, mellow"],
  ["An epic cinematic theme for a hero returning home after a long war", "orchestral, cinematic, choir, taiko drums"],
  ["A heartbroken country ballad about the old pickup truck your dad left you", "country, acoustic guitar, pedal steel, warm male vocal"],
  ["A neon-soaked 80s synthwave chase through a city that never sleeps", "synthwave, retro, gated drums, arpeggiated synths"],
  ["A playful jazz tune about a cat who runs a secret café at midnight", "swing jazz, upright bass, brushed drums, playful"],
  ["A hype workout anthem about never skipping leg day", "trap, 808s, energetic, hype"],
  ["A dreamy bedroom-pop love song about falling for someone over text", "bedroom pop, dreamy, reverb guitars, soft female vocal"],
  ["An Afrobeats party track about dancing until sunrise on a rooftop", "afrobeats, amapiano log drums, sunny, groovy"],
  ["A gospel-tinged anthem about getting back up after losing everything", "gospel, soul, choir, piano, uplifting"],
  ["A spooky sea shanty sung by ghost pirates looking for their lost ship", "sea shanty, folk, stomps, male choir, eerie"],
  ["A K-pop comeback single about being unstoppable", "k-pop, dance pop, punchy synths, catchy hook"],
];
const LYRIC_THEMES = ["First love", "Leaving home", "Late-night drive", "Chasing dreams", "Heartbreak", "Friendship", "Summer nostalgia", "Self-belief", "City lights", "Rainy days"];
const SOUND_IDEAS = ["Rainy café ambience with vinyl crackle", "Retro 8-bit victory jingle", "Deep cinematic braaam impact", "Lo-fi drum loop, dusty and swung", "Magical sparkle whoosh transition", "Epic orchestral trailer riser", "Chill tropical house loop", "Sci-fi spaceship engine hum"];
const KEYS = ["Any", "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B", "Cm", "C#m", "Dm", "D#m", "Em", "Fm", "F#m", "Gm", "G#m", "Am", "A#m", "Bm"];
const STEMS = ["Lead Vocal", "Backing Vocals", "Drum Kit", "Kick", "Snare", "Hi-Hat", "Bass", "808", "Piano", "Electric Guitar", "Acoustic Guitar", "Guitar", "Synth", "Synth Pad", "Synth Bass", "Synth Lead", "String Section", "Brass Section", "Woodwinds", "Organ", "Percussion", "Choir", "Saxophone", "Trumpet", "Violin", "Cello", "Flute", "Sound Effects"];
const VARIETY = ["Exact", "Normal", "High", "Extra", "Max"];

const ICON = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6 10.6 12 5 6.4z"/></svg>',
  dl: '<svg viewBox="0 0 24 24"><path d="M11 4h2v8.2l3.3-3.3 1.4 1.4L12 16l-5.7-5.7 1.4-1.4 3.3 3.3zM5 18h14v2H5z"/></svg>',
  sun: '<svg viewBox="0 0 24 24"><path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0-5 1 3h-2zm0 20-1-3h2zM2 12l3-1v2zm20 0-3 1v-2zM4.9 4.9l2.8 1.4-1.4 1.4zm14.2 14.2-2.8-1.4 1.4-1.4zM4.9 19.1l1.4-2.8 1.4 1.4zM19.1 4.9l-1.4 2.8-1.4-1.4z"/></svg>',
  moon: '<svg viewBox="0 0 24 24"><path d="M20 15.3A8.5 8.5 0 0 1 8.7 4a8.5 8.5 0 1 0 11.3 11.3z"/></svg>',
  system: '<svg viewBox="0 0 24 24"><path d="M3 4h18v12H3zm2 2v8h14V6zM8 18h8v2H8z"/></svg>',
};

/* =========================================================
   State
   ========================================================= */
const state = {
  client: null,
  tracks: store.get("tracks", []),
  jobs: store.get("jobs", []),
  personas: store.get("personas", []),
  lyrics: store.get("lyrics", []),
  favs: new Set(store.get("favs", [])),
  model: store.get("model", "V6"),
  createMode: store.get("createMode", "simple"),
  refs: [],
  credits: null,
};
if (!MODELS.some((m) => m.id === state.model)) state.model = "V6";

let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    store.set("tracks", state.tracks);
    store.set("jobs", state.jobs.slice(0, 80).map(({ _busy, ...j }) => j));
    store.set("personas", state.personas);
    store.set("lyrics", state.lyrics.slice(0, 40));
    store.set("favs", [...state.favs]);
  }, 150);
}

/* =========================================================
   Theme
   ========================================================= */
const THEMES = [["light", ICON.sun, "Light theme"], ["system", ICON.system, "Match system"], ["dark", ICON.moon, "Dark theme"]];
const darkMq = window.matchMedia("(prefers-color-scheme: dark)");

function applyTheme(pref) {
  const dark = pref === "dark" || (pref === "system" && darkMq.matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  document.documentElement.setAttribute("data-theme-pref", pref);
  try { localStorage.setItem("ts.theme", pref); } catch {}
  $$(".theme-switch button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.theme === pref)));
}
function initTheme() {
  $$("[data-theme-switch]").forEach((host) => {
    const wrap = el("div", "theme-switch");
    wrap.setAttribute("role", "group");
    wrap.setAttribute("aria-label", "Theme");
    for (const [id, icon, label] of THEMES) {
      const b = el("button", "", icon);
      b.type = "button";
      b.dataset.theme = id;
      b.title = label;
      b.setAttribute("aria-label", label);
      b.addEventListener("click", () => applyTheme(id));
      wrap.append(b);
    }
    host.append(wrap);
  });
  const pref = document.documentElement.getAttribute("data-theme-pref") || "system";
  applyTheme(pref);
  darkMq.addEventListener("change", () => {
    if ((document.documentElement.getAttribute("data-theme-pref") || "system") === "system") applyTheme("system");
  });
}

/* =========================================================
   Toasts
   ========================================================= */
function toast(title, msg = "", { type = "info", actions = [], timeout = 5500 } = {}) {
  const t = el("div", `toast ${type}`);
  t.setAttribute("role", type === "error" ? "alert" : "status");
  t.innerHTML = `<div class="t-body"><b>${esc(title)}</b>${msg ? `<span>${esc(msg)}</span>` : ""}<div class="t-actions"></div></div><button class="x" aria-label="Dismiss">×</button>`;
  const acts = $(".t-actions", t);
  for (const a of actions) {
    const b = el("button", "btn btn-sm", esc(a.label));
    b.addEventListener("click", () => { a.onClick(); t.remove(); });
    acts.append(b);
  }
  if (!actions.length) acts.remove();
  $(".x", t).addEventListener("click", () => t.remove());
  $("#toasts").prepend(t);
  if (timeout) setTimeout(() => t.remove(), timeout);
  while ($("#toasts").children.length > 4) $("#toasts").lastElementChild.remove();
}

function showError(target, err) {
  const box = typeof target === "string" ? $(target) : target;
  const msg = err instanceof Error ? err.message : String(err);
  if (box) {
    box.textContent = msg;
    box.hidden = false;
  }
  if (err instanceof ApiError && err.code === 401) lock("Your API key was rejected. Please enter a valid key.");
}
function clearError(target) {
  const box = typeof target === "string" ? $(target) : target;
  if (box) box.hidden = true;
}
function setLoading(btn, on) {
  btn.classList.toggle("is-loading", on);
  btn.disabled = on;
}

/* =========================================================
   Email sign-in (Supabase magic link)
   ========================================================= */
const sb = window.supabase?.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit" },
});
let user = null;
let resendAt = 0;

function showGateStep(step) {
  $("#auth-loading").hidden = true;
  $("#login-form").hidden = step !== "login";
  $("#login-sent").hidden = step !== "sent";
  $("#gate-form").hidden = step !== "key";
  $("#signed-in-as").hidden = !user;
  if (user) $("#signed-in-as b").textContent = user.email;
  const n = step === "key" ? 2 : 1;
  $$(".gate-steps li").forEach((li) => {
    li.classList.toggle("done", +li.dataset.step < n);
    li.classList.toggle("current", +li.dataset.step === n);
  });
  $("#gate").hidden = false;
  $("#app").hidden = true;
  setTimeout(() => (step === "login" ? $("#login-email") : step === "key" ? $("#gate-key") : null)?.focus(), 30);
}

// Decide what to show: sign-in, API key, or the studio.
let visitLoggedFor = null;
function enterApp() {
  if (!user) return showGateStep("login");
  if (visitLoggedFor !== user.id) {
    visitLoggedFor = user.id;
    logEvent("visit");
  }
  const key = readKey();
  if (key) unlock(new SunoClient(key));
  else showGateStep("key");
}

async function sendLink(email) {
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: true },
  });
  if (error) {
    if (error.status === 429 || /rate limit/i.test(error.message)) throw new Error("Too many emails sent. Please wait a minute and try again.");
    throw new Error(error.message);
  }
  resendAt = Date.now() + 60000;
}

async function signOutAccount() {
  leaveAdmin();
  visitLoggedFor = null;
  profile = null;
  renderProfileBadge();
  removeKey();
  state.client = null;
  stopPolling();
  audio.pause();
  $$("dialog[open]").forEach((d) => d.close());
  await sb?.auth.signOut();
  user = null;
  showGateStep("login");
}

async function initAuth() {
  // Errors from an expired or reused link come back in the URL hash.
  const hash = new URLSearchParams(location.hash.slice(1));
  const linkError = hash.get("error_description");

  if (!sb) {
    showGateStep("login");
    $("#login-error").textContent = "Sign-in couldn't load. Check your connection and refresh the page.";
    $("#login-error").hidden = false;
    return;
  }

  const { data } = await sb.auth.getSession();
  user = data.session?.user || null;
  if (hash.has("access_token") || hash.has("error")) history.replaceState(null, "", location.pathname + location.search);

  sb.auth.onAuthStateChange((event, session) => {
    const next = session?.user || null;
    if (event === "SIGNED_OUT" && user) {
      user = null;
      profile = null;
      renderProfileBadge();
      removeKey();
      state.client = null;
      stopPolling();
      audio.pause();
      showGateStep("login");
    } else if (event === "SIGNED_IN" && next && next.id !== user?.id) {
      user = next;
      setTimeout(enterApp, 0);
    }
  });

  enterApp();
  if (!user && linkError) {
    $("#login-error").textContent = /expired|invalid/i.test(linkError) ? "That sign-in link has expired or was already used. Request a new one below." : linkError;
    $("#login-error").hidden = false;
  }
}

let passwordMode = false;
function setPasswordMode(on) {
  passwordMode = on;
  $("#pw-field").hidden = !on;
  $("#login-submit .btn-label").textContent = on ? "Sign in" : "Email me a sign-in code";
  $("#login-fine").textContent = on ? "Passwords are set by an administrator." : "No password needed — we'll email you a one-time code.";
  $("#pw-toggle").textContent = on ? "Email me a code instead" : "Have a password? Sign in with it";
  clearError("#login-error");
  (on ? $("#login-password") : $("#login-email")).focus();
}

function initLogin() {
  $("#pw-toggle").addEventListener("click", () => setPasswordMode(!passwordMode));
  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError("#login-error");
    const email = $("#login-email").value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showError("#login-error", "Enter a valid email address.");
    const btn = $("#login-submit");
    if (passwordMode) {
      const password = $("#login-password").value;
      if (!password) return showError("#login-error", "Enter your password.");
      setLoading(btn, true);
      try {
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw new Error(/invalid login/i.test(error.message) ? "Wrong email or password." : /banned/i.test(error.message) ? "This account has been suspended." : error.message);
        $("#login-password").value = "";
        user = data.user;
        enterApp();
      } catch (err) {
        showError("#login-error", err);
      } finally {
        setLoading(btn, false);
      }
      return;
    }
    setLoading(btn, true);
    try {
      await sendLink(email);
      $("#sent-email").textContent = email;
      clearError("#code-error");
      showGateStep("sent");
      setTimeout(() => $("#login-code").focus(), 40);
    } catch (err) {
      showError("#login-error", err);
    } finally {
      setLoading(btn, false);
    }
  });
  $("#resend-btn").addEventListener("click", async () => {
    const wait = Math.ceil((resendAt - Date.now()) / 1000);
    if (wait > 0) return toast(`You can resend in ${wait}s`);
    try {
      await sendLink($("#sent-email").textContent);
      toast("New link sent 📬", "", { type: "success" });
    } catch (err) {
      toast("Couldn't resend", err.message, { type: "error" });
    }
  });
  $("#change-email").addEventListener("click", () => showGateStep("login"));
  $("#code-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError("#code-error");
    const token = $("#login-code").value.replace(/\D/g, "");
    if (token.length < 6) return showError("#code-error", "Enter the code from the email.");
    const btn = $("#code-submit");
    setLoading(btn, true);
    try {
      const { data, error } = await sb.auth.verifyOtp({ email: $("#sent-email").textContent, token, type: "email" });
      if (error) throw new Error(/expired|invalid/i.test(error.message) ? "That code is wrong or has expired. Check the email or resend a new one." : error.message);
      user = data.user;
      $("#login-code").value = "";
      enterApp();
    } catch (err) {
      showError("#code-error", err);
    } finally {
      setLoading(btn, false);
    }
  });
  $("#gate-signout").addEventListener("click", signOutAccount);
}

/* =========================================================
   Profiles (Supabase table: tunesmith_profiles)
   ========================================================= */
let profile = null;
const AVATAR_BUCKET = "tunesmith-avatars";

function initials() {
  const name = profile?.display_name || profile?.username || user?.email || "?";
  return name.trim().split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
}
function avatarHtml() {
  const url = safeUrl(profile?.avatar_url);
  return url ? `<img src="${esc(url)}" alt="" />` : esc(initials());
}
function renderProfileBadge() {
  $("#topbar-avatar").innerHTML = avatarHtml();
  const first = (profile?.display_name || "").split(" ")[0];
  $("#create-greeting").textContent = first ? `What are we making today, ${first}?` : "What are we making today?";
  updateAdminAccess();
}

async function loadProfile() {
  if (!sb || !user) return;
  const uid = user.id;
  const { data, error } = await sb.from("tunesmith_profiles").select("*").eq("id", uid).maybeSingle();
  if (error || user?.id !== uid) return;
  profile = data || { id: uid, favorite_genres: [] };
  renderProfileBadge();
  // Invite new users to set up their profile once.
  const seen = store.get(`profilePrompted.${uid}`, false);
  if (!profile.display_name && !seen) {
    store.set(`profilePrompted.${uid}`, true);
    setTimeout(() => openProfile({ welcome: true }), 600);
  }
}

function openProfile({ welcome = false } = {}) {
  if (!user) return;
  const p = profile || { favorite_genres: [] };
  const genres = new Set(p.favorite_genres || []);
  let avatarUrl = p.avatar_url || "";
  $("#dlg-title").textContent = welcome ? "👋 Set up your profile" : "Your profile";
  const body = $("#dlg-body");
  body.innerHTML = `
    ${welcome ? '<p class="hint">Tell us a little about yourself. You can change this any time from the avatar in the top bar.</p><br>' : ""}
    <div class="profile-head">
      <span class="avatar lg" data-p="avatar"></span>
      <div>
        <div class="actions">
          <label class="btn btn-sm">Upload photo<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden data-p="file" /></label>
          <button type="button" class="btn btn-sm btn-ghost" data-p="remove">Remove</button>
        </div>
        <p class="hint" style="margin-top:.4rem">PNG, JPG, WebP or GIF · up to 2 MB</p>
      </div>
    </div>
    <div class="fb-grid">
      <div class="field"><label class="label" for="p-name">Display name</label><input id="p-name" class="input" maxlength="60" placeholder="e.g. Anna Olmos" value="${esc(p.display_name || "")}" /></div>
      <div class="field"><label class="label" for="p-user">Username</label><div class="username-wrap"><span>@</span><input id="p-user" class="input" maxlength="24" placeholder="anna_beats" value="${esc(p.username || "")}" /></div><p class="hint">3–24 lowercase letters, numbers or _</p></div>
      <div class="field full"><label class="label" for="p-bio">Bio</label><textarea id="p-bio" class="input" rows="3" maxlength="280" placeholder="Bedroom producer, synth lover, chasing the perfect chorus.">${esc(p.bio || "")}</textarea><div class="field-foot"><span></span><span class="counter" data-p="bio-count"></span></div></div>
      <div class="field full"><span class="label">Favourite genres</span><div class="chips" data-p="genres" style="margin-top:0"></div></div>
      <div class="field full"><span class="label">Email</span><p class="hint">${esc(user.email)}</p></div>
    </div>`;
  const av = $("[data-p=avatar]", body);
  const paintAvatar = () => {
    const url = safeUrl(avatarUrl);
    av.innerHTML = url ? `<img src="${esc(url)}" alt="" />` : esc(initials());
    $("[data-p=remove]", body).hidden = !avatarUrl;
  };
  paintAvatar();

  const chipHost = $("[data-p=genres]", body);
  chipHost.innerHTML = GENRES.map((g) => `<button type="button" class="chip ${genres.has(g) ? "on" : ""}" data-g="${esc(g)}">${esc(g)}</button>`).join("");
  $$(".chip", chipHost).forEach((c) => c.addEventListener("click", () => {
    const g = c.dataset.g;
    if (genres.has(g)) genres.delete(g);
    else if (genres.size >= 12) return toast("Up to 12 genres");
    else genres.add(g);
    c.classList.toggle("on", genres.has(g));
  }));

  const bio = $("#p-bio", body);
  const count = () => ($("[data-p=bio-count]", body).textContent = `${bio.value.length} / 280`);
  bio.addEventListener("input", count);
  count();
  $("#p-user", body).addEventListener("input", (e) => (e.target.value = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "")));

  $("[data-p=file]", body).addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) return toast("Please choose a PNG, JPG, WebP or GIF", "", { type: "error" });
    if (file.size > 2 * 1024 * 1024) return toast("That image is over 2 MB", "Try a smaller one.", { type: "error" });
    av.innerHTML = '<span class="spinner"></span>';
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error } = await sb.storage.from(AVATAR_BUCKET).upload(path, file, { contentType: file.type, upsert: true });
      if (error) throw error;
      avatarUrl = sb.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl;
    } catch (err) {
      toast("Upload failed", err.message, { type: "error" });
    }
    paintAvatar();
  });
  $("[data-p=remove]", body).addEventListener("click", () => { avatarUrl = ""; paintAvatar(); });

  const foot = $("#dlg-foot");
  foot.innerHTML = "";
  const cancel = el("button", "btn btn-ghost", welcome ? "Skip for now" : "Cancel");
  cancel.addEventListener("click", () => dlg.close());
  const saveBtn = el("button", "btn btn-primary", '<span class="btn-label">Save profile</span><span class="spinner"></span>');
  saveBtn.type = "submit";
  foot.append(cancel, saveBtn);
  clearError("#dlg-error");

  dlgSubmit = async () => {
    clearError("#dlg-error");
    const username = $("#p-user", body).value.trim();
    if (username && !/^[a-z0-9_]{3,24}$/.test(username)) return showError("#dlg-error", "Usernames need 3–24 lowercase letters, numbers or underscores.");
    const row = {
      id: user.id,
      display_name: $("#p-name", body).value.trim() || null,
      username: username || null,
      bio: bio.value.trim() || null,
      avatar_url: avatarUrl || null,
      favorite_genres: [...genres],
    };
    setLoading(saveBtn, true);
    try {
      const { data, error } = await sb.from("tunesmith_profiles").upsert(row).select().single();
      if (error) {
        if (error.code === "23505") throw new Error(`@${username} is taken — try another username.`);
        throw new Error(error.message);
      }
      const oldUrl = profile?.avatar_url;
      profile = data;
      renderProfileBadge();
      removeOldAvatar(oldUrl, data.avatar_url);
      dlg.close();
      toast("Profile saved ✨", data.display_name ? `Looking good, ${data.display_name.split(" ")[0]}!` : "", { type: "success" });
    } catch (err) {
      showError("#dlg-error", err);
    } finally {
      setLoading(saveBtn, false);
    }
  };
  if (!dlg.open) dlg.showModal();
}

// Clean up a replaced profile photo (best effort).
function removeOldAvatar(oldUrl, newUrl) {
  const marker = `/object/public/${AVATAR_BUCKET}/`;
  if (!oldUrl || oldUrl === newUrl || !oldUrl.includes(marker)) return;
  const path = decodeURIComponent(oldUrl.split(marker)[1] || "");
  if (path.startsWith(`${user.id}/`)) sb.storage.from(AVATAR_BUCKET).remove([path]).catch(() => {});
}

/* =========================================================
   Activity log (feeds the admin console's monitoring)
   ========================================================= */
function logEvent(kind, detail = {}) {
  if (!sb || !user) return;
  sb.from("tunesmith_events").insert({ user_id: user.id, kind, detail }).then(() => {}, () => {});
}

/* =========================================================
   Admin console (roles: admin = full access, employee = read-only)
   ========================================================= */
const ROLE_LABEL = { admin: "Administrator", employee: "Employee", user: "User" };
const isStaff = () => profile?.role === "admin" || profile?.role === "employee";
const isAdmin = () => profile?.role === "admin";
const adm = { users: [], timer: null, loading: false, loadedOnce: false };

function updateAdminAccess() {
  const tab = $("#admin-tab");
  if (!tab) return;
  tab.hidden = !isStaff();
  $$("[data-admin-only]").forEach((n) => (n.hidden = !isAdmin()));
  // If someone opened #admin before their profile loaded, route again now.
  if (location.hash === "#admin" && !$("#app").hidden) route();
}

async function adminCall(action, payload = {}) {
  const { data, error } = await sb.functions.invoke("tunesmith-admin", { body: { action, ...payload } });
  if (error) {
    let msg = error.message;
    try {
      const body = await error.context?.json?.();
      if (body?.error) msg = body.error;
    } catch {}
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

function enterAdmin() {
  $("#adm-role").className = `role-badge ${profile?.role || ""}`;
  $("#adm-role").textContent = isAdmin() ? "Administrator" : "Employee · read-only";
  $("#adm-sub").textContent = isAdmin()
    ? "Manage people and roles, and keep an eye on the site."
    : "You have read-only access. Ask an administrator to make changes.";
  if (!adm.loadedOnce) refreshAdmin();
  setAutoRefresh($("#adm-auto").checked);
}
function leaveAdmin() {
  clearInterval(adm.timer);
  adm.timer = null;
}
function setAutoRefresh(on) {
  clearInterval(adm.timer);
  adm.timer = on ? setInterval(() => { if (!document.hidden) refreshAdmin(); }, 30000) : null;
}

function fmtWhen(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  const s = (Date.now() - d) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return d.toLocaleDateString();
}
function fmtBytes(n) {
  if (!n && n !== 0) return "—";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i ? 1 : 0)} ${u[i]}`;
}
function fmtDuration(fromIso) {
  const s = (Date.now() - new Date(fromIso)) / 1000;
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}
const isSuspended = (u) => u.banned_until && new Date(u.banned_until) > new Date();

function svcCard(name, check, okText) {
  const cls = check == null ? "wait" : check.ok ? "ok" : "bad";
  const detail = check == null ? "Checking…" : check.ok ? (okText || `Up · ${check.ms} ms`) : check.error || "Down";
  return `<div class="svc"><div class="svc-top"><span class="dot ${cls}"></span>${esc(name)}</div><small>${esc(detail)}</small></div>`;
}

async function timedCheck(fn) {
  const t = performance.now();
  try {
    const extra = await fn();
    return { ok: true, ms: Math.round(performance.now() - t), extra };
  } catch (err) {
    return { ok: false, ms: Math.round(performance.now() - t), error: err.message || String(err) };
  }
}

async function refreshAdmin() {
  if (adm.loading || !isStaff()) return;
  adm.loading = true;
  const btn = $("#adm-refresh");
  setLoading(btn, true);
  clearError("#adm-error");
  $("#adm-status").innerHTML = ["Database", "Sign-in service", "File storage", "Suno API", "Site functions"].map((n) => svcCard(n, null)).join("");

  // Checks the browser can do itself
  const sunoCheck = timedCheck(async () => {
    if (!state.client) throw new Error("No API key in this session");
    const c = await state.client.credits();
    return `${Number(c).toLocaleString()} credits on your key`;
  });
  const siteCheck = timedCheck(async () => {
    const r = await fetch("/callback", { method: "POST" });
    if (!r.ok) throw new Error(`Callback returned ${r.status}`);
  });
  const dbStats = sb.rpc("tunesmith_db_stats").then(({ data, error }) => { if (error) throw error; return data; });

  const [overview, users, audit, suno, site, db] = await Promise.allSettled([
    adminCall("overview"),
    adminCall("list_users"),
    isAdmin() ? adminCall("audit_log") : Promise.resolve({ entries: [] }),
    sunoCheck,
    siteCheck,
    dbStats,
  ]);

  const ov = overview.status === "fulfilled" ? overview.value : null;
  if (!ov) {
    const msg = overview.reason?.message || "Couldn't reach the admin service.";
    showError("#adm-error", `Admin service: ${msg}`);
  }
  const h = ov?.health || {};
  const fail = (r) => ({ ok: false, error: r.reason?.message || "Unavailable" });
  $("#adm-status").innerHTML = [
    svcCard("Database", ov ? h.database : db.status === "fulfilled" ? { ok: true, ms: 0 } : fail(db), ov ? null : "Connected"),
    svcCard("Sign-in service", ov ? h.auth : fail(overview)),
    svcCard("File storage", ov ? h.storage : fail(overview)),
    svcCard("Suno API", suno.value, suno.value?.ok ? `Up · ${suno.value.ms} ms · ${suno.value.extra}` : null),
    svcCard("Site functions", site.value, site.value?.ok ? `Up · ${site.value.ms} ms` : null),
  ].join("");
  if (site.value && !site.value.ok && /^(localhost|127\.)/.test(location.hostname)) {
    $("#adm-status").lastElementChild.querySelector("small").textContent = "Only available on the deployed Netlify site";
    $("#adm-status").lastElementChild.querySelector(".dot").className = "dot warn";
  }
  $("#adm-checked").textContent = `· checked ${new Date().toLocaleTimeString()}`;

  if (ov) {
    const u = ov.users, a = ov.activity;
    const tiles = [
      [u.total, "People"],
      [u.new7d, "New this week"],
      [u.active24h, "Signed in today"],
      [a.requests24h, "Studio requests (24h)"],
      [a.failures24h, "Failed tasks (24h)", a.failures24h > 0],
      [`${u.roles.admin || 0} · ${u.roles.employee || 0} · ${u.roles.user || 0}`, "Admins · Employees · Users"],
    ];
    if (u.banned) tiles.push([u.banned, "Suspended", true]);
    $("#adm-tiles").innerHTML = tiles.map(([v, l, bad]) => `<div class="tile ${bad ? "bad" : ""}"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join("");
    renderActivity(a.recent);
  }

  if (users.status === "fulfilled") {
    adm.users = users.value.users || [];
    renderAdminUsers();
  } else if (ov) {
    showError("#adm-error", users.reason?.message || "Couldn't load people.");
  }

  renderDbStats(db.status === "fulfilled" ? db.value : null, db.reason?.message);
  if (isAdmin()) renderAudit(audit.status === "fulfilled" ? audit.value.entries : null);

  adm.loadedOnce = true;
  adm.loading = false;
  setLoading(btn, false);
}

const EVENT_TEXT = {
  visit: "opened the studio",
  song: "created a song",
  remix: "started a remix",
  sound: "generated a sound",
  lyrics: "wrote lyrics",
  wav: "rendered a WAV",
  stems: "split stems",
  midi: "exported MIDI",
  video: "made a music video",
  cover: "made cover art",
  recovery: "restored audio links",
  failed: "had a task fail",
};
function renderActivity(rows) {
  const host = $("#adm-activity");
  if (!rows?.length) {
    host.innerHTML = '<p class="muted">No activity yet. It will show up here as people use the studio.</p>';
    return;
  }
  host.innerHTML = rows.map((e) => {
    const who = e.email || "Someone";
    const extra = [e.detail?.op, e.detail?.model, e.kind === "failed" && e.detail?.error].filter(Boolean).join(" · ");
    return `<div class="feed-row"><time title="${esc(new Date(e.created_at).toLocaleString())}">${esc(fmtWhen(e.created_at))}</time><div class="what"><b>${esc(who)}</b> ${esc(EVENT_TEXT[e.kind] || e.kind)}${extra ? ` <small>· ${esc(extra)}</small>` : ""}</div></div>`;
  }).join("");
}

const AUDIT_TEXT = {
  set_role: (d) => `changed role ${d.from || "?"} → ${d.to || "?"}`,
  set_password: () => "set a new password",
  suspend_user: () => "suspended",
  restore_user: () => "restored",
  delete_user: () => "deleted",
  create_user: (d) => `added as ${d.role || "user"}`,
  update_profile: () => "edited the profile",
};
function renderAudit(entries) {
  const host = $("#adm-audit");
  if (!entries) { host.innerHTML = '<p class="muted">Couldn\'t load the history.</p>'; return; }
  if (!entries.length) { host.innerHTML = '<p class="muted">No admin changes yet.</p>'; return; }
  host.innerHTML = entries.map((e) => `<div class="feed-row"><time title="${esc(new Date(e.created_at).toLocaleString())}">${esc(fmtWhen(e.created_at))}</time><div class="what"><b>${esc(e.actor_email || "An admin")}</b> → ${esc(e.target_email || "someone")}: ${esc((AUDIT_TEXT[e.action] || (() => e.action))(e.detail || {}))}</div></div>`).join("");
}

function renderDbStats(d, errMsg) {
  const host = $("#adm-db");
  if (!d) { host.innerHTML = `<p class="form-error">${esc(errMsg || "Couldn't read database stats.")}</p>`; return; }
  const pct = Math.min(100, Math.round((d.connections / d.max_connections) * 100));
  const tables = Object.entries(d.tables || {}).sort((a, b) => a[0].localeCompare(b[0]));
  host.innerHTML = `
    <dl class="kv">
      <dt>Status</dt><dd><span class="status">Connected</span></dd>
      <dt>Postgres</dt><dd>${esc(d.version)}</dd>
      <dt>Size</dt><dd>${esc(fmtBytes(d.size_bytes))}</dd>
      <dt>Connections</dt><dd>${esc(d.connections)} of ${esc(d.max_connections)}<div class="meter"><i style="width:${pct}%"></i></div></dd>
      <dt>Up for</dt><dd>${esc(fmtDuration(d.started_at))}</dd>
      ${tables.map(([t, n]) => `<dt>${esc(t)}</dt><dd>${Number(n).toLocaleString()} rows</dd>`).join("")}
    </dl>`;
}

function renderAdminUsers() {
  const q = $("#adm-search").value.trim().toLowerCase();
  const f = $("#adm-role-filter").value;
  const list = adm.users.filter((u) => {
    if (f === "suspended" ? !isSuspended(u) : f !== "all" && u.role !== f) return false;
    return !q || [u.email, u.display_name, u.username].some((x) => (x || "").toLowerCase().includes(q));
  });
  $("#adm-user-count").textContent = `${list.length} of ${adm.users.length}`;
  const body = $("#adm-users");
  if (!list.length) {
    body.innerHTML = `<tr><td colspan="6" class="empty-row">${adm.users.length ? "No one matches that search." : "No people yet."}</td></tr>`;
    return;
  }
  body.innerHTML = list.map((u) => {
    const me = u.id === user?.id;
    const url = safeUrl(u.avatar_url);
    const name = u.display_name || (u.username ? `@${u.username}` : u.email);
    const status = isSuspended(u) ? '<span class="status suspended">Suspended</span>' : u.last_sign_in_at ? '<span class="status">Active</span>' : '<span class="status pending">Never signed in</span>';
    const role = isAdmin() && !me
      ? `<select class="input" data-role="${esc(u.id)}" aria-label="Role for ${esc(u.email)}">${Object.entries(ROLE_LABEL).map(([v, l]) => `<option value="${v}" ${u.role === v ? "selected" : ""}>${l}</option>`).join("")}</select>`
      : `<span class="role-badge ${esc(u.role)}">${esc(ROLE_LABEL[u.role] || u.role)}</span>`;
    return `<tr>
      <td><div class="adm-person"><span class="avatar">${url ? `<img src="${esc(url)}" alt="" />` : esc((name || "?")[0].toUpperCase())}</span><div><b>${esc(name)}${me ? " (you)" : ""}</b><small>${esc(u.email || "")}</small></div></div></td>
      <td>${role}</td>
      <td>${status}</td>
      <td title="${esc(new Date(u.created_at).toLocaleString())}">${esc(fmtWhen(u.created_at))}</td>
      <td title="${u.last_sign_in_at ? esc(new Date(u.last_sign_in_at).toLocaleString()) : ""}">${esc(fmtWhen(u.last_sign_in_at))}</td>
      <td><button type="button" class="btn btn-sm" data-manage="${esc(u.id)}">${isAdmin() ? "Manage" : "View"}</button></td>
    </tr>`;
  }).join("");
  $$("[data-manage]", body).forEach((b) => b.addEventListener("click", () => openPerson(b.dataset.manage)));
  $$("[data-role]", body).forEach((sel) => sel.addEventListener("change", async () => {
    const u = adm.users.find((x) => x.id === sel.dataset.role);
    const role = sel.value;
    if (!confirm(`Make ${u.email} ${role === "admin" ? "an" : "a"} ${ROLE_LABEL[role]}?`)) { sel.value = u.role; return; }
    sel.disabled = true;
    try {
      await adminCall("set_role", { userId: u.id, role });
      u.role = role;
      toast("Role updated", `${u.email} is now ${role === "admin" ? "an" : "a"} ${ROLE_LABEL[role]}.`, { type: "success" });
      refreshAdmin();
    } catch (err) {
      sel.value = u.role;
      toast("Couldn't change role", err.message, { type: "error" });
    } finally {
      sel.disabled = false;
    }
  }));
}

async function adminAction(fn, okTitle, okMsg) {
  try {
    await fn();
    toast(okTitle, okMsg || "", { type: "success" });
    refreshAdmin();
    return true;
  } catch (err) {
    toast("That didn't work", err.message, { type: "error" });
    return false;
  }
}

function openPerson(id) {
  const u = adm.users.find((x) => x.id === id);
  if (!u) return;
  const me = u.id === user?.id;
  const url = safeUrl(u.avatar_url);
  $("#dlg-title").textContent = u.display_name || u.email;
  const body = $("#dlg-body");
  body.innerHTML = `
    <div class="profile-head">
      <span class="avatar lg">${url ? `<img src="${esc(url)}" alt="" />` : esc((u.display_name || u.email || "?")[0].toUpperCase())}</span>
      <div>
        <b>${esc(u.email)}</b><br>
        <span class="role-badge ${esc(u.role)}">${esc(ROLE_LABEL[u.role])}</span>
        ${isSuspended(u) ? '<span class="status suspended" style="margin-left:.4rem">Suspended</span>' : ""}
      </div>
    </div>
    <dl class="kv">
      <dt>Display name</dt><dd>${esc(u.display_name || "—")}</dd>
      <dt>Username</dt><dd>${u.username ? "@" + esc(u.username) : "—"}</dd>
      <dt>Bio</dt><dd>${esc(u.bio || "—")}</dd>
      <dt>Genres</dt><dd>${esc((u.favorite_genres || []).join(", ") || "—")}</dd>
      <dt>Joined</dt><dd>${esc(new Date(u.created_at).toLocaleString())}</dd>
      <dt>Last sign-in</dt><dd>${u.last_sign_in_at ? esc(new Date(u.last_sign_in_at).toLocaleString()) : "Never"}</dd>
      <dt>User ID</dt><dd class="mono" style="font-weight:400">${esc(u.id)}</dd>
    </dl>
    ${isAdmin() ? `<h4 class="adm-h" style="margin-top:1.2rem">Actions</h4>
    <div class="adm-actions">
      <button type="button" class="btn btn-sm" data-a="edit">✏️ Edit profile</button>
      <button type="button" class="btn btn-sm" data-a="password">🔑 Set password</button>
      ${me ? "" : `<button type="button" class="btn btn-sm" data-a="ban">${isSuspended(u) ? "✅ Restore access" : "⛔ Suspend"}</button>
      <button type="button" class="btn btn-sm btn-danger" data-a="delete">🗑 Delete account</button>`}
    </div>` : '<p class="hint" style="margin-top:1rem">Employees can view people but not change them.</p>'}`;
  $("#dlg-foot").innerHTML = '<button type="button" class="btn btn-primary" data-close>Done</button>';
  clearError("#dlg-error");
  dlgSubmit = () => dlg.close();

  const act = (name, fn) => $(`[data-a=${name}]`, body)?.addEventListener("click", fn);
  act("edit", () => openForm({
    title: `Edit ${u.email}`,
    submitLabel: "Save",
    fields: [
      { name: "display_name", label: "Display name", maxLength: 60, value: u.display_name || "" },
      { name: "username", label: "Username", maxLength: 24, value: u.username || "", help: "3–24 lowercase letters, numbers or _" },
      { name: "bio", label: "Bio", type: "textarea", rows: 3, maxLength: 280, value: u.bio || "" },
    ],
    onSubmit: async (v) => {
      if (v.username && !/^[a-z0-9_]{3,24}$/.test(v.username)) throw new Error("Usernames need 3–24 lowercase letters, numbers or underscores.");
      await adminCall("update_profile", { userId: u.id, display_name: v.display_name || "", username: v.username || "", bio: v.bio || "" });
      toast("Profile updated", u.email, { type: "success" });
      refreshAdmin();
    },
  }));
  act("password", () => openForm({
    title: `Set a password for ${u.email}`,
    intro: "They can then sign in with “Have a password? Sign in with it” on the sign-in screen. Email codes keep working too.",
    submitLabel: "Set password",
    fields: [
      { name: "password", label: "New password", type: "password", required: true, minLength: 8, help: "8–72 characters" },
      { name: "confirm", label: "Confirm password", type: "password", required: true },
    ],
    onSubmit: async (v) => {
      if (v.password.length < 8) throw new Error("Passwords must be at least 8 characters.");
      if (v.password !== v.confirm) throw new Error("The passwords don't match.");
      await adminCall("set_password", { userId: u.id, password: v.password });
      toast("Password set 🔑", `Let ${u.email} know their new password.`, { type: "success" });
      refreshAdmin();
    },
  }));
  act("ban", async () => {
    const banned = !isSuspended(u);
    if (!confirm(banned ? `Suspend ${u.email}? They won't be able to sign in until restored.` : `Restore access for ${u.email}?`)) return;
    if (await adminAction(() => adminCall("set_banned", { userId: u.id, banned }), banned ? "Account suspended" : "Access restored", u.email)) dlg.close();
  });
  act("delete", async () => {
    const typed = prompt(`This permanently deletes ${u.email} and their profile. Type DELETE to confirm.`);
    if (typed !== "DELETE") return;
    if (await adminAction(() => adminCall("delete_user", { userId: u.id }), "Account deleted", u.email)) dlg.close();
  });
  if (!dlg.open) dlg.showModal();
}

function addPerson() {
  openForm({
    title: "Add a person",
    intro: "They can sign in right away with their email (we'll send a code when they try). Add a password only if they need one.",
    submitLabel: "Add person",
    fields: [
      { name: "email", label: "Email", type: "email", required: true, placeholder: "name@example.com" },
      { name: "role", label: "Role", type: "select", value: "user", options: Object.entries(ROLE_LABEL).map(([v, l]) => [v, l]) },
      { name: "password", label: "Password", type: "password", help: "Optional · 8–72 characters" },
    ],
    onSubmit: async (v) => {
      await adminCall("create_user", { email: v.email, role: v.role || "user", password: v.password || undefined });
      toast("Person added", `${v.email} · ${ROLE_LABEL[v.role || "user"]}`, { type: "success" });
      refreshAdmin();
    },
  });
}

function initAdmin() {
  $("#adm-refresh").addEventListener("click", refreshAdmin);
  $("#adm-auto").addEventListener("change", (e) => setAutoRefresh(e.target.checked));
  $("#adm-search").addEventListener("input", renderAdminUsers);
  $("#adm-role-filter").addEventListener("change", renderAdminUsers);
  $("#adm-add").addEventListener("click", addPerson);
}

/* =========================================================
   Key gate
   ========================================================= */
// The Suno key is stored per signed-in account.
const keyName = () => `ts.key.${user?.id || "anon"}`;
function readKey() {
  try { return localStorage.getItem(keyName()) || sessionStorage.getItem(keyName()) || ""; } catch { return ""; }
}
function removeKey() {
  try { localStorage.removeItem(keyName()); sessionStorage.removeItem(keyName()); localStorage.removeItem("ts.key"); } catch {}
}
function writeKey(key, remember) {
  try {
    removeKey();
    (remember ? localStorage : sessionStorage).setItem(keyName(), key);
  } catch {}
}

function initGate() {
  const form = $("#gate-form");
  const input = $("#gate-key");
  $("#gate-reveal").addEventListener("click", () => {
    input.type = input.type === "password" ? "text" : "password";
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const key = input.value.trim().replace(/^Bearer\s+/i, "");
    if (!key) return;
    const btn = $("#gate-submit");
    setLoading(btn, true);
    clearError("#gate-error");
    try {
      const client = new SunoClient(key);
      const credits = await client.credits();
      writeKey(key, $("#gate-remember").checked);
      input.value = "";
      unlock(client, credits);
      toast("You're in! 🎉", `${Number(credits).toLocaleString()} credits ready to spend.`, { type: "success" });
    } catch (err) {
      const box = $("#gate-error");
      box.textContent = err instanceof ApiError && err.code === 401 ? "That key didn't work. Copy it again from sunoapi.org/api-key." : err.message;
      box.hidden = false;
    } finally {
      setLoading(btn, false);
    }
  });
}

function unlock(client, credits) {
  state.client = client;
  loadProfile();
  $("#gate").hidden = true;
  $("#app").hidden = false;
  if (credits != null) setCredits(credits);
  else refreshCredits();
  route();
  startPolling();
}

function lock(message) {
  removeKey();
  state.client = null;
  stopPolling();
  audio.pause();
  $$("dialog[open]").forEach((d) => d.close());
  showGateStep(user ? "key" : "login");
  if (message) {
    $("#gate-error").textContent = message;
    $("#gate-error").hidden = false;
  }
}

/* =========================================================
   Credits
   ========================================================= */
function setCredits(n) {
  state.credits = n;
  $("#credits-val").textContent = n == null ? "—" : Number(n).toLocaleString();
  $("#credits-btn").classList.toggle("low", n != null && n < 30);
}
async function refreshCredits() {
  if (!state.client) return;
  try { setCredits(await state.client.credits()); } catch (err) {
    if (err.code === 401) lock("Your API key was rejected. Please enter a valid key.");
  }
}

/* =========================================================
   Routing
   ========================================================= */
const TABS = ["create", "lyrics", "remix", "sounds", "library", "admin"];
function route() {
  const tab = (location.hash || "#create").slice(1);
  let active = TABS.includes(tab) ? tab : "create";
  if (active === "admin" && !isStaff()) active = "create";
  $$("[data-view]").forEach((v) => (v.hidden = v.dataset.view !== active));
  $$(".tabs a").forEach((a) => a.setAttribute("aria-selected", String(a.dataset.tab === active)));
  if (active === "library") renderLibrary();
  if (active === "lyrics") renderLyrics();
  if (active === "remix") refreshLibraryPickers();
  if (active === "admin") enterAdmin();
  else leaveAdmin();
}
window.addEventListener("hashchange", route);
const go = (tab) => { if (location.hash !== "#" + tab) location.hash = tab; else route(); };

/* =========================================================
   Jobs (async tasks) & polling
   ========================================================= */
const KIND = {
  music: "Song", lyrics: "Lyrics", wav: "WAV", stems: "Stems", midi: "MIDI", video: "Video", cover: "Cover art", recovery: "Restore",
};
const POLL_MS = { music: 5000, lyrics: 4000, wav: 5000, stems: 7000, midi: 7000, video: 8000, cover: 6000, recovery: 3000 };
const TIMEOUT_MS = 25 * 60 * 1000;
const MUSIC_STAGE = { PENDING: 0, TEXT_SUCCESS: 1, FIRST_SUCCESS: 2, SUCCESS: 3 };
// CALLBACK_EXCEPTION only means Suno could not reach the callback URL; results may
// still arrive, so we keep polling until the timeout instead of failing.
const FAIL_STATES = new Set(["CREATE_TASK_FAILED", "GENERATE_AUDIO_FAILED", "GENERATE_LYRICS_FAILED", "GENERATE_WAV_FAILED", "GENERATE_MP4_FAILED", "SENSITIVE_WORD_ERROR"]);
const FAIL_TEXT = {
  CREATE_TASK_FAILED: "Couldn't start the task",
  GENERATE_AUDIO_FAILED: "Audio generation failed",
  GENERATE_LYRICS_FAILED: "Lyrics generation failed",
  GENERATE_WAV_FAILED: "WAV conversion failed",
  GENERATE_MP4_FAILED: "Video generation failed",
  SENSITIVE_WORD_ERROR: "Blocked by content filter — try rewording",
};

function addJob(job) {
  logEvent(job.kind === "music" ? job.meta?.source || "song" : job.kind, { op: job.meta?.op || null, model: job.meta?.model || null });
  const j = { status: "running", stage: 0, createdAt: Date.now(), updatedAt: Date.now(), fails: 0, nextAt: Date.now() + 2500, meta: {}, ...job };
  state.jobs.unshift(j);
  save();
  renderJobs();
  kickPolling();
  return j;
}
function updateJob(job, patch) {
  if (patch.status === "failed" && job.status !== "failed") {
    logEvent("failed", { kind: job.kind, op: job.meta?.op || null, error: String(patch.error || "").slice(0, 200) });
  }
  Object.assign(job, patch, { updatedAt: Date.now() });
  save();
  renderJobs();
  emit("job", job);
}
const jobById = (id) => state.jobs.find((j) => j.id === id);

let pollTimer = null;
function startPolling() {
  stopPolling();
  pollTimer = setInterval(pollTick, 1000);
  renderJobs();
}
function stopPolling() { clearInterval(pollTimer); pollTimer = null; }
function kickPolling() { if (state.client && !pollTimer) startPolling(); }

let tickCount = 0;
async function pollTick() {
  if (!state.client) return;
  tickCount++;
  const now = Date.now();
  const running = state.jobs.filter((j) => j.status === "running");
  // Refresh elapsed timers.
  if (running.length) $$("[data-job-time]").forEach((n) => { const j = jobById(n.dataset.jobTime); if (j) n.textContent = ago(j.createdAt); });
  for (const job of running) {
    if (job._busy || job.nextAt > now) continue;
    if (now - job.createdAt > TIMEOUT_MS) {
      updateJob(job, { status: "failed", error: "Timed out. It may still finish — tap Check again." });
      continue;
    }
    job._busy = true;
    pollJob(job)
      .then(() => { job.fails = 0; })
      .catch((err) => {
        if (err instanceof ApiError && err.code === 401) return lock("Your API key was rejected. Please enter a valid key.");
        job.fails = (job.fails || 0) + 1;
        if (job.fails >= 6) {
          const batch = job.kind === "lyrics" && state.lyrics.find((b) => b.taskId === job.id);
          if (batch) Object.assign(batch, { status: "failed", error: err.message });
          updateJob(job, { status: "failed", error: err.message });
          renderLyrics();
        }
      })
      .finally(() => {
        job._busy = false;
        job.nextAt = Date.now() + (POLL_MS[job.kind] || 5000) * (1 + Math.min(job.fails || 0, 4));
      });
  }
}

async function pollJob(job) {
  const c = state.client;
  switch (job.kind) {
    case "music": {
      const d = await c.musicInfo(job.id);
      const status = d?.status || "PENDING";
      const items = d?.response?.sunoData || [];
      const playable = items.filter((i) => i.audio_url || i.stream_audio_url || i.source_audio_url || i.source_stream_audio_url);
      if (playable.length) upsertTracks(playable, job);
      const prevStage = job.stage || 0;
      const stage = Math.max(prevStage, MUSIC_STAGE[status] ?? 0, playable.length ? 2 : 0);
      const complete = status === "SUCCESS" || (status === "CALLBACK_EXCEPTION" && playable.some((i) => i.audio_url || i.source_audio_url));
      if (complete) {
        updateJob(job, { status: "done", stage: 3, trackIds: playable.map((i) => i.id) });
        onMusicDone(job);
      } else if (FAIL_STATES.has(status)) {
        updateJob(job, { status: "failed", error: d.errorMessage || FAIL_TEXT[status] });
        toast(`${job.label} didn't work`, d.errorMessage || FAIL_TEXT[status], { type: "error" });
      } else if (stage !== prevStage) {
        updateJob(job, { stage, trackIds: playable.map((i) => i.id) });
        if (stage === 2 && prevStage < 2 && playable.length) {
          toast("First take is streaming 🎧", "Listen now while the final master renders.", {
            actions: [{ label: "▶ Play", onClick: () => playTrack(playable[0].id) }],
          });
        }
      }
      break;
    }
    case "lyrics": {
      const d = await c.lyricsInfo(job.id);
      const status = d?.status;
      const batch = state.lyrics.find((b) => b.taskId === job.id);
      if (status === "SUCCESS" || (status === "CALLBACK_EXCEPTION" && d?.response?.data?.length)) {
        const items = (d.response?.data || []).filter((x) => x.text).map((x) => ({ title: x.title, text: x.text }));
        if (batch) Object.assign(batch, { status: "done", items });
        updateJob(job, { status: "done", stage: 3 });
        renderLyrics();
        refreshCredits();
        if (!job.meta.quiet) toast("Fresh lyrics are ready ✍️", `${items.length} takes on "${job.label}"`, { type: "success", actions: [{ label: "View", onClick: () => go("lyrics") }] });
      } else if (FAIL_STATES.has(status)) {
        if (batch) Object.assign(batch, { status: "failed", error: d.errorMessage || FAIL_TEXT[status] });
        updateJob(job, { status: "failed", error: d.errorMessage || FAIL_TEXT[status] });
        renderLyrics();
      }
      break;
    }
    case "wav": {
      const d = await c.wavInfo(job.id);
      const url = d?.response?.audioWavUrl;
      if (url) {
        patchTrack(job.meta.audioId, { wavUrl: url });
        finishAsset(job, "WAV master is ready 💿");
      } else if (isFailFlag(d?.successFlag)) failAsset(job, d);
      break;
    }
    case "stems": {
      const d = await c.separateInfo(job.id);
      const list = stemsFrom(d?.response);
      if (list.length && (String(d.successFlag) === "SUCCESS" || String(d.successFlag) === "CALLBACK_EXCEPTION")) {
        patchTrack(job.meta.audioId, { stems: { taskId: job.id, type: job.meta.type, stemName: job.meta.stemName, list } });
        finishAsset(job, "Stems are separated 🎚️");
      } else if (isFailFlag(d?.successFlag)) failAsset(job, d);
      break;
    }
    case "midi": {
      const d = await c.midiInfo(job.id);
      const flag = Number(d?.successFlag);
      if (flag === 1) {
        const n = d?.midiData?.instruments?.length || 0;
        patchTrack(job.meta.audioId, { midi: { taskId: job.id, instruments: n } });
        finishAsset(job, "MIDI transcription is ready 🎹");
      } else if (flag === 2 || flag === 3) failAsset(job, d);
      break;
    }
    case "video": {
      const d = await c.videoInfo(job.id);
      const url = d?.response?.videoUrl;
      if (url) {
        patchTrack(job.meta.audioId, { videoUrl: url });
        finishAsset(job, "Your music video is ready 🎬");
      } else if (isFailFlag(d?.successFlag)) failAsset(job, d);
      break;
    }
    case "cover": {
      const d = await c.coverInfo(job.id);
      const flag = d?.successFlag;
      const images = d?.response?.images || [];
      if (images.length && (Number(flag) === 1 || flag === "SUCCESS")) {
        state.tracks.filter((t) => t.taskId === job.meta.taskId).forEach((t) => (t.covers = images));
        save();
        finishAsset(job, "New cover art is ready 🖼️");
        renderLibrary();
      } else if (Number(flag) === 3) failAsset(job, d);
      break;
    }
    case "recovery": {
      const r = await c.recoverInfo(job.id);
      if (r.code === 200) {
        const rows = Array.isArray(r.data) ? r.data : [];
        let ok = 0;
        for (const row of rows) {
          if (row.status === "success" && row.audio_url) {
            ok++;
            patchTrack(row.id, { audioUrl: row.audio_url, expired: false });
          }
        }
        if (ok) finishAsset(job, `Restored ${ok} audio link${ok > 1 ? "s" : ""} 🩹`);
        else failAsset(job, { errorMessage: rows[0]?.error || "Nothing could be restored" });
      }
      break;
    }
  }
}

function isFailFlag(f) {
  return f != null && /FAIL/.test(String(f));
}
function finishAsset(job, title) {
  updateJob(job, { status: "done", stage: 3 });
  refreshCredits();
  refreshOpenTrack();
  toast(title, job.label, { type: "success", actions: job.meta.audioId ? [{ label: "Open", onClick: () => openTrack(job.meta.audioId) }] : [] });
}
function failAsset(job, d) {
  const msg = d?.errorMessage || "The task failed";
  updateJob(job, { status: "failed", error: msg });
  toast(`${KIND[job.kind]} failed`, msg, { type: "error" });
}

function stemsFrom(r) {
  if (!r) return [];
  if (Array.isArray(r.originData) && r.originData.length) {
    return r.originData.filter((x) => x.audio_url).map((x) => ({ name: x.stem_type_group_name || "Stem", url: x.audio_url, id: x.id }));
  }
  const map = { vocalUrl: "Vocals", instrumentalUrl: "Instrumental", backingVocalsUrl: "Backing vocals", drumsUrl: "Drums", bassUrl: "Bass", guitarUrl: "Guitar", keyboardUrl: "Keyboard", percussionUrl: "Percussion", stringsUrl: "Strings", synthUrl: "Synth", fxUrl: "FX", brassUrl: "Brass", woodwindsUrl: "Woodwinds" };
  return Object.entries(map).filter(([k]) => r[k]).map(([k, name]) => ({ name, url: r[k] }));
}

function onMusicDone(job) {
  refreshCredits();
  renderLibrary();
  const first = job.trackIds?.[0];
  toast(job.meta.source === "sound" ? "Your sound is ready 🔊" : "Your song is ready 🎉", job.label, {
    type: "success",
    timeout: 9000,
    actions: first ? [{ label: "▶ Play", onClick: () => playTrack(first) }, { label: "Open", onClick: () => openTrack(first) }] : [],
  });
}

function upsertTracks(items, job) {
  let added = false;
  for (const it of items) {
    let t = state.tracks.find((x) => x.id === it.id);
    const patch = {
      id: it.id,
      taskId: job.id,
      title: it.title || job.meta.title || job.label || "Untitled",
      tags: it.tags || job.meta.style || "",
      lyrics: it.prompt || "",
      imageUrl: it.image_url || it.source_image_url || "",
      audioUrl: it.audio_url || it.source_audio_url || "",
      streamUrl: it.stream_audio_url || it.source_stream_audio_url || "",
      duration: it.duration || 0,
      model: it.model_name || job.meta.model || "",
      source: job.meta.source || "song",
      op: job.meta.op || "",
    };
    if (!t) {
      t = { createdAt: Date.now(), ...patch };
      state.tracks.unshift(t);
      added = true;
    } else {
      for (const [k, v] of Object.entries(patch)) if (v) t[k] = v;
    }
  }
  save();
  if (added) $("#lib-count").textContent = state.tracks.length;
  renderLibrary();
  if (player.current) syncPlayerSource();
}

function patchTrack(id, patch) {
  const t = state.tracks.find((x) => x.id === id);
  if (t) Object.assign(t, patch);
  save();
  renderLibrary();
}

/* ---------- job UI */
function jobCard(job) {
  const card = el("div", `job ${job.status}`);
  const kind = job.meta.op || KIND[job.kind];
  let status;
  if (job.status === "running") {
    status = job.kind === "music" ? ["Warming up the band…", "Writing lyrics & arrangement…", "Streaming first take — mastering…", "Done"][job.stage || 0] : "Working on it…";
  } else if (job.status === "done") status = "Ready";
  else status = job.error || "Failed";

  card.innerHTML = `
    <div class="job-top"><span class="job-kind">${esc(kind)}</span><b title="${esc(job.label)}">${esc(job.label)}</b><span class="job-time" data-job-time="${esc(job.id)}">${ago(job.createdAt)}</span></div>
    <div class="job-status">${job.status === "running" ? '<span class="eq busy"><i></i><i></i><i></i><i></i></span>' : job.status === "done" ? "✓" : "⚠"} ${esc(status)}</div>
    ${job.kind === "music" && job.status !== "failed" ? `<div class="stages">${[1, 2, 3].map((s) => `<i class="${(job.stage || 0) >= s ? "on" : (job.stage || 0) + 1 === s && job.status === "running" ? "active" : ""}"></i>`).join("")}</div><div class="job-stage-labels"><span>Lyrics</span><span>Stream</span><span>Master</span></div>` : ""}
    <div class="job-actions"></div>`;
  const acts = $(".job-actions", card);
  const btn = (label, fn, cls = "btn btn-sm") => {
    const b = el("button", cls, label);
    b.type = "button";
    b.addEventListener("click", fn);
    acts.append(b);
  };
  const ids = (job.trackIds || []).filter((id) => state.tracks.some((t) => t.id === id));
  if (job.kind === "music" && ids.length) {
    ids.forEach((id, i) => btn(`▶ Take ${i + 1}`, () => playTrack(id)));
    btn("Open", () => openTrack(ids[0]), "btn btn-sm btn-ghost");
  }
  if (job.kind === "lyrics" && job.status === "done") btn("View lyrics", () => { closeDrawer(); go("lyrics"); });
  if (job.meta.audioId && job.status === "done" && job.kind !== "music") btn("Open track", () => openTrack(job.meta.audioId));
  if (job.status === "failed") {
    if (/Timed out/.test(job.error || "")) btn("Check again", () => updateJob(job, { status: "running", createdAt: Date.now(), fails: 0, nextAt: 0, error: "" }));
    if (job.meta.retry) btn("Try again", () => retryJob(job));
  }
  if (job.status !== "running") btn("Dismiss", () => { state.jobs = state.jobs.filter((j) => j !== job); save(); renderJobs(); }, "btn btn-sm btn-ghost");
  if (!acts.children.length) acts.remove();
  return card;
}

async function retryJob(job) {
  const { fn, body } = job.meta.retry;
  try {
    const id = await state.client[fn](body);
    state.jobs = state.jobs.filter((j) => j !== job);
    addJob({ ...job, id, status: "running", stage: 0, createdAt: Date.now(), error: "", trackIds: [], fails: 0, nextAt: Date.now() + 2500 });
    toast("Trying again…", job.label);
  } catch (err) {
    toast("Couldn't retry", err.message, { type: "error" });
  }
}

function renderJobs() {
  const running = state.jobs.filter((j) => j.status === "running").length;
  const badge = $("#jobs-badge");
  badge.hidden = !running;
  badge.textContent = running;
  $("#jobs-btn").classList.toggle("busy", running > 0);

  const list = $("#jobs-list");
  list.replaceChildren(...state.jobs.slice(0, 40).map(jobCard));
  $("#jobs-empty").hidden = state.jobs.length > 0;

  const recent = state.jobs.filter((j) => ["music"].includes(j.kind) && (j.status === "running" || Date.now() - j.updatedAt < 60 * 60 * 1000)).slice(0, 5);
  $("#cooking-list").replaceChildren(...recent.map(jobCard));
  $("#cooking-empty").hidden = recent.length > 0;
}

function openDrawer() {
  $("#jobs-drawer").hidden = false;
  $("#scrim").hidden = false;
}
function closeDrawer() {
  $("#jobs-drawer").hidden = true;
  $("#scrim").hidden = true;
}

/* =========================================================
   Generic form builder (used by dialogs & remix)
   ========================================================= */
function personaOptions() {
  return [["", "None"], ...state.personas.map((p, i) => [String(i), `${p.name}${p.personaModel === "voice_persona" ? " (voice)" : ""}`])];
}
function modelOptions(includeLegacy = true) {
  return MODELS.filter((m) => includeLegacy || !m.legacy).map((m) => [m.id, `${m.name}${m.legacy ? " (legacy)" : ""} — ${m.desc}`]);
}

function buildForm(container, fields) {
  container.innerHTML = "";
  const grid = el("div", "fb-grid");
  container.append(grid);
  const nodes = {};

  for (const f of fields) {
    const id = `fb-${f.name}-${uid()}`;
    const wide = f.full ?? ["textarea", "finetune", "note", "duration", "timeline"].includes(f.type);
    const wrap = el("div", `field${wide ? " full" : ""}`);
    const label = f.label ? `<label class="label" for="${id}">${esc(f.label)}${f.required ? "" : f.optional === false ? "" : ' <span class="opt">optional</span>'}</label>` : "";
    const help = f.help ? `<p class="hint">${f.help}</p>` : "";
    const val = f.value ?? "";
    switch (f.type) {
      case "note":
        wrap.innerHTML = `<p class="hint">${f.html}</p>`;
        break;
      case "textarea":
        wrap.innerHTML = `${label}<textarea id="${id}" class="input ${f.mono ? "mono" : ""}" rows="${f.rows || 5}" ${f.maxLength ? `maxlength="${f.maxLength}"` : ""} placeholder="${esc(f.placeholder || "")}">${esc(val)}</textarea>${help}`;
        break;
      case "select":
      case "model":
      case "persona": {
        const opts = f.type === "model" ? modelOptions() : f.type === "persona" ? personaOptions() : f.options;
        const v = f.type === "model" ? val || state.model : val;
        wrap.innerHTML = `${label}<select id="${id}" class="input">${opts.map(([o, l]) => `<option value="${esc(o)}" ${String(o) === String(v) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>${help}`;
        break;
      }
      case "toggle":
        wrap.innerHTML = `<label class="toggle"><input type="checkbox" id="${id}" ${val ? "checked" : ""} /><span class="toggle-ui"></span><span><b>${esc(f.label)}</b>${f.sub ? `<small>${esc(f.sub)}</small>` : ""}</span></label>`;
        break;
      case "seg":
        wrap.innerHTML = `<span class="label">${esc(f.label)}</span><div class="seg seg-sm" role="radiogroup">${f.options.map(([o, l]) => `<button type="button" role="radio" data-value="${esc(o)}" aria-checked="${String(o) === String(val)}">${esc(l)}</button>`).join("")}</div>`;
        $$("button", wrap).forEach((b) => b.addEventListener("click", () => {
          $$("button", wrap).forEach((x) => x.setAttribute("aria-checked", String(x === b)));
          container.dispatchEvent(new Event("input"));
        }));
        break;
      case "duration":
        wrap.innerHTML = `<label class="toggle toggle-inline"><input type="checkbox" data-dur-on /><span class="toggle-ui"></span><span><b>Set length</b><small>V6-series & V5.5 only</small></span></label><div class="slider-row"><input type="range" min="10" max="360" step="5" value="${val || 120}" disabled data-dur /><output>${fmtTime(val || 120)}</output></div>`;
        {
          const on = $("[data-dur-on]", wrap), r = $("[data-dur]", wrap), o = $("output", wrap);
          on.addEventListener("change", () => (r.disabled = !on.checked));
          r.addEventListener("input", () => (o.textContent = fmtTime(+r.value)));
        }
        break;
      case "finetune":
        wrap.innerHTML = `<label class="toggle toggle-inline"><input type="checkbox" data-ft-on /><span class="toggle-ui"></span><span><b>Fine-tune</b><small>Style adherence, weirdness, audio weight & variety</small></span></label>
          <div class="finetune" hidden>
            <div class="slider-field"><label>Style adherence</label><input type="range" min="0" max="1" step="0.01" value="0.65" data-k="styleWeight" /><output>0.65</output></div>
            <div class="slider-field"><label>Weirdness</label><input type="range" min="0" max="1" step="0.01" value="0.5" data-k="weirdnessConstraint" /><output>0.50</output></div>
            ${f.noAudioWeight ? "" : '<div class="slider-field"><label>Audio weight</label><input type="range" min="0" max="1" step="0.01" value="0.65" data-k="audioWeight" /><output>0.65</output></div>'}
            <div class="slider-field"><label>Variety</label><input type="range" min="0" max="4" step="1" value="1" data-k="variety" /><output>Normal</output></div>
          </div>`;
        {
          const on = $("[data-ft-on]", wrap);
          on.addEventListener("change", () => ($(".finetune", wrap).hidden = !on.checked));
          $$("input[type=range]", wrap).forEach((r) => r.addEventListener("input", () => (r.nextElementSibling.textContent = r.dataset.k === "variety" ? VARIETY[+r.value] : (+r.value).toFixed(2))));
        }
        break;
      case "timeline":
        wrap.innerHTML = `${label}<div class="timeline"><div class="bars">${Array.from({ length: 64 }, (_, i) => `<i style="height:${20 + Math.abs(Math.sin(i * 1.7) * 60 + Math.sin(i * 0.4) * 20)}%"></i>`).join("")}</div><div class="sel"></div></div>`;
        break;
      default:
        wrap.innerHTML = `${label}<input id="${id}" class="input" type="${f.type || "text"}" ${f.maxLength ? `maxlength="${f.maxLength}"` : ""} ${f.min != null ? `min="${f.min}"` : ""} ${f.max != null ? `max="${f.max}"` : ""} ${f.step != null ? `step="${f.step}"` : ""} placeholder="${esc(f.placeholder || "")}" value="${esc(val)}" />${help}`;
    }
    nodes[f.name] = { f, wrap };
    grid.append(wrap);
  }

  const raw = () => {
    const out = {};
    for (const [name, { f, wrap }] of Object.entries(nodes)) {
      if (["note", "timeline"].includes(f.type)) continue;
      if (f.type === "toggle") out[name] = $("input", wrap).checked;
      else if (f.type === "seg") out[name] = $("[aria-checked=true]", wrap)?.dataset.value ?? "";
      else if (f.type === "duration") out[name] = $("[data-dur-on]", wrap).checked ? +$("[data-dur]", wrap).value : "";
      else if (f.type === "finetune") {
        if ($("[data-ft-on]", wrap).checked) $$("input[type=range]", wrap).forEach((r) => (out[r.dataset.k] = +r.value));
      } else out[name] = ($("input,textarea,select", wrap).value || "").trim();
    }
    return out;
  };
  const refresh = () => {
    const v = raw();
    for (const { f, wrap } of Object.values(nodes)) if (f.showIf) wrap.hidden = !f.showIf(v);
    fields.forEach((f) => f.onChange?.(v, nodes));
  };
  container.addEventListener("input", refresh);
  container.addEventListener("change", refresh);
  refresh();

  return {
    nodes,
    raw,
    values() {
      const v = raw();
      const out = {};
      for (const [name, { f, wrap }] of Object.entries(nodes)) {
        if (wrap.hidden) continue;
        if (f.type === "finetune") {
          for (const k of ["styleWeight", "weirdnessConstraint", "audioWeight", "variety"]) if (v[k] !== undefined && !(k === "audioWeight" && f.noAudioWeight)) out[k] = v[k];
          continue;
        }
        let x = v[name];
        if (x === "" || x == null) continue;
        if (f.type === "number") x = Number(x);
        if (f.type === "persona") {
          const p = state.personas[+x];
          if (p) { out.personaId = p.personaId; out.personaModel = p.personaModel || "style_persona"; }
          continue;
        }
        if (f.type === "toggle" && f.omitFalse && !x) continue;
        out[name] = x;
      }
      return out;
    },
    validate(vals) {
      for (const { f, wrap } of Object.values(nodes)) {
        if (wrap.hidden || !f.required) continue;
        const x = f.type === "persona" ? vals.personaId : vals[f.name];
        if (x === undefined || x === "") return `${f.label} is required.`;
      }
      return null;
    },
    set(name, value) {
      const n = nodes[name];
      if (!n) return;
      const input = $("input,textarea,select", n.wrap);
      if (n.f.type === "toggle") input.checked = !!value;
      else input.value = value;
      refresh();
    },
  };
}

/* ---------- dialog */
const dlg = $("#dlg");
let dlgSubmit = null;
function openForm({ title, intro, fields, submitLabel = "Start", onSubmit, extraButtons = [] }) {
  $("#dlg-title").textContent = title;
  const body = $("#dlg-body");
  body.innerHTML = "";
  if (intro) body.append(el("p", "hint", intro));
  const holder = el("div");
  body.append(holder);
  const form = buildForm(holder, fields);
  clearError("#dlg-error");
  const foot = $("#dlg-foot");
  foot.innerHTML = "";
  for (const b of extraButtons) {
    const x = el("button", "btn btn-ghost", esc(b.label));
    x.type = "button";
    x.addEventListener("click", () => b.onClick(form));
    foot.append(x);
  }
  const cancel = el("button", "btn btn-ghost", "Cancel");
  cancel.type = "button";
  cancel.addEventListener("click", () => dlg.close());
  const submit = el("button", "btn btn-primary", `<span class="btn-label">${esc(submitLabel)}</span><span class="spinner"></span>`);
  submit.type = "submit";
  foot.append(cancel, submit);
  dlgSubmit = async () => {
    clearError("#dlg-error");
    const vals = form.values();
    const problem = form.validate(vals);
    if (problem) return showError("#dlg-error", problem);
    setLoading(submit, true);
    try {
      const keep = await onSubmit(vals, form, { body, foot });
      if (!keep) dlg.close();
    } catch (err) {
      showError("#dlg-error", err);
    } finally {
      setLoading(submit, false);
    }
  };
  if (!dlg.open) dlg.showModal();
  setTimeout(() => $("input:not([type=checkbox]):not([type=range]),textarea,select", body)?.focus(), 30);
  return form;
}
$("#dlg-form").addEventListener("submit", (e) => {
  e.preventDefault();
  dlgSubmit?.();
});
document.addEventListener("click", (e) => {
  const x = e.target.closest("[data-close]");
  if (x) x.closest("dialog")?.close();
});
$$("dialog").forEach((d) => d.addEventListener("click", (e) => { if (e.target === d) d.close(); }));

/* =========================================================
   Create tab
   ========================================================= */
const createForm = $("#create-form");
const cf = {
  idea: $("#c-idea"), title: $("#c-title"), lyrics: $("#c-lyrics"), style: $("#c-style"), instrumental: $("#c-instrumental"),
  negative: $("#c-negative"), durOn: $("#c-duration-on"), dur: $("#c-duration"), persona: $("#c-persona"), finetune: $("#c-finetune"),
};

function setSeg(group, value) {
  $$("button", group).forEach((b) => b.setAttribute("aria-checked", String(b.dataset.value === value)));
}
function segValue(group) {
  return $("[aria-checked=true]", group)?.dataset.value ?? "";
}
function bindSeg(group, onChange) {
  $$("button", group).forEach((b) => b.addEventListener("click", () => { setSeg(group, b.dataset.value); onChange?.(b.dataset.value); }));
}

function setCreateMode(mode) {
  state.createMode = mode;
  store.set("createMode", mode);
  createForm.dataset.mode = mode;
  setSeg($("#create-mode"), mode);
  updateCounters();
}

function renderModelPicker() {
  const host = $("#model-picker");
  host.innerHTML = MODELS.map((m) => `<button type="button" role="radio" class="model ${m.legacy ? "is-legacy" : ""}" data-model="${m.id}" aria-checked="${m.id === state.model}"><b>${esc(m.name)} ${m.tag ? `<span class="tag">${esc(m.tag)}</span>` : '<span class="tag legacy">Legacy</span>'}</b><small>${esc(m.desc)}</small></button>`).join("");
  if (MODELS.find((m) => m.id === state.model)?.legacy) host.classList.add("show-legacy");
  $$(".model", host).forEach((b) => b.addEventListener("click", () => setModel(b.dataset.model)));
  $$(".model-select").forEach((s) => {
    s.innerHTML = modelOptions().map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join("");
    s.value = state.model;
  });
}
function setModel(id) {
  state.model = id;
  store.set("model", id);
  $$("#model-picker .model").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.model === id)));
  updateDurationAvailability();
  updateCounters();
}
function updateDurationAvailability() {
  const ok = DURATION_MODELS.has(state.model);
  $("#duration-field").hidden = !ok;
}

function updateCounters() {
  const L = limits(state.model);
  const max = { "c-idea": L.idea, "c-lyrics": L.lyrics, "c-style": L.style, "l-prompt": 200, "s-prompt": 500 };
  $$(".counter").forEach((c) => {
    const input = document.getElementById(c.dataset.for);
    if (!input) return;
    const m = max[input.id];
    if (m) input.maxLength = m;
    const n = input.value.length;
    c.textContent = `${n.toLocaleString()} / ${m.toLocaleString()}`;
    c.classList.toggle("over", n > m);
  });
}

function renderStyleChips() {
  const host = $("#style-chips");
  host.innerHTML = [...GENRES, ...MOODS].map((g) => `<button type="button" class="chip" data-chip="${esc(g)}">${esc(g)}</button>`).join("");
  $$(".chip", host).forEach((c) => c.addEventListener("click", () => toggleStyleTag(c.dataset.chip)));
  syncStyleChips();
}
function styleParts() {
  return cf.style.value.split(",").map((s) => s.trim()).filter(Boolean);
}
function toggleStyleTag(tag) {
  const parts = styleParts();
  const i = parts.findIndex((p) => p.toLowerCase() === tag.toLowerCase());
  if (i >= 0) parts.splice(i, 1);
  else parts.push(tag.toLowerCase());
  cf.style.value = parts.join(", ");
  syncStyleChips();
  updateCounters();
}
function syncStyleChips() {
  const set = new Set(styleParts().map((p) => p.toLowerCase()));
  $$("#style-chips .chip").forEach((c) => c.classList.toggle("on", set.has(c.dataset.chip.toLowerCase())));
}

function renderPersonaSelect() {
  const cur = cf.persona.value;
  cf.persona.innerHTML = personaOptions().map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join("") + '<option value="__add">+ Add a Voice ID or Persona ID…</option>';
  cf.persona.value = state.personas[+cur] ? cur : "";
}

function addPersonaManually(after) {
  openForm({
    title: "Add a persona or voice",
    intro: "Paste a Persona ID (from Generate Persona) or a Voice ID created with Suno Voice.",
    submitLabel: "Save",
    fields: [
      { name: "name", label: "Name", required: true, placeholder: "e.g. My smoky alto" },
      { name: "personaId", label: "ID", required: true, placeholder: "persona or voice ID" },
      { name: "personaModel", label: "Type", type: "seg", value: "style_persona", options: [["style_persona", "Style persona"], ["voice_persona", "Custom voice"]] },
    ],
    onSubmit: async (v) => {
      state.personas.unshift({ name: v.name, personaId: v.personaId, personaModel: v.personaModel || "style_persona", createdAt: Date.now() });
      save();
      renderPersonaSelect();
      after?.(0);
      toast("Persona saved", v.name, { type: "success" });
    },
  });
}

function bindRange(input, fmt) {
  const out = input.nextElementSibling;
  const upd = () => (out.textContent = fmt(+input.value));
  input.addEventListener("input", upd);
  upd();
}

function refLabel(r) {
  return { image: "🖼️", video: "🎬", audio: "🎵" }[r.type];
}
function guessType(name, mime = "") {
  if (mime.startsWith("image/") || /\.(png|jpe?g|webp|bmp|gif)(\?|$)/i.test(name)) return "image";
  if (mime.startsWith("video/") || /\.(mp4|mov|webm)(\?|$)/i.test(name)) return "video";
  return "audio";
}
function renderRefs() {
  const host = $("#refs");
  host.innerHTML = "";
  state.refs.forEach((r, i) => {
    const d = el("div", "ref", `<button type="button" title="Change type" data-cycle>${refLabel(r)}</button><span title="${esc(r.url)}">${esc(r.name || r.url)}</span><button type="button" aria-label="Remove" data-rm>×</button>`);
    $("[data-rm]", d).addEventListener("click", () => { state.refs.splice(i, 1); renderRefs(); });
    $("[data-cycle]", d).addEventListener("click", () => {
      const order = ["image", "video", "audio"];
      r.type = order[(order.indexOf(r.type) + 1) % 3];
      renderRefs();
    });
    host.append(d);
  });
}
function addRef(url, name, mime) {
  const type = guessType(name || url, mime);
  const counts = { image: 0, video: 0, audio: 0 };
  state.refs.forEach((r) => counts[r.type]++);
  if (type === "image" && counts.image >= 5) return toast("Up to 5 images", "Remove one to add another.", { type: "error" });
  if (type === "video" && counts.video >= 1) return toast("Only 1 video", "Remove the current video first.", { type: "error" });
  state.refs.push({ url, name, type });
  renderRefs();
}

async function uploadWithToast(file) {
  const t = el("div", "toast", `<div class="t-body"><b>Uploading ${esc(file.name)}</b><span>0%</span></div>`);
  $("#toasts").prepend(t);
  try {
    const url = await state.client.upload(file, (p) => ($("span", t).textContent = `${Math.round(p * 100)}%`));
    return url;
  } finally {
    t.remove();
  }
}

function initCreate() {
  createForm.dataset.mode = state.createMode;
  bindSeg($("#create-mode"), setCreateMode);
  setCreateMode(state.createMode);
  renderModelPicker();
  updateDurationAvailability();
  renderStyleChips();
  renderPersonaSelect();

  $("#legacy-toggle").addEventListener("click", (e) => {
    const on = $("#model-picker").classList.toggle("show-legacy");
    e.currentTarget.textContent = on ? "Hide legacy models" : "Show legacy models";
    e.currentTarget.setAttribute("aria-expanded", String(on));
  });

  cf.style.addEventListener("input", () => { syncStyleChips(); });
  createForm.addEventListener("input", updateCounters);
  cf.instrumental.addEventListener("change", () => createForm.classList.toggle("instrumental-on", cf.instrumental.checked));

  cf.durOn.addEventListener("change", () => (cf.dur.disabled = !cf.durOn.checked));
  bindRange(cf.dur, fmtTime);
  cf.finetune.addEventListener("change", () => ($("#finetune").hidden = !cf.finetune.checked));
  bindRange($("#c-styleWeight"), (v) => v.toFixed(2));
  bindRange($("#c-weirdness"), (v) => v.toFixed(2));
  bindRange($("#c-audioWeight"), (v) => v.toFixed(2));
  bindRange($("#c-variety"), (v) => VARIETY[v]);

  cf.persona.addEventListener("change", () => {
    if (cf.persona.value === "__add") {
      cf.persona.value = "";
      addPersonaManually((i) => (cf.persona.value = String(i)));
    }
  });

  $("#surprise-btn").addEventListener("click", () => {
    const [idea, style] = pick(IDEAS);
    cf.idea.value = idea;
    cf.style.value = style;
    syncStyleChips();
    updateCounters();
    cf.idea.focus();
  });

  $$("[data-insert-tag]").forEach((b) => b.addEventListener("click", () => {
    const ta = cf.lyrics;
    const tag = b.textContent;
    const pre = ta.value.slice(0, ta.selectionStart);
    const ins = `${pre && !pre.endsWith("\n") ? "\n\n" : ""}${tag}\n`;
    ta.setRangeText(ins, ta.selectionStart, ta.selectionEnd, "end");
    ta.focus();
    updateCounters();
  }));

  $("#boost-btn").addEventListener("click", boostStyle);
  $("#write-lyrics-btn").addEventListener("click", openLyricsAssist);

  // Reference media
  $("#ref-add-url").addEventListener("click", () => {
    const u = $("#ref-url").value.trim();
    if (!safeUrl(u)) return toast("Enter a public http(s) URL", "", { type: "error" });
    addRef(u, u.split("/").pop().split("?")[0]);
    $("#ref-url").value = "";
  });
  $("#ref-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      const url = await uploadWithToast(file);
      addRef(url, file.name, file.type);
    } catch (err) {
      toast("Upload failed", err.message, { type: "error" });
    }
  });

  createForm.addEventListener("submit", submitCreate);
  updateCounters();
}

async function boostStyle() {
  const btn = $("#boost-btn");
  const content = cf.style.value.trim() || cf.idea.value.trim().slice(0, 200);
  if (!content) {
    toast("Add a style first", "Type a few words like “dreamy synth pop” or tap a chip, then boost it.");
    cf.style.focus();
    return;
  }
  btn.classList.add("is-loading");
  btn.textContent = "🚀 Boosting…";
  try {
    const d = await state.client.boostStyle(content);
    const result = d?.result;
    if (result) {
      cf.style.value = result.slice(0, limits(state.model).style);
      syncStyleChips();
      updateCounters();
      toast("Style boosted 🚀", "We expanded your style into a richer description.", { type: "success" });
      refreshCredits();
    } else toast("No boost this time", "Try a slightly longer description.");
  } catch (err) {
    toast("Couldn't boost style", err.message, { type: "error" });
  } finally {
    btn.classList.remove("is-loading");
    btn.textContent = "🚀 Boost style";
  }
}

async function submitCreate(e) {
  e.preventDefault();
  clearError("#create-error");
  const btn = $("#create-submit");
  const custom = state.createMode === "custom";
  const instrumental = cf.instrumental.checked;
  const style = cf.style.value.trim();
  const body = { customMode: custom, instrumental, model: state.model };
  const L = limits(state.model);
  if (style.length > L.style) return showError("#create-error", `Style is too long for ${modelName(state.model)} (max ${L.style}).`);
  if (style) body.style = style;

  let label;
  if (!custom) {
    const idea = cf.idea.value.trim();
    if (idea) body.prompt = idea;
    const urls = (t) => state.refs.filter((r) => r.type === t).map((r) => r.url);
    if (urls("image").length) body.imageUrls = urls("image");
    if (urls("video").length) body.videoUrls = urls("video");
    if (urls("audio").length) body.audioUrls = urls("audio");
    if (!idea && !style && !state.refs.length) return showError("#create-error", "Describe your song, pick a style, or add reference media to get started.");
    if (state.refs.length + (style ? 1 : 0) > 10) return showError("#create-error", "Too many attachments — style plus reference media can't exceed 10.");
    label = idea ? idea.slice(0, 60) : style.slice(0, 60) || "New song";
  } else {
    const title = cf.title.value.trim();
    const lyrics = cf.lyrics.value.trim();
    const negative = cf.negative.value.trim();
    if (title) body.title = title;
    if (!instrumental && lyrics) body.lyrics = lyrics;
    if (negative) body.negativeTags = negative;
    if (!instrumental && !lyrics) return showError("#create-error", "Add some lyrics (or tap “Write with AI”), or switch on Instrumental.");
    if (!style && !lyrics && !negative) return showError("#create-error", "Add a style, lyrics or styles to avoid.");
    if (lyrics.length > L.lyrics) return showError("#create-error", `Lyrics are too long for ${modelName(state.model)} (max ${L.lyrics}).`);
    const vg = segValue($("#c-vocal"));
    if (vg && !instrumental) body.vocalGender = vg;
    if (cf.durOn.checked && DURATION_MODELS.has(state.model)) body.duration = +cf.dur.value;
    const p = state.personas[+cf.persona.value];
    if (cf.persona.value !== "" && p) {
      body.personaId = p.personaId;
      body.personaModel = p.personaModel || "style_persona";
    }
    if (cf.finetune.checked) {
      body.styleWeight = +$("#c-styleWeight").value;
      body.weirdnessConstraint = +$("#c-weirdness").value;
      if (!instrumental) body.audioWeight = +$("#c-audioWeight").value;
      body.variety = +$("#c-variety").value;
    }
    label = title || style.slice(0, 50) || lyrics.split("\n").find((l) => l && !l.startsWith("["))?.slice(0, 50) || "New song";
  }

  setLoading(btn, true);
  try {
    const id = await state.client.generate(body);
    addJob({ id, kind: "music", label, meta: { source: "song", model: state.model, style, title: body.title, retry: { fn: "generate", body } } });
    toast("Composing your song 🎶", "Two takes are on the way. You can keep creating meanwhile.");
    if (window.innerWidth < 1080) $("#now-cooking").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    showError("#create-error", err);
  } finally {
    setLoading(btn, false);
  }
}

/* =========================================================
   Lyrics
   ========================================================= */
async function startLyrics(prompt, { quiet = false } = {}) {
  const id = await state.client.lyrics(prompt);
  state.lyrics.unshift({ taskId: id, prompt, status: "pending", items: [], createdAt: Date.now() });
  addJob({ id, kind: "lyrics", label: prompt.slice(0, 60), meta: { quiet } });
  renderLyrics();
  return id;
}

function lyricCard(item, batch) {
  const c = el("article", "lyric-card");
  c.innerHTML = `<h4>${esc(item.title || "Untitled")}</h4><pre>${esc(item.text)}</pre><div class="actions"></div>`;
  const acts = $(".actions", c);
  const use = el("button", "btn btn-primary btn-sm", "🎵 Use in a song");
  use.addEventListener("click", () => useLyrics(item));
  const copy = el("button", "btn btn-sm", "Copy");
  copy.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(item.text); toast("Copied to clipboard"); } catch { toast("Couldn't copy", "", { type: "error" }); }
  });
  acts.append(use, copy);
  return c;
}

function useLyrics(item) {
  setCreateMode("custom");
  cf.lyrics.value = item.text;
  if (!cf.title.value && item.title) cf.title.value = item.title;
  cf.instrumental.checked = false;
  createForm.classList.remove("instrumental-on");
  updateCounters();
  if (dlg.open) dlg.close();
  go("create");
  setTimeout(() => cf.lyrics.focus(), 60);
  toast("Lyrics loaded ✍️", "Pick a style and model, then hit Create.");
}

function renderLyrics() {
  const host = $("#lyrics-results");
  if (!host) return;
  host.innerHTML = "";
  for (const b of state.lyrics) {
    const head = el("div", "lyric-batch-head", `<b>“${esc(b.prompt)}”</b><span>· ${new Date(b.createdAt).toLocaleString()}</span>`);
    const rm = el("button", "link-btn", "Remove");
    rm.addEventListener("click", () => { state.lyrics = state.lyrics.filter((x) => x !== b); save(); renderLyrics(); });
    head.append(rm);
    host.append(head);
    if (b.status === "pending") host.append(el("div", "lyric-pending", `<span class="eq busy"><i></i><i></i><i></i><i></i><i></i></span> Writing a few takes… usually under a minute.`));
    else if (b.status === "failed") host.append(el("div", "lyric-pending", `⚠ ${esc(b.error || "Lyrics generation failed")}`));
    else b.items.forEach((it) => host.append(lyricCard(it, b)));
  }
}

function initLyrics() {
  const chips = $("#lyric-chips");
  chips.innerHTML = LYRIC_THEMES.map((t) => `<button type="button" class="chip">${esc(t)}</button>`).join("");
  $$(".chip", chips).forEach((c) => c.addEventListener("click", () => {
    const p = $("#l-prompt");
    p.value = p.value ? `${p.value.replace(/[\s,.]+$/, "")}, ${c.textContent.toLowerCase()}` : c.textContent;
    updateCounters();
  }));
  $("#lyrics-form").addEventListener("input", updateCounters);
  $("#lyrics-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError("#lyrics-error");
    const prompt = $("#l-prompt").value.trim();
    if (!prompt) return showError("#lyrics-error", "Tell us what the song is about.");
    const btn = $("#lyrics-submit");
    setLoading(btn, true);
    try {
      await startLyrics(prompt);
    } catch (err) {
      showError("#lyrics-error", err);
    } finally {
      setLoading(btn, false);
    }
  });
}

function openLyricsAssist() {
  const seed = [cf.title.value, cf.style.value].filter(Boolean).join(" — ").slice(0, 200);
  let unsub = null;
  openForm({
    title: "✍️ Write lyrics with AI",
    intro: "Describe the story or feeling. We'll write a couple of takes and you pick one.",
    submitLabel: "Write lyrics",
    fields: [{ name: "prompt", label: "What's it about?", type: "textarea", rows: 3, maxLength: 200, required: true, value: seed, placeholder: "A bittersweet goodbye to a summer romance" }],
    onSubmit: async ({ prompt }, _form, { body, foot }) => {
      const id = await startLyrics(prompt, { quiet: true });
      body.innerHTML = `<div class="lyric-pending"><span class="eq busy"><i></i><i></i><i></i><i></i><i></i></span> Writing takes on “${esc(prompt)}”…</div>`;
      foot.innerHTML = "";
      const close = el("button", "btn btn-ghost", "Keep working — I'll check Lyrics later");
      close.type = "button";
      close.addEventListener("click", () => dlg.close());
      foot.append(close);
      unsub?.();
      unsub = on("job", (job) => {
        if (job.id !== id || !dlg.open) return;
        const batch = state.lyrics.find((b) => b.taskId === id);
        if (job.status === "done" && batch) {
          body.innerHTML = "";
          const grid = el("div", "lyrics-results");
          grid.style.marginTop = "0";
          batch.items.forEach((it) => grid.append(lyricCard(it, batch)));
          body.append(grid);
          unsub();
        } else if (job.status === "failed") {
          body.innerHTML = `<div class="form-error">${esc(job.error || "Lyrics generation failed")}</div>`;
          unsub();
        }
      });
      return true; // keep dialog open
    },
  });
  dlg.addEventListener("close", () => unsub?.(), { once: true });
}

/* =========================================================
   Remix tab
   ========================================================= */
const REMIX = {
  cover: {
    emoji: "🎨", name: "Restyle", desc: "Cover a song in a new style, keep the melody", sources: 1, fn: "uploadCover", op: "Cover",
    fields: () => [
      { name: "model", label: "Model", type: "model", required: true },
      { name: "title", label: "Title", maxLength: 80, placeholder: "My jazz version" },
      { name: "style", label: "New style", full: true, placeholder: "e.g. smoky jazz club, upright bass, brushed drums" },
      { name: "instrumental", type: "toggle", label: "Instrumental", sub: "Drop the vocals" },
      { name: "vocalGender", label: "Voice", type: "seg", value: "", options: [["", "Any"], ["f", "Female"], ["m", "Male"]], showIf: (v) => !v.instrumental },
      { name: "lyrics", label: "New lyrics", type: "textarea", mono: true, rows: 6, maxLength: 5000, showIf: (v) => !v.instrumental, placeholder: "Leave empty to keep it close to the original" },
      { name: "negativeTags", label: "Avoid", placeholder: "e.g. autotune, distortion" },
      { name: "persona", label: "Persona", type: "persona" },
      { name: "duration", type: "duration" },
      { name: "ft", type: "finetune" },
    ],
  },
  extend: {
    emoji: "➕", name: "Extend", desc: "Continue your upload seamlessly", sources: 1, fn: "uploadExtend", op: "Extend",
    fields: () => [
      { name: "model", label: "Model", type: "model", required: true },
      { name: "continueAt", label: "Continue from (seconds)", type: "number", min: 1, step: 0.1, placeholder: "e.g. 45", help: "Leave empty to continue from the end." },
      { name: "title", label: "Title", maxLength: 100 },
      { name: "style", label: "Style", placeholder: "Keep it close to the original style" },
      { name: "instrumental", type: "toggle", label: "Instrumental", sub: "No vocals in the extension" },
      { name: "vocalGender", label: "Voice", type: "seg", value: "", options: [["", "Any"], ["f", "Female"], ["m", "Male"]], showIf: (v) => !v.instrumental },
      { name: "lyrics", label: "Lyrics for the new part", type: "textarea", mono: true, rows: 6, maxLength: 5000, showIf: (v) => !v.instrumental },
      { name: "negativeTags", label: "Avoid" },
      { name: "persona", label: "Persona", type: "persona" },
      { name: "ft", type: "finetune" },
    ],
  },
  vocals: {
    emoji: "🎤", name: "Add vocals", desc: "Put a singer on your instrumental", sources: 1, fn: "addVocals", op: "Vocals",
    fields: () => [
      { name: "title", label: "Title", required: true, placeholder: "Song title" },
      { name: "style", label: "Vocal & music style", required: true, placeholder: "e.g. soulful R&B, breathy female vocal" },
      { name: "lyrics", label: "Lyrics", type: "textarea", mono: true, rows: 7, maxLength: 5000, placeholder: "[Verse]\n…" },
      { name: "negativeTags", label: "Avoid", required: true, value: "harsh vocals, distortion" },
      { name: "vocalGender", label: "Voice", type: "seg", value: "", options: [["", "Any"], ["f", "Female"], ["m", "Male"]] },
      { name: "model", label: "Model", type: "model" },
      { name: "ft", type: "finetune" },
    ],
  },
  instrumental: {
    emoji: "🎸", name: "Add a band", desc: "Build backing music under your vocals", sources: 1, fn: "addInstrumental", op: "Backing",
    fields: () => [
      { name: "title", label: "Title", required: true, placeholder: "Song title" },
      { name: "tags", label: "Band & style", required: true, placeholder: "e.g. acoustic folk, fingerpicked guitar, soft cello" },
      { name: "negativeTags", label: "Avoid", required: true, value: "heavy metal, aggressive drums" },
      { name: "vocalGender", label: "Voice hint", type: "seg", value: "", options: [["", "Any"], ["f", "Female"], ["m", "Male"]] },
      { name: "model", label: "Model", type: "model" },
      { name: "ft", type: "finetune" },
    ],
  },
  mashup: {
    emoji: "🔀", name: "Mashup", desc: "Blend two songs into something new", sources: 2, fn: "mashup", op: "Mashup",
    fields: () => [
      { name: "model", label: "Model", type: "model", required: true },
      { name: "title", label: "Title", maxLength: 80 },
      { name: "style", label: "Style", full: true, placeholder: "e.g. club edit, four-on-the-floor, euphoric" },
      { name: "lyrics", label: "Lyrics", type: "textarea", mono: true, rows: 5, maxLength: 5000 },
      { name: "vocalGender", label: "Voice", type: "seg", value: "", options: [["", "Any"], ["f", "Female"], ["m", "Male"]] },
      { name: "persona", label: "Persona", type: "persona" },
      { name: "duration", type: "duration" },
      { name: "ft", type: "finetune" },
    ],
  },
};
let remixMode = "cover";
let remixForm = null;
const remixSources = [];

function sourceWidget(i, count) {
  const w = el("div", "source");
  w.innerHTML = `
    <div class="source-head"><b>${count > 1 ? `Song ${i + 1}` : "Source audio"}</b><span class="hint">MP3/WAV · up to 8 min · drag & drop</span></div>
    <div class="source-row">
      <input class="input" placeholder="Paste a public audio URL…" data-url />
      <label class="btn"><input type="file" accept="audio/*" hidden data-file />Upload</label>
      <select class="input" data-lib style="max-width:220px"><option value="">From your library…</option></select>
    </div>
    <div class="source-status" data-status></div>`;
  const status = $("[data-status]", w);
  const set = (url, label) => {
    remixSources[i] = url;
    status.className = "source-status" + (url ? " ok" : "");
    status.innerHTML = url ? `✓ ${esc(label || "Ready")}` : "";
    const old = $("audio", w);
    old?.remove();
    if (url) {
      const a = el("audio");
      a.controls = true;
      a.preload = "none";
      a.src = url;
      w.append(a);
    }
  };
  const doUpload = async (file) => {
    if (!file) return;
    status.className = "source-status";
    status.innerHTML = `<span class="spinner"></span> Uploading ${esc(file.name)}… <b data-pct>0%</b>`;
    try {
      const url = await state.client.upload(file, (p) => { const n = $("[data-pct]", status); if (n) n.textContent = `${Math.round(p * 100)}%`; });
      $("[data-url]", w).value = url;
      set(url, `${file.name} uploaded (kept for 3 days)`);
    } catch (err) {
      status.innerHTML = `⚠ ${esc(err.message)}`;
    }
  };
  $("[data-url]", w).addEventListener("change", (e) => {
    const u = e.target.value.trim();
    if (u && !safeUrl(u)) { status.textContent = "⚠ URL must start with http(s)://"; return; }
    set(u, "Using URL");
  });
  $("[data-file]", w).addEventListener("change", (e) => { doUpload(e.target.files[0]); e.target.value = ""; });
  $("[data-lib]", w).addEventListener("change", (e) => {
    const t = state.tracks.find((x) => x.id === e.target.value);
    if (t) { $("[data-url]", w).value = t.audioUrl; set(t.audioUrl, `“${t.title}” from your library`); }
  });
  w.addEventListener("dragover", (e) => { e.preventDefault(); w.classList.add("drag"); });
  w.addEventListener("dragleave", () => w.classList.remove("drag"));
  w.addEventListener("drop", (e) => { e.preventDefault(); w.classList.remove("drag"); doUpload(e.dataTransfer.files[0]); });
  if (remixSources[i]) {
    $("[data-url]", w).value = remixSources[i];
    set(remixSources[i], "Ready");
  }
  return w;
}

function refreshLibraryPickers() {
  const opts = '<option value="">From your library…</option>' + state.tracks.filter((t) => t.audioUrl).map((t) => `<option value="${esc(t.id)}">${esc(t.title)}</option>`).join("");
  $$("#remix-sources [data-lib]").forEach((s) => (s.innerHTML = opts));
}

function setRemixMode(mode) {
  remixMode = mode;
  const m = REMIX[mode];
  $$("#remix-modes .remix-mode").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.mode === mode)));
  remixSources.length = Math.min(remixSources.length, m.sources);
  const src = $("#remix-sources");
  src.innerHTML = "";
  for (let i = 0; i < m.sources; i++) src.append(sourceWidget(i, m.sources));
  refreshLibraryPickers();
  remixForm = buildForm($("#remix-fields"), m.fields());
  $("#remix-submit .btn-label").textContent = `${m.emoji} ${m.name}`;
  clearError("#remix-error");
}

function initRemix() {
  const host = $("#remix-modes");
  host.innerHTML = Object.entries(REMIX).map(([k, m]) => `<button type="button" role="radio" class="remix-mode" data-mode="${k}" aria-checked="false"><span class="emoji">${m.emoji}</span><b>${esc(m.name)}</b><small>${esc(m.desc)}</small></button>`).join("");
  $$(".remix-mode", host).forEach((b) => b.addEventListener("click", () => setRemixMode(b.dataset.mode)));
  setRemixMode("cover");

  $("#remix-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError("#remix-error");
    const m = REMIX[remixMode];
    const urls = remixSources.slice(0, m.sources).filter(Boolean);
    if (urls.length < m.sources) return showError("#remix-error", m.sources > 1 ? "Add both songs to mash up." : "Add the source audio first — upload, paste a URL or pick from your library.");
    const vals = remixForm.values();
    const problem = remixForm.validate(vals);
    if (problem) return showError("#remix-error", problem);
    if (vals.instrumental === false) delete vals.instrumental;
    if (vals.instrumental) { delete vals.lyrics; delete vals.vocalGender; delete vals.audioWeight; }
    if (vals.duration && !DURATION_MODELS.has(vals.model || "V6")) delete vals.duration;
    const body = m.sources > 1 ? { ...vals, uploadUrlList: urls } : { ...vals, uploadUrl: urls[0] };
    if (["cover", "extend", "mashup"].includes(remixMode) && !body.model) body.model = state.model;
    if (remixMode === "cover" && body.instrumental === undefined) body.instrumental = false;

    const btn = $("#remix-submit");
    setLoading(btn, true);
    try {
      const id = await state.client[m.fn](body);
      const label = body.title || `${m.name}: ${body.style || body.tags || "untitled"}`.slice(0, 60);
      addJob({ id, kind: "music", label, meta: { source: "remix", op: m.op, model: body.model, title: body.title, style: body.style || body.tags, retry: { fn: m.fn, body } } });
      toast(`${m.emoji} ${m.name} started`, "Track it in the Activity panel.", { actions: [{ label: "Activity", onClick: openDrawer }] });
    } catch (err) {
      showError("#remix-error", err);
    } finally {
      setLoading(btn, false);
    }
  });
}

/* =========================================================
   Sounds tab
   ========================================================= */
function initSounds() {
  $("#s-key").innerHTML = KEYS.map((k) => `<option>${k}</option>`).join("");
  const chips = $("#sound-chips");
  chips.innerHTML = SOUND_IDEAS.map((t) => `<button type="button" class="chip">${esc(t)}</button>`).join("");
  $$(".chip", chips).forEach((c) => c.addEventListener("click", () => { $("#s-prompt").value = c.textContent; updateCounters(); }));
  const bpmOn = $("#s-bpm-on"), bpm = $("#s-bpm"), out = $("#s-bpm-out");
  const upd = () => (out.textContent = bpmOn.checked ? `${bpm.value} BPM` : "Auto");
  bpmOn.addEventListener("change", () => { bpm.disabled = !bpmOn.checked; upd(); });
  bpm.addEventListener("input", upd);
  $("#sounds-form").addEventListener("input", updateCounters);
  $("#sounds-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError("#sounds-error");
    const prompt = $("#s-prompt").value.trim();
    if (!prompt) return showError("#sounds-error", "Describe the sound you want.");
    const body = { prompt, model: $("#s-model").value || "V6", soundLoop: $("#s-loop").checked, soundKey: $("#s-key").value };
    if (bpmOn.checked) body.soundTempo = +bpm.value;
    if ($("#s-grab").checked) body.grabLyrics = true;
    const btn = $("#sounds-submit");
    setLoading(btn, true);
    try {
      const id = await state.client.sounds(body);
      addJob({ id, kind: "music", label: prompt.slice(0, 60), meta: { source: "sound", op: "Sound", model: body.model, style: [body.soundLoop && "loop", body.soundTempo && `${body.soundTempo} bpm`, body.soundKey !== "Any" && body.soundKey].filter(Boolean).join(" · "), retry: { fn: "sounds", body } } });
      toast("🔊 Sound in the works", "It'll land in your Library.", { actions: [{ label: "Activity", onClick: openDrawer }] });
    } catch (err) {
      showError("#sounds-error", err);
    } finally {
      setLoading(btn, false);
    }
  });
}

/* =========================================================
   Library
   ========================================================= */
function filteredTracks() {
  const q = ($("#lib-search")?.value || "").toLowerCase().trim();
  const f = $("#lib-filter")?.value || "all";
  return state.tracks.filter((t) => {
    if (f === "fav" && !state.favs.has(t.id)) return false;
    if (["song", "sound", "remix"].includes(f) && (t.source || "song") !== f) return false;
    if (!q) return true;
    return [t.title, t.tags, t.lyrics, t.op].some((x) => (x || "").toLowerCase().includes(q));
  });
}

function trackCard(t) {
  const card = el("article", "track");
  card.dataset.id = t.id;
  if (player.current?.id === t.id) card.classList.add("is-playing");
  const img = safeUrl(t.imageUrl);
  const assets = [t.wavUrl && "WAV", t.stems && "STEMS", t.midi && "MIDI", t.videoUrl && "VIDEO"].filter(Boolean);
  const isPlaying = player.current?.id === t.id && !audio.paused;
  card.innerHTML = `
    <div class="track-art" data-open>
      ${img ? `<img src="${esc(img)}" alt="" loading="lazy" />` : `<div class="fallback">${esc((t.title || "?").slice(0, 1).toUpperCase())}</div>`}
      <div class="track-badges">${t.op ? `<span class="tbadge">${esc(t.op)}</span>` : ""}${!t.audioUrl && t.streamUrl ? '<span class="tbadge streaming">Streaming</span>' : ""}${t.expired ? '<span class="tbadge">Expired</span>' : ""}</div>
      <button class="track-play" data-play aria-label="${isPlaying ? "Pause" : "Play"} ${esc(t.title)}">${isPlaying ? ICON.pause : ICON.play}</button>
    </div>
    <div class="track-body">
      <div class="track-title"><b title="${esc(t.title)}">${esc(t.title)}</b><button class="fav ${state.favs.has(t.id) ? "on" : ""}" data-fav aria-label="Favourite">${state.favs.has(t.id) ? "★" : "☆"}</button></div>
      <div class="track-tags">${esc(t.tags || "—")}</div>
      <div class="track-foot"><span class="meta">${fmtTime(t.duration)} · ${esc(modelName(t.model) || t.model || "")}</span><span class="assets">${assets.map((a) => `<span>${a}</span>`).join("")}</span></div>
    </div>`;
  $("img", card)?.addEventListener("error", (e) => e.target.remove());
  $("[data-play]", card).addEventListener("click", (e) => {
    e.stopPropagation();
    if (player.current?.id === t.id) togglePlay();
    else playTrack(t.id, filteredTracks());
  });
  $("[data-open]", card).addEventListener("click", () => openTrack(t.id));
  $(".track-title b", card).addEventListener("click", () => openTrack(t.id));
  $("[data-fav]", card).addEventListener("click", () => toggleFav(t.id));
  return card;
}

let libRenderQueued = false;
function renderLibrary() {
  $("#lib-count").textContent = state.tracks.length;
  if ($("#view-library").hidden) return;
  if (libRenderQueued) return;
  libRenderQueued = true;
  requestAnimationFrame(() => {
    libRenderQueued = false;
    const list = filteredTracks();
    $("#lib-grid").replaceChildren(...list.map(trackCard));
    $("#lib-empty").hidden = state.tracks.length > 0;
    if (state.tracks.length && !list.length) $("#lib-grid").innerHTML = '<p class="muted">No tracks match that search.</p>';
  });
}

function toggleFav(id) {
  if (state.favs.has(id)) state.favs.delete(id);
  else state.favs.add(id);
  save();
  renderLibrary();
  refreshOpenTrack();
}

function initLibrary() {
  $("#lib-search").addEventListener("input", renderLibrary);
  $("#lib-filter").addEventListener("change", renderLibrary);
  $("#lib-count").textContent = state.tracks.length;
}

/* =========================================================
   Track detail dialog & tools
   ========================================================= */
const trackDlg = $("#track-dlg");
let openTrackId = null;
trackDlg.addEventListener("close", () => (openTrackId = null));
function refreshOpenTrack() { if (openTrackId && trackDlg.open) renderTrackDialog(openTrackId); }
function openTrack(id) {
  const t = state.tracks.find((x) => x.id === id);
  if (!t) return toast("Track not found", "It may have been removed.");
  openTrackId = id;
  renderTrackDialog(id);
  if (!trackDlg.open) trackDlg.showModal();
}

function renderTrackDialog(id) {
  const t = state.tracks.find((x) => x.id === id);
  if (!t) return trackDlg.close();
  const host = $("#track-body");
  const img = safeUrl(t.imageUrl);
  const fav = state.favs.has(t.id);
  host.innerHTML = `
    <button type="button" class="icon-btn td-close" data-close aria-label="Close">${ICON.close}</button>
    <div class="td-hero">
      <div class="td-art">${img ? `<img src="${esc(img)}" alt="" />` : ""}</div>
      <div class="td-info">
        <h3>${esc(t.title)}</h3>
        <p class="td-tags">${esc(t.tags || "")}</p>
        <div class="td-meta">
          ${t.duration ? `<span>⏱ ${fmtTime(t.duration)}</span>` : ""}
          ${t.model ? `<span>🧠 ${esc(modelName(t.model))}</span>` : ""}
          ${t.op ? `<span>🔁 ${esc(t.op)}</span>` : ""}
          <span>📅 ${new Date(t.createdAt).toLocaleDateString()}</span>
          <span title="Files are kept by Suno for 14 days">⏳ ${Math.max(0, 14 - Math.floor((Date.now() - t.createdAt) / 86400000))}d left</span>
        </div>
        <div class="td-primary">
          <button class="btn btn-primary" data-act="play">▶ Play</button>
          <button class="btn" data-act="mp3">${ICON.dl} MP3</button>
          <button class="btn" data-act="karaoke">🎤 Sing along</button>
          <button class="btn" data-act="fav">${fav ? "★ Favourited" : "☆ Favourite"}</button>
        </div>
      </div>
    </div>
    <div class="td-sections">
      <section class="td-section"><h4>Keep creating</h4><div class="tools">
        ${tool("extend", "➕", "Extend", "Continue from any moment")}
        ${tool("replace", "🔁", "Replace section", "Rewrite 10s+ of the song")}
        ${tool("restyle", "🎨", "Restyle", "Cover it in a new genre")}
        ${tool("persona", "👤", "Save as persona", "Reuse this voice & vibe")}
        ${tool("cover", "🖼️", "New cover art", "Generate artwork")}
      </div></section>
      <section class="td-section"><h4>Studio tools</h4><div class="tools">
        ${tool("stems", "🎚️", "Split stems", "Vocals, drums, bass…")}
        ${tool("wav", "💿", "WAV master", "Lossless download")}
        ${tool("video", "🎬", "Music video", "MP4 with visuals")}
        ${tool("midi", "🎹", "MIDI", t.stems ? "Transcribe the stems" : "Split stems first")}
        ${tool("recover", "🩹", "Restore links", "If playback stopped working")}
      </div></section>
      <section class="td-section" data-assets hidden><h4>Downloads</h4><div class="asset-list" data-asset-list></div></section>
      ${t.covers?.length ? `<section class="td-section"><h4>Cover art</h4><div class="cover-grid">${t.covers.filter(safeUrl).map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" alt="Cover option" /></a>`).join("")}</div></section>` : ""}
      ${t.videoUrl && safeUrl(t.videoUrl) ? `<section class="td-section video-wrap"><h4>Music video</h4><video src="${esc(t.videoUrl)}" controls preload="none" poster="${esc(img)}"></video></section>` : ""}
      ${t.lyrics ? `<section class="td-section"><h4>Lyrics</h4><pre class="lyrics-view">${esc(t.lyrics)}</pre></section>` : ""}
      <section class="td-section"><h4>Details</h4>
        <div class="settings-row"><div><b>Task ID</b><small class="mono">${esc(t.taskId)}</small></div><button class="btn btn-sm" data-copy="${esc(t.taskId)}">Copy</button></div>
        <div class="settings-row"><div><b>Audio ID</b><small class="mono">${esc(t.id)}</small></div><button class="btn btn-sm" data-copy="${esc(t.id)}">Copy</button></div>
        <div class="settings-row"><div><b>Remove from library</b><small>Only removes it from this device.</small></div><button class="btn btn-sm btn-danger" data-act="delete">Remove</button></div>
      </section>
    </div>`;

  // Assets
  const list = $("[data-asset-list]", host);
  const addAsset = (label, url, filename, playable = true) => {
    if (!safeUrl(url)) return;
    const row = el("div", "asset", `<b>${esc(label)}</b>${playable ? `<audio controls preload="none" src="${esc(url)}"></audio>` : ""}<div class="actions"></div>`);
    const b = el("button", "btn btn-sm", `${ICON.dl} Download`);
    b.addEventListener("click", () => download(url, filename));
    $(".actions", row).append(b);
    list.append(row);
  };
  const base = slug(t.title);
  if (t.wavUrl) addAsset("WAV master", t.wavUrl, `${base}.wav`);
  (t.stems?.list || []).forEach((s) => addAsset(`Stem · ${s.name}`, s.url, `${base}-${slug(s.name)}.mp3`));
  if (t.videoUrl) addAsset("Music video (MP4)", t.videoUrl, `${base}.mp4`, false);
  if (t.midi) {
    const row = el("div", "asset", `<b>MIDI · ${t.midi.instruments || ""} instrument${t.midi.instruments === 1 ? "" : "s"}</b><div class="actions"></div>`);
    const b = el("button", "btn btn-sm", `${ICON.dl} .mid file`);
    b.addEventListener("click", () => downloadMidi(t));
    $(".actions", row).append(b);
    list.append(row);
  }
  $("[data-assets]", host).hidden = !list.children.length;

  $$("[data-copy]", host).forEach((b) => b.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(b.dataset.copy); toast("Copied"); } catch {}
  }));
  $$("[data-act]", host).forEach((b) => b.addEventListener("click", () => trackAction(b.dataset.act, t)));
  $("img", host)?.addEventListener("error", (e) => e.target.remove());
}

function tool(act, emoji, name, sub) {
  return `<button type="button" class="tool" data-act="${act}"><span class="emoji">${emoji}</span><b>${esc(name)}</b><small>${esc(sub)}</small></button>`;
}
function slug(s) {
  return (s || "track").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "track";
}

async function download(url, filename) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error();
    const blob = await res.blob();
    saveBlob(blob, filename);
  } catch {
    window.open(url, "_blank", "noopener");
  }
}
function saveBlob(blob, filename) {
  const a = el("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
async function downloadMidi(t) {
  try {
    const d = await state.client.midiInfo(t.midi.taskId);
    if (!d?.midiData?.instruments?.length) throw new Error("No MIDI notes available");
    saveBlob(midiFromNotes(d.midiData), `${slug(t.title)}.mid`);
  } catch (err) {
    toast("Couldn't build MIDI", err.message, { type: "error" });
  }
}

function trackAction(act, t) {
  const c = state.client;
  switch (act) {
    case "play": return playTrack(t.id);
    case "mp3": return download(t.audioUrl || t.streamUrl, `${slug(t.title)}.mp3`);
    case "karaoke": return openKaraoke(t.id);
    case "fav": return toggleFav(t.id);
    case "delete":
      if (!confirm(`Remove “${t.title}” from your library?`)) return;
      state.tracks = state.tracks.filter((x) => x.id !== t.id);
      state.favs.delete(t.id);
      save();
      trackDlg.close();
      renderLibrary();
      return toast("Removed from library");
    case "restyle":
      trackDlg.close();
      go("remix");
      remixSources[0] = trackSrc(t);
      setRemixMode("cover");
      return;
    case "extend":
      return openForm({
        title: `➕ Extend “${t.title}”`,
        intro: "Pick where the new part should start. Leave lyrics empty for an instrumental-feeling continuation.",
        submitLabel: "Extend track",
        fields: [
          { name: "continueAt", label: `Continue from (seconds, 1–${Math.floor(t.duration || 0) || "end"})`, type: "number", min: 1, max: t.duration || undefined, step: 0.1, value: t.duration ? Math.max(1, Math.floor(t.duration - 10)) : "", required: true },
          { name: "model", label: "Model", type: "model", required: true, value: MODELS.some((m) => m.id === t.model) ? t.model : state.model },
          { name: "title", label: "Title", maxLength: 100, value: t.title },
          { name: "style", label: "Style", value: (t.tags || "").slice(0, 1000) },
          { name: "instrumental", type: "toggle", label: "Instrumental extension" },
          { name: "vocalGender", label: "Voice", type: "seg", value: "", options: [["", "Any"], ["f", "Female"], ["m", "Male"]], showIf: (v) => !v.instrumental },
          { name: "lyrics", label: "Lyrics for the new part", type: "textarea", mono: true, rows: 5, maxLength: 5000, showIf: (v) => !v.instrumental },
          { name: "negativeTags", label: "Avoid" },
          { name: "persona", label: "Persona", type: "persona" },
          { name: "ft", type: "finetune" },
        ],
        onSubmit: async (v) => {
          if (!v.instrumental) delete v.instrumental;
          else { delete v.vocalGender; delete v.lyrics; delete v.audioWeight; }
          const body = { ...v, audioId: t.id, taskId: t.taskId };
          const id = await c.extend(body);
          addJob({ id, kind: "music", label: `${t.title} (extended)`, meta: { source: t.source || "song", op: "Extended", model: v.model, title: v.title || t.title, style: v.style, retry: { fn: "extend", body } } });
          toast("➕ Extending your track", "New takes will appear in your Library.");
        },
      });
    case "replace": {
      const dur = t.duration || 60;
      const form = openForm({
        title: `🔁 Replace a section of “${t.title}”`,
        intro: "Choose at least 10 seconds (up to half the song) and write what should happen there. It blends back into the original.",
        submitLabel: "Replace section",
        fields: [
          { name: "timeline", type: "timeline", label: `Selected range (song is ${fmtTime(dur)})` },
          { name: "infillStartS", label: "Start (s)", type: "number", min: 0, step: 0.01, required: true, value: Math.min(30, Math.max(0, dur / 3)).toFixed(2) },
          { name: "infillEndS", label: "End (s)", type: "number", min: 0, step: 0.01, required: true, value: Math.min(dur, Math.min(30, Math.max(0, dur / 3)) + Math.max(10, Math.min(20, dur / 2))).toFixed(2) },
          { name: "prompt", label: "Lyrics for this section", type: "textarea", mono: true, rows: 4, required: true, placeholder: "[Chorus]\nNew words for this part…" },
          { name: "fullLyrics", label: "Full song lyrics after the change", type: "textarea", mono: true, rows: 7, required: true, value: t.lyrics || "", help: "Edit the section you're replacing so this matches the finished song." },
          { name: "title", label: "Title", required: true, value: t.title },
          { name: "tags", label: "Style", required: true, value: (t.tags || "pop").slice(0, 1000) },
          { name: "negativeTags", label: "Avoid" },
          { name: "vocalGender", label: "Voice", type: "seg", value: "", options: [["", "Any"], ["f", "Female"], ["m", "Male"]] },
          { name: "persona", label: "Persona", type: "persona" },
          { name: "ft", type: "finetune" },
          {
            name: "_", type: "note", html: "",
            onChange: (v, nodes) => {
              const s = +v.infillStartS || 0, e = +v.infillEndS || 0;
              const sel = $(".timeline .sel", nodes.timeline.wrap);
              sel.style.left = `${(Math.max(0, s) / dur) * 100}%`;
              sel.style.width = `${Math.max(0, Math.min(dur, e) - s) / dur * 100}%`;
              const len = e - s;
              nodes._.wrap.innerHTML = `<p class="hint">${len >= 10 && len <= dur / 2 + 0.01 ? `✓ Replacing ${len.toFixed(1)}s` : `⚠ Range must be 10s – ${(dur / 2).toFixed(1)}s (currently ${len.toFixed(1)}s)`}</p>`;
            },
          },
        ],
        onSubmit: async (v) => {
          const s = +v.infillStartS, e = +v.infillEndS;
          if (!(e - s >= 10)) throw new Error("The section must be at least 10 seconds long.");
          if (e - s > dur / 2 + 0.01) throw new Error("The section can be at most half of the song.");
          delete v._;
          const body = { ...v, infillStartS: +s.toFixed(2), infillEndS: +e.toFixed(2), taskId: t.taskId, audioId: t.id };
          const id = await c.replaceSection(body);
          addJob({ id, kind: "music", label: `${t.title} (new section)`, meta: { source: t.source || "song", op: "Rewritten", title: v.title, style: v.tags, retry: { fn: "replaceSection", body } } });
          toast("🔁 Rewriting that section", "The new version will land in your Library.");
        },
      });
      return form;
    }
    case "persona":
      return openForm({
        title: "👤 Save as persona",
        intro: "Capture this track's voice and character so future songs can sound like it. Pick a 10–30s stretch with clear vocals.",
        submitLabel: "Create persona",
        fields: [
          { name: "name", label: "Persona name", required: true, placeholder: "e.g. Midnight Crooner" },
          { name: "style", label: "Style label", value: (t.tags || "").split(",").slice(0, 3).join(",").trim() },
          { name: "description", label: "Describe the voice & vibe", type: "textarea", rows: 3, required: true, placeholder: "Warm, smoky male baritone with jazzy phrasing over lush Rhodes chords" },
          { name: "vocalStart", label: "Vocal start (s)", type: "number", min: 0, step: 0.1, value: 0 },
          { name: "vocalEnd", label: "Vocal end (s)", type: "number", min: 1, step: 0.1, value: Math.min(30, Math.floor(t.duration || 30)) },
        ],
        onSubmit: async (v) => {
          if (v.vocalEnd != null && v.vocalStart != null && v.vocalEnd <= v.vocalStart) throw new Error("End must be after start.");
          const d = await c.persona({ ...v, taskId: t.taskId, audioId: t.id });
          state.personas.unshift({ name: d?.name || v.name, personaId: d.personaId, personaModel: "style_persona", description: v.description, fromTrack: t.id, createdAt: Date.now() });
          save();
          renderPersonaSelect();
          refreshCredits();
          toast("Persona created 👤", `Pick “${v.name}” under Advanced controls in Custom mode.`, { type: "success" });
        },
      });
    case "cover":
      return runAsset(async () => {
        const id = await c.cover(t.taskId);
        addJob({ id, kind: "cover", label: t.title, meta: { taskId: t.taskId, audioId: t.id } });
        toast("🖼️ Painting new cover art");
      });
    case "wav":
      if (t.wavUrl) return download(t.wavUrl, `${slug(t.title)}.wav`);
      return runAsset(async () => {
        const id = await c.wav(t.taskId, t.id);
        addJob({ id, kind: "wav", label: t.title, meta: { audioId: t.id } });
        toast("💿 Rendering WAV master");
      });
    case "video":
      return openForm({
        title: "🎬 Make a music video",
        intro: "We'll render an MP4 with animated visuals for this track.",
        submitLabel: "Create video",
        fields: [
          { name: "author", label: "Artist name on video", maxLength: 50, placeholder: "Your artist name" },
          { name: "domainName", label: "Watermark / brand", maxLength: 50, placeholder: "e.g. yourname.com" },
        ],
        onSubmit: async (v) => {
          const id = await c.video({ taskId: t.taskId, audioId: t.id, ...v });
          addJob({ id, kind: "video", label: t.title, meta: { audioId: t.id } });
          toast("🎬 Directing your video", "This can take a few minutes.");
        },
      });
    case "stems":
      return openForm({
        title: "🎚️ Split stems",
        intro: "Separate the mix into parts for remixing, karaoke or production.",
        submitLabel: "Separate",
        fields: [
          { name: "type", label: "Separation", type: "select", value: "separate_vocal", required: true, options: [["separate_vocal", "Vocals + instrumental (2 stems)"], ["split_stem", "Full band — up to 12 stems"], ["split_stem_advanced", "Single instrument of your choice"]] },
          { name: "stemName", label: "Instrument", type: "select", required: true, options: STEMS.map((s) => [s, s]), value: "Lead Vocal", showIf: (v) => v.type === "split_stem_advanced" },
        ],
        onSubmit: async (v) => {
          const body = { taskId: t.taskId, audioId: t.id, type: v.type };
          if (v.type === "split_stem_advanced") body.stemName = v.stemName;
          const id = await c.separate(body);
          addJob({ id, kind: "stems", label: t.title, meta: { audioId: t.id, type: v.type, stemName: v.stemName } });
          toast("🎚️ Separating stems", "Usually takes a minute or two.");
        },
      });
    case "midi":
      if (!t.stems) {
        toast("Split stems first", "MIDI is transcribed from separated stems.", { actions: [{ label: "Split stems", onClick: () => trackAction("stems", t) }] });
        return;
      }
      if (t.midi) return downloadMidi(t);
      return runAsset(async () => {
        const id = await c.midi({ taskId: t.stems.taskId });
        addJob({ id, kind: "midi", label: t.title, meta: { audioId: t.id } });
        toast("🎹 Transcribing to MIDI");
      });
    case "recover":
      return runAsset(async () => {
        const id = await c.recover(t.taskId);
        addJob({ id, kind: "recovery", label: t.title, meta: { audioId: t.id } });
        toast("🩹 Restoring audio links");
      });
  }
}
async function runAsset(fn) {
  try { await fn(); } catch (err) {
    toast("That didn't work", err.message, { type: "error" });
    if (err.code === 401) lock("Your API key was rejected. Please enter a valid key.");
  }
}

/* =========================================================
   Player
   ========================================================= */
const audio = $("#audio");
const player = { current: null, queue: [] };

function trackSrc(t) { return safeUrl(t.audioUrl) || safeUrl(t.streamUrl); }
// Streaming previews report an infinite duration, so fall back to the API's value.
function playDuration() {
  return isFinite(audio.duration) && audio.duration > 0 ? audio.duration : player.current?.duration || 0;
}

function playTrack(id, queue) {
  const t = state.tracks.find((x) => x.id === id);
  if (!t) return;
  const src = trackSrc(t);
  if (!src) return toast("Not ready yet", "This take is still being generated.");
  player.queue = (queue && queue.length ? queue : state.tracks).map((x) => x.id);
  player.current = t;
  audio.src = src;
  audio.play().catch(() => {});
  $("#player").hidden = false;
  updatePlayerMeta();
  renderLibrary();
}
function syncPlayerSource() {
  // Swap from the streaming preview to the final master when it becomes available.
  const t = state.tracks.find((x) => x.id === player.current?.id);
  if (!t) return;
  player.current = t;
  if (t.audioUrl && audio.src !== t.audioUrl && audio.src === t.streamUrl && audio.paused) {
    const pos = audio.currentTime;
    audio.src = t.audioUrl;
    audio.currentTime = pos;
  }
  updatePlayerMeta();
}
function updatePlayerMeta() {
  const t = player.current;
  if (!t) return;
  $("#p-title").textContent = t.title;
  $("#p-sub").textContent = t.tags || modelName(t.model);
  const img = $("#p-cover");
  img.src = safeUrl(t.imageUrl) || "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: "Tunesmith", album: t.tags || "", artwork: safeUrl(t.imageUrl) ? [{ src: t.imageUrl, sizes: "512x512" }] : [] });
  }
}
function togglePlay() {
  if (!player.current) return;
  if (audio.paused) audio.play().catch(() => {});
  else audio.pause();
}
function step(dir) {
  if (!player.current) return;
  const q = player.queue.filter((id) => state.tracks.some((t) => t.id === id && trackSrc(t)));
  if (!q.length) return;
  const i = q.indexOf(player.current.id);
  const next = q[(i + dir + q.length) % q.length];
  playTrack(next, q.map((id) => state.tracks.find((t) => t.id === id)));
}

function initPlayer() {
  audio.volume = store.get("vol", 0.9);
  $("#p-vol").value = audio.volume;
  $("#p-play").addEventListener("click", togglePlay);
  $("#p-prev").addEventListener("click", () => (audio.currentTime > 3 ? (audio.currentTime = 0) : step(-1)));
  $("#p-next").addEventListener("click", () => step(1));
  $("#p-vol").addEventListener("input", (e) => { audio.volume = +e.target.value; store.set("vol", audio.volume); });
  $("#p-seek").addEventListener("input", (e) => {
    const d = playDuration();
    if (d) audio.currentTime = (e.target.value / 1000) * d;
  });
  $("#p-karaoke").addEventListener("click", () => player.current && openKaraoke(player.current.id));
  $("#p-open").addEventListener("click", () => player.current && openTrack(player.current.id));

  const setPlaying = (on) => {
    $("#player").classList.toggle("playing", on);
    $("#p-eq").classList.toggle("playing", on);
    $("#p-play").setAttribute("aria-label", on ? "Pause" : "Play");
    $$(".track").forEach((c) => {
      const me = c.dataset.id === player.current?.id;
      c.classList.toggle("is-playing", me);
      const b = $("[data-play]", c);
      if (b) b.innerHTML = me && on ? ICON.pause : ICON.play;
    });
  };
  audio.addEventListener("play", () => setPlaying(true));
  audio.addEventListener("pause", () => setPlaying(false));
  audio.addEventListener("ended", () => step(1));
  audio.addEventListener("timeupdate", () => {
    const d = playDuration();
    $("#p-cur").textContent = fmtTime(audio.currentTime);
    $("#p-dur").textContent = fmtTime(d);
    if (d) $("#p-seek").value = Math.round((audio.currentTime / d) * 1000);
  });
  audio.addEventListener("error", () => {
    const t = player.current;
    if (!t || !audio.src) return;
    if (!t.expired) { t.expired = true; save(); }
    toast("Couldn't play this track", "The audio link may have expired.", {
      type: "error",
      actions: [{ label: "Restore link", onClick: () => trackAction("recover", t) }],
    });
  });

  if ("mediaSession" in navigator) {
    navigator.mediaSession.setActionHandler("play", togglePlay);
    navigator.mediaSession.setActionHandler("pause", togglePlay);
    navigator.mediaSession.setActionHandler("previoustrack", () => step(-1));
    navigator.mediaSession.setActionHandler("nexttrack", () => step(1));
  }

  document.addEventListener("keydown", (e) => {
    if (e.code !== "Space" || !player.current) return;
    if (e.target.closest("input,textarea,select,button,[contenteditable]") || $("dialog[open]")) return;
    e.preventDefault();
    togglePlay();
  });
}

/* =========================================================
   Karaoke (timestamped lyrics)
   ========================================================= */
const kDlg = $("#karaoke-dlg");
const lyricCache = new Map();
let kRaf = 0;

async function openKaraoke(id) {
  const t = state.tracks.find((x) => x.id === id);
  if (!t) return;
  if (player.current?.id !== id) playTrack(id);
  $("#k-title").textContent = `🎤 ${t.title}`;
  const body = $("#k-body");
  const wave = $("#k-wave");
  wave.innerHTML = "";
  body.innerHTML = '<div class="lyric-pending"><span class="eq busy"><i></i><i></i><i></i><i></i></span> Syncing lyrics…</div>';
  if (!kDlg.open) kDlg.showModal();
  try {
    let d = lyricCache.get(id);
    if (!d) {
      d = await state.client.timestampedLyrics(t.taskId, t.id);
      lyricCache.set(id, d);
    }
    const words = (d?.alignedWords || []).filter((w) => w.word);
    if (!words.length) throw new Error(t.lyrics ? "Timing isn't available for this track." : "This track has no lyrics — it may be instrumental.");
    body.innerHTML = "";
    words.forEach((w, i) => {
      // Words can carry section tags and line breaks, e.g. "[Verse]\nHello".
      const parts = w.word.split(/(\[[^\]]*\]|\n)/).filter((p) => p !== "");
      for (const p of parts) {
        if (p === "\n") body.append(el("br"));
        else if (/^\[.*\]$/.test(p)) body.append(el("span", "sec", esc(p.slice(1, -1))));
        else {
          const s = el("span", "w", esc(p) + " ");
          s.dataset.i = i;
          s.addEventListener("click", () => { audio.currentTime = w.startS; audio.play().catch(() => {}); });
          body.append(s);
        }
      }
    });
    const wf = d.waveformData || [];
    if (wf.length) {
      const n = 90;
      const bars = Array.from({ length: n }, (_, i) => {
        const chunk = wf.slice(Math.floor((i * wf.length) / n), Math.floor(((i + 1) * wf.length) / n));
        return chunk.length ? Math.max(...chunk) : 0;
      });
      const max = Math.max(...bars, 0.001);
      wave.innerHTML = bars.map((b) => `<i style="height:${Math.max(6, (b / max) * 100)}%"></i>`).join("");
    }
    const spans = $$(".w", body);
    let last = -1;
    const loop = () => {
      const now = audio.currentTime;
      let cur = -1;
      for (let i = 0; i < words.length; i++) if (words[i].startS <= now + 0.05) cur = i; else break;
      if (cur !== last) {
        spans.forEach((s) => {
          const i = +s.dataset.i;
          s.classList.toggle("sung", i < cur);
          s.classList.toggle("now", i === cur);
        });
        const nowEl = spans.find((s) => +s.dataset.i === cur);
        nowEl?.scrollIntoView({ block: "center", behavior: "smooth" });
        last = cur;
      }
      const d2 = playDuration() || t.duration;
      if (d2) {
        const bars = $$("i", wave);
        const upto = Math.floor((now / d2) * bars.length);
        bars.forEach((b, i) => b.classList.toggle("past", i <= upto));
      }
      kRaf = requestAnimationFrame(loop);
    };
    cancelAnimationFrame(kRaf);
    loop();
  } catch (err) {
    body.innerHTML = `<p class="muted" style="font-size:1rem">${esc(err.message)}</p>`;
  }
}
kDlg.addEventListener("close", () => cancelAnimationFrame(kRaf));

/* =========================================================
   Settings
   ========================================================= */
function openSettings() {
  const key = readKey();
  const masked = key ? `${key.slice(0, 4)}••••••${key.slice(-4)}` : "—";
  const remembered = (() => { try { return !!localStorage.getItem(keyName()); } catch { return false; } })();
  $("#dlg-title").textContent = "Settings";
  const body = $("#dlg-body");
  body.innerHTML = `
    <div class="settings-row"><div><b>Account</b><small>${esc(user?.email || "—")}</small></div><div style="display:flex;gap:.4rem"><button type="button" class="btn btn-sm" data-s="profile">Edit profile</button><button type="button" class="btn btn-sm btn-danger" data-s="signout">Sign out</button></div></div>
    <div class="settings-row"><div><b>API key</b><small><span class="key-mask">${esc(masked)}</span> · ${remembered ? "remembered on this device" : "this session only"}</small></div><button type="button" class="btn btn-sm btn-danger" data-s="lock">Remove key</button></div>
    <div class="settings-row"><div><b>Credits</b><small>${state.credits != null ? Number(state.credits).toLocaleString() + " remaining" : "—"}</small></div><a class="btn btn-sm" href="https://sunoapi.org" target="_blank" rel="noopener">Top up</a></div>
    <div class="settings-row"><div><b>Connection</b><small>Auto uses the built-in secure proxy on Netlify, falling back to direct calls.</small></div>
      <select class="input" style="width:auto" data-s="conn"><option value="auto">Auto</option><option value="proxy">Proxy only</option><option value="direct">Direct to api.sunoapi.org</option></select></div>
    <div class="settings-row"><div><b>Personas & voices</b><small>${state.personas.length ? state.personas.map((p) => esc(p.name)).join(", ") : "None yet — create one from any track."}</small></div><div style="display:flex;gap:.4rem"><button type="button" class="btn btn-sm" data-s="addp">Add</button>${state.personas.length ? '<button type="button" class="btn btn-sm btn-ghost" data-s="clearp">Clear</button>' : ""}</div></div>
    <div class="settings-row"><div><b>Library backup</b><small>${state.tracks.length} tracks saved in this browser.</small></div><div style="display:flex;gap:.4rem;flex-wrap:wrap"><button type="button" class="btn btn-sm" data-s="export">Export</button><label class="btn btn-sm">Import<input type="file" accept="application/json" hidden data-s="import" /></label><button type="button" class="btn btn-sm btn-danger" data-s="clear">Clear</button></div></div>
    <div class="settings-row"><div><b>About</b><small>Tunesmith runs entirely in your browser on top of the <a href="https://docs.sunoapi.org" target="_blank" rel="noopener">Suno API</a>. Generated files are hosted by Suno for 14 days, uploads for 3 days.</small></div></div>`;
  $("#dlg-foot").innerHTML = '<button type="button" class="btn btn-primary" data-close>Done</button>';
  clearError("#dlg-error");
  dlgSubmit = () => dlg.close();
  const conn = $("[data-s=conn]", body);
  conn.value = state.client?.mode || "auto";
  conn.addEventListener("change", () => {
    try { localStorage.setItem("ts.conn", conn.value); } catch {}
    state.client = new SunoClient(state.client.key);
    toast("Connection updated");
  });
  $("[data-s=lock]", body).addEventListener("click", () => { dlg.close(); lock(); toast("Key removed", "Add a key to keep creating."); });
  $("[data-s=profile]", body).addEventListener("click", () => openProfile());
  $("[data-s=signout]", body).addEventListener("click", async () => { await signOutAccount(); toast("Signed out", "See you next time."); });
  $("[data-s=addp]", body).addEventListener("click", () => addPersonaManually());
  $("[data-s=clearp]", body)?.addEventListener("click", () => {
    if (!confirm("Remove all saved personas?")) return;
    state.personas = [];
    save();
    renderPersonaSelect();
    openSettings();
  });
  $("[data-s=export]", body).addEventListener("click", () => {
    const data = { app: "tunesmith", version: 1, exportedAt: new Date().toISOString(), tracks: state.tracks, personas: state.personas, lyrics: state.lyrics, favs: [...state.favs] };
    saveBlob(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), `tunesmith-library-${new Date().toISOString().slice(0, 10)}.json`);
  });
  $("[data-s=import]", body).addEventListener("change", async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!Array.isArray(data.tracks)) throw new Error("Not a Tunesmith backup");
      const have = new Set(state.tracks.map((t) => t.id));
      const added = data.tracks.filter((t) => t && t.id && !have.has(t.id));
      state.tracks.push(...added);
      state.tracks.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      (data.personas || []).forEach((p) => { if (p?.personaId && !state.personas.some((x) => x.personaId === p.personaId)) state.personas.push(p); });
      (data.favs || []).forEach((id) => state.favs.add(id));
      save();
      renderLibrary();
      renderPersonaSelect();
      toast("Library imported", `${added.length} new track${added.length === 1 ? "" : "s"}.`, { type: "success" });
      openSettings();
    } catch (err) {
      toast("Import failed", err.message, { type: "error" });
    }
  });
  $("[data-s=clear]", body).addEventListener("click", () => {
    if (!confirm("Clear your whole library from this device? Download anything you want to keep first.")) return;
    state.tracks = [];
    state.favs.clear();
    state.jobs = state.jobs.filter((j) => j.status === "running");
    save();
    renderLibrary();
    renderJobs();
    toast("Library cleared");
    openSettings();
  });
  if (!dlg.open) dlg.showModal();
}

/* =========================================================
   Boot
   ========================================================= */
function initShell() {
  $("#credits-btn").addEventListener("click", async () => {
    $("#credits-val").textContent = "…";
    await refreshCredits();
    if (state.credits != null) setCredits(state.credits);
  });
  $("#jobs-btn").addEventListener("click", openDrawer);
  $("#scrim").addEventListener("click", closeDrawer);
  $("[data-close-drawer]").addEventListener("click", closeDrawer);
  $("#jobs-clear").addEventListener("click", () => {
    state.jobs = state.jobs.filter((j) => j.status === "running");
    save();
    renderJobs();
  });
  $("#settings-btn").addEventListener("click", openSettings);
  $("#profile-btn").addEventListener("click", () => openProfile());
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#jobs-drawer").hidden) closeDrawer(); });
}

function boot() {
  initTheme();
  initGate();
  initShell();
  initCreate();
  initLyrics();
  initRemix();
  initSounds();
  initLibrary();
  initPlayer();
  renderJobs();
  initLogin();
  initAdmin();
  initAuth();
}

boot();

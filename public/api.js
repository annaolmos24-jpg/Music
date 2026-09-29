// Thin client for the Suno API (https://docs.sunoapi.org).
// Requests go through the Netlify same-origin proxy (/suno-api) when available,
// and fall back to calling the API directly.

const DIRECT = "https://api.sunoapi.org";
const PROXY = "/suno-api";
const UPLOAD_DIRECT = "https://sunoapiorg.redpandaai.co";
const UPLOAD_PROXY = "/suno-upload";

export const FRIENDLY_ERRORS = {
  400: "Some of the settings aren't valid. Check the fields and try again.",
  401: "That API key wasn't accepted. Double-check it at sunoapi.org/api-key.",
  402: "You're out of credits. Top up at sunoapi.org to keep creating.",
  404: "The API couldn't find that resource.",
  405: "Rate limit reached. Give it a few seconds.",
  409: "That already exists for this track.",
  413: "The prompt or lyrics are too long for this model.",
  422: "Some of the settings aren't valid. Check the fields and try again.",
  429: "You're out of credits. Top up at sunoapi.org to keep creating.",
  430: "Whoa, slow down! Too many requests. Try again in a moment.",
  451: "The API couldn't fetch the source file. Make sure the URL is public.",
  455: "Suno is under maintenance right now. Please try again shortly.",
  500: "Suno hit a server error. Please try again.",
};

export class ApiError extends Error {
  constructor(code, msg) {
    const friendly = FRIENDLY_ERRORS[code];
    super(msg && friendly && !/^(success|error)$/i.test(msg) ? `${friendly} (${msg})` : msg || friendly || `Request failed (${code})`);
    this.code = code;
    this.raw = msg;
  }
}

function canProxy() {
  return location.protocol === "http:" || location.protocol === "https:";
}

export function callbackUrl() {
  const local = /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(location.hostname);
  if (location.protocol === "https:" && !local) return `${location.origin}/callback`;
  return "https://example.com/tunesmith-callback";
}

export class SunoClient {
  constructor(key) {
    this.key = key;
    let mode = "auto";
    try { mode = localStorage.getItem("ts.conn") || "auto"; } catch {}
    this.mode = mode;
    this.useProxy = mode === "proxy" || (mode === "auto" && canProxy());
  }

  base() { return this.useProxy ? PROXY : DIRECT; }
  uploadBase() { return this.useProxy ? UPLOAD_PROXY : UPLOAD_DIRECT; }

  async request(path, { method = "GET", body, query, okCodes = [200] } = {}) {
    const qs = query ? "?" + new URLSearchParams(query).toString() : "";
    const doFetch = () =>
      fetch(this.base() + path + qs, {
        method,
        headers: {
          Authorization: `Bearer ${this.key}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });

    let res;
    try {
      res = await doFetch();
    } catch (err) {
      if (this.useProxy && this.mode === "auto") {
        this.useProxy = false;
        return this.request(path, { method, body, query, okCodes });
      }
      throw new ApiError(0, "Network error — check your connection.");
    }

    let json = null;
    const text = await res.text();
    try { json = JSON.parse(text); } catch {}

    // Proxy missing (e.g. plain static server): fall back to direct calls once.
    if (!json && this.useProxy && this.mode === "auto") {
      this.useProxy = false;
      return this.request(path, { method, body, query, okCodes });
    }
    if (!json) throw new ApiError(res.status, `Unexpected response (${res.status})`);
    if (!okCodes.includes(json.code)) throw new ApiError(json.code ?? res.status, json.msg);
    return json;
  }

  get(path, query, opts = {}) { return this.request(path, { query, ...opts }); }
  post(path, body, opts = {}) { return this.request(path, { method: "POST", body, ...opts }); }

  // ---- Account
  credits() { return this.get("/api/v1/generate/credit").then((r) => r.data); }

  // ---- Music
  generate(body) { return this.post("/api/v1/generate", withCb(body)).then(taskId); }
  extend(body) { return this.post("/api/v1/generate/extend", withCb(body)).then(taskId); }
  uploadCover(body) { return this.post("/api/v1/generate/upload-cover", withCb(body)).then(taskId); }
  uploadExtend(body) { return this.post("/api/v1/generate/upload-extend", withCb(body)).then(taskId); }
  addVocals(body) { return this.post("/api/v1/generate/add-vocals", withCb(body)).then(taskId); }
  addInstrumental(body) { return this.post("/api/v1/generate/add-instrumental", withCb(body)).then(taskId); }
  mashup(body) { return this.post("/api/v1/generate/mashup", withCb(body)).then(taskId); }
  replaceSection(body) { return this.post("/api/v1/generate/replace-section", withCb(body)).then(taskId); }
  sounds(body) { return this.post("/api/v1/generate/sounds", withCb(body)).then(taskId); }
  musicInfo(id) { return this.get("/api/v1/generate/record-info", { taskId: id }).then((r) => r.data); }

  // ---- Lyrics & style
  lyrics(prompt) { return this.post("/api/v1/lyrics", withCb({ prompt })).then(taskId); }
  lyricsInfo(id) { return this.get("/api/v1/lyrics/record-info", { taskId: id }).then((r) => r.data); }
  timestampedLyrics(taskIdv, audioId) { return this.post("/api/v1/generate/get-timestamped-lyrics", { taskId: taskIdv, audioId }).then((r) => r.data); }
  boostStyle(content) { return this.post("/api/v1/style/generate", { content }).then((r) => r.data); }

  // ---- Persona
  persona(body) { return this.post("/api/v1/generate/generate-persona", body).then((r) => r.data); }

  // ---- Processing
  wav(taskIdv, audioId) { return this.post("/api/v1/wav/generate", withCb({ taskId: taskIdv, audioId })).then(taskId); }
  wavInfo(id) { return this.get("/api/v1/wav/record-info", { taskId: id }).then((r) => r.data); }
  separate(body) { return this.post("/api/v1/vocal-removal/generate", withCb(body)).then(taskId); }
  separateInfo(id) { return this.get("/api/v1/vocal-removal/record-info", { taskId: id }).then((r) => r.data); }
  midi(body) { return this.post("/api/v1/midi/generate", withCb(body)).then(taskId); }
  midiInfo(id) { return this.get("/api/v1/midi/record-info", { taskId: id }).then((r) => r.data); }
  video(body) { return this.post("/api/v1/mp4/generate", withCb(body)).then(taskId); }
  videoInfo(id) { return this.get("/api/v1/mp4/record-info", { taskId: id }).then((r) => r.data); }
  cover(taskIdv) { return this.post("/api/v1/suno/cover/generate", withCb({ taskId: taskIdv }), { okCodes: [200, 409] }).then(taskId); }
  coverInfo(id) { return this.get("/api/v1/suno/cover/record-info", { taskId: id }).then((r) => r.data); }
  recover(sunoTaskId) { return this.post("/api/v1/suno/recovery", withCb({ sunoTaskId })).then(taskId); }
  recoverInfo(id) { return this.get("/api/v1/suno/recovery/record-info", { task_id: id }, { okCodes: [200, 201] }); }

  // ---- File upload (temporary hosting, deleted after 3 days)
  async upload(file, onProgress) {
    const send = (base) =>
      new Promise((resolve, reject) => {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("uploadPath", "tunesmith");
        fd.append("fileName", `${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`);
        const xhr = new XMLHttpRequest();
        xhr.open("POST", base + "/api/file-stream-upload");
        xhr.setRequestHeader("Authorization", `Bearer ${this.key}`);
        xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
        xhr.onload = () => {
          let json = null;
          try { json = JSON.parse(xhr.responseText); } catch {}
          if (!json) return reject(Object.assign(new ApiError(xhr.status, "Upload failed"), { retryable: true }));
          if ((json.code === 200 || json.success) && json.data?.downloadUrl) return resolve(json.data.downloadUrl);
          reject(new ApiError(json.code || xhr.status, json.msg || "Upload failed"));
        };
        xhr.onerror = () => reject(Object.assign(new ApiError(0, "Upload failed — network error"), { retryable: true }));
        xhr.send(fd);
      });
    try {
      return await send(this.uploadBase());
    } catch (err) {
      if (err.retryable && this.useProxy) return send(UPLOAD_DIRECT);
      throw err;
    }
  }
}

function withCb(body) {
  return { ...body, callBackUrl: callbackUrl() };
}
function taskId(r) {
  const id = r?.data?.taskId || r?.data?.task_id || r?.taskId;
  if (!id) throw new ApiError(r?.code || 500, r?.msg || "No task ID returned");
  return id;
}

# Tunesmith Studio

A one-page AI music studio built on the [Suno API](https://docs.sunoapi.org). Paste your API key and you can write, generate, remix and finish songs from the browser.

## Features

- **Key gate**: the studio stays locked until you enter a valid Suno API key. The key is checked against the free credit-balance endpoint and kept only in your browser. You choose whether it's remembered on the device or kept for this session only.
- **Create (Simple)**: describe a song idea, add style chips, or use 🎲 *Surprise me*. You can attach reference images, a video or audio clips (uploaded or linked by URL).
- **Create (Custom)**: title, lyrics with section tags, 🚀 *Boost style*, ✍️ *Write lyrics with AI*, instrumental toggle, vocal gender, styles to avoid, length (10 s – 6 min), personas and custom voices, and fine-tuning for style weight, weirdness, audio weight and variety.
- **Models**: V6 (default), V6 Wild and V6 Mini, plus the legacy V5.5, V5, V4.5+, V4.5 All, V4.5 and V4.
- **Lyrics Lab**: generates several takes on a theme. Any take can be sent straight into a song.
- **Remix Studio**: Restyle (upload & cover), Extend an upload, Add vocals, Add a band (instrumental) and Mashup two songs. Audio can be uploaded, linked by URL or picked from your library.
- **Sound Lab**: loops and sound effects with tempo (BPM) and key control.
- **Library & track tools**: extend, replace a section, restyle, save as persona, new cover art, stem separation (2-stem, full band or a single instrument), WAV master, music video, MIDI export (`.mid`), restore expired links, and a sing-along karaoke view built from timestamped lyrics.
- **Live progress**: every task is polled in the background. You see a *Lyrics → Stream → Master* progress bar and can play the first take while the rest is still rendering.
- **Themes**: light, dark and system, plus a responsive layout for phones.

## Deploying on Netlify

No build step is needed. Connect the repo and Netlify reads `netlify.toml`:

- `public/` is the published site.
- `/suno-api/*` and `/suno-upload/*` are same-origin proxies to `api.sunoapi.org` and the Suno file-upload host, which avoids CORS problems.
- `/callback` goes to a tiny function (`netlify/functions/suno-callback.mjs`) that acknowledges Suno's required `callBackUrl`. The app gets its results by polling.

## Running locally

```bash
npx netlify dev        # full setup including proxies and the callback function
# or any static server, e.g.
npx serve public       # the app falls back to calling the API directly
```

## Notes

- Suno keeps generated files for 14 days and file uploads for 3 days. Download anything you want to keep.
- Your library, personas and lyric drafts are stored in `localStorage`. You can export or import them from Settings.

---

## Also in this repo: Nourish (nutrition & wellness tracker)

The [`nutrition/`](nutrition/) folder holds a separate app: a meal, macro, water and weight tracker that uses live Open Food Facts data (free, no key). To deploy it on its own Netlify site, set **Base directory** to `nutrition`. See [`nutrition/README.md`](nutrition/README.md).

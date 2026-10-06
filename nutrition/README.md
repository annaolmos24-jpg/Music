# Nourish · Nutrition & Wellness

A responsive meal and wellness tracker with a personal greeting for Oriana. It uses live food data from
[Open Food Facts](https://world.openfoodfacts.org), a free, open database that needs no account, API key or payment.

## Features

- **Personal greeting**: "Good morning/afternoon/evening, Oriana" with a daily wellness tip. The name can be changed under *Goals*.
- **Today**: calorie ring, protein/carbs/fat/fiber bars, sugar and sodium, a water tracker, a mood and sleep check-in, notes, and meals grouped as breakfast, lunch, dinner and snacks. You can step back through previous days.
- **Add food**: live product search, barcode lookup (plus camera scanning in browsers that support it, such as Chrome on Android), portion picker with per-serving amounts, recent foods and a quick-add form for home-cooked meals.
- **Progress**: 7/14/30-day calorie chart vs. goal, macro balance, logging streak, water and sleep averages, and weight logging with a trend chart (lb or kg).
- **Themes**: light, dark and system.
- **Responsive**: bottom tab bar on phones, sidebar on tablets and desktops. Can be added to a home screen.
- **Private**: data stays in the browser (`localStorage`). Export/import a JSON backup from *Goals*.

## Deploying on Netlify

No build step. In Netlify: **Add new site → Import an existing project →** pick this repo, then set:

| Setting | Value |
| --- | --- |
| Base directory | `nutrition` |
| Build command | *(leave empty)* |
| Publish directory | `nutrition/public` (filled in automatically from `netlify.toml`) |

`netlify.toml` adds same-origin proxies (`/off-search/*`, `/off/*`) to Open Food Facts. If they aren't available, the app calls Open Food Facts directly.

You can also drag the `nutrition/public` folder onto Netlify Drop (app.netlify.com/drop).

## Running locally

```bash
npx serve nutrition/public
# or, with the proxies:
cd nutrition && npx netlify dev
```

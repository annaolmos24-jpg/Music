# Nourish · Nutrition & Wellness

A responsive meal and wellness tracker with a personal greeting for Oriana. It uses live food data from
[Open Food Facts](https://world.openfoodfacts.org), a free, open database that needs no account, API key or payment.

## Features

- **Personal greeting**: "Good morning/afternoon/evening, Oriana" with a daily wellness tip. The name can be changed under *Goals*.
- **Today**: calorie ring, protein/carbs/fat/fiber bars, sugar and sodium, a water tracker, a mood and sleep check-in, notes, and meals grouped as breakfast, lunch, dinner and snacks. You can step back through previous days.
- **Add food**: live product search, barcode lookup (plus camera scanning in browsers that support it, such as Chrome on Android), portion picker with per-serving amounts, recent foods and a quick-add form for home-cooked meals.
- **Learn**: a calorie and BMI calculator (Mifflin-St Jeor) that can set your goals for you, five one-day meal plan templates (Balanced, High protein, Mediterranean, Plant-based, Quick & budget) with shopping lists and one-tap logging, a healthy-plate guide, 20 food facts, tips by topic, and myths vs. facts.
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

## Updating the app

### Change the content (meal plans, facts, tips, myths)
All Learn-tab content lives in **`nutrition/public/learn.js`**. It's plain lists you can edit without touching any other code:

- **Meal plans** (`PLANS`): each food is `["Name", calories, protein g, carbs g, fat g]`. Copy a whole plan block to add a new one, and give it a unique `id`.
- **Food facts** (`FACTS`): `{ emoji, title, text }`.
- **Tips** (`TIPS`): a `title`, an `emoji` and a list of `items`.
- **Myths** (`MYTHS`): `{ myth, fact }`.

The daily tip shown in the greeting is the `TIPS` list near the top of `nutrition/public/app.js`. The default name is `name: "Oriana"` in `DEFAULTS` in that same file. You can also change the name in the app under **Goals**.

### Publish your change
Netlify redeploys automatically every time `main` changes on GitHub, usually in under a minute:

1. **On GitHub's website:** open the file, click the ✏️ pencil, make your edit, then click **Commit changes** to `main`.
2. **Or on your computer:**
   ```bash
   git pull
   # edit files, then:
   git add -A && git commit -m "Update meal plans" && git push
   ```
3. Check progress in Netlify under **Deploys**. Hard-refresh the site (Ctrl/Cmd + Shift + R) to see the new version.

If something breaks, you can roll back in Netlify: **Deploys → pick an older deploy → Publish deploy**.

## Running locally

```bash
npx serve nutrition/public
# or, with the proxies:
cd nutrition && npx netlify dev
```

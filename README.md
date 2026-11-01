# Market Flow Agent

## Automatic cloud setup (recommended, no computer needed)
GitHub Actions runs the scan on a schedule and Apify fetches Carousell through residential proxies, which gets past the block that stops GitHub's own servers.
1. Create a free account at apify.com (no card). Copy your API token (Settings > API & Integrations). Set a monthly usage limit of $5 in your account's billing/limits settings so you can never be charged.
2. Test once in Apify's console: open the Carousell Scraper by crawloop, set country PH, query "nintendo switch", max items 5, and run it. If it errors about proxies, residential proxy needs a paid plan on your account and you should use the local setup below instead.
3. In your GitHub repo add secrets: `APIFY_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, one AI key, and `NTFY_TOPIC` or `DISCORD_WEBHOOK_URL`. Optional variables: `APIFY_MAX_ITEMS` (listings per search, default 10), `WATCH`, `HOME_LAT`, `HOME_LNG`, `RADIUS_KM`.
4. Actions > scan > Run workflow. The log should show `carousell_apify "nintendo switch": N listings` and `Saved N listings.`
5. It then runs by itself every 12 hours. Cost: Apify bills per listing returned plus proxy data, so a bigger `APIFY_MAX_ITEMS` or a faster cron uses up the free $5 sooner. Check the cost of your first run in Apify's console before changing the schedule.

Scans Carousell (Shopee is experimental) for your watch list, ranks deals by demand, margin and distance, saves to Supabase, and sends Telegram alerts.

## Setup
1. Install Node 20+ and Git. Run: `npm install` then `npx playwright install chromium`
2. Supabase: create a free project, open SQL Editor, open `supabase/schema.sql` in a text editor, copy ALL the text inside (not the file name), paste it into the editor, and run it. Copy the Project URL and the service_role key (Settings > API).
3. Free AI keys (no card needed, set at least one): Gemini at aistudio.google.com/apikey, Groq at console.groq.com/keys, OpenRouter at openrouter.ai/keys. They are tried in that order, and it falls back to keyword rules if all fail. Free tiers have rate limits and may change; Gemini's free tier may use your prompts to improve Google products.
4. Alerts (pick one or both, no Telegram needed):
   - ntfy: install the ntfy app (iOS/Android), subscribe to a long random topic name like `mikan-deals-x7k29qpl`, and set `NTFY_TOPIC` to it. No account needed. Anyone who knows the topic name can read it, so keep it random.
   - Discord: create a server, open a channel's Settings > Integrations > Webhooks > New Webhook, copy the URL into `DISCORD_WEBHOOK_URL`.
5. Copy `.env.example` to `.env` and fill in the keys. Change HOME_LAT / HOME_LNG to your exact spot.
6. Test: `npm test`, then `SOURCES=mock npm run scan` (no keys needed), then `npm run scan` for real.

## Run the scanner (recommended: your own computer)
Bot-protected sites like Carousell block cloud servers, so run it at home with your real Chrome:
1. Install Node 22+ and Google Chrome, then `npm install`.
2. `npm run login`: Chrome opens on Carousell. Pass any check, then close the window (your profile is remembered).
3. `npm run watch`: scans every 30 min while your computer is on. `npm run scan` runs once.
4. More sites: add entries to `sources.json`, then list their names in `SOURCES` in `.env` (e.g. `SOURCES=carousell,lazada`).
5. Dashboard preview without data: open the dashboard URL with `?demo` at the end.

## Run on GitHub instead (may be blocked)
- Option A, GitHub Actions: push to a private repo, add the secrets from `.env` under Settings > Secrets and variables > Actions, enable the `scan` workflow. Runs every 30 min. Sites may block GitHub's servers.
- Option B, your own PC or spare device: `npm run watch` (loops every INTERVAL_MIN minutes). Home internet is blocked less often.

## Notes
- The scrapers read listing links generically, but I could not test them against the live sites. Run once and check the output.
- Keep the scan interval and watch list modest. Personal use only.
- Facebook Marketplace is not included (no public API, login required).

## Dashboard (see your listings)
1. Put your Supabase Project URL and ANON key in `docs/config.js` (never the service_role key), commit and push.
2. On GitHub: Settings > Pages > Deploy from a branch > `main` and folder `/docs` > Save. Your dashboard appears at `https://<username>.github.io/<repo>/` after a minute.
3. It refreshes every minute, warns you if the scanner stops, and lets you filter, sort, search and save listings.

## If a scan shows 0 listings
The log prints a DEBUG line (status, page title, text) and the run saves a screenshot under the run's Artifacts. A captcha or block page means the site is rejecting GitHub's servers. Run `npm run watch` from your own computer instead.

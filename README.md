# Market Flow Agent

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

## Run 24/7
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

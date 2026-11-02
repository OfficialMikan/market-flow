# Market Flow Agent

## Version 4: what to do (in this order)
1. **Database:** in Supabase > SQL Editor run `schema.sql`, then `migration-2.sql`, then `migration-3.sql` (paste each file's text, not its name). Set your own passcode in migration-2 first. Migrations are safe to run twice.
2. **Keys:** rotate any key that was ever committed. Real values live only in `.env` and GitHub Secrets.
3. **Facebook Marketplace:** set `FB_LOCATION` (the place part of your Marketplace URL).
4. **Facebook groups (optional):** in the dashboard's Settings tab, paste links of PUBLIC groups near you, one per line. Private groups cannot be read, and this never uses your Facebook login.
5. **Scan:** Actions > scan > Run workflow, then open the dashboard (add `?demo` to preview it with sample data).

**What the scanner does now:** rotates through a tech catalog of about 200 searches (`QUERIES_PER_RUN` per scan), reads public group posts, fetches full details (description, specs, seller) for only the few best-priced listings (`DETAIL_TOP_N`), asks the free AIs to extract specs, condition, issues and whether each post is for sale or wanted, then matches every seller with buyers and works out your net profit. Confidence: A buyer found, B sold comps, C asking comps, D AI estimate.

**Privacy:** seller names, profile links and full descriptions are saved in a separate table that the public key cannot read. They only appear in the dashboard after you enter your passcode. Phone numbers, emails and links are stripped from everything public.

**Cost (Apify bills per result):** at the defaults, about $0.02 per scan for Marketplace and about $0.015 per public group, with 4 scans a day. One or two groups should fit the free $5; more groups, more searches per scan or a faster schedule will not. The budget guard pauses Apify sources at 90% of `APIFY_BUDGET_USD`. The Carousell scraper needs residential proxies and returns nothing without them, so it is off by default.

## Automatic cloud setup (recommended, no computer needed)
GitHub Actions runs the scan on a schedule and Apify fetches Carousell through residential proxies, which gets past the block that stops GitHub's own servers.
1. Create a free account at apify.com (no card). Copy your API token (Settings > API & Integrations). Set a monthly usage limit of $5 in your account's billing/limits settings so you can never be charged.
2. Test once in Apify's console: open the Carousell Scraper by crawloop, set country PH, query "nintendo switch", max items 5, and run it. If it errors about proxies, residential proxy needs a paid plan on your account and you should use the local setup below instead.
3. In your GitHub repo add secrets: `APIFY_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, one AI key, and `NTFY_TOPIC` or `DISCORD_WEBHOOK_URL`. Optional variables: `APIFY_MAX_ITEMS` (listings per search, default 10), `WATCH`, `HOME_LAT`, `HOME_LNG`, `RADIUS_KM`.
4. Actions > scan > Run workflow. The log should show `carousell_apify "nintendo switch": N listings` and `Saved N listings.`
4b. Facebook Marketplace (public listings, no Facebook login): in a browser open facebook.com/marketplace, set your city, search anything, and copy the place part of the address (`facebook.com/marketplace/<THIS>/search/...`). Add it as the GitHub variable `FB_LOCATION`. Optional variables: `FB_RADIUS_KM` (default 25), `FB_MAX_ITEMS` (per search, default 15). Meta's terms forbid automated collection, so expect occasional blocks; this never uses your own Facebook account.
4c. If a source returns 0 listings, the log prints a DEBUG line with the Apify run status and log tail. Paste it to get it fixed.
5. After you push, it runs by itself every 6 hours (Actions tab shows those runs as triggered by "schedule"); you only click Run workflow to test. GitHub can delay scheduled runs by a while and pauses them after 60 days without repo activity. Cost: Apify bills per listing returned plus proxy data, so a bigger `APIFY_MAX_ITEMS` or a faster cron uses up the free $5 sooner. Check the cost of your first run in Apify's console before changing the schedule.

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

## Security rules
- Never put real keys in `.env.example` or any committed file. Real values go only in `.env` (ignored by git) and GitHub Secrets. Git history is permanent and this repo is public.
- Scan now button: create a fine-grained GitHub token limited to this one repo with only Actions: Read and write, and an expiry date. It is kept in your browser only. Never use a token with full `repo` access.

## New in this version
1. **Database update (required once):** Supabase > SQL Editor > paste the text of `supabase/migration-2.sql`. First change the line `CHANGE-ME-TO-A-LONG-RANDOM-PASSCODE` to your own long random passcode. It is safe to run twice.
2. **Sold tracking:** a Carousell listing counts as sold/removed when a newest-first search should have shown it but did not (and not when most listings vanish at once, which looks like a failed scrape). After 3+ such listings of the same product, its median days-to-sell feeds into demand and shows on the card as "sells in ~N d". Facebook results are not sorted by newest, so Facebook items are not marked sold.
3. **Settings tab:** edit your searches and alert rules (minimum margin, maximum price, maximum km) from the dashboard. They are saved with your passcode and used on the next scan. Searches set here replace the `WATCH` variable.
4. **Profit tab:** log what you buy and sell, see profit, return, money tied up and profit by category. Tap Bought on any listing to add it. Data stays in this browser; use Export CSV for backups.
5. **Phone app:** open the dashboard in Chrome or Safari and choose Add to Home screen. "New since last visit" shows what appeared since you last had the page open, and on supported phones the app icon shows that count.
6. **Budget guard:** before using Apify, the scanner checks this month's usage and pauses Apify sources at 90% of `APIFY_BUDGET_USD` (default 5), sending you an alert. Change it with the `APIFY_BUDGET_USD` and `APIFY_STOP_AT_PCT` variables.

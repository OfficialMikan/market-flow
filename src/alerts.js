import { markAlerted } from "./db.js";
// Channels: any that have env vars set are used. All are free and none needs a Telegram account.
const E = process.env;
const post = (url, body) => fetch(url, { method: "POST", signal: AbortSignal.timeout(15000), headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export const channels = () => [
  E.DISCORD_WEBHOOK_URL && { name: "discord", send: d => post(E.DISCORD_WEBHOOK_URL, { content: d.text.slice(0, 1900) }) },
  E.NTFY_TOPIC && { name: "ntfy", send: d => post(E.NTFY_SERVER || "https://ntfy.sh", { topic: E.NTFY_TOPIC, title: d.title, message: d.text, click: d.url }) },
  E.TELEGRAM_BOT_TOKEN && E.TELEGRAM_CHAT_ID && { name: "telegram", send: d => post(`https://api.telegram.org/bot${E.TELEGRAM_BOT_TOKEN}/sendMessage`, { chat_id: E.TELEGRAM_CHAT_ID, text: d.text }) },
].filter(Boolean);

export async function alertDeals(deals, sb) {
  const chans = channels();
  if (!chans.length || !deals.length) return;
  const sent = [];
  for (const d of deals.slice(0, 10)) {
    const msg = { title: `₱${d.price} ${d.title}`.slice(0, 80), url: d.url,
      text: `${d.title}\n₱${d.price} → resale ~₱${d.resale ?? "?"} (${d.marginPct}%)\nDemand ${d.demand} · ${d.distanceKm ?? "?"} km · score ${d.score}\n${d.url}` };
    let ok = false;
    for (const c of chans) {
      try { const r = await c.send(msg); if (r.ok) ok = true; else console.error(`${c.name} alert failed: HTTP ${r.status}`); }
      catch (e) { console.error(`${c.name} alert failed:`, e.message); }
    }
    if (ok) sent.push(d.hash);
  }
  await markAlerted(sb, sent);
}

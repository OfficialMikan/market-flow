// Free multi-provider AI: tries each provider that has a key, in order, and falls through on any error.
import { redact } from "./pipeline.js";
export const CATS = ["Phones", "Tablets & Wearables", "Laptops", "Desktops & Parts", "Monitors", "Peripherals", "Audio", "Gaming", "Cameras & Drones", "Networking & Storage", "Smart Home & Power", "Printers & 3D", "Other"];
const KW = {
  "Gaming": /switch|ps4|ps5|xbox|joy-?con|dualsense|steam deck|rog ally|\bpsp\b|vita|console|quest 2/i,
  "Phones": /iphone|samsung|galaxy s|galaxy a|xiaomi|redmi|poco|oppo|vivo|realme|pixel|infinix|\bphone\b/i,
  "Tablets & Wearables": /ipad|tablet|galaxy tab|apple watch|smartwatch|galaxy watch|garmin|amazfit|kindle/i,
  "Laptops": /laptop|macbook|thinkpad|latitude|elitebook|chromebook|surface pro|notebook/i,
  "Monitors": /monitor|ultrawide|\b\d\dhz\b|\d\d ?inch/i,
  "Audio": /airpods|earbuds|headphone|headset|speaker|soundbar|buds|\biem\b|microphone interface|audio interface/i,
  "Cameras & Drones": /camera|\bdji\b|gopro|insta360|lens|tripod|drone|mirrorless/i,
  "Networking & Storage": /router|wifi|wi-fi|starlink|hard drive|\bhdd\b|\bnas\b|sd card|flash drive|raspberry|arduino|portable ssd/i,
  "Printers & 3D": /printer|3d print|ender 3|bambu|projector|laminator/i,
  "Smart Home & Power": /power bank|charger|smart tv|tv box|chromecast|vacuum|smart bulb|cctv|inverter|e-scooter|e-bike|power station/i,
  "Peripherals": /keyboard|mouse|webcam|stream deck|gaming chair|desk mat|wacom|\bups\b|hyperx|razer|logitech/i,
  "Desktops & Parts": /rtx|gtx|\brx \d|ryzen|\bi[3579]\b|ddr[45]|\bram\b|\bssd\b|nvme|motherboard|power supply|\bpsu\b|\bgpu\b|\bcpu\b|gaming pc|mini pc|mac mini|pc case|cooler/i,
};
const WANT = /\b(wtb|looking for|looking to buy|lf|iso|hanap|need to buy|want to buy|wanted|bibili ako)\b/i;
const SYS = `You help a Philippine tech reseller read second-hand listings and Facebook group posts. Reply with ONLY a JSON array, no prose.
For each input {i,kind,title,price,place,text,attrs} return {i,intent,name,brand,model,color,year,category,price,area,condition,specs,issues,issue_level,multi,quantity,warranty,receipt,reason,delivery,resale,demand,flag,summary}:
intent: "sell" (item for sale), "wanted" (someone wants to buy it) or "other" (not a sale or wanted post);
name: short lowercase product name, brand + model + key variant, max 5 words, identical for the same product;
brand: the brand or ""; model: exact model name or ""; color: or ""; year: release or purchase year as a number, else null;
category: one of ${CATS.join(", ")};
price: asking price (sell) or budget (wanted) in full pesos taken from the data (write 13k as 13000), null if not stated;
area: Philippine town or city named for pickup or location, else "";
condition: one of new, like new, good, fair, poor, unknown;
specs: up to 6 short strings such as "16GB RAM" taken only from the data;
issues: defects or problems stated, up to 4 short strings, empty if none;
issue_level: 0 none, 1 minor (scratches, missing box), 2 major (cracked, not working, needs repair);
multi: true if the post sells several different items;
resale: realistic used resale price in PHP for this exact product and condition, null if unsure;
demand: 0-100, how fast this sells on Philippine second-hand marketplaces;
flag: short reason if it looks like a scam, fake, parts-only or an advertisement, otherwise null;
quantity: number of units offered (default 1); warranty: remaining warranty or "" (e.g. "3 months"); receipt: true if a receipt, box or proof of purchase is mentioned; reason: why they are selling, or ""; delivery: meetup, shipping, both or unknown;
summary: one plain sentence under 140 characters describing what is offered.
Never invent specs. Never include phone numbers, emails or links.`;

export const providers = () => [
  { name: "gemini", key: process.env.GEMINI_API_KEY, url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", model: process.env.GEMINI_MODEL || "gemini-flash-lite-latest" },
  { name: "groq", key: process.env.GROQ_API_KEY, url: "https://api.groq.com/openai/v1/chat/completions", model: process.env.GROQ_MODEL || "openai/gpt-oss-120b" },
  { name: "openrouter", key: process.env.OPENROUTER_API_KEY, url: "https://openrouter.ai/api/v1/chat/completions", model: process.env.OPENROUTER_MODEL || "openrouter/free" },
].filter(p => p.key);

export function textPrice(t) {
  const m = /(?:₱|php|\bp)\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s?(k\b)?/i.exec(t || "") || /(\d{3,6})\s?(?:pesos|php|only)\b/i.exec(t || "");
  if (!m) return null;
  const v = +String(m[1]).replace(/,/g, "") * (m[2] ? 1000 : 1);
  return v > 0 ? v : null;
}
const strip = t => String(t || "").toLowerCase().replace(WANT, " ").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w && !["budget", "php", "pls", "po"].includes(w)).slice(0, 4).join(" ");
export function heuristic(l) {
  const text = `${l.title || ""} ${l.description || ""}`;
  const category = Object.keys(KW).find(k => KW[k].test(text)) || "Other";
  const intent = WANT.test(text) ? "wanted" : "sell";
  return { ...l, name: strip(l.title), brand: "", category, intent, price: l.price > 0 ? l.price : textPrice(l.description || l.title),
    area: "", conditionTxt: "unknown", specs: [], issues: [], issueLevel: 0, multi: false, model: "", color: "", year: null, quantity: 1, warranty: "", receipt: false, reason: "", delivery: "unknown", resale: null, aiResale: null, demand: 50, aiDemand: 50, flag: null, summary: "" };
}
const list = (v, n, len) => (Array.isArray(v) ? v : []).map(x => redact(x).slice(0, len)).filter(Boolean).slice(0, n);
export function norm(a, l) {
  const h = heuristic(l);
  const price = l.price > 0 ? l.price : (+a.price > 0 ? +a.price : h.price); // listing price always wins
  return { ...l, name: String(a.name || h.name).toLowerCase().slice(0, 60), brand: redact(a.brand).slice(0, 30), category: CATS.includes(a.category) ? a.category : h.category,
    intent: ["sell", "wanted", "other"].includes(a.intent) ? a.intent : h.intent, price: price || null,
    model: redact(a.model).slice(0, 40), color: redact(a.color).slice(0, 20), year: +a.year >= 1990 && +a.year <= 2030 ? +a.year : null, quantity: Math.min(99, Math.max(1, Math.round(+a.quantity) || 1)),
    warranty: redact(a.warranty).slice(0, 40), receipt: a.receipt === true, reason: redact(a.reason).slice(0, 100), delivery: ["meetup", "shipping", "both"].includes(a.delivery) ? a.delivery : "unknown",
    area: redact(a.area).slice(0, 40), conditionTxt: ["new", "like new", "good", "fair", "poor", "unknown"].includes(a.condition) ? a.condition : "unknown",
    specs: list(a.specs, 6, 40), issues: list(a.issues, 4, 60), issueLevel: [0, 1, 2].includes(+a.issue_level) ? +a.issue_level : 0, multi: a.multi === true,
    resale: a.resale > 0 ? +a.resale : null, aiResale: a.resale > 0 ? +a.resale : null, demand: Math.min(100, Math.max(0, +a.demand || 50)), aiDemand: Math.min(100, Math.max(0, +a.demand || 50)), flag: a.flag ? redact(a.flag).slice(0, 80) : null, summary: redact(a.summary).slice(0, 160) };
}
async function ask(p, payload) {
  const r = await fetch(p.url, { method: "POST", signal: AbortSignal.timeout(60000),
    headers: { "content-type": "application/json", authorization: `Bearer ${p.key}` },
    body: JSON.stringify({ model: p.model, temperature: 0, messages: [{ role: "system", content: SYS }, { role: "user", content: payload }] }) });
  if (!r.ok) throw new Error(`${p.name} HTTP ${r.status}`);
  const text = (await r.json()).choices?.[0]?.message?.content || "";
  const arr = JSON.parse(text.slice(text.indexOf("["), text.lastIndexOf("]") + 1));
  if (!Array.isArray(arr)) throw new Error(`${p.name} bad JSON`);
  return arr;
}
export async function enrich(items) {
  const provs = providers(), out = [];
  if (!provs.length) { console.log("No AI keys set: using keyword heuristics."); return items.map(heuristic); }
  for (let i = 0; i < items.length; i += 8) {
    const chunk = items.slice(i, i + 8);
    const payload = JSON.stringify(chunk.map((l, j) => ({ i: j, kind: l.kind || "listing", title: l.title, price: l.price ?? null, place: l.locationText || "",
      text: String(l.description || "").slice(0, 500), attrs: l.attributes ? JSON.stringify(l.attributes).slice(0, 200) : "" })));
    let arr = null;
    for (const p of provs) {
      try { arr = await ask(p, payload); break; }
      catch (e) { console.error("AI provider failed, trying next:", e.message); }
    }
    chunk.forEach((l, j) => { const a = arr?.find(x => x.i === j); out.push(a ? norm(a, l) : heuristic(l)); });
  }
  return out;
}

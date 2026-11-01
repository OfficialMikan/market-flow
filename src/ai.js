// Free multi-provider AI: tries each provider that has a key, in order, and falls through on any error.
const CATS = ["Gaming", "Computers", "Phones", "Home", "Supplies", "Fashion", "Other"];
const KW = {
  Gaming: /switch|ps4|ps5|xbox|joy-?con|controller|gaming/i,
  Computers: /laptop|keyboard|mouse|monitor|ssd|ram|gpu|\bpc\b/i,
  Phones: /iphone|samsung|xiaomi|redmi|phone|android|airpods|earbud/i,
  Home: /\bfan\b|rice cooker|aircon|\bref\b|\btv\b|oven|kettle/i,
  Supplies: /bulk|wholesale|\bpcs\b|dozen/i,
};
const SYS = `You help a Philippine reseller judge second-hand listings. Reply with ONLY a JSON array.
For each input {i,title,price,place} return {i,name,category,resale,demand,flag}:
name = short lowercase product name (brand + model, max 4 words) so identical products share a name;
category = one of ${CATS.join(", ")};
resale = realistic used resale price in PHP, or null if unsure;
demand = 0-100, how fast this sells on Philippine second-hand marketplaces;
flag = short reason if it looks like a scam, fake, or parts-only, otherwise null.`;

// All three expose an OpenAI-compatible chat endpoint and have a free tier. Models are overridable via env.
export const providers = () => [
  { name: "gemini", key: process.env.GEMINI_API_KEY, url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", model: process.env.GEMINI_MODEL || "gemini-flash-lite-latest" },
  { name: "groq", key: process.env.GROQ_API_KEY, url: "https://api.groq.com/openai/v1/chat/completions", model: process.env.GROQ_MODEL || "openai/gpt-oss-120b" },
  { name: "openrouter", key: process.env.OPENROUTER_API_KEY, url: "https://openrouter.ai/api/v1/chat/completions", model: process.env.OPENROUTER_MODEL || "openrouter/free" },
].filter(p => p.key);

export function heuristic(l) {
  const t = l.title || "";
  const category = Object.keys(KW).find(k => KW[k].test(t)) || "Other";
  const name = t.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean).slice(0, 4).join(" ");
  return { ...l, name, category, resale: null, demand: 50, flag: null };
}
async function ask(p, payload) {
  const r = await fetch(p.url, {
    method: "POST", signal: AbortSignal.timeout(45000),
    headers: { "content-type": "application/json", authorization: `Bearer ${p.key}` },
    body: JSON.stringify({ model: p.model, temperature: 0, messages: [{ role: "system", content: SYS }, { role: "user", content: payload }] }),
  });
  if (!r.ok) throw new Error(`${p.name} HTTP ${r.status}`);
  const text = (await r.json()).choices?.[0]?.message?.content || "";
  const arr = JSON.parse(text.slice(text.indexOf("["), text.lastIndexOf("]") + 1));
  if (!Array.isArray(arr)) throw new Error(`${p.name} bad JSON`);
  return arr;
}
export async function enrich(list) {
  const provs = providers(), out = [];
  if (!provs.length) { console.log("No AI keys set: using keyword heuristics."); return list.map(heuristic); }
  for (let i = 0; i < list.length; i += 15) {
    const chunk = list.slice(i, i + 15);
    const payload = JSON.stringify(chunk.map((l, j) => ({ i: j, title: l.title, price: l.price, place: l.locationText || "" })));
    let arr = null;
    for (const p of provs) {
      try { arr = await ask(p, payload); break; }
      catch (e) { console.error("AI provider failed, trying next:", e.message); }
    }
    chunk.forEach((l, j) => {
      const a = arr?.find(x => x.i === j), h = heuristic(l);
      out.push(a ? { ...l, name: String(a.name || h.name).toLowerCase(), category: CATS.includes(a.category) ? a.category : h.category,
        resale: a.resale > 0 ? +a.resale : null, demand: Math.min(100, Math.max(0, +a.demand || 50)), flag: a.flag || null } : h);
    });
  }
  return out;
}

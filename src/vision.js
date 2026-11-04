// Photo evaluation. Photos are downloaded here and sent as data to a vision-capable free model (Gemini by default).
import { providers } from "./ai.js";
import { redact } from "./pipeline.js";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36";
const VSYS = `You inspect photos of a second-hand item for a Philippine reseller. Reply with ONLY a JSON object:
{"condition":"new|like new|good|fair|poor|unknown","severity":0,"defects":[],"inclusions":[],"case_note":"","matches_description":true,"notes":""}
defects: only damage or wear you can actually see (scratches, cracks, dents, stains, burn marks, missing parts), max 6 short strings;
severity: 0 none, 1 minor cosmetic, 2 major (cracked, broken, missing key parts);
inclusions: accessories visible such as box, charger, cables, case or pouch, manual, receipt, max 6;
case_note: the case or housing if relevant (phone case or screen protector, carrying case, PC chassis type), else "";
matches_description: false only if the photos clearly contradict the description (different model, damage not mentioned);
notes: one short sentence. Never guess brands or specs you cannot see. Never include phone numbers or links.`;
// Gemini works out of the box. Groq/OpenRouter are used only if you name a vision model: GROQ_VISION_MODEL, OPENROUTER_VISION_MODEL.
export const visionProviders = () => providers().map(p => ({ ...p, model: process.env[`${p.name.toUpperCase()}_VISION_MODEL`] || (p.name === "gemini" ? p.model : null) })).filter(p => p.model);

export async function toDataUrl(url) {
  try {
    const r = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(15000) });
    const type = (r.headers?.get?.("content-type") || "").split(";")[0];
    if (!r.ok || !/^image\/(jpeg|png|webp)$/.test(type)) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    return buf.length > 0 && buf.length <= 1_500_000 ? `data:${type};base64,${buf.toString("base64")}` : null;
  } catch { return null; }
}
const list = (v, n, len) => (Array.isArray(v) ? v : []).map(x => redact(x).slice(0, len)).filter(Boolean).slice(0, n);
export function normVision(a) {
  if (!a || typeof a !== "object") return null;
  return { condition: ["new", "like new", "good", "fair", "poor", "unknown"].includes(a.condition) ? a.condition : "unknown", severity: [0, 1, 2].includes(+a.severity) ? +a.severity : 0,
    defects: list(a.defects, 6, 60), inclusions: list(a.inclusions, 6, 40), caseNote: redact(a.case_note).slice(0, 80), matches: a.matches_description !== false, notes: redact(a.notes).slice(0, 200) };
}
export async function inspect(l) {
  const urls = [...new Set([l.imageUrl, ...(l.images || [])].filter(u => /^https:\/\//.test(u || "")))].slice(0, 3);
  const imgs = (await Promise.all(urls.map(toDataUrl))).filter(Boolean);
  if (!imgs.length) return null;
  const text = `Title: ${l.title}\nDescription: ${String(l.description || "").slice(0, 600)}\nSpecs: ${(l.specs || []).join(", ")}`;
  for (const p of visionProviders()) {
    try {
      const r = await fetch(p.url, { method: "POST", signal: AbortSignal.timeout(60000), headers: { "content-type": "application/json", authorization: `Bearer ${p.key}` },
        body: JSON.stringify({ model: p.model, temperature: 0, messages: [{ role: "system", content: VSYS }, { role: "user", content: [{ type: "text", text }, ...imgs.map(u => ({ type: "image_url", image_url: { url: u } }))] }] }) });
      if (!r.ok) throw new Error(`${p.name} HTTP ${r.status}`);
      const t = (await r.json()).choices?.[0]?.message?.content || "";
      return normVision(JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)));
    } catch (e) { console.error("  vision provider failed, trying next:", e.message); }
  }
  return null;
}
export function mergeVision(l, v) {
  if (!v) return l;
  return { ...l, visionDone: true, defects: v.defects, inclusions: v.inclusions, caseNote: v.caseNote, photoNotes: v.notes, mismatch: !v.matches,
    issues: [...new Set([...(l.issues || []), ...v.defects])].slice(0, 8), issueLevel: Math.max(l.issueLevel || 0, v.severity, v.matches ? 0 : 1),
    conditionTxt: l.conditionTxt && l.conditionTxt !== "unknown" ? l.conditionTxt : v.condition };
}

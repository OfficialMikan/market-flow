import assert from "node:assert/strict";
import { haversine, dedupe, rank } from "./pipeline.js";
import { heuristic } from "./ai.js";
import { parse } from "./sources/scrape.js";
import * as mock from "./sources/mock.js";

const d = haversine(15.2147, 120.6586, 15.145, 120.5887);
assert.ok(d > 9 && d < 13, "distance " + d);
const p = parse({ url: "https://x/p/1", text: "Rina\nMechanical keyboard 75% RGB\n₱1,100\n2 days ago", img: "" });
assert.equal(p.price, 1100); assert.equal(p.title, "Mechanical keyboard 75% RGB");
const raw = [...await mock.search("a"), ...await mock.search("b")];
const u = dedupe(raw); assert.equal(u.length, raw.length / 2);
const ranked = rank(u.map(heuristic));
assert.equal(ranked[0].price, 1100, "cheapest keyboard should rank first");
assert.ok(ranked.every(r => !/tarlac/i.test(r.locationText)), "out-of-radius item must be dropped");
console.log("all tests passed");

// Fallback chain: first provider fails with 429, second answers.
process.env.GEMINI_API_KEY = "a"; process.env.GROQ_API_KEY = "b";
const realFetch = globalThis.fetch; let calls = [];
globalThis.fetch = async (url) => {
  calls.push(url);
  if (url.includes("generativelanguage")) return { ok: false, status: 429 };
  return { ok: true, json: async () => ({ choices: [{ message: { content: '```json\n[{"i":0,"name":"switch joy-con","category":"Gaming","resale":3300,"demand":90,"flag":null}]\n```' } }] }) };
};
const { enrich } = await import("./ai.js");
const e = await enrich([{ title: "Joy-Con pair", price: 2400 }]);
assert.equal(calls.length, 2); assert.equal(e[0].name, "switch joy-con"); assert.equal(e[0].resale, 3300);
globalThis.fetch = realFetch;
console.log("fallback test passed");

// Alerts: discord + ntfy both fire, deal marked alerted.
process.env.DISCORD_WEBHOOK_URL = "https://discord.test/hook"; process.env.NTFY_TOPIC = "t";
const { alertDeals } = await import("./alerts.js");
const hits = []; globalThis.fetch = async (url, o) => { hits.push([url, JSON.parse(o.body)]); return { ok: true }; };
let marked = null; const fakeSb = { from: () => ({ update: () => ({ in: async (_c, h) => { marked = h; } }) }) };
await alertDeals([{ hash: "h1", title: "Joy-Con", price: 2400, resale: 3300, marginPct: 26, demand: 90, distanceKm: 3, score: 88, url: "https://x/p/1" }], fakeSb);
assert.equal(hits.length, 2); assert.ok(hits[0][1].content.includes("₱2400")); assert.equal(hits[1][1].topic, "t"); assert.deepEqual(marked, ["h1"]);
globalThis.fetch = realFetch;
console.log("alerts test passed");

const { loadCustom } = await import("./sources/custom.js");
assert.ok(typeof loadCustom("sources.json").lazada.search === "function");
console.log("custom sources test passed");

// Apify source: maps items, skips sold, sends auth + PH input.
process.env.APIFY_TOKEN = "tok";
const apify = await import("./sources/apify.js");
let seen = null;
globalThis.fetch = async (url, o) => { seen = { url, o }; return { ok: true, json: async () => [
  { url: "https://www.carousell.ph/p/a-1/", title: "Switch OLED", price: 10500, imageUrl: "https://i/1.jpg", location: "Angeles", likesCount: 4, isSold: false, listedAt: "2026-11-01T01:00:00Z" },
  { url: "https://www.carousell.ph/p/b-2/", title: "Sold thing", price: 100, isSold: true }] }; };
const got = await apify.search("nintendo switch");
assert.equal(got.length, 1); assert.equal(got[0].locationText, "Angeles"); assert.equal(got[0].comments, 4);
assert.equal(seen.o.headers.authorization, "Bearer tok");
const sent = JSON.parse(seen.o.body); assert.equal(sent.country, "PH"); assert.deepEqual(sent.searchQueries, ["nintendo switch"]);
globalThis.fetch = realFetch;
console.log("apify test passed");

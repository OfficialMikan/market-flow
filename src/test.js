import assert from "node:assert/strict";
import { haversine, dedupe, rank, fixTinyPrices } from "./pipeline.js";
import { heuristic } from "./ai.js";
import { parse } from "./sources/scrape.js";
import * as mock from "./sources/mock.js";

const d = haversine(15.2147, 120.6586, 15.145, 120.5887);
assert.ok(d > 9 && d < 13, "distance " + d);
const p = parse({ url: "https://x/p/1", text: "Rina\nMechanical keyboard 75% RGB\n₱1,100\n2 days ago", img: "" });
assert.equal(p.price, 1100); assert.equal(p.title, "Mechanical keyboard 75% RGB");
const raw = [...await mock.search("a"), ...await mock.search("b")];
const u = dedupe(raw); assert.equal(u.length, raw.length / 2);
const ranked = rank(fixTinyPrices(u.map(heuristic)));
assert.equal(ranked.find(r => /iphone/i.test(r.title) && r.listedPrice).price, 13000, "the mock iPhone listed as 13 is repaired before ranking");
assert.equal(ranked.filter(r => r.intent !== "wanted")[0].price, 1100, "cheapest keyboard should rank first");
const tar = ranked.find(r => /tarlac/i.test(r.locationText)); assert.ok(tar && tar.distanceKm > 25 && tar.zone === "nearby", "listings past the old 25 km cutoff are kept and labeled");
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

// Facebook source + empty-run diagnostics
process.env.FB_LOCATION = "angeles-city";
const fb = await import("./sources/facebook.js");
let fbBody = null;
globalThis.fetch = async (url, o) => { fbBody = JSON.parse(o.body); return { ok: true, json: async () => [
  { listingUrl: "https://www.facebook.com/marketplace/item/1/", listingTitle: "PS5 controller", priceAmount: 1800, primaryPhotoUrl: "https://i/p.jpg", locationText: "Angeles, Pampanga", createdAt: "2026-11-01T02:00:00Z", isSold: false },
  { listingUrl: "https://www.facebook.com/marketplace/item/2/", listingTitle: "Free chair", priceAmount: 0 }] }; };
const fbr = await fb.search("ps5");
assert.equal(fbr.length, 1); assert.equal(fbr[0].lat, undefined); assert.ok(fbr[0].locationText.includes("Pampanga"));
assert.equal(fbBody.location, "angeles-city"); assert.equal(fbBody.searchKeyword, "ps5"); assert.equal(fbBody.radiusKm, 25);
delete process.env.FB_LOCATION; await assert.rejects(fb.search("x"), /FB_LOCATION/);
const errs = []; const origErr = console.error; console.error = (...a) => errs.push(a.join(" "));
globalThis.fetch = async (url) => url.includes("run-sync") ? { ok: true, json: async () => [] }
  : url.includes("/runs/last") ? { json: async () => ({ data: { id: "r1", status: "SUCCEEDED", statusMessage: "0 items", usageTotalUsd: 0.01 } }) }
  : { text: async () => "line one\nProxy error: residential not allowed\n" };
const { runActor } = await import("./sources/apifyCore.js");
assert.deepEqual(await runActor("a~b", {}), []);
console.error = origErr;
assert.ok(errs.some(e => e.includes("status=SUCCEEDED")) && errs.some(e => e.includes("Proxy error")), "diagnostics printed");
globalThis.fetch = realFetch;
console.log("facebook + diagnostics test passed");

// Tolerant mapping + unusable-items diagnostic
const ap = await import("./sources/apify.js");
assert.equal(ap.mapItem({ url: "https://c/p/1", title: "x", price: "PHP 1,200" }).price, 1200);
assert.equal(ap.mapItem({ listingUrl: "https://c/p/2", name: "y", priceFormatted: "₱2,500" }).price, 2500);
const e2 = []; const oe = console.error; console.error = (...a) => e2.push(a.join(" "));
process.env.APIFY_TOKEN = "t";
globalThis.fetch = async () => ({ ok: true, json: async () => [{ weird: "shape", cost: 5 }] });
assert.deepEqual(await ap.search("q"), []);
console.error = oe; globalThis.fetch = realFetch;
assert.ok(e2.some(e => e.includes("none were usable") && e.includes("weird")));
console.log("mapping test passed");

// v3: alert rules, sell speed, sold detection, budget guard
const { passesRules } = await import("./alerts.js");
const R = { minScore: 60, minMargin: 20, maxPrice: 5000, maxKm: 15 };
assert.ok(passesRules({ score: 70, marginPct: 25, price: 3000, distanceKm: 10 }, R));
assert.ok(!passesRules({ score: 70, marginPct: 10, price: 3000, distanceKm: 10 }, R));
assert.ok(!passesRules({ score: 70, marginPct: 25, price: 9000, distanceKm: 10 }, R));
assert.ok(!passesRules({ score: 70, marginPct: 25, price: 3000, distanceKm: 40 }, R));
assert.ok(passesRules({ score: 70, marginPct: 25, price: 3000, distanceKm: null }, R));
const { speedByName, findGone } = await import("./pipeline.js");
const day = 864e5, t0 = Date.now();
const srows = [1, 2, 3].map(d => ({ name: "switch oled", posted_at: new Date(t0 - d * day).toISOString(), removed_at: new Date(t0).toISOString() }));
assert.deepEqual(speedByName(srows), { "switch oled": 2 }); assert.deepEqual(speedByName(srows.slice(0, 2)), {});
const cand = [..."abcdefgh"].map(h => ({ hash: h }));
assert.deepEqual(findGone(cand, new Set([..."abcdef"])), ["g", "h"]); assert.equal(findGone(cand, new Set()), null);
const base = { name: "switch oled", price: 1000, resale: 1500, demand: 50, comments: 0, url: "u" };
const slow = rank([{ ...base }], 25, { speed: { "switch oled": 30 } })[0], fast = rank([{ ...base }], 25, { speed: { "switch oled": 1 } })[0];
assert.ok(fast.demand > slow.demand && fast.sellDays === 1);
const { markRemoved } = await import("./db.js");
const hit = []; const mk = data => { const q = { select: () => q, eq: () => q, is: () => q, gte: () => q, limit: () => q, update: () => q, in: (_c, h) => { hit.push(h); return q; }, then: res => res({ data, error: null }) }; return q; };
const gone = await markRemoved({ from: () => mk(cand) }, [{ source: "s", q: "x", oldest: "2026-01-01" }], new Set([..."abcdef"]));
assert.equal(gone, 2); assert.deepEqual(hit[0], ["g", "h"]);
const { checkBudget } = await import("./sources/apifyCore.js");
const lim = used => async () => ({ ok: true, json: async () => ({ data: { limits: { maxMonthlyUsageUsd: 5 }, current: { monthlyUsageUsd: used } } }) });
globalThis.fetch = lim(4.7); const b1 = await checkBudget(); assert.equal(b1.ok, false); assert.equal(b1.cap, 5);
globalThis.fetch = lim(1); assert.equal((await checkBudget()).ok, true);
globalThis.fetch = async () => ({ ok: false, status: 404 }); assert.equal((await checkBudget()).ok, true);
globalThis.fetch = realFetch;
console.log("v3 backend tests passed");

// ===== v4: buyer matching, privacy, details, groups, catalog =====
const P = await import("./pipeline.js"), A = await import("./ai.js"), Cat = await import("./catalog.js");
assert.ok(P.sameProduct("rtx 3060", "RTX 3060 graphics")); assert.ok(!P.sameProduct("rtx 3060", "rtx 3060 ti"), "ti is a different card");
assert.ok(!P.sameProduct("iphone 11", "iphone 12")); assert.ok(!P.sameProduct("switch oled", "switch lite")); assert.ok(P.sameProduct("iphone 11 128gb", "iphone 11 128gb"));
assert.equal(P.redact("Call 0917 123 4567 or +63 917-123-4567, mail a.b@x.com https://fb.com/x ₱1,200"), "Call or , mail ₱1,200");
assert.equal(P.sellerScore(null), null); assert.equal(P.sellerScore({ rating: 5, reviews: 100, tenureYears: 5 }), 100); assert.ok(P.sellerScore({ rating: 3, reviews: 2 }) < 60);
assert.equal(P.dedupe([{ url: "https://a/1", kind: "post" }, { url: "https://a/2", price: 0 }, { url: "https://a/3", price: 5 }]).length, 2, "posts may lack a price, listings may not");
assert.equal(A.textPrice("selling, price ₱1,800 only"), 1800); assert.equal(A.textPrice("php 2.5k"), 2500); assert.equal(A.textPrice("no price here"), null);
const nm = A.norm({ intent: "sell", name: "Switch OLED", category: "Gaming", price: 10500, specs: ["64GB", "call 09171234567"], issues: ["scratch on screen"], issue_level: 1, summary: "Switch OLED, light use. Text 09171234567" }, { title: "Switch", price: 10000 });
assert.equal(nm.name, "switch oled"); assert.equal(nm.price, 10000, "listing price beats the AI price"); assert.deepEqual(nm.specs, ["64GB", "call"]); assert.ok(!/0917/.test(nm.summary)); assert.equal(nm.issueLevel, 1);
const hw = A.heuristic({ title: "WTB RTX 3060", description: "looking for rtx 3060, budget php 12k" }); assert.equal(hw.intent, "wanted"); assert.equal(hw.price, 12000); assert.equal(hw.name, "rtx 3060");
// matching: supply <-> wanted, real sold price beats asking comps, issues cut the price, offer stays below ask
const sup = (n, price, extra = {}) => ({ url: "https://s/" + n + price, hash: "h" + price, title: n, name: n, price, intent: "sell", demand: 60, comments: 0, ...extra });
const want = { url: "https://w/1", hash: "w1", title: "WTB rtx 3060", name: "rtx 3060", intent: "wanted", price: 14000, kind: "post", demand: 70 };
const batch = [sup("rtx 3060", 9000), sup("rtx 3060", 11000), sup("rtx 3060", 12000), sup("rtx 3060", 12500), want];
const rk = rank(batch, 25, {});
const cheap = rk.find(r => r.price === 9000); assert.equal(cheap.confidence, "A"); assert.equal(cheap.sellBasis, "buyer"); assert.equal(cheap.matches[0].url, "https://w/1");
assert.ok(cheap.net > 1500 && cheap.net < 3000, "net " + cheap.net); assert.ok(cheap.offerPrice < 9000 && cheap.offerPrice >= 5400);
const wrow = rk.find(r => r.intent === "wanted"); assert.ok(wrow.matches.length >= 1 && wrow.matches[0].net > 0 && wrow.matches.every(m => m.net > 0));
const noBuyer = rank(batch.filter(r => r.intent !== "wanted"), 25, { soldPrice: { "rtx 3060": 11800 } }).find(r => r.price === 9000);
assert.equal(noBuyer.sellBasis, "sold"); assert.equal(noBuyer.confidence, "B"); assert.equal(noBuyer.sellPrice, 11800);
const dmg = rank([sup("rtx 3060", 9000, { issueLevel: 2 }), sup("rtx 3060", 9500), sup("rtx 3060", 10000), sup("rtx 3060", 10500)], 25, { soldPrice: { "rtx 3060": 11800 } });
assert.ok(dmg.find(r => r.price === 9000).net < noBuyer.net - 1500, "major issue cuts the expected resale");
assert.equal(P.soldMedianByName([1, 2, 3].map(i => ({ name: "x", price: 100 * i, removed_at: "2026-01-01" }))).x, 200);
// details selection, catalog rotation, group + fb + carousell mapping
const pool = [1000, 10000, 10000, 10000, 10000].map((p, i) => ({ source: "carousell_apify", q: "k", kind: "listing", price: p, url: "u" + i }));
assert.deepEqual(P.pickForDetails(pool, 3, ["carousell_apify"]).map(x => x.price), [1000]); assert.equal(P.pickForDetails(pool, 3, ["facebook_marketplace"]).length, 0);
const ql = Cat.buildQueryList(["Phones", "Gaming"]); assert.ok(ql.length >= 30 && ql[0] === "iphone 11" && ql[1] === "nintendo switch");
const s1 = Cat.pickSlice(ql, 0, 6), s2 = Cat.pickSlice(ql, s1.next, 6); assert.equal(s1.queries.length, 6); assert.equal(s2.queries[0], ql[6]);
assert.equal(Cat.pickSlice(ql, ql.length - 2, 4).queries[2], ql[0], "rotation wraps"); assert.ok(Cat.ALL_CATEGORIES.length >= 12);
const G = await import("./sources/groups.js"), F = await import("./sources/facebook.js"), Ap = await import("./sources/apify.js");
const gp = G.mapPost({ url: "https://www.facebook.com/groups/g/posts/1/", text: "Selling PS5 slim\nBrand new, ₱28,000 po. Angeles", time: "2026-11-01T01:00:00Z", user: { name: "Ana Cruz", profileUrl: "https://fb.com/ana" }, likesCount: 3 });
assert.equal(gp.kind, "post"); assert.equal(gp.title, "Selling PS5 slim"); assert.equal(gp.seller.name, "Ana Cruz"); assert.equal(gp.postedAt, "2026-11-01T01:00:00.000Z"); assert.equal(G.mapPost({ url: "u", text: "hi" }), null);
const fd = F.mapItem({ listingUrl: "https://fb/item/1", listingTitle: "GPU", priceAmount: 9000, description: "RTX 3060 12GB", condition: "Used - Good", sellerName: "Ben", sellerRatingAverage: 4.8, sellerRatingCount: 12, sellerJoinTime: "2019-01-01", listingPhotos: ["https://i/1.jpg", { url: "https://i/2.jpg" }], strikethroughPrice: "₱10,000" });
assert.equal(fd.seller.name, "Ben"); assert.equal(fd.images.length, 2); assert.equal(fd.oldPrice, 10000); assert.ok(fd.seller.tenureYears > 5);
const cd = Ap.mapItem({ url: "https://c/p/1", title: "Mac", price: 30000, description: "M1 8GB", seller: { username: "dealer1", url: "https://c/u/dealer1", rating: 4.9, reviewCount: 40, tenureYears: 3 }, isNegotiable: true, meetupLocation: "SM Clark" });
assert.equal(cd.seller.name, "dealer1"); assert.equal(cd.negotiable, true); assert.equal(cd.meetup, "SM Clark");
// save(): public table never gets seller names or descriptions; price drops are detected
const { save } = await import("./db.js");
const cap = { listings: [], listing_private: [], price_history: [] };
const oldRows = [{ hash: "h1", price: 2000, alerted: true, prev_price: null, price_drop_pct: 0 }];
const fsb = { from: t => ({ select: () => ({ in: async () => ({ data: oldRows, error: null }) }), upsert: async r => { cap[t].push(...r); return { error: null }; }, insert: async r => { cap[t].push(...r); return { error: null }; } }) };
const saved = await save(fsb, [{ hash: "h1", source: "s", url: "https://x/1", title: "Mac call 09171234567", price: 1500, name: "mac", intent: "sell", seller: { name: "Secret Seller", url: "https://p", rating: 4.5, reviews: 10 }, description: "private words 09171234567", matches: [{ url: "u", budget: 1 }], specs: ["8GB"], images: ["https://i/1.jpg", "http://bad"] }]);
assert.equal(saved[0].newDrop, 25); assert.equal(cap.listings[0].prev_price, 2000); assert.equal(cap.listings[0].price_drop_pct, 25);
assert.ok(!JSON.stringify(cap.listings).includes("Secret Seller") && !JSON.stringify(cap.listings).includes("private words"), "seller + description stay out of the public table");
assert.ok(!cap.listings[0].title.includes("0917")); assert.deepEqual(cap.listings[0].images, ["https://i/1.jpg"]);
assert.equal(cap.listing_private[0].seller_name, "Secret Seller"); assert.ok(cap.listing_private[0].seller_score > 0); assert.equal(cap.price_history[0].price, 1500);
console.log("v4 backend tests passed");

// ===== v5: price repair, fees, zones, photo check, group finder, known listings =====
{
const V = await import("./vision.js"), Dsc = await import("./discover.js"), Core = await import("./sources/apifyCore.js");
assert.equal(Core.toPrice("13k"), 13000); assert.equal(Core.toPrice("1.2k"), 1200); assert.equal(Core.toPrice("PHP 1,200"), 1200); assert.equal(Core.toPrice(13), 13);
const tp = (name, price, extra = {}) => ({ name, price, intent: "sell", category: "Phones", ...extra });
let fx = P.fixTinyPrices([tp("iphone 11", 13, { resale: 11000 }), tp("iphone 11", 9500), tp("iphone 11", 10500)]);
assert.equal(fx[0].price, 13000); assert.match(fx[0].priceNote, /Listed as 13, treated as ₱13,000/); assert.equal(fx[0].listedPrice, 13);
fx = P.fixTinyPrices([tp("iphone 11", 13), tp("iphone 11", 9500), tp("iphone 11", 10500)]); assert.equal(fx[0].price, 13000, "similar listings are enough evidence");
fx = P.fixTinyPrices([tp("phone case", 99, { resale: 150 })]); assert.equal(fx[0].price, 99, "a cheap accessory is left alone");
fx = P.fixTinyPrices([tp("rtx 3060", 13)]); assert.equal(fx[0].price, 13, "no evidence, no change");
fx = P.fixTinyPrices([tp("charger", 90, { resale: 1000 })]); assert.equal(fx[0].price, 90, "90,000 is far above a 1,000 estimate, so it is left alone");
fx = P.fixTinyPrices([tp("macbook", 5, { resale: 3000 })]); assert.equal(fx[0].price, 5000, "5,000 is plausible next to a 3,000 estimate");

fx = P.fixTinyPrices([tp("iphone 11", 13.5, { resale: 14000 })]); assert.equal(fx[0].price, 13500);
fx = P.fixTinyPrices([{ name: "switch oled", price: 14, intent: "wanted", resale: 12000 }]); assert.equal(fx[0].price, 14000, "wanted budgets are repaired too");
assert.equal(P.pickForDetails([{ source: "s", q: "a", kind: "listing", price: 100, url: "1" }, { source: "s", q: "a", kind: "listing", price: 200, url: "2" }], 5, ["s"], 1).length, 2, "details for every new listing, even in small searches");
// fees are configurable and the math follows them
const fb = [sup("rtx 3060", 9000), sup("rtx 3060", 11000), sup("rtx 3060", 12000), sup("rtx 3060", 12500)];
const lowFee = rank(fb, 25, { fees: { haggle: 1, fee: 0 } }).find(r => r.price === 9000), highFee = rank(fb, 25, { fees: { haggle: 10, fee: 5 } }).find(r => r.price === 9000);
assert.ok(lowFee.net > highFee.net + 1000, "higher fees reduce profit: " + lowFee.net + " vs " + highFee.net);
// far listings are kept, labeled by zone, and the zone limits come from settings
const zs = rank([sup("x thing", 1000, { distanceKm: null, lat: 14.6, lng: 120.98, geoPrecision: "town" }), sup("x thing", 1100, { lat: 15.2, lng: 120.66 })], 25, { near: 15, far: 50 });
assert.equal(zs.find(r => r.price === 1000).zone, "far"); assert.equal(zs.find(r => r.price === 1100).zone, "near");
assert.equal(rank([sup("x thing", 1000, { lat: 14.6, lng: 120.98 })], 25, { near: 15, far: 200 })[0].zone, "nearby", "zone limits are configurable");
// buyers carry their id so the dashboard can show who is asking
assert.ok(cheap.matches[0].hash === "w1", "buyer entries include the post id");
// known listings are restored instead of re-analysed
const rs = P.restore({ url: "u", price: 9000, title: "t", hash: "h" }, { name: "rtx 3060", category: "Desktops & Parts", specs: ["12GB"], issues: ["scratch"], issue_level: 1, ai_demand: 80, ai_resale: 11000, has_details: true, vision_done: true, geo_precision: "town", place: "Angeles", lat: 15.1, lng: 120.5, price: 9000 });
assert.ok(rs.enriched && rs.detailed && rs.visionDone && rs.demand === 80 && rs.aiResale === 11000 && rs.geoPrecision === "town" && rs.lat === 15.1);
assert.equal(P.restore({ url: "u", price: 9000 }, { name: "x", geo_precision: "none" }).geoPrecision, undefined, "unlocated listings are retried");
// photo check: images downloaded, sent to the vision model, result merged and cleaned
process.env.GEMINI_API_KEY = "g"; const reqs = [];
globalThis.fetch = async (url, o) => { reqs.push([url, o]);
  if (String(url).startsWith("https://img.test/")) return { ok: true, headers: { get: () => "image/jpeg" }, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
  return { ok: true, json: async () => ({ choices: [{ message: { content: 'sure {"condition":"good","severity":1,"defects":["scratch on screen","call 09171234567"],"inclusions":["box","charger"],"case_note":"tempered glass and case","matches_description":false,"notes":"Screen has a scratch."}' } }] }) }; };
const vr = await V.inspect({ title: "iPhone", description: "mint", imageUrl: "https://img.test/1.jpg", images: ["https://img.test/2.jpg", "http://insecure/3.jpg"] });
const body = JSON.parse(reqs.find(r => String(r[0]).includes("generativelanguage"))[1].body); const parts = body.messages[1].content;
assert.equal(parts.filter(p => p.type === "image_url").length, 2, "https photos only, as data"); assert.ok(parts[1].image_url.url.startsWith("data:image/jpeg;base64,"));
assert.deepEqual(vr.defects, ["scratch on screen", "call"]); assert.equal(vr.matches, false); assert.equal(vr.caseNote, "tempered glass and case");
const mg = V.mergeVision({ issues: ["battery 82%"], issueLevel: 0, conditionTxt: "unknown" }, vr); assert.deepEqual(mg.issues, ["battery 82%", "scratch on screen", "call"]); assert.equal(mg.issueLevel, 1); assert.equal(mg.mismatch, true); assert.equal(mg.conditionTxt, "good"); assert.equal(mg.visionDone, true);
assert.equal(await V.inspect({ title: "x", imageUrl: "http://insecure/1.jpg" }), null, "no usable photo, no call");
globalThis.fetch = async () => ({ ok: false, status: 500 }); assert.equal(await V.inspect({ title: "x", imageUrl: "https://img.test/1.jpg" }), null, "failures fall back quietly");
globalThis.fetch = realFetch; delete process.env.GEMINI_API_KEY;
assert.equal(V.visionProviders().length, 0); process.env.GROQ_API_KEY = "k"; assert.equal(V.visionProviders().length, 0, "groq needs a named vision model"); process.env.GROQ_VISION_MODEL = "m"; assert.equal(V.visionProviders().length, 1); delete process.env.GROQ_API_KEY; delete process.env.GROQ_VISION_MODEL;
// group finder
const gu = Dsc.groupUrls([{ organicResults: [{ url: "https://www.facebook.com/groups/PampangaBuySell/?ref=x" }, { url: "https://www.facebook.com/groups/feed/" }, { url: "https://example.com/x" }] }, { url: "https://m.facebook.com/groups/GadgetsPH/posts/1" }]);
assert.deepEqual(gu, ["https://www.facebook.com/groups/PampangaBuySell", "https://www.facebook.com/groups/GadgetsPH"]);
assert.ok(Dsc.discoveryQueries(["Magalang", "Angeles", "Arayat"]).length <= 6 && Dsc.discoveryQueries(["Magalang"])[0].includes("site:facebook.com/groups"));
const gp = (t, d = "") => ({ title: t, description: d });
const good = Dsc.scoreGroup([1, 2, 3, 4, 5, 6].map(i => gp("Selling PS5 ₱" + i + "000", "Angeles City meetup")), { lat: 15.2147, lng: 120.6586 }); assert.ok(good.score >= 0.45 && good.sellRatio === 1 && good.localRatio === 1, JSON.stringify(good));
const bad = Dsc.scoreGroup([1, 2, 3, 4, 5, 6].map(i => gp("Good morning everyone " + i, "pray for us")), { lat: 15.2147, lng: 120.6586 }); assert.ok(bad.score < 0.45);
assert.equal(Dsc.scoreGroup([], {}).score, 0);
process.env.APIFY_TOKEN = "t"; globalThis.fetch = async (u, o) => ({ ok: true, json: async () => String(u).includes("google") ? [{ organicResults: [{ url: "https://www.facebook.com/groups/x1" }] }] : [1, 2, 3, 4, 5].map(i => ({ url: "https://www.facebook.com/groups/x1/posts/" + i, text: "Selling gadget number " + i + " price ₱" + i + "000 Angeles", time: "2026-11-01T01:00:00Z" })) });
assert.deepEqual(await Dsc.discover({ lat: 15.2, lng: 120.6 }), ["https://www.facebook.com/groups/x1"]);
const ev = await Dsc.evaluate("https://www.facebook.com/groups/x1", { lat: 15.2147, lng: 120.6586 }); assert.equal(ev.status, "active"); assert.equal(ev.postsSeen, 5);
globalThis.fetch = async () => ({ ok: true, json: async () => [] }); assert.deepEqual((await Dsc.evaluate("https://www.facebook.com/groups/empty", {})).status, "rejected"); globalThis.fetch = realFetch;
// save(): new fields reach the right tables, coordinates are rounded in public and exact in private
const cap5 = { listings: [], listing_private: [], price_history: [] };
const fsb5 = { from: t => ({ select: () => ({ in: async () => ({ data: [], error: null }) }), upsert: async r => { cap5[t].push(...r); return { error: null }; }, insert: async r => { cap5[t].push(...r); return { error: null }; } }) };
await save(fsb5, [{ hash: "k1", source: "s", url: "https://x/9", title: "RTX", price: 13000, priceNote: "Listed as 13, treated as ₱13,000", listedPrice: 13, name: "rtx", intent: "sell", lat: 15.123456, lng: 120.654321, place: "Angeles", geoPrecision: "exact", model: "3060", year: 2022, receipt: true, delivery: "meetup",
  attributes: [{ name: "Storage", value: "12GB" }], defects: ["scratch"], inclusions: ["box"], caseNote: "case", photoNotes: "ok", mismatch: false, detailed: true, visionDone: true, aiDemand: 80, aiResale: 11000, seller: { name: "Sam" }, description: "desc" }]);
const L5 = cap5.listings[0]; assert.equal(L5.lat, 15.12); assert.equal(L5.lng, 120.65); assert.equal(L5.place, "Angeles"); assert.equal(L5.price_note, "Listed as 13, treated as ₱13,000"); assert.equal(L5.listed_price, 13);
assert.deepEqual(L5.extra, { Storage: "12GB" }); assert.equal(L5.has_details, true); assert.equal(L5.vision_done, true); assert.equal(L5.ai_resale, 11000); assert.equal(L5.has_receipt, true); assert.ok(!JSON.stringify(L5).includes("Sam") && !JSON.stringify(L5).includes("desc"));
assert.equal(cap5.listing_private[0].lat, 15.123456, "exact coordinates stay in the private table"); assert.equal(cap5.listing_private[0].seller_name, "Sam");
// known listings load with their private coordinates
const { loadKnown } = await import("./db.js");
const ksb = { from: t => { const q = { select: () => q, in: () => q, not: () => q, then: res => res({ data: t === "listings" ? [{ hash: "k1", name: "rtx", has_details: true }] : [{ hash: "k1", lat: 15.1, lng: 120.5 }], error: null }) }; return q; } };
const kn = await loadKnown(ksb, ["k1"]); assert.equal(kn.get("k1").lat, 15.1); assert.equal(kn.get("k1").has_details, true);
// a repaired price stays repaired when the scrape still says 13, so there is no false 99% price-drop alert
const rp = P.restore({ url: "u", price: 13 }, { name: "iphone 11", price: 13000, listed_price: 13, price_note: "Listed as 13, treated as ₱13,000" });
assert.equal(rp.price, 13000); assert.equal(rp.listedPrice, 13); assert.match(rp.priceNote, /treated as/);
assert.equal(P.restore({ url: "u", price: 9500 }, { name: "iphone 11", price: 13000, listed_price: 13 }).price, 9500, "a genuinely new price is respected");
console.log("v5 backend tests passed");
}

await import("./geo.test.js");

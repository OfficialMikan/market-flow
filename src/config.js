const env = (k, d) => process.env[k] || d;
export const CONFIG = {
  home: { name: env("HOME_NAME", "Magalang, Pampanga"), lat: +env("HOME_LAT", 15.2147), lng: +env("HOME_LNG", 120.6586) },
  radiusKm: +env("RADIUS_KM", 25),
  sources: env("SOURCES", process.env.APIFY_TOKEN ? "facebook_marketplace,facebook_groups" : "carousell").split(",").map(s => s.trim()).filter(Boolean),
  watch: env("WATCH", "").split(",").map(s => s.trim()).filter(Boolean),
  alertMinScore: +env("ALERT_MIN_SCORE", 60),
  categories: env("CATEGORIES", "").split(",").map(s => s.trim()).filter(Boolean),
  groups: env("FB_GROUPS", "").split(",").map(s => s.trim()).filter(Boolean),
  near: +env("NEAR_KM", 15), far: +env("FAR_KM", 50),   // zones: near, nearby, far (far listings are kept, just labeled)
  haggle: +env("HAGGLE_PCT", 5), fee: +env("FEE_PCT", 3), // 5% off for haggling + 3% platform, payment and handling costs
  detailMax: +env("DETAIL_MAX", 10), visionTopN: +env("VISION_TOP_N", 3), geocodeCap: +env("GEOCODE_CAP", 12),
  discoverEvery: +env("DISCOVER_DAYS", 7), discoverEval: +env("DISCOVER_EVAL", 2), maxGroups: +env("MAX_GROUPS", 4),
  perRun: +env("QUERIES_PER_RUN", 3),     // searches per scan, rotated through the catalog
  detailTopN: +env("DETAIL_TOP_N", 3),    // deals that get a full detail fetch (description, seller)
};
// Approximate town centers, used to estimate distance from a listing's place text.
export const TOWNS = {
  magalang: [15.2147, 120.6586], angeles: [15.145, 120.5887], mabalacat: [15.2236, 120.5731],
  "san fernando": [15.0286, 120.6898], mexico: [15.0667, 120.7167], arayat: [15.1469, 120.7694],
  porac: [15.0733, 120.5442], guagua: [14.9667, 120.6333], apalit: [14.9494, 120.758],
  bacolor: [14.999, 120.65], lubao: [14.9333, 120.6], clark: [15.1857, 120.546],
  tarlac: [15.4755, 120.5963], capas: [15.3361, 120.5886],
};

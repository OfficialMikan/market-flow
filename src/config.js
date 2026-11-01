const env = (k, d) => process.env[k] || d;
export const CONFIG = {
  home: { name: env("HOME_NAME", "Magalang, Pampanga"), lat: +env("HOME_LAT", 15.2147), lng: +env("HOME_LNG", 120.6586) },
  radiusKm: +env("RADIUS_KM", 25),
  sources: env("SOURCES", process.env.APIFY_TOKEN ? "facebook_marketplace,carousell_apify" : "carousell").split(",").map(s => s.trim()).filter(Boolean),
  watch: env("WATCH", "nintendo switch,iphone 11,mechanical keyboard,gaming mouse,laptop").split(",").map(s => s.trim()).filter(Boolean),
  alertMinScore: +env("ALERT_MIN_SCORE", 75),
};
// Approximate town centers, used to estimate distance from a listing's place text.
export const TOWNS = {
  magalang: [15.2147, 120.6586], angeles: [15.145, 120.5887], mabalacat: [15.2236, 120.5731],
  "san fernando": [15.0286, 120.6898], mexico: [15.0667, 120.7167], arayat: [15.1469, 120.7694],
  porac: [15.0733, 120.5442], guagua: [14.9667, 120.6333], apalit: [14.9494, 120.758],
  bacolor: [14.999, 120.65], lubao: [14.9333, 120.6], clark: [15.1857, 120.546],
  tarlac: [15.4755, 120.5963], capas: [15.3361, 120.5886],
};

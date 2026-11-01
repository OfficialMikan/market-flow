const env = (k, d) => process.env[k] || d;
export const CONFIG = {
  home: { name: env("HOME_NAME", "Magalang, Pampanga"), lat: +env("HOME_LAT", 15.2147), lng: +env("HOME_LNG", 120.6586) },
  radiusKm: +env("RADIUS_KM", 25),
  sources: env("SOURCES", process.env.APIFY_TOKEN ? "facebook_marketplace,carousell_apify" : "carousell").split(",").map(s => s.trim()).filter(Boolean),
  watch: env("WATCH", "nintendo switch,iphone 11,mechanical keyboard,gaming mouse,laptop").split(",").map(s => s.trim()).filter(Boolean),
  alertMinScore: +env("ALERT_MIN_SCORE", 75),
  // Weights and constants for ranking
  friction: +env(\"FRICTION\", 0.92), // haggling + fees
  weights: {
    demand: 0.45,
    margin: 0.35,
    proximity: 0.2,
  },
  demandWeights: {
    engagement: 0.35,
    base: 0.65,
  },
  engagementWeights: {
    comments: 5,
    likes: 4,
  },

};
// Approximate town centers, used to estimate distance from a listing's place text.
export const TOWNS = {
  magalang: [15.2147, 120.6586], angeles: [15.145, 120.5887], mabalacat: [15.2236, 120.5731],
  // AI Categories and Keywords
  aiCategories: [\"Gaming\", \"Computers\", \"Phones\", \"Home\", \"Supplies\", \"Fashion\", \"Other\"],
  aiKeywords: {
    Gaming: /switch|ps4|ps5|xbox|joy-?con|controller|gaming/i,
    Computers: /laptop|keyboard|mouse|monitor|ssd|ram|gpu|\\bpc\\b/i,
    Phones: /iphone|samsung|xiaomi|redmi|phone|android|airpods|earbud/i,
    Home: /\\bfan\\b|rice cooker|aircon|\\bref\\b|\\btv\\b|oven|kettle/i,
    Supplies: /bulk|wholesale|\\bpcs\\b|dozen/i,
  },

  "san fernando": [15.0286, 120.6898], mexico: [15.0667, 120.7167], arayat: [15.1469, 120.7694],
  porac: [15.0733, 120.5442], guagua: [14.9667, 120.6333], apalit: [14.9494, 120.758],
  bacolor: [14.999, 120.65], lubao: [14.9333, 120.6], clark: [15.1857, 120.546],
  tarlac: [15.4755, 120.5963], capas: [15.3361, 120.5886],
};

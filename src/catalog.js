// Tech-first search catalog. The scanner rotates through it a few searches per run so cost stays bounded.
export const CATALOG = {
  "Phones": ["iphone 11", "iphone 12", "iphone 13", "iphone 14", "iphone 15", "iphone xr", "samsung galaxy s21", "samsung galaxy s22", "samsung galaxy s23", "samsung galaxy a54", "samsung galaxy a34", "redmi note 12", "xiaomi 13t", "poco x5 pro", "poco f5", "oppo reno 8", "vivo v27", "realme gt", "google pixel 7", "infinix note 30"],
  "Tablets & Wearables": ["ipad 9th gen", "ipad air 5", "ipad pro 11", "ipad mini 6", "galaxy tab s8", "galaxy tab a8", "xiaomi pad 6", "apple watch series 8", "apple watch se", "galaxy watch 5", "garmin forerunner", "amazfit gts", "kindle paperwhite"],
  "Laptops": ["macbook air m1", "macbook air m2", "macbook pro m1", "thinkpad t480", "thinkpad x1 carbon", "dell latitude", "hp elitebook", "asus tuf gaming laptop", "asus rog laptop", "acer nitro 5", "lenovo legion", "msi gaming laptop", "surface pro", "chromebook", "gaming laptop rtx 3050", "gaming laptop rtx 3060"],
  "Desktops & Parts": ["rtx 3060", "rtx 3060 ti", "rtx 3070", "rtx 3080", "rtx 4060", "rtx 4070", "gtx 1660 super", "gtx 1650", "rx 6600", "rx 580", "ryzen 5 5600", "ryzen 5 3600", "ryzen 7 5800x3d", "ryzen 7 5700x", "i5 12400f", "i5 13400f", "i7 12700k", "ddr4 16gb ram", "ddr4 32gb ram", "ddr5 ram", "nvme ssd 1tb", "ssd 512gb", "samsung 970 evo", "b450 motherboard", "b550 motherboard", "a520 motherboard", "h610 motherboard", "650w power supply", "750w power supply", "pc case", "cpu cooler", "aio cooler", "gaming pc", "mini pc", "mac mini"],
  "Monitors": ["144hz monitor", "165hz monitor", "27 inch monitor", "24 inch monitor", "ultrawide monitor", "4k monitor", "curved monitor", "lg ultragear", "asus tuf monitor", "portable monitor"],
  "Peripherals": ["mechanical keyboard", "keychron", "logitech mx master", "logitech g502", "gaming mouse", "razer", "steelseries", "wireless keyboard", "webcam", "stream deck", "gaming chair", "desk mat", "microphone", "hyperx", "wacom tablet", "ups"],
  "Audio": ["airpods pro", "airpods 2", "airpods max", "sony wh-1000xm4", "sony wh-1000xm5", "jbl speaker", "jbl flip", "bose headphones", "galaxy buds", "gaming headset", "hyperx cloud", "soundbar", "bluetooth speaker", "audio interface", "iem"],
  "Gaming": ["nintendo switch", "nintendo switch oled", "nintendo switch lite", "joy-con", "ps5", "ps5 controller", "ps4 slim", "ps4 pro", "dualsense", "xbox series s", "xbox series x", "steam deck", "rog ally", "psp", "ps vita", "retro handheld", "meta quest 2", "switch games", "ps5 games", "ps4 games"],
  "Cameras & Drones": ["canon eos", "canon m50", "sony a6000", "sony a7", "fujifilm x100", "nikon d3500", "gopro hero", "dji mini", "dji mavic", "dji osmo", "insta360", "camera lens 50mm", "tripod", "ring light", "action camera"],
  "Networking & Storage": ["wifi 6 router", "tp-link router", "mesh wifi", "starlink", "external hard drive", "portable ssd", "nas", "network switch", "wifi extender", "sd card", "usb flash drive", "raspberry pi", "arduino"],
  "Smart Home & Power": ["power bank", "anker", "magsafe charger", "smart tv", "android tv box", "chromecast", "robot vacuum", "smart bulb", "security camera", "cctv", "inverter", "solar power station", "e-scooter", "e-bike"],
  "Printers & 3D": ["epson l3210", "epson ecotank", "canon pixma", "brother printer", "3d printer", "ender 3", "bambu lab", "label printer", "laminator", "projector"],
};
export const ALL_CATEGORIES = Object.keys(CATALOG);

// Round-robin across categories so any slice of the list covers a variety.
export function buildQueryList(categories = []) {
  const cats = (categories.length ? categories : ALL_CATEGORIES).filter(c => CATALOG[c]);
  const out = [], max = Math.max(0, ...cats.map(c => CATALOG[c].length));
  for (let i = 0; i < max; i++) for (const c of cats) if (CATALOG[c][i] && !out.includes(CATALOG[c][i])) out.push(CATALOG[c][i]);
  return out;
}
export function pickSlice(list, cursor, n) {
  if (n <= 0 || !list.length) return { queries: [], next: cursor || 0 };
  if (list.length <= n) return { queries: [...list], next: 0 };
  const start = (cursor || 0) % list.length, queries = [];
  for (let i = 0; i < n; i++) queries.push(list[(start + i) % list.length]);
  return { queries, next: (start + n) % list.length };
}

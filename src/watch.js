import { scan } from "./run.js";
const every = +(process.env.INTERVAL_MIN || 30) * 60000;
(async function loop() { try { await scan(); } catch (e) { console.error(e); } setTimeout(loop, every); })();

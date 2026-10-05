import { Innertube, Log } from "youtubei.js";
import { log } from "../utils.js";

Log.setLevel();

let engine = null;

export async function initYt(refresh = false) {
  if (engine && !refresh) return engine;
  log("Starting YouTube engine...", "highlight");
  try {
    const inst = await Innertube.create({
      lang: "en",
      location: "US",
      retrieve_player: false,
    });
    engine = inst;
    log("YouTube engine ready (youtubei.js)", "success");
  } catch (err) {
    log(`YouTube engine init failed: ${err.message}`, "error");
    throw err;
  }
  return engine;
}

export function getEngine() {
  if (!engine) throw new Error("YouTube engine not initialized");
  return engine;
}
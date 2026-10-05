import path from "node:path";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");

export const CONFIG = {
  projectRoot: PROJECT_ROOT,
  headless: true,
  defaultLocale: "id-ID",

  gm: {
    cookieFile: path.join(PROJECT_ROOT, "cookies", "googlemaps_cookies.json"),
    searchUrl: "https://www.google.com/maps/search",
    defaultLang: "id",
    navTimeout: 45000,
    waitAfterNav: 3000,
    delayMin: 1100,
    delayMax: 2300,
    scrollStepDelay: 900,
  },

  scan: {
    radiusKm: 8,
    zoom: 14,
    resultsPerQuery: 15,
    maxScrollRounds: 5,
    emptyRoundsStop: 2,
    checkpointDir: path.join(import.meta.dirname, "checkpoints"),
    outputDir: path.join(import.meta.dirname, "output"),
    titikFile: path.join(PROJECT_ROOT, "plan-fitur", "titik_kandidat.csv"),
    pilot: ["Buah Batu", "Kedaton"],
    queries: {
      defaults: ["pasta", "restoran italia"],
      daerah: {
        Lampung: ["spaghetti", "italian restaurant"],
        Jogja: ["italian restaurant"],
      },
    },
  },

  klasifikasi: {
    hargaBenchmarkOk: [20000, 50000],
    kategoriAllowlist: [
      /italian restaurant/i,
      /restoran( italia| italian)?/i,
      /pasta/i,
      /caf[eé]|coffee/i,
      /pizza/i,
      /western/i,
      /trattoria/i,
      /ristorante/i,
      /bistro/i,
      /restaurant/i,
      /bar/i,
    ],
    khususSellHint: "SKY Steak & Pasta",
    ownBrandName: /sky\s?(pasta|steak[\s&]*pasta)/i,
  },

  pamulang: {
    nama: "Pamulang (Home Base)",
    kota: "Tangerang Selatan",
    wilayah: "Jabodetabek",
    radiusKm: 8,
    queries: ["pasta", "restoran italia", "spaghetti", "italian restaurant"],
    placeFile: path.join(import.meta.dirname, "output", "pamulang", "place_sky_pasta_pamulang.json"),
    outDir: path.join(import.meta.dirname, "output", "pamulang"),
  },
};

export const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36",
];
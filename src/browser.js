import { chromium } from "playwright";
import { CONFIG, USER_AGENTS } from "./config.js";
import { loadCookies } from "./cookies.js";
import { log, randomDelay } from "./utils.js";

export async function createBrowser({
  headless = CONFIG.headless,
  cookieFile = CONFIG.cookieFile,
} = {}) {
  const userAgent =
    USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

  const browser = await chromium.launch({
    headless,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-infobars",
      "--window-size=1280,900",
    ],
  });

  const context = await browser.newContext({
    userAgent,
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    locale: CONFIG.defaultLocale,
    timezoneId: "Asia/Jakarta",
    extraHTTPHeaders: {
      "Accept-Language": "id-ID,id;q=0.9,en;q=0.8",
    },
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    Object.defineProperty(navigator, "languages", {
      get: () => ["id-ID", "id", "en"],
    });
  });

  const cookieResult = loadCookies(cookieFile);
  if (cookieResult.ok && cookieResult.cookies.length > 0) {
    await context.addCookies(cookieResult.cookies);
    log(
      `Cookies loaded (${cookieResult.cookies.length} total)${cookieResult.hasSession ? " with sessionid" : " WITHOUT sessionid"}`,
      cookieResult.hasSession ? "success" : "warn",
    );
  } else {
    log(`Cookie load failed: ${cookieResult.error}`, "warn");
  }

  const page = await context.newPage();
  return { browser, context, page };
}

export function setupResponseCapture(page) {
  const captured = {
    comments: [],
    replies: [],
    search: [],
  };

  page.on("response", async (response) => {
    const url = response.url();

    if (url.includes("/api/comment/list/reply/")) {
      try {
        const body = await response.json();
        captured.replies.push({ url, body, time: Date.now() });
      } catch {}
      return;
    }

    if (url.includes("/api/comment/list/")) {
      try {
        const body = await response.json();
        captured.comments.push({ url, body, time: Date.now() });
      } catch {}
      return;
    }

    if (
      url.includes("/api/search/") ||
      url.includes("/api/challenge/item_list/") ||
      url.includes("/api/challenge/item/list/") ||
      url.includes("/api/item_list/")
    ) {
      try {
        const body = await response.json();
        captured.search.push({ url, body, time: Date.now() });
      } catch {}
    }
  });

  return captured;
}

export async function installApiHook(page) {
  await page.addInitScript(() => {
    if (window.__ttCaptureInstalled) return;
    window.__ttCaptureInstalled = true;
    window.__ttCapture = [];

    const shouldCapture = (url) =>
      /\/api\/(challenge\/item_list|challenge\/item\/list|item_list|search\/|comment\/list)/i.test(
        url,
      );

    const record = async (url, getBody) => {
      if (!shouldCapture(url)) return;
      try {
        const body = await getBody();
        window.__ttCapture.push({ url, body, time: Date.now() });
      } catch {}
    };

    const origFetch = window.fetch;
    window.fetch = async (...args) => {
      const url = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
      const resp = await origFetch(...args);
      if (resp && resp.ok) {
        const clone = resp.clone();
        record(url, () => clone.json());
      }
      return resp;
    };

    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
      this.__ttUrl = url;
      return origOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function (...args) {
      this.addEventListener("load", () => {
        if (this.status >= 200 && this.status < 300) {
          const url = this.__ttUrl || "";
          record(url, async () => JSON.parse(this.responseText));
        }
      });
      return origSend.apply(this, args);
    };
  });
}

export async function drainApiCapture(page, pattern = /search\/|challenge\/item_list|item_list/) {
  if (!page) return [];
  const drained = await page.evaluate((pat) => {
    const entries = window.__ttCapture || [];
    const re = new RegExp(pat);
    const matches = entries.filter((e) => re.test(e.url));
    const rest = entries.filter((e) => !re.test(e.url));
    window.__ttCapture = rest;
    return matches;
  }, pattern.source ?? pattern);
  return drained || [];
}

export function isLoginWallOrCaptcha(page) {
  return page.evaluate(() => {
    const text = document.body?.innerText?.toLowerCase() || "";
    const hasCaptchaWord = /verify|captcha|robot|prove you'?re human/i.test(text);
    const hasLoginWall = /log in to continue|you need to log in/i.test(text);
    return { hasCaptchaWord, hasLoginWall };
  });
}

export async function detectBlocked(page) {
  const { hasCaptchaWord, hasLoginWall } = await isLoginWallOrCaptcha(page);
  if (hasCaptchaWord) {
    log("CAPTCHA / verification challenge detected!", "error");
    return { blocked: true, reason: "captcha" };
  }
  if (hasLoginWall) {
    log("Login wall detected — cookies may have expired!", "error");
    return { blocked: true, reason: "login_wall" };
  }
  return { blocked: false, reason: null };
}

export async function scrollPage(page, steps = 5, delayMin, delayMax) {
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, 1200);
    await randomDelay(delayMin ?? CONFIG.scrollStepDelay, delayMax ?? CONFIG.scrollStepDelay + 400);
    await page.waitForTimeout(300);
  }
}

export async function resetPage(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(1500);
}
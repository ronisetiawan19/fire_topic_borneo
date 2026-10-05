import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { CONFIG, USER_AGENTS } from "../config.js";

export function log(msg, level = "info") {
  const colors = {
    info: "\x1b[36m",
    success: "\x1b[32m",
    warn: "\x1b[33m",
    error: "\x1b[31m",
    highlight: "\x1b[35m",
  };
  const label = {
    info: "INFO",
    success: "OK",
    warn: "WARN",
    error: "ERR!",
    highlight: "==>",
  }[level] || "INFO";
  console.log(`\x1b[90m${new Date().toISOString().slice(11, 19)}\x1b[0m ${colors[level]}[${label}]\x1b[0m ${msg}`);
}

export async function randomDelay(min = CONFIG.gm.delayMin, max = CONFIG.gm.delayMax) {
  const d = min + Math.random() * Math.max(0, max - min);
  await new Promise((r) => setTimeout(r, d));
}

export function todayStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function sanitizeFilename(name) {
  return String(name)
    .replace(/[/\\:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 80);
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQ = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQ = true;
    } else if (c === ",") {
      row.push(cur);
      cur = "";
    } else if (c === "\n") {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
    } else if (c !== "\r") {
      cur += c;
    }
  }
  if (cur.length || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

export function parseCsvObjects(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const o = {};
    header.forEach((h, i) => {
      o[h] = (r[i] ?? "").trim();
    });
    return o;
  });
}

export function loadCookies(cookieFile) {
  const cookiePath = path.resolve(cookieFile);
  if (!existsSync(cookiePath)) {
    return { ok: false, error: `Cookie file not found: ${cookiePath}` };
  }
  try {
    const raw = JSON.parse(readFileSync(cookiePath, "utf-8"));
    if (!Array.isArray(raw)) {
      return { ok: false, error: "Cookie file must be a JSON array" };
    }
    const cookies = raw.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain || ".google.com",
      path: c.path || "/",
      httpOnly: c.httpOnly ?? false,
      secure: c.secure ?? true,
      sameSite: c.sameSite || "Lax",
      ...(c.expires && c.expires > 0 ? { expires: c.expires } : {}),
    }));
    const names = cookies.map((c) => c.name);
    return {
      ok: true,
      cookies,
      hasNid: names.includes("NID"),
      cookieNames: names,
    };
  } catch (err) {
    return { ok: false, error: `Failed to parse cookie file: ${err.message}` };
  }
}

export async function createBrowser({ headless = CONFIG.headless, cookieFile = CONFIG.gm.cookieFile } = {}) {
  const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
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
      `Cookies Google Maps dimuat (${cookieResult.cookies.length} total)${cookieResult.hasNid ? " [NID ada]" : " [TANPA NID!]"}`,
      cookieResult.hasNid ? "success" : "warn",
    );
  } else {
    log(`Cookie load gagal: ${cookieResult.error}`, "warn");
  }

  const page = await context.newPage();
  return { browser, context, page };
}

export async function dismissConsent(page) {
  try {
    if (page.url().includes("consent.google.com")) {
      await page.evaluate(() => {
        const btns = Array.from(
          document.querySelectorAll("button, form[action] input[type=submit]"),
        );
        const agree = btns.find((b) =>
          /setuju|agree|accept all|^accept|ya, saya setuju|i agree|saya setuju/i.test(
            (b.innerText || b.value || "").trim(),
          ),
        );
        if (agree) agree.click();
      });
      await page.waitForTimeout(3500);
      await page.goto(page.url(), { waitUntil: "domcontentloaded" }).catch(() => {});
    }
    const banner = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const agree = btns.find((b) =>
        /setuju|saya setuju|^agree$|^accept all$|^i agree$/i.test((b.innerText || "").trim()),
      );
      if (agree) {
        agree.click();
        return true;
      }
      return false;
    });
    if (banner) await page.waitForTimeout(1200);
  } catch {}
  return true;
}

export async function detectBlockedOnPage(page) {
  try {
    const status = await page.evaluate(() => {
      const text = document.body?.innerText?.toLowerCase() || "";
      return {
        captcha: /verify|unusual traffic|prove you'?re human|captcha/i.test(text),
        consent: /sebelum melanjutkan|before you continue|consent/i.test(text),
      };
    });
    if (status.captcha) {
      log("Google CAPTCHA / unusual traffic terdeteksi!", "error");
      return { blocked: true, reason: "captcha" };
    }
    return { blocked: false, reason: null };
  } catch {
    return { blocked: false, reason: null };
  }
}

export async function gotoGm(page, url, lang = CONFIG.gm.defaultLang, { retries = 3 } = {}) {
  const sep = url.includes("?") ? "&" : "?";
  let lastErr = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await page.goto(`${url}${sep}hl=${lang}`, {
        waitUntil: "domcontentloaded",
        timeout: CONFIG.gm.navTimeout,
      });
      await page.waitForTimeout(CONFIG.gm.waitAfterNav);
      await dismissConsent(page);
      await page.waitForTimeout(1000);
      return detectBlockedOnPage(page);
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        log(`goto gagal (${attempt}/${retries}): ${err.message.split("\n")[0]} — coba lagi...`, "warn");
        await randomDelay(1800, 3200);
      }
    }
  }
  throw lastErr;
}
import { delay, log } from "../utils.js";

export const TW_OPERATIONS = [
  "SearchTimeline",
  "UserTweets",
  "UserByScreenName",
  "UserByRestId",
  "TweetDetail",
  "TweetResultByRestId",
];

export async function installApiHook(page) {
  await page.addInitScript(() => {
    if (window.__xCaptureInstalled) return;
    window.__xCaptureInstalled = true;
    window.__xCapture = [];

    const parseOp = (url) => {
      const m = String(url).match(
        /\/i\/api\/graphql\/[A-Za-z0-9_.-]+\/([A-Za-z0-9]+)/,
      );
      return m ? m[1] : "";
    };

    const record = async (url, getBody) => {
      const op = parseOp(url);
      if (!op) return;
      try {
        const body = await getBody();
        if (body && !body.errors) {
          window.__xCapture.push({ url, op, body, time: Date.now() });
        }
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
      this.__xUrl = url;
      return origOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function (...args) {
      this.addEventListener("load", () => {
        if (this.status >= 200 && this.status < 300) {
          const url = this.__xUrl || "";
          record(url, async () => JSON.parse(this.responseText));
        }
      });
      return origSend.apply(this, args);
    };
  });
}

export async function drainApiCapture(page, operationNames) {
  if (!page) return [];
  const ops = Array.isArray(operationNames)
    ? operationNames
    : [operationNames];
  try {
    const drained = await page.evaluate((ops) => {
      const entries = window.__xCapture || [];
      const matches = entries.filter((e) => e.op && ops.includes(e.op));
      window.__xCapture = entries.filter((e) => !ops.includes(e.op));
      return matches;
    }, ops);
    return drained || [];
  } catch {
    return [];
  }
}

export async function waitForApiCapture(page, operationNames, timeoutMs = 15000) {
  const ops = Array.isArray(operationNames)
    ? operationNames
    : [operationNames];
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = await page
      .evaluate((ops) => {
        const entries = window.__xCapture || [];
        return entries.some((e) => e.op && ops.includes(e.op));
      }, ops)
      .catch(() => false);
    if (found) return true;
    await delay(1000);
  }
  return false;
}

export async function gotoX(page, url) {
  log(`Opening ${url}`, "highlight");
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(2500);
}
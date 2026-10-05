export async function installGmHook(page) {
  await page.addInitScript(() => {
    if (window.__gmCaptureInstalled) return;
    window.__gmCaptureInstalled = true;
    window.__gmCapture = [];

    const shouldCapture = (url) =>
      /\/batchexecute|\/rpcs\/|\.google\.com\/_\/maps/i.test(url);

    const record = async (url, getBody) => {
      if (!shouldCapture(url)) return;
      try {
        const body = await getBody();
        window.__gmCapture.push({ url, body, time: Date.now() });
      } catch {}
    };

    const origFetch = window.fetch;
    window.fetch = async (...args) => {
      const url = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
      const resp = await origFetch(...args);
      if (resp && resp.ok && shouldCapture(url)) {
        const clone = resp.clone();
        record(url, () => clone.text());
      }
      return resp;
    };

    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
      this.__gmUrl = url;
      return origOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function (...args) {
      this.addEventListener("load", () => {
        if (this.status >= 200 && this.status < 300) {
          const url = this.__gmUrl || "";
          if (!shouldCapture(url)) return;
          record(url, async () => this.responseText);
        }
      });
      return origSend.apply(this, args);
    };
  });
}

export async function drainGmCapture(page, pattern = /batchexecute|rpcs/) {
  if (!page) return [];
  try {
    const drained = await page.evaluate((pat) => {
      const entries = window.__gmCapture || [];
      const re = new RegExp(pat);
      const matches = entries.filter((e) => re.test(e.url));
      window.__gmCapture = entries.filter((e) => !re.test(e.url));
      return matches;
    }, pattern.source ?? pattern);
    return (drained || []).slice(-20);
  } catch {
    return [];
  }
}
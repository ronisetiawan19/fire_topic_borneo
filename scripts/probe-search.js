const BASE = "https://gofood.co.id";

async function main() {
  const jar = new Map();
  const headers = {
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36",
    accept: "application/json,text/html,*/*",
    "accept-language": "id-ID,id;q=0.9,en;q=0.8",
  };

  async function get(url) {
    const res = await fetch(url, { headers, redirect: "manual" });
    const c = res.headers.get("set-cookie");
    if (c) {
      for (const pair of c.split(/,(?=\w+=)/)) {
        const [k, v] = pair.split(";")[0].split("=");
        if (k) jar.set(k.trim(), v);
      }
    }
    return res;
  }

  const h0 = await get(BASE + "/");
  console.log("home:", h0.status, "cookies:", [...jar.keys()]);

  const h1 = await get(BASE + "/api/csrf");
  console.log("csrf:", h1.status);
  const csrfBody = await h1.text();
  console.log("csrf body:", csrfBody.slice(0, 400));
  let token = null;
  try {
    const j = JSON.parse(csrfBody);
    token = j?.data?.csrfToken ?? j?.csrfToken ?? j?.csrf ?? j?.token ?? null;
  } catch {}
  console.log("token:", token);

  const cookieStr = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");

  for (const body of [
    JSON.stringify({ q: "sky pasta" }),
    JSON.stringify({ keyword: "sky pasta", offset: 0, limit: 10 }),
  ]) {
    const res = await fetch(BASE + "/api/outlets/search", {
      method: "POST",
      headers: {
        ...headers,
        "content-type": "application/json",
        "x-csrf-token": token || "",
        "x-requested-with": "XMLHttpRequest",
        "x-location": "-6.289859566636911,106.63389042302078",
        cookie: cookieStr,
      },
      body,
    });
    const text = await res.text();
    console.log("\nPOST outlets/search ->", res.status, "len", text.length);
    console.log(text.slice(0, 3000));
  }
}

main().catch((e) => console.error(e));
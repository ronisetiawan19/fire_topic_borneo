#!/usr/bin/env bun
const urls = ["https://gofood.link/u/OjRp", "https://gofood.link/u/51zOQ"];
for (const u of urls) {
  try {
    const r = await fetch(u, { redirect: "manual", headers: { "User-Agent": "Mozilla/5.0" } });
    console.log(`[${u}] status=${r.status} loc=${r.headers.get("location")}`);
  } catch (e) {
    console.log(`[${u}] ERR ${e.message}`);
  }
}
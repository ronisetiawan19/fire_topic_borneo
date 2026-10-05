export async function collectTweetsFromDom(page, { skipPinned = false } = {}) {
  try {
    const tweets = await page.evaluate((skipPinned) => {
      const parseCount = (txt) => {
        if (!txt) return 0;
        const m = String(txt)
          .toLowerCase()
          .match(/([\d.,]+)\s*([kmb])?/);
        if (!m) return 0;
        let n = parseFloat(m[1].replace(",", "."));
        if (m[2] === "k") n *= 1e3;
        if (m[2] === "m") n *= 1e6;
        if (m[2] === "b") n *= 1e9;
        return Math.round(n);
      };

      const text = (el) => (el?.textContent || "").trim();
      const articles = Array.from(
        document.querySelectorAll('article[data-testid="tweet"]'),
      );

      const out = [];
      for (const a of articles) {
        const full = text(a);
        if (skipPinned && /^Pinned\b/.test(full)) continue;

        const link = a.querySelector('a[href*="/status/"]');
        const href = link?.getAttribute("href") || "";
        const statusM = href.match(/\/status\/(\d+)/);
        const tweet_id = statusM ? statusM[1] : "";
        if (!tweet_id) continue;

        const userM = href.match(/^\/([^/]+)\/status\//);
        const author = userM ? userM[1] : "";

        const userRep = a.querySelector('[data-testid="User-Name"]');
        const nameSpans = userRep
          ? Array.from(userRep.querySelectorAll("span"))
          : [];
        const nameTexts = nameSpans
          .map((s) => s.textContent?.trim() || "")
          .filter(Boolean);
        const nickname =
          nameTexts[0] && !nameTexts[0].startsWith("@") ? nameTexts[0] : "";

        const timeEl = a.querySelector("time[datetime]");
        const created_at = timeEl?.getAttribute("datetime") || "";

        const textEl = a.querySelector('[data-testid="tweetText"]');
        const tweetText = textEl?.innerText || "";

        const countText = (sel) =>
          text(a.querySelector(`${sel} span[data-testid="app-text-transition-container"]`));
        const replies = parseCount(countText('[data-testid="reply"]'));
        const retweets = parseCount(countText('[data-testid="retweet"]'));
        const likes = parseCount(countText('[data-testid="like"]'));

        let views = 0;
        const viewEl = Array.from(a.querySelectorAll("span")).find((s) =>
          /views/i.test(s.textContent || ""),
        );
        const viewM = (viewEl?.textContent || "").match(
          /([\d.,]+[KMB]?)\s*views/i,
        );
        if (viewM) views = parseCount(viewM[1]);

        const socialCtx = text(a.querySelector('[data-testid="socialContext"]'));
        const is_retweet = /reposted|repeat/i.test(socialCtx);

        const media = Array.from(
          a.querySelectorAll('img[src*="pbs.twimg.com/media/"]'),
        ).map((img) => ({ type: "photo", url: img.getAttribute("src") || "" }));

        out.push({
          tweet_id,
          text: tweetText,
          author,
          nickname,
          user_id: "",
          created_at,
          likes,
          retweets,
          replies,
          quotes: 0,
          views,
          is_retweet,
          retweeted: is_retweet,
          is_quote: false,
          quoted_text: "",
          media,
          in_reply_to: "",
          url: `https://x.com${href}`,
          lang: "",
          type: "tweet",
          source: "dom",
        });
      }
      return out;
    }, skipPinned);
    return tweets || [];
  } catch {
    return [];
  }
}

export async function parseUserFromDom(page, fallbackUsername) {
  try {
    return await page.evaluate((fb) => {
      const href =
        document
          .querySelector('[data-testid="UserName"] a')
          ?.getAttribute("href")
          ?.replace(/^\//, "") || fb;
      const nickname =
        document.querySelector(
          '[data-testid="UserName"] span[dir="ltr"]',
        )?.textContent || "";
      return {
        user_id: "",
        username: href,
        nickname,
        bio: "",
        followers: 0,
        following: 0,
        tweets_count: 0,
        verified: false,
        blue_verified: false,
        location: "",
        joined: "",
        profile_image: "",
        url: `https://x.com/${href}`,
      };
    }, fallbackUsername);
  } catch {
    return null;
  }
}
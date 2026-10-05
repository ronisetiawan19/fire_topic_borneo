# Dokumentasi twitter-scraper

Twitter/X scraper — **3 subcommand** + **opsi global**.
Berjalan di atas **Playwright (browser)** secara default — browser memuat session dari `cookies/twitter_cookies.json`, menangkap respons GraphQL X, dan membaca tweet dari DOM. Mode `api` (GraphQL langsung) tetap tersedia sebagai fallback.

```
twitter-scraper [opsi global] <command> [opsi command] <input...>
```

> **Syarat wajib:** isi `cookies/twitter_cookies.json` dengan cookie `auth_token` dan `ct0` dari akun X Anda (lihat bagian [Persiapan cookie](#persiapan-cookie)).

---

## Opsi Global

Berlaku untuk semua command, diletakkan sebelum nama command.

| Opsi | Fungsi | Nilai yang diterima | Default |
|---|---|---|---|
| `-V, --version` | Menampilkan versi tool | — | — |
| `-o, --output <dir>` | Menentukan folder penyimpanan hasil | path folder | `output/twitter` |
| `-f, --format <format>` | Format file output | `json`, `csv`, atau `both` | `json` |

Contoh:

```
twitter-scraper -o hasil -f both scrape "review"
```

---

## Command 1 — `scrape` (berdasarkan keyword / hashtag)

```
twitter-scraper scrape <keywords...>
```

Scraping tweet berdasarkan **keyword** (`"review"`) atau **hashtag** (`#fyp`).
Bisa menerima **lebih dari satu keyword** sekaligus.

| Opsi | Fungsi | Nilai yang diterima | Default |
|---|---|---|---|
| `<keywords...>` | Satu atau lebih keyword / hashtag | `"review"` `#fyp` dll. | wajib |
| `-l, --limit <n>` | Maksimal jumlah tweet yang discrape per keyword | angka | `20` |
| `-p, --product <type>` | Jenis hasil pencarian | `top`, `latest`, `media` | `top` |
| `-m, --mode <api\|browser>` | Engine scraping | `api` / `browser` | `browser` |

### Contoh penggunaan

```bash
# Dasar — 1 keyword, 20 tweet (default)
twitter-scraper scrape "review"

# Hashtag
twitter-scraper scrape "#fyp"

# Beberapa keyword sekaligus
twitter-scraper scrape "review" "makanan"

# Batasi jumlah tweet
twitter-scraper scrape "review" -l 10

# Hasil terbaru (Latest)
twitter-scraper scrape "review" -p latest

# Fallback engine API (GraphQL langsung)
twitter-scraper scrape "review" -m api

# Kombinasi lengkap — JSON + CSV, hasil terbaru, 5 tweet, kata "review"
twitter-scraper scrape "review" -l 5 -p latest -f both
```

---

## Command 2 — `user` (berdasarkan profil akun)

```
twitter-scraper user <usernames...>
```

Scraping tweet dari **satu atau lebih profil pengguna** (dengan atau tanpa `@`).

| Opsi | Fungsi | Nilai yang diterima | Default |
|---|---|---|---|
| `<usernames...>` | Satu atau lebih username | `elonmusk` `@elonmusk` dll. | wajib |
| `-l, --limit <n>` | Maksimal jumlah tweet yang discrape per user | angka | `20` |
| `-m, --mode <api\|browser>` | Engine scraping | `api` / `browser` | `browser` |

### Contoh penggunaan

```bash
# Dasar — 1 user, 20 tweet (default)
twitter-scraper user elonmusk

# Dengan @ di depan
twitter-scraper user @elonmusk

# Beberapa user sekaligus
twitter-scraper user elonmusk "vercel"

# Batasi jumlah tweet
twitter-scraper user elonmusk -l 10

# Kombinasi lengkap — JSON + CSV, 5 tweet dari 2 user
twitter-scraper user elonmusk vercel -l 5 -f both
```

---

## Command 3 — `url` (berdasarkan link tweet langsung)

```
twitter-scraper url <urls...>
```

Scraping **satu tweet beserta balasannya (replies)** dari **satu atau lebih URL tweet**.
ID tweet diekstrak otomatis dari URL (format `x.com` maupun `twitter.com`).

| Opsi | Fungsi | Nilai yang diterima | Default |
|---|---|---|---|
| `<urls...>` | Satu atau lebih URL tweet | `https://x.com/user/status/123...` | wajib |
| `--no-replies` | Melewati pengambilan balasan (reply), hanya tweet utama | flag (tanpa nilai) | balasan diambil |
| `--max-replies <n>` | Batas maksimal balasan per tweet. `0` = tidak terbatas | angka | `0` |
| `-m, --mode <api\|browser>` | Engine scraping | `api` / `browser` | `browser` |

### Contoh penggunaan

```bash
# Dasar — 1 tweet + semua balasan
twitter-scraper url "https://x.com/elonmusk/status/123456789"

# Format twitter.com juga didukung
twitter-scraper url "https://twitter.com/elonmusk/status/123456789"

# Beberapa URL sekaligus
twitter-scraper url "https://x.com/user1/status/111" "https://x.com/user2/status/222"

# Batasi balasan per tweet
twitter-scraper url "https://x.com/user/status/123" --max-replies 50

# Tanpa balasan (lebih cepat)
twitter-scraper url "https://x.com/user/status/123" --no-replies

# Kombinasi lengkap — JSON + CSV, maks 50 balasan
twitter-scraper url "https://x.com/user/status/123" --max-replies 50 -f both
```

---

## Persiapan cookie

Mode `browser` (default) membutuhkan cookie masuk akun X. Edit file **`cookies/twitter_cookies.json`**:

```json
[
  {
    "name": "auth_token",
    "value": "ISI_AUTH_TOKEN_ANDA",
    "domain": ".x.com",
    "path": "/",
    "httpOnly": true,
    "secure": true,
    "sameSite": "Lax"
  },
  {
    "name": "ct0",
    "value": "ISI_CT0_ANDA",
    "domain": ".x.com",
    "path": "/",
    "httpOnly": false,
    "secure": true,
    "sameSite": "Lax"
  }
]
```

Cara mengambil cookie:

1. Login ke `https://x.com` di browser Anda.
2. Buka DevTools (F12) → tab **Application/Storage** → **Cookies** → pilih `x.com`.
3. Salin nilai **`auth_token`** dan **`ct0`** ke file di atas.
4. Jangan bagikan file ini ke siapa pun — ini milik sesi akun Anda.

> Catatan: cookie bisa **kedaluwarsa**. Jika muncul log *"Blocked … cookies may be expired"* atau *"Login wall detected"*, ulangi langkah di atas untuk mengambil nilai baru.

---

## Nilai default yang penting

| Pengaturan | Default |
|---|---|
| Folder output | `output/twitter/` |
| Format output | `json` |
| Max tweet per keyword (`scrape`) | `20` |
| Max tweet per user (`user`) | `20` |
| Max balasan per tweet (`url`) | `0` (semua) |
| Jenis pencarian (`-p`) | `top` |
| Engine scraping | `browser` (Playwright) |
| File cookie | `cookies/twitter_cookies.json` |

---

## Perilaku & catatan

- Tweet dari pencarian (`scrape`) diambil lewat **penangkapan respons GraphQL** + **fallback DOM**, sehingga tetap jalan saat API berubah.
- Profil user di-render server (SSR) oleh X, jadi tweet profil dibaca **langsung dari DOM** browser.
- Halaman tweet (`url`) mengambil tweet utama dari operasi `TweetResultByRestId` / `TweetDetail`; balasan dari `TweetDetail`.
- Tweet yang sudah dihapus / berbayar dilewati.
- Antara permintaan diberi **jeda acak** untuk menghindari rate-limit.
- Jika terdeteksi CAPTCHA / login wall, proses berhenti dan dicatat di log.
- Nama file output mengikuti input:
  - `scrape "review"` → `output/twitter/tw_review_TANGGAL.json`
  - `scrape` beberapa keyword → `output/twitter/tw_search_multi_TANGGAL.json`
  - `user elonmusk` → `output/twitter/tw_elonmusk_TANGGAL.json`
  - `user` beberapa akun → `output/twitter/tw_user_multi_TANGGAL.json`
  - `url` tunggal → `output/twitter/tweet_<ID>_TANGGAL.json`
  - `url` banyak → `output/twitter/tweets_TANGGAL.json`

## Struktur hasil JSON

```json
{
  "query": ["review"],
  "mode": "browser",
  "scraped_at": "2026-09-10T...",
  "total_tweets": 5,
  "total_replies": 50,
  "total_records": 55,
  "tweets": [
    {
      "tweet_id": "123456789",
      "text": "isi tweet",
      "author": "username",
      "nickname": "Nama Pengguna",
      "user_id": "987654321",
      "created_at": "Sat Sep 05 03:19:32 +0000 2026",
      "likes": 117,
      "retweets": 11,
      "replies": 1,
      "quotes": 2,
      "views": 9444,
      "is_retweet": false,
      "retweeted": false,
      "is_quote": false,
      "quoted_text": "",
      "media": [
        {
          "type": "photo",
          "url": "https://pbs.twimg.com/media/..."
        }
      ],
      "in_reply_to": "",
      "url": "https://x.com/username/status/123456789",
      "lang": "en",
      "type": "tweet"
    }
  ],
  "replies": [
    {
      "tweet_id": "987654321",
      "text": "isi balasan",
      "author": "pengirim",
      "parent_tweet_id": "123456789",
      "type": "tweet"
    }
  ]
}
```

Gunakan `-f both` untuk mendapatkan file **CSV** dengan kolom tweet (tweet_id, type, author, nickname, text, likes, retweets, replies, quotes, views, created_at, is_retweet, url) di samping file JSON.
# Dokumentasi tiktok-scraper

TikTok comment scraper — **2 subcommand** + **opsi global**.

```
tiktok-scraper [opsi global] <command> [opsi command] <input...>
```

---

## Opsi Global

Berlaku untuk semua command, diletakkan sebelum nama command.

| Opsi | Fungsi | Nilai yang diterima | Default |
|---|---|---|---|
| `-V, --version` | Menampilkan versi tool | — | — |
| `-o, --output <dir>` | Menentukan folder penyimpanan hasil | path folder | `output/tiktok` |
| `-f, --format <format>` | Format file output | `json`, `csv`, atau `both` | `json` |
| `--headless <bool>` | Mode browser tanpa tampilan | `true` / `false` | `true` |

Contoh:

```
tiktok-scraper -o hasil -f both --headless false scrape "#fyp"
```

> **Catatan:** engine `api` membaca session dari `cookies/tiktok_cookies.json` bila ada. Cookie tidak wajib, tetapi membantu mengurangi rate-limit/blokir. Format: array cookie JSON (misal dari Cookie-Editor). Jika muncul log *rate limited / auth error*, perbarui cookie atau gunakan `--mode browser`.

---

## Command 1 — `scrape` (berdasarkan hashtag / keyword)

```
tiktok-scraper scrape <inputs...>
```

Scraping comment berdasarkan **hashtag** (`#fyp`) atau **keyword** (`makanan` akurat).
Bisa menerima **lebih dari satu input** sekaligus.

| Opsi | Fungsi | Nilai yang diterima | Default |
|---|---|---|---|
| `<inputs...>` | Satu atau lebih hashtag / keyword | `#fyp` `"belajar ngoding"` dll. | wajib |
| `-l, --limit <n>` | Maksimal jumlah video yang discrape per input | angka | `10` |
| `--max-comments <n>` | Batas maksimal komentar per video. `0` = tidak terbatas | angka | `0` |
| `--no-replies` | Melewati pengambilan balasan (reply), hanya komentar utama | flag (tanpa nilai) | balasan diambil |
| `--mode <api\|browser>` | Engine yang dipakai mengambil komentar | `api` / `browser` | `api` |

### Contoh penggunaan

```bash
# Dasar — 1 hashtag, 10 video (default), semua komentar + balasan
tiktok-scraper scrape "#fyp"

# Beberapa input sekaligus
tiktok-scraper scrape "#fyp" "makanan"

# Batasi jumlah video
tiktok-scraper scrape "#fyp" -l 5

# Batasi komentar per video
tiktok-scraper scrape "#fyp" --max-comments 100

# Tanpa balasan (lebih cepat)
tiktok-scraper scrape "#fyp" --no-replies

# Gunakan engine browser (fallback manual)
tiktok-scraper scrape "#fyp" --mode browser

# Kombinasi lengkap — JSON + CSV, maks 3 video, 50 komentar/video
tiktok-scraper scrape "#fyp" "makanan" -l 3 --max-comments 50 -f both
```

---

## Command 2 — `url` (berdasarkan link video langsung)

```
tiktok-scraper url <urls...>
```

Scraping comment dari **satu atau lebih URL video TikTok** tanpa perlu search.
ID video diekstrak otomatis dari URL.

| Opsi | Fungsi | Nilai yang diterima | Default |
|---|---|---|---|
| `<urls...>` | Satu atau lebih URL video TikTok | `https://www.tiktok.com/@user/video/123...` | wajib |
| `--no-replies` | Melewati pengambilan balasan | flag (tanpa nilai) | balasan diambil |
| `--max-comments <n>` | Batas maksimal komentar per video. `0` = tidak terbatas | angka | `0` |

### Contoh penggunaan

```bash
# Dasar — 1 video, semua komentar + balasan
tiktok-scraper url "https://www.tiktok.com/@jordan_belf012t/video/7676096424802651413"

# Beberapa URL sekaligus
tiktok-scraper url "https://www.tiktok.com/@user1/video/111" "https://www.tiktok.com/@user2/video/222"

# Pembatas + tanpa balasan + format CSV
tiktok-scraper url "https://www.tiktok.com/@user/video/123" --max-comments 50 --no-replies -f csv
```

---

## Nilai default yang penting

| Pengaturan | Default |
|---|---|
| Folder output | `output/tiktok/` |
| Format output | `json` |
| Max video per input (`scrape`) | `10` |
| Max komentar per video | `0` (semua) |
| Engine scraping | `api` |
| Mode browser | headless (`true`) |

---

## Perilaku & catatan

- Jika video memiliki **0 komentar**, video otomatis dilewati (skip).
- Antara video diberi **jeda acak** untuk menghindari rate-limit.
- Nama file output mengikuti input, contoh: `#fyp` → `output/tiktok/fyp_TANGGAL.json`.
- Beberapa input berbeda → file `multi_keywords_TANGGAL.json`.
- Command `url` tunggal → `output/tiktok/video_<ID>_TANGGAL.json`.
- Opsi global `--headless false` berguna jika terdeteksi blokir / butuh debugging visual.

## Struktur hasil JSON

```json
{
  "query": "fyp",
  "scraped_at": "2026-09-09T...",
  "total_videos": 10,
  "total_comments": 1500,
  "total_replies": 300,
  "total_records": 1800,
  "comments": [
    {
      "comment_id": "7664408360699527966",
      "author": "username",
      "nickname": "Nama Pengguna",
      "text": "isi komentar",
      "likes": 530014,
      "replies": 236,
      "time": 1784509159,
      "video_id": "7663987446073281806",
      "type": "comment",
      "parent_comment_id": ""
    }
  ],
  "videos": []
}
```

Gunakan `-f both` untuk mendapatkan file **CSV** dengan kolom yang sama di samping file JSON.
# Dokumentasi youtube-scraper

YouTube comment scraper — **2 subcommand** + **opsi global**.
Berjalan di atas engine `youtubei.js` (penanganan po-token & visitor otomatis, tanpa perlu API key atau cookie).

```
youtube-scraper [opsi global] <command> [opsi command] <input...>
```

---

## Opsi Global

Berlaku untuk semua command, diletakkan sebelum nama command.

| Opsi | Fungsi | Nilai yang diterima | Default |
|---|---|---|---|
| `-V, --version` | Menampilkan versi tool | — | — |
| `-o, --output <dir>` | Menentukan folder penyimpanan hasil | path folder | `output/youtube` |
| `-f, --format <format>` | Format file output | `json`, `csv`, atau `both` | `json` |

Contoh:

```
youtube-scraper -o hasil -f both scrape "review iphone"
```

---

## Command 1 — `scrape` (berdasarkan hashtag / keyword)

```
youtube-scraper scrape <inputs...>
```

Scraping comment berdasarkan **hashtag** (`#review`) atau **keyword** (`"review iphone"`).
Bisa menerima **lebih dari satu input** sekaligus.

| Opsi | Fungsi | Nilai yang diterima | Default |
|---|---|---|---|
| `<inputs...>` | Satu atau lebih hashtag / keyword | `#review` `"review iphone"` dll. | wajib |
| `-l, --limit <n>` | Maksimal jumlah video yang discrape per input | angka | `10` |
| `--max-comments <n>` | Batas maksimal komentar per video. `0` = tidak terbatas | angka | `0` |
| `--no-replies` | Melewati pengambilan balasan (reply), hanya komentar utama | flag (tanpa nilai) | balasan diambil |

### Contoh penggunaan

```bash
# Dasar — 1 keyword, 10 video (default), semua komentar + balasan
youtube-scraper scrape "review iphone"

# Hashtag + beberapa input sekaligus
youtube-scraper scrape "#review" "makanan"

# Batasi jumlah video
youtube-scraper scrape "#review" -l 5

# Batasi komentar per video
youtube-scraper scrape "review iphone" --max-comments 100

# Tanpa balasan (lebih cepat)
youtube-scraper scrape "#review" --no-replies

# Kombinasi lengkap — JSON + CSV, maks 3 video, 50 komentar/video
youtube-scraper scrape "review iphone" -l 3 --max-comments 50 -f both
```

---

## Command 2 — `url` (berdasarkan link video langsung)

```
youtube-scraper url <urls...>
```

Scraping comment dari **satu atau lebih URL video YouTube** (format `watch?v=` maupun `youtu.be/`) tanpa perlu search.
ID video diekstrak otomatis dari URL.

| Opsi | Fungsi | Nilai yang diterima | Default |
|---|---|---|---|
| `<urls...>` | Satu atau lebih URL video YouTube | `https://www.youtube.com/watch?v=dQw...` atau `https://youtu.be/dQw...` | wajib |
| `--no-replies` | Melewati pengambilan balasan | flag (tanpa nilai) | balasan diambil |
| `--max-comments <n>` | Batas maksimal komentar per video. `0` = tidak terbatas | angka | `0` |

### Contoh penggunaan

```bash
# Dasar — 1 video, semua komentar + balasan
youtube-scraper url "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

# Format youtu.be juga didukung
youtube-scraper url "https://youtu.be/dQw4w9WgXcQ"

# Beberapa URL sekaligus
youtube-scraper url "https://www.youtube.com/watch?v=AAA" "https://www.youtube.com/watch?v=BBB"

# Pembatas + tanpa balasan + format CSV
youtube-scraper url "https://youtu.be/dQw4w9WgXcQ" --max-comments 50 --no-replies -f csv
```

---

## Nilai default yang penting

| Pengaturan | Default |
|---|---|
| Folder output | `output/youtube/` |
| Format output | `json` |
| Max video per input (`scrape`) | `10` |
| Max komentar per video | `0` (semua) |
| Engine scraping | `youtubei.js` (auto auth po-token) |
| Bahasa waktu/angka | `en` (agar `1 year ago`, `313K` termapping) |

---

## Perilaku & catatan

- Jika video **tidak memiliki komentar**, video otomatis dilewati (skip).
- Antara video diberi **jeda acak** untuk menghindari rate-limit.
- Jika komentar video dimatikan oleh kreator, video dilewati.
- Nama file output mengikuti input, contoh: `"review iphone"` → `output/youtube/yt_review_iphone_TANGGAL.json`.
- Beberapa input berbeda → `output/youtube/yt_multi_TANGGAL.json`.
- Command `url` tunggal → `output/youtube/video_<ID>_TANGGAL.json`.
- Command `url` banyak → `output/youtube/yt_videos_TANGGAL.json`.
- Tidak butuh `YOUTUBE_API_KEY` atau cookie — semua auth ditangani otomatis oleh engine.

## Struktur hasil JSON

```json
{
  "query": ["review iphone"],
  "scraped_at": "2026-09-09T...",
  "total_videos": 3,
  "total_comments": 24,
  "total_replies": 0,
  "total_records": 24,
  "comments": [
    {
      "comment_id": "Ugy_-sCRfHYl3v3WfHJ4AaABAg",
      "author": "UCSh-TKtbyoGgpJGaXROqK8A",
      "nickname": "SukronHidayatullah",
      "text": "isi komentar",
      "likes": 3300,
      "replies": 165,
      "time": 1767930970,
      "video_id": "rkLpVyRGCPw",
      "type": "comment",
      "parent_comment_id": ""
    }
  ],
  "videos": []
}
```

Gunakan `-f both` untuk mendapatkan file **CSV** dengan kolom yang sama di samping file JSON.
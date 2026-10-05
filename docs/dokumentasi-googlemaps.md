# Dokumentasi googlemaps-scraper

Google Maps review scraper — **2 subcommand** + **opsi global**.

```
googlemaps-scraper [opsi global] <command> [opsi command] <input...>
```

---

## Persiapan Cookie (opsional, tetapi direkomendasikan)

Cookie membantu menghindari anti-bot/CAPTCHA. File: `cookies/googlemaps_cookies.json`.

### Cookie yang perlu

| Cookie | Fungsi | Wajib? |
|---|---|---|
| `NID` | Session Google Maps (HttpOnly, otomatis dikirim browser) | Ya |
| `SID` / `__Secure-1PSID` | Login Google (opsional, untuk akses lebih stabil) | Opsional |

### Cara export

**Cara cepat — Cookie-Editor extension:**

1. Install Cookie-Editor dari Chrome Web Store
2. Buka `google.com/maps`, pastikan sudah login (opsional)
3. Klik ikon Cookie-Editor → **Export** → **JSON**
4. Paste ke file `cookies/googlemaps_cookies.json`

**Cara manual (DevTools):**

1. Buka `google.com/maps`
2. F12 → tab **Application** → Cookies → `https://www.google.com`
3. Cari `NID`
4. Buat file JSON:
```json
[
  {
    "name": "NID",
    "value": "isi nilai cookie di sini",
    "domain": ".google.com",
    "path": "/",
    "httpOnly": true,
    "secure": true,
    "sameSite": "None"
  }
]
```

> **Penting:** `NID` akan kedaluwarsa. Jika scraper berhenti dengan pesan "blocked", buat ulang cookie baru.

---

## Opsi Global

Berlaku untuk semua command, diletakkan sebelum nama command.

| Opsi | Fungsi | Nilai yang diterima | Default |
|---|---|---|---|
| `-V, --version` | Menampilkan versi tool | — | — |
| `-o, --output <dir>` | Folder penyimpanan hasil | path folder | `output/googlemaps` |
| `-f, --format <format>` | Format file output | `json`, `csv`, atau `both` | `json` |
| `--headless <bool>` | Mode browser tanpa tampilan | `true` / `false` | `true` |

Contoh:

```
googlemaps-scraper -o hasil -f both search "klinik gigi"
```

---

## Command 1 — `search` (berdasarkan keyword)

```
googlemaps-scraper search <queries...>
```

Mencari tempat berdasarkan **keyword**, lalu mengambil ulasan dari masing-masing tempat.
Bisa menerima **lebih dari satu query** sekaligus.

| Opsi | Fungsi | Nilai yang diterima | Default |
|---|---|---|---|
| `<queries...>` | Satu atau lebih keyword pencarian | `"klinik gigi"`, `"restoran padang"` dll. | wajib |
| `-l, --limit <n>` | Maksimal jumlah tempat yang diambil per query | angka | `5` |
| `--max-reviews <n>` | Batas maksimal ulasan per tempat. `0` = tidak terbatas | angka | `0` |
| `--since <YYYY-MM-DD>` | Ambil ulasan dari tanggal ini ke depan | tanggal | 1 tahun terakhir |
| `--until <YYYY-MM-DD>` | Ambil ulasan sampai tanggal ini | tanggal | hari ini |
| `--sort <relevant\|newest>` | Urutan ulasan | `relevant` / `newest` | `relevant` |

### Contoh penggunaan

```bash
# Dasar — 1 keyword, 5 tempat (default), semua ulasan
googlemaps-scraper search "klinik gigi tangerang"

# Batasi jumlah tempat
googlemaps-scraper search "restoran padang" -l 3

# Batasi ulasan per tempat
googlemaps-scraper search "klinik gigi" --max-reviews 20

# Filter rentang tanggal (1 tahun terakhir → sekarang, default)
googlemaps-scraper search "restoran" --since 2025-01-01

# Gabungan
googlemaps-scraper search "klinik gigi" "dokter gigi" -l 3 --max-reviews 50 --sort newest -f both

# Multi keyword + batasi
googlemaps-scraper search "makanan" "minuman" -l 2 --max-reviews 15
```

---

## Command 2 — `url` (berdasarkan URL Google Maps)

```
googlemaps-scraper url [urls...] [--file <path>]
```

Mengambil ulasan dari **URL tempat Google Maps** langsung.
Bisa menerima **lebih dari satu URL** sekaligus, dari argumen langsung, file `.txt`, atau stdin.

> **Default = SEMUA ulasan, tanpa batas tanggal.**
> Berbeda dengan `search` (default 1 tahun terakhir), command `url` tidak memasang
> filter tanggal bila `--since`/`--until` tidak diberikan — seluruh ulasan diambil.

| Opsi | Fungsi | Nilai yang diterima | Default |
|---|---|---|---|
| `[urls...]` | URL tempat Google Maps, `@file.txt`, atau `-` untuk stdin | URL lengkap atau short link (`goo.gl/maps/...`) | — |
| `--file <path>` | Baca URL dari file teks, satu URL per baris | path file | — |
| `--max-reviews <n>` | Batas maksimal ulasan. `0` = tidak terbatas | angka | `0` (semua) |
| `--since <YYYY-MM-DD>` | Ambil ulasan dari tanggal ini ke depan | tanggal | tanpa batas (semua waktu) |
| `--until <YYYY-MM-DD>` | Ambil ulasan sampai tanggal ini | tanggal | sekarang |
| `--sort <relevant\|newest>` | Urutan ulasan | `relevant` / `newest` | `relevant` |

### Contoh penggunaan

```bash
# Dasar — 1 URL, semua ulasan, semua waktu
googlemaps-scraper url "https://www.google.com/maps/place/Klinik+Gigi+.../..."

# Beberapa URL sekaligus
googlemaps-scraper url "URL1" "URL2" "URL3"

# Short link juga bisa
googlemaps-scraper url "https://goo.gl/maps/abc123"

# Dari file .txt (1 URL per baris)
googlemaps-scraper url --file links.txt

# From file via prefix @
googlemaps-scraper url @links.txt

# Dari stdin
Get-Content links.txt | googlemaps-scraper url -

# Gabungan beberapa sumber sekaligus
googlemaps-scraper url "URL1" @links.txt --file more.txt

# Batasi jumlah ulasan (default tetap semua waktu)
googlemaps-scraper url --file links.txt --max-reviews 100

# Filter tanggal eksplisit
googlemaps-scraper url "URL" --since 2025-06-01 -f both
```

### Format file `links.txt`

```
# komentar diabaikan, baris kosong juga
https://www.google.com/maps/place/Klinik+Gigi+A/data=!4m2!3m1!1s0x2e7f...
https://maps.app.goo.gl/AbCdEf123
https://goo.gl/maps/XyZ
```

Aturan pembacaan file:

| Aturan | Perilaku |
|---|---|
| Baris kosong | Dilewati |
| Baris diawali `#` | Dianggap komentar, dilewati |
| Kutip pembungkus (`"` `'` `` ` ``) | Dibuang otomatis |
| Tanda `,` / `;` di ujung baris | Dibuang otomatis |
| Duplikat | Dihapus, urutan pertama dipertahankan |
| Baris bukan URL Google Maps | **Tetap diproses**, tapi diberi peringatan |

> **Penting (PowerShell):** URL Google Maps sering mengandung `&`. Menempelkan URL
> **tanpa tanda kutip** di PowerShell akan gagal total dengan
> `The ampersand (&) character is not allowed`. Selalu bungkus dengan `"`:
>
> ```powershell
> # SALAH — ParserError
> googlemaps-scraper url https://www.google.com/maps/place/A?entry=ttu&hl=en
>
> # BENAR
> googlemaps-scraper url "https://www.google.com/maps/place/A?entry=ttu&hl=en"
> ```
>
> Alternatif paling aman: simpan URL di `links.txt`, lalu pakai `--file`.

---

## Default & Perilaku

| Aspek | Nilai default |
|---|---|
| Cookie file | `cookies/googlemaps_cookies.json` |
| Bahasa/maps | `hl=id` (Indonesia) |
| Max places per query | `5` |
| Max reviews per tempat | `0` (tidak terbatas) |
| Max scroll rounds | `15` |
| Stop jika 2x berturut tidak ada review baru | `2` |
| Filter tanggal `search` | 1 tahun terakhir → hari ini |
| Filter tanggal `url` | **tanpa batas** (semua ulasan) kecuali `--since`/`--until` |
| Output folder | `output/googlemaps/` |
| Output format | `json` |

> Catatan: nilai `date_range.since` pada output JSON bernilai `null` bila `url`
> dijalankan tanpa `--since`/`--until`. Ini disengaja — artinya tidak ada batas bawah tanggal.

---

## Output JSON

Contoh struktur file output:

```json
{
  "query": ["klinik gigi tangerang"],
  "mode": "browser",
  "date_range": {
    "since": "2025-09-10",
    "until": null
  },
  "sort": "relevant",
  "scraped_at": "2026-09-10T13:32:44.657Z",
  "total_places": 2,
  "total_reviews": 30,
  "places": [
    {
      "place_id": "0x2e69f1810d5bb79b:0xe3fe8aa6784cdf5b",
      "name": "Klinik Gigi Teman Dental",
      "link": "https://www.google.com/maps/place/...",
      "address": "Jl. HOS Cokroaminoto No. 18 B, Larangan",
      "rating": 5,
      "reviews_count": 1559,
      "reviews": [
        {
          "review_id": "Ci9DQUlRQUNv...",
          "author": "farid hermansyah",
          "rating": 5,
          "time_label": "2 bulan lalu",
          "text": "Baru selesai tambal gigi graham...",
          "time": 1783690350,
          "date_flag": "",
          "source": "dom"
        }
      ]
    }
  ]
}
```

### Field review

| Field | Keterangan |
|---|---|
| `review_id` | ID unik ulasan dari Google Maps (bisa kosong) |
| `author` | Nama penulis ulasan |
| `rating` | Rating 1–5 (0 jika tidak ditemukan) |
| `time_label` | Label waktu asli dari Maps (contoh: "2 bulan lalu") |
| `text` | Isi teks ulasan (kosong jika ulasan hanya rating) |
| `time` | Timestamp Unix (detik) — estimasi dari label waktu relatif |
| `date_flag` | `"unknown"` jika ulasan tidak punya tanggal |
| `source` | `"dom"` (parse dari DOM browser) |

### Nama file output

| Mode | Pola nama |
|---|---|
| search, 1 query | `gm_<query>_<YYYY-MM-DD>.json` |
| search, multi query | `gm_search_multi_<YYYY-MM-DD>.json` |
| url, 1 URL | `gm_place_<placeid>.json` |
| url, multi URL | `gm_places_<YYYY-MM-DD>.json` |

---

## Catatan Penting

- **Cookie `NID` adalah HttpOnly** — tidak bisa diambil lewat `document.cookie`. Gunakan Cookie-Editor extension atau DevTools Application tab.
- **Anti-bot:** Jika muncul CAPTCHA atau "unusual traffic", cookie yang lebih lengkap (dengan SID) atau mengurangi kecepatan scraping dapat membantu.
- **Urutan ulasan** sangat tergantung padaGoogle Maps. Default `relevant` seringkali menampilkan ulasan terpopuler; `newest` memaksa urutan kronologis.
- **Tanggal relatif** (contoh "2 bulan lalu", "a year ago") dikonversi menjadi timestamp estimasi — tidak presisi sampai hari, melainkan estimasi berdasarkan tanggal scraping saat ini.
- **Place dari search** menggunakan tempat hasil pencarian, bukan tempat terdekat. Hasil bisa berbeda-beda tergantung bahasa Maps (`hl=id`).
- **Short link** (`goo.gl/maps/...`) otomatis di-resolve ke URL penuh sebelum scraping.
- **Filter tanggal berbeda antar command** — `search` memakai default 1 tahun terakhir,
  sedangkan `url` memakai **tanpa batas tanggal** (semua ulasan). Ini disengaja agar
  `url` tidak membuang ulasan lama secara diam-diam.
- **Tanggal yang ditampilkan bisa mundur 1 hari** — `--since 2025-06-01` bisa tampil
  sebagai `2025-05-31` di log, karena label tanggal dikonversi ke UTC. Filternya sendiri
  tetap benar (memakai tengah malam waktu lokal).
- **Batas round session untuk batch** — `CONFIG.gm.maxSessionRounds` (default `1200`) adalah
  **counter global per proses**, bukan per tempat. Pada batch besar (mis. 30+ URL dengan
  semua ulasan), counter ini bisa habis di tengah jalan sehingga review untuk tempat
  berikutnya hanya terambil sebagian. Gejalanya hanya berupa peringatan
  `Session round budget ... reached — stopping early` di log.
  Untuk batch besar, jalankan dalam beberapa perintah kecil, atau turunkan `--max-reviews`.
  Lihat `src/googlemaps/reviews.js` bila ingin diubah di kemudian hari.
- **Nama file output tidak memakai jam** — pola `gm_places_<YYYY-MM-DD>.json` membuat
  dua menjalankan pada hari yang sama menimpa file sebelumnya. Pakai `-o <folder>` berbeda
  bila perlu menyimpan beberapa batch dalam sehari.

---

## Test

```bash
# Dasar — search
bun run src/googlemaps.js search "klinik gigi tangerang" -l 2 --max-reviews 10

# URL langsung
bun run src/googlemaps.js url "https://www.google.com/maps/place/..." --max-reviews 10

# Format CSV + JSON
bun run src/googlemaps.js search "restoran" -l 1 --max-reviews 5 -f both

# Filter tanggal
bun run src/googlemaps.js search "dokter gigi" -l 2 --since 2025-06-01

# Batch dari file (semua ulasan, semua waktu)
bun run src/googlemaps.js url --file links.txt

# Batch dari stdin
Get-Content links.txt | bun run src/googlemaps.js url -

# Lihat semua opsi
bun run src/googlemaps.js --help
bun run src/googlemaps.js search --help
bun run src/googlemaps.js url --help
```

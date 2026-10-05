# Dokumentasi gofood-scraper

GoFood review scraper — kumpulkan review per **branch Sky Pasta** dan filter by tanggal.

```
gofood-scraper [opsi global] <command> [opsi command]
```

> GrabFood **tidak** didukung — GoFood adalah satunya platform Food Delivery yang punya ulasan tertulis untuk Sky Pasta.

---

## Cara Kerja (singkat)

1. Setiap branch dibuka lewat browser (Playwright) satu konteks bersih per branch untuk dapat cookie sesi.
2. Review diambil langsung dari API internal:
   `GET https://gofood.co.id/api/outlets/{uuid}/reviews?page=N&page_size=20`
   → respons `{ data: [review], next_page, prev_page }`, urut **terbaru → terlama**.
3. Paginasi di-stop lebih awal saat ulasan tertua di satu halaman sudah melewati cutoff tanggal.
4. Review difilter berdasarkan `createdAt` (waktu WIB, `+07:00`) terhadap rentang tanggal.

> **Anti-bot:** GoFood memakai WAF Tencent qcloud. Jika terlalu banyak request beruntun, halaman SSR diganti halaman CAPTCHA — **API review tetap jalan**. Capture pakai jeda acak 3–6 detik antar halaman API.

---

## Opsi Global

| Opsi | Fungsi | Nilai yang diterima | Default |
|---|---|---|---|
| `-V, --version` | Menampilkan versi tool | — | — |
| `-o, --output <dir>` | Folder penyimpanan hasil | path folder | `output/gofood` |
| `-f, --format <format>` | Format file output | `json`, `csv`, atau `both` | `json` |
| `--headless <bool>` | Mode browser tanpa tampilan | `true` / `false` | `false` |

---

## Command 1 — `branches` (semua / per branch)

```
gofood-scraper branches
```

Meng-crawl 7 branch Sky Pasta terdaftar di `src/data/sky_pasta_branches.js`:

| # | Branch | Service area | UUID |
|---|---|---|---|
| 1 | Pamulang | tangerang-selatan | `bd96dd68-4bd3-41e2-8fde-ce7ea7b1c41c` |
| 2 | Tebet | jakarta | `594d2e42-b1fd-44f2-83a9-da53b2210842` |
| 3 | Cinere | depok | `43373425-c78e-4dd4-a4e5-23d58e701cae` |
| 4 | Ciledug | jakarta | `423518a4-dea9-46b0-ab0e-015e0129a38f` |
| 5 | Petukangan | jakarta | `03ba0e0d-e52b-4531-a140-69cac28c986f` |
| 6 | Binus Jakbar | jakarta | `2e05c08c-0485-47a6-b128-acaf8d39271f` |
| 7 | Galaxy Bekasi | jakarta | `c4b7588e-a2e5-4fae-bd07-3a99c66edf22` |

| Opsi | Fungsi | Nilai yang diterima | Default |
|---|---|---|---|
| `-b, --branch <name>` | Hanya 1 branch | `tebet`, `Pamulang`, `Binus Jakbar`, dst. | semua branch |
| `--since <YYYY-MM-DD>` | Ambil review dari tanggal ini ke depan | tanggal | 1 tahun terakhir |
| `--until <YYYY-MM-DD>` | Ambil review sampai tanggal ini | tanggal | hari ini |

### Contoh penggunaan

```bash
# Semua 7 branch, 1 tahun terakhir
bun run src/gofood.js branches -f both

# Hanya Tebet
bun run src/gofood.js branches -b tebet

# Filter tanggal spesifik, simpan ke folder lain
bun run src/gofood.js branches -b cinere --since 2025-06-01 -o hasil-gofood

# Verifikasi kehadiran 7/7 branch dari output
bun run scripts/verify_branches.js
```

---

## Command 2 — `url` (toko dari URL)

```
gofood-scraper url <url>
```

Mengambil review toko mana pun dari URL halaman review-nya.

| Opsi | Fungsi | Nilai yang diterima | Default |
|---|---|---|---|
| `--since <YYYY-MM-DD>` | Ambil review dari tanggal ini ke depan | tanggal | 1 tahun terakhir |
| `--until <YYYY-MM-DD>` | Ambil review sampai tanggal ini | tanggal | hari ini |

### Contoh

```bash
bun run src/gofood.js url "https://gofood.co.id/jakarta/restaurant/sky-pasta-tebet-594d2e42-b1fd-44f2-83a9-da53b2210842/reviews" -f both
```

---

## Output JSON

File: `output/gofood/gofood_sky_pasta_<YYYY-MM-DD>.json`

```json
{
  "platform": "gofood",
  "brand": "Sky Pasta",
  "scrape_mode": "api",
  "date_range": { "since": "2025-09-13", "until": null },
  "scraped_at": "2026-09-13T...Z",
  "total_branches": 7,
  "total_reviews_kept": 205,
  "total_reviews_available": 280,
  "branches": [
    {
      "ok": true,
      "branch": "Tebet",
      "uuid": "594d2e42-b1fd-44f2-83a9-da53b2210842",
      "url": "https://gofood.co.id/jakarta/restaurant/sky-pasta-tebet-.../reviews",
      "total": 60,
      "kept": [
        {
          "review_id": "1a69456b-...",
          "author": "L*** P******",
          "author_initial": "LP",
          "rating": 5,
          "text": "terlalu creamy jd enek. rasa tdk spt mac n cheese.",
          "tags": [],
          "created_at": "2026-09-01T13:09:44.4652+07:00",
          "created_ts": 1788242984465,
          "ordered_at": "2026-08-30T15:43:40.153778Z",
          "ordered_ts": 1788104620153,
          "items": ["Mac N Cheese"],
          "date_flag": ""
        }
      ],
      "skipped": 14,
      "unknown": 0,
      "pages": 3
    }
  ]
}
```

### Field review

| Field | Keterangan |
|---|---|
| `review_id` | ID unik ulasan GoFood |
| `author` | Nama penulis (GoFood memaskulin beberapa karakter, mis. `L*** P******`) |
| `author_initial` | Inisial nama |
| `rating` | Rating 1–5 |
| `text` | Isi teks ulasan (bisa kosong jika ulasan hanya rating) |
| `tags` | Tag ulasan (kosong biasanya) |
| `created_at` | Waktu dibuat (ISO 8601, offset `+07:00` WIB) |
| `created_ts` | Timestamp Unix (ms) |
| `ordered_at` | Waktu pesanan (UTC `Z`) |
| `ordered_ts` | Timestamp Unix (ms) waktu pesanan |
| `items` | Item makanan yang dipesan |
| `date_flag` | `"unknown"` jika ulasan tanpa tanggal yang valid |

> Field `name`/`rating` outlet tidak diambil — API review tidak mengembalikan metadata outlet. Untuk itu gunakan platform Google Maps (`googlemaps-scraper`).

---

## Output CSV

File: `output/gofood/gofood_sky_pasta_<YYYY-MM-DD>.csv` (UTF-8 BOM, siap Excel)

Kolom: `branch`, `outlet_url`, `outlet_uuid`, `review_id`, `author`, `rating`, `text`, `tags`, `created_at`, `ordered_at`, `items`.

---

## Verifikasi Branch

```bash
bun run scripts/verify_branches.js                # membaca output/gofood
bun run scripts/verify_branches.js hasil-gofood   # folder kustom
```

Output: `[PASS]`/`[FAIL]` per branch, skor akhir `7/7`. Exit code `0` hanya jika semua 7 branch hadir di output.

---

## Catatan Penting

- **GrabFood** keluar dari scope: GrabFood tidak menyediakan ulasan tertulis sama sekali.
- **WAF Tencent qcloud**: setelah beberapa request beruntun cepat, halaman SSR diganti CAPTCHA. Scraper tidak butuh halaman render penuh — API `/api/outlets/{uuid}/reviews` tetap bisa diakses lewat sesi browser yang sama.
- **Pagination SSR tidak dipakai.** `?page=N` di URL halaman `.next/data` selalu melempar balik data halaman 1 — paginasi sebenarnya ada di API `reviews`.
- **Cutoff default** = 1 tahun (`sinceDefaultDays: 365`). Ubah di `src/config.js` → `CONFIG.gofood`.
- **UUID Binus Jakbar** menggunakan `2e05c08c` (ditemukan dari GoFood search suggestion). Ada UUID kedua `dd55f44c` pada manifest sebagai fallback (`altUuid`).

---

## Test

```bash
# Semua branch + JSON + CSV
bun run src/gofood.js branches -f both

# Per branch
bun run src/gofood.js branches -b petukangan

# URL tunggal
bun run src/gofood.js url "https://gofood.co.id/jakarta/restaurant/sky-pasta-ciledug-423518a4-dea9-46b0-ab0e-015e0129a38f/reviews"

# Verifikasi
bun run scripts/verify_branches.js

# Lihat semua opsi
bun run src/gofood.js --help
bun run src/gofood.js branches --help
```
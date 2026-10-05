# Analisis Kompetitor Sky Pasta

Scan kompetitor pasta/Italian berbasis **koordinat 18 titik kandidat** (`plan-fitur/titik_kandidat.csv`)
mengikuti aturan **Apple-to-Apple** pada dokumen `plan-fitur/Sky_Pasta_Analisis_Ekspansi (2).docx`:

- **Ya (kelas A)** — objek spesialis pasta/Italian casual **DAN** harga setara benchmark Sky Pasta Pamulang (Rp 20–50rb / price level `$$`).
- **Cek Manual (kelas TBD)** — objek spesialis pasta/Italian **TANPA** harga tertera di Maps → **belum dihitung sebagai head-to-head** sampai harga diverifikasi manual.
- **Tidak (kelas B)** — objek melebar (pizza/steak/café/Italian umum), harga masih dalam benchmark.
- **Tidak (kelas C)** — harga di luar benchmark (di bawah ~Rp 20rb atau di atas ~Rp 50rb).

## Fitur

- Self-contained — **tidak menyentuh scraper lain** (`src/`, `config.js`, dst). Bisa dihapus tanpa efek samping.
- Input hanya dibaca (read-only): `plan-fitur/titik_kandidat.csv`, `cookies/googlemaps_cookies.json`.
- Pencarian ditambat (anchor) ke koordinat titik: `google.com/maps/search/{query}/@{lat},{lon},{zoom}z`.
- Dedupe global by `place_id` lintas query & titik.
- Checkpoint per titik → scan **resumable** & tahan CAPTCHA.
- Klasifikasi deterministik (pure function) + unit test.

## Cara pakai

```bash
# Dari root project:

# pilot (2 titik dari CONFIG.scan.pilot)
bun analisis-sky-pasta/scripts/scan.mjs --pilot

# semua 18 titik
bun analisis-sky-pasta/scripts/scan.mjs all

# satu titik (nama parsial atau nomor)
bun analisis-sky-pasta/scripts/scan.mjs "Buah Batu"
bun analisis-sky-pasta/scripts/scan.mjs 13

# re-scan paksa (abaikan checkpoint)
bun analisis-sky-pasta/scripts/scan.mjs all --force

# lihat browser (debug selector / ejaan CAPTCHA)
bun analisis-sky-pasta/scripts/scan.mjs --pilot --headless false

# override query
bun analisis-sky-pasta/scripts/scan.mjs 13 --queries "pasta,italian restaurant"
```

## Output

- `output/kompetitor_<tanggal>.csv` — gabungan semua titik
- `output/per_titik/<titik>_<tanggal>.csv` — per titik
- `output/report_<tanggal>.md` — report format tabel dokumen (tinggal salin)

Kolom: `titik, kota, index, kompetitor, objek, alamat, rating, n_reviews, harga_label, price_level, jarak_km, apple_to_apple, kelas, alasan_kelas, review_rendah, harga_tbd, go_maps_url, place_id`.

## Test

```bash
bun analisis-sky-pasta/scripts/test-classify.mjs
```

## Catatan

- Koordinat titik berstatus **DRAFT** — hasil scan juga jadi validasi akurasi koordinat sebelum direkomendasikan ke klien.
- Harga tidak selalu muncul di Google Maps feed → tempat seperti itu ditandai `harga_tbd=ya`, diklasifikasikan **Cek Manual (kelas TBD)**, dan **tidak dihitung sebagai head-to-head** hingga harga diverifikasi manual.
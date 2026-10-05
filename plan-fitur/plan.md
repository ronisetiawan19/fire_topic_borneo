# Plan: Scraping Sewa Ruko/Komersial — Ekspansi Sky Pasta

Tujuan: mengumpulkan data ruko/tempat sewa di titik kandidat ekspansi 

## 1. Daftar Platform & Link

| Platform | Link Utama | Struktur URL Pencarian | Catatan Scraping |
|---|---|---|---|
| OLX Indonesia | https://www.olx.co.id | `olx.co.id/{kota}_g{kode}/properti_c88/q-ruko-disewakan` | Paling ramah discrape, banyak listing personal, update harian |
| Lamudi | https://www.lamudi.co.id/sewa/ | `lamudi.co.id/sewa/{provinsi}/{kota}/komersial/ruko/` | URL rapi per provinsi/kota, tapi proteksi bot lebih ketat |
| Rumah123 | https://www.rumah123.com/sewa/ | `rumah123.com/sewa/{kota}/ruko/` | Situs terbesar, kemungkinan ada Cloudflare/reCAPTCHA |
| 99.co Indonesia | https://www.99.co/id | filter lokasi + tipe properti di UI | Struktur URL kurang predictable, cek manual dulu |
| Pinhome | https://www.pinhome.id | filter lokasi + tipe properti di UI | Termasuk properti komersial |
| Realoka | https://www.realoka.com | filter lokasi di UI | Fokus listing gratis (ruko, kios, gudang, kantor) |
| Mitula | https://www.mitula.co.id | search engine agregator | Menggabungkan listing dari banyak situs lain |
| Trovit | https://www.trovit.co.id | search engine agregator | Sama seperti Mitula |

## 2. Kata Kunci Pencarian per Lokasi

```
ruko disewakan Taman Yasmin Bogor
ruko disewakan Sentul City Bogor
ruko disewakan Buah Batu Bandung
ruko disewakan Palagan Sleman
ruko disewakan Kedaton Bandar Lampung
```

## 3. Data yang Perlu Diambil per Listing

- Nama/judul listing
- Alamat / kelurahan
- Luas tanah & luas bangunan (m²)
- Harga sewa (per tahun/per bulan)
- Jumlah lantai
- Link listing asli
- Kontak (jika tersedia)

## 4. Catatan Teknis

- `googlemaps-scraper` yang dipakai sebelumnya **tidak bisa langsung dipakai** untuk situs ini — perlu scraper terpisah (Playwright/Selenium) karena struktur HTML dan proteksi bot beda dari Google Maps.
- OLX kemungkinan paling mudah di-scrape duluan (struktur URL sederhana, proteksi bot lebih ringan dibanding Lamudi/Rumah123).
- Untuk Lamudi & Rumah123, disarankan cek dulu apakah ada rate-limit/CAPTCHA sebelum scraping besar-besaran.
- Alternatif kalau scraping sulit: ambil data manual dari 10-15 listing teratas per lokasi sebagai sample, cukup untuk estimasi harga sewa kasar.

## 5. Output yang Diharapkan

Tabel gabungan (CSV/Excel) berisi listing ruko per kandidat lokasi, untuk dibandingkan dengan estimasi budget ekspansi klien — lalu digabung ke laporan analisis lokasi yang sudah ada.

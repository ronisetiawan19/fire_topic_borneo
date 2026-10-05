# Riset Manual Harga/Menu — Kompetitor TBD
Tanggal riset: 2026‑09‑23
Sumber data: `output/kompetitor_2026-09-23.csv` dilengkapi riset manual web per `place_id`.
File hasil: `output/kompetitor_2026-09-23_manual.csv` (salinan CSV asli; hanya kolom `harga_label`, `apple_to_apple`, `kelas`, `alasan_kelas`, `harga_tbd` yang diupdate per `place_id`).

## Ringkasan
- Baris TBD awal: 58 baris (data kompetitor unik berstatus `TBD`).
- Setelah riset manual (putaran 1 + 2): **A = 14, C = 4, B = 4, TBD = 36** (per kompetitor unik).
- Metode: pencarian menu/harga via web (carikulinerindonesia, menukuliner.net, jajandolan, Grab, Chope PDF, kooliner.com, gentech.one). Benchmark harga pasta representatif: **Rp 20–50 rb**.

Kriteria kelas:
- **A** = spesialis pasta/Italian + harga setara benchmark (Rp 20–50 rb).
- **C** = spesialis pasta tapi harga di luar benchmark (max < 20 rb atau min ≥ 50 rb).
- **B** = objek melebar / bukan kompetitor langsung (mis. supplier B2B, menu nasi/ramen/coffee).
- **TBD** = harga/menu belum ditemukan setelah pencarian.

## Reklasifikasi A
| Kompetitor | Kota | harga_label (manual) | Alasan | Sumber |
|---|---|---|---|---|
| Pastayani | Tangerang Selatan | Rp 19,5–33 rb | Spesialis pasta/Italian (nama) & harga setara benchmark — spaghetti bolognese panggang Rp 19.500 (sedikit di bawah 20rb), paket Rp 23–33 rb | menukuliner.net/menu/466143 (Pastayani Nusa Jaya Karawaci) |
| PASTA TIMUR | Depok | Rp 37–39,5 rb | Spesialis pasta/Italian & harga setara benchmark | catatan riset |
| Pasta Kangen Pekapuran | Depok | Rp 21,2–24 rb | Spesialis pasta/Italian & harga setara benchmark | catatan riset |
| Lahap Pasta, Kukusan | Depok | Rp 20–33 rb | Spesialis pasta/Italian & harga setara benchmark | catatan riset |
| Pasta Kangen K21 | Kab. Bogor | Rp 19–23 rb | Spesialis pasta/Italian & harga setara benchmark | carikulinerindonesia.com/10914482 |
| Dapur Mamazal, Aneka Pasta dan Salad Buah, Jatiasih | Kab. Bogor | Rp 25–38,5 rb | Spesialis pasta/Italian & harga setara benchmark | menukuliner.net/menu/301002 |
| Rumah Pasta Dago | Kota Bandung | Rp 28,9–39,9 rb | Spesialis pasta/Italian & harga setara benchmark | carikulinerindonesia.com/10567415 |
| Lingkar Pasta | Kota Bandung | Rp 22–35,5 rb | Spesialis pasta/Italian & harga setara benchmark | carikulinerindonesia.com/10936911 |
| ALA'PASTA SPAGHETTI | Kota Bandung | Rp 29–31 rb | Spesialis spaghetti/Italian & harga setara benchmark | carikulinerindonesia.com/15328310 |
| Pasta Drive | Kota Bandung | Rp 22 rb | Spesialis pasta/Italian & harga setara benchmark | carikulinerindonesia.com/12563736 |
| SpaghettiQue - Italian Cuisine | Kota Bandung | Rp 40 rb | Spesialis spaghetti/Italian & harga setara benchmark; harga via cabang Rancamanyar | carikulinerindonesia.com/10532488; Grab dineout.spaghetti/…-C32WA7MVRJ5YNE |
| Pasta Bilqis | Kota Bandung | Rp 20–28 rb | Spesialis pasta/Italian & harga setara benchmark | menukuliner.net/menu/114281 |
| Pasta Ratan | Kab. Sleman / Kota Jogja | Rp 20–24,5 rb | Spesialis pasta/Italian & harga setara benchmark | carikulinerindonesia.com/10690796 |
| Pasta Huis Bogor | Kota Bogor & Kab. Bogor (2 baris, place_id sama) | Rp 16–21 rb | Spesialis pasta (IG @pastahuis_bogor cocok); lasagna Rp 21rb & makaroni panggang Rp 16rb dalam benchmark; catatan: alamat listing Pabaton Bogor Tengah vs CSV Bantarjati Bogor Utara, kemungkinan pindah/listing ganda | carikulinerindonesia.com/10060213 |

## Reklasifikasi C
| Kompetitor | Kota | harga_label (manual) | Alasan | Sumber |
|---|---|---|---|---|
| Pasta Yori Resto | Tangerang Selatan | Rp 4–13,6 rb | Spesialis pasta tapi harga di luar benchmark (max Rp 13,6 rb < 20 rb) | carikulinerindonesia.com/14638971 (Yo Spaghetti Bolognese Rp 13.600) |
| Lasagna by Indria | Tangerang Selatan | Rp 35–238 rb | Spesialis pasta tapi harga di luar benchmark — lasagna personal utama Rp 68 rb, family Rp 238 rb | carikulinerindonesia.com/10997013 |
| Pasta Kangen Ungu | Kab. Bogor | Rp 15–17,5 rb | Spesialis pasta tapi harga di luar benchmark (max Rp 17,5 rb < 20 rb) | menukuliner.net/menu/466033 |
| Senti Ristorante | Kota Bandung | Rp 80–215 rb | Spesialis pasta tapi harga di luar benchmark (min Rp 80 rb ≥ 50 rb) | menu PDF Chope (riset 2026) |

## Reklasifikasi B
| Kompetitor | Kota | harga_label (manual) | Alasan | Sumber |
|---|---|---|---|---|
| il Fresco Artisan Pasta - Homemade Pasta Supplier Jakarta | Tangerang Selatan | — (tidak tertera) | Objek melebar — supplier homemade pasta B2B, bukan kedai saji langsung | LinkedIn (GM il Fresco Jakarta; packaging retail) |
| Win's Pasta | Bekasi | Rp 1–104 rb | Objek melebar (pizza & pasta, rentang harga lebar) — kompetitor sekunder | menukuliner.net/katalog/tuna-aglio-di-jakarta |
| Tirari Food Pasta & Asian | Bekasi | — (tidak tertera) | Objek melebar (pasta & aneka Asia/kopi), bukan spesialis pasta murni | jajandolan.com (Tigari Food & Coffee Bekasi) |
| Hiraku Pasta & Ricebowl | Bekasi | Rp 14–25 rb | Objek melebar (pasta & ricebowl/ramen), bukan spesialis pasta murni | carikulinerindonesia.com/11384565; /15414701 |

## Tetap TBD (36 kompetitor unik)
Alasan umum: pencarian web tidak menghasilkan menu/harga yang jelas & terverifikasi untuk objek/wilayah yang sama.

- **Tangerang Selatan (7):** Pasta & Ice Cream; Lasagna Kitchen; Ciao Pasta (GS); Rav Pasta; Trattoria Pasta; BÈBÈ PASTA; Puzzle it Pasta.
- **Bekasi (3):** FINE PASTA; zahra's pasta; Raika Pasta.
- **Depok (4):** Amanda Pasta; LeShayla Pasta dan Pastry; SPAGHETTI MANTEBS resto; Raja pasta.
- **Kab. Bogor (13):** PASTA 9.0; VIP Canteen Pasta; La Cucina di Tania; Asinan-Pasta Asinan; Angel Pasta's Kitchen; Studio Rasa; BEEF LASAGNA BOGOR; MamayaPasta; Kedai Pasta; Putri Aneka Pasta; Rap's Pasta; Pasta Corner And Snack - Foodcount Bersama; PASTI PASTA.
- **Kota Bandung (4):** Rumarasa Pasta & Donut; Pasta 18 Toko; Akira Pasta; Spaghetti Dayeuhkolot apiw (gentech.one/spaghetti-dayeuhkolot-apiw/ hanya konfirmasi alamat, tanpa harga).
- **Yogyakarta (2):** Spaghetti & Pasta Mak Ning; Pesta Pasta Yogyakarta.
- **Bandar Lampung (3):** PASSIONE Pasta Otentik Lampung (kooliner.com — hanya alamat Kangkung Telukbetung Selatan, tanpa harga); Ulil@Spaghetti; Pasta Cherry.

## Catatan verifikasi
- **Pasta Cherry (Lampung)** & **Ulil@Spaghetti**: pencarian menemukan nama serupa dengan harga (Pasta MeeraThar, Buono Pasta, Spaghetti Tulang Lampung) tetapi lokasi/objek berbeda → tidak digunakan.
- Harga cabang jaringan dipakai sebagai proksi bila alamat nama cocok (SpaghettiQue via cabang Rancamanyar; Pastayani via cabang Nusa Jaya Karawaci).
- Kolom non-harga (rating, n_reviews, jarak, alamat, URL Maps) tidak diubah; hanya kolom hasil riset manual yang diupdate.

## Putaran 2 (prioritas): Bogor (14 unik), Kota Bandung (4), Bandar Lampung (3)
Metode: pencarian web & sosmed (via websearch) — nama + area + kata kunci (pasta/menu/harga/lasagna/makaroni/panggang). Keputusan: tanpa data harga yang terverifikasi → tetap **TBD** (per direktif).

### Hasil putaran 2
| Kompetitor | Hasil | Kesimpulan |
|---|---|---|
| **Pasta Huis Bogor** (Kota & Kab. Bogor) | carikulinerindonesia.com/10060213: Makaroni Panggang Rp 16.000, Lasagna Rp 21.000, minuman Rp 13–16.000; IG @pastahuis_bogor unik & cocok. Alamat listing Pabaton (Bogor Tengah) tak sama dgn CSV Bantarjati (Bogor Utara) — dianggap pindah/listing ganda. **Reklasifikasi → A ("Rp 16–21 rb")** | **A** |
| Pasta 18 Toko (Kota Bandung) | restaurantguru.com/Pasta-18-Toko-Bandung: toko terkonfirmasi (Jl. Tripang No.18, Turangga, Lengkong; lasagna beef & chicken-mushroom, makaroni, klapertart; GoFood alias "eunin kitchen"; telp +62 22 7312143). Harga tidak tersedia | TBD |
| MamayaPasta (Cileungsi) | carikulinerindonesia.com/14630100 → Rp 0–0 (kosong) | TBD |
| Putri Aneka Pasta (Gn. Putri) | "Pasta Putri" carikulinerindonesia.com/11140423 ada (Baked Macaroni Rp 23rb, Spaghetti Brulee Rp 23rb, Beef Lasagna Mozzarella Rp 30rb) tapi alamat Bojonggede/Cimanggis ≠ Bojong Kulur → tidak dipakai | TBD |
| Studio Rasa (Bogor Utara) | carikulinerindonesia.com/12761513 = Gunung Putri & menu martabak → objek berbeda | TBD |
| BEEF LASAGNA BOGOR (Sukaraja) | hanya listing Maps (Jl. Griya Soka 3, rev 4); no price | TBD |
| Kedai Pasta (Cileungsi) | no jejak harga | TBD |
| Rap's Pasta (Grand Nusa Indah, Cileungsi) | no jejak harga | TBD |
| Pasta Corner And Snack (Jatiasih) | hasil = "Pasta Corner" Huk Family Resto ≠ | TBD |
| PASTI PASTA (Cileungsi Metland) | hasil = "PASTi Pasta" (Taiwan) ≠ | TBD |
| VIP Canteen Pasta (Tegallega) | no jejak harga | TBD |
| Asinan-Pasta Asinan | hasil = "The Pasta Bojonggede" ≠ | TBD |
| Angel Pasta's Kitchen (Menteng) | hasil = Angels Kitchen Cileungsi (masakan Manado) ≠ | TBD |
| PASTA 9.0 (Sempur) | no jejak harga | TBD |
| La Cucina di Tania (PO Spaghetti Brulee) | no jejak harga | TBD |
| Rumarasa Pasta & Donut (Citeureup) | "Rumarasa Nusantara" (aglio olio Rp 89rb, carbonara Rp 98rb) = restoran berbeda | TBD |
| Akira Pasta (Turangga, Lengkong) | no jejak harga | TBD |
| Spaghetti Dayeuhkolot apiw | gentech.one hanya konfirmasi alamat (Jl. Raya Bojongsoang No.76 Dayeuhkolot) | TBD |
| PASSIONE Pasta Otentik Lampung | kooliner.com hanya alamat (Kangkung, Telukbetung Selatan) | TBD |
| Ulil@Spaghetti (Lampung) | no jejak harga (nama serupa = usaha lain) | TBD |
| Pasta Cherry (Lampung) | no jejak harga | TBD |

### Net putaran 2
- 1 reklasifikasi baru: **Pasta Huis Bogor → A** (baris Kota Bogor "Sindang Barang - Bogor Timur" idx 3 & Kab. Bogor "Sentul City" idx 3, place_id `0x2e69c42e13c80767:0x43517c23264e8952`).
- 20 dari 21 prioritas tetap TBD — jejak online UMKM pasta sangat minim (no menu/harga terverifikasi di web/sosmed).
- **Rekap akhir: A = 14, C = 4, B = 4, TBD = 36 unik.**
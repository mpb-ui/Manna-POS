# Penempatan otomatis seluruh Outdoor

Tanggal: 17 Oktober 2026. Basis: `8073b2518326aed0c687bce502448a0d305563b1`.

Batch ini melanjutkan penyamaan UI pada `product-configurator-audit.md`: perhitungan otomatis sekarang berlaku untuk seluruh produk Outdoor berukuran bebas, bukan hanya Albatros. Tidak ada migrasi, seed ulang, perubahan tarif, atau penulisan data produksi selama implementasi dan QA.

## Produk dan dasar perhitungan

| Produk | Kapasitas roll yang digunakan | Dasar harga tetap |
| --- | --- | --- |
| FL 280 Glossy | 110 / 220 / 320 cm | m², lebar nominal 1 / 2 / 3 m |
| FL 380 Matte | 110 / 220 / 320 cm | m², lebar nominal 1 / 2 / 3 m |
| FL 410 Glossy | 220 cm | m², lebar nominal 2 m |
| FL 440 Matte | 320 cm | m², lebar nominal 3 m |
| Cloth Banner | 100 / 150 cm, fallback konfigurasi existing | Meter lari |
| NB Backlite 510 | 320 cm | Meter lari |

Cloth Banner menggunakan kapasitas yang sudah berlaku, tanpa mengasumsikan lebar ekstra. `rollCapacities`/`outdoorCapacities` yang dikonfigurasi tetap diutamakan. Produk Outdoor baru dengan dasar `sqm` atau `linear_m` juga menggunakan algoritme bersama. Spanduk Template mempertahankan tiga ukuran dan biaya desain tetap; pilihan tersebut bukan lebar roll bebas.

## Algoritme dan tampilan

- Kasir memasukkan lebar gambar, panjang gambar, lebihan per sisi, dan jumlah. Pada desktop ketiga input ukuran satu baris; pada layar kecil baris menyesuaikan.
- Kedua arah 0°/90° dibandingkan untuk setiap roll. Footprint fisik mencakup lebihan di kedua sisi. Penempatan harus muat pada kapasitas roll.
- Prioritas pertama adalah luas bahan terpakai paling kecil; jika sama, pilih unit tagihan paling kecil, kemudian urutan deterministik. Ini mengikuti prioritas hemat bahan Albatros; hasilnya tidak selalu harga jual paling murah karena minimum dan pembulatan tagihan.
- Lebihan hingga 5 cm/sisi tidak menambah panjang tagihan. Di atas 5 cm, kedua sisi ikut menambah panjang tagihan. Minimum 1 m dan pembulatan produk tetap berlaku.
- Harga m² memakai lebar nominal × panjang tagihan. Harga meter lari hanya memakai panjang tagihan. Grosir, promo, finishing, desain, HPP, serta pemetaan SKU roll memakai jalur existing.
- Detail perhitungan tertutup secara default, berisi bahan terpilih, panjang tagihan, estimasi pemakaian fisik, pratinjau, dan perbandingan penempatan. Kasus tidak muat atau input invalid menampilkan pesan dan memblokir Tambah Pesanan.
- Contoh FL 280: gambar asli 200 × 100 cm, lebihan 5 cm/sisi → diputar pada roll kapasitas 110 cm; footprint 110 × 210 cm, panjang tagihan 2 m, harga dasar Rp60.000 per lembar. Ukuran asli tetap 200 × 100 cm.

Perhitungan murni bersama berada di `public/roll-placement.js`, dipakai frontend dan backend. Backend menghitung ulang pilihan roll dan snapshot; nilai roll/snapshot dari klien tidak dipercaya. UI bersama di `public/roll-configurator.js` menggantikan modul khusus Albatros, dengan algoritme Albatros tetap didelegasikan ke modul lamanya.

## Kompatibilitas dan data

Snapshot penempatan disimpan terpisah dari ukuran asli/lebihan dan ditampilkan pada detail, nota, SPK, dan dokumen PO. Membuka atau mencetak order historis tidak menghitung ulang harga.

Edit draft lama dengan ukuran, jumlah, lebihan, dan lebar yang sama mempertahankan perhitungan lama. Konfigurasi baru, perubahan ukuran/lebihan, permintaan versi kalkulasi baru, serta repeat order memakai perhitungan otomatis. Endpoint preflight dan penyimpanan sama-sama menerima konteks draft historis yang sudah diperiksa izinnya.

Stok fisik roll tetap dikurangi manual, bukan saat menyelesaikan pesanan. Estimasi penggunaan bahan bukan mutasi stok. Tidak ada perubahan izin, akses nominal, pembayaran, maupun workflow per item.

## Validasi

- Seluruh **206 automated tests lulus**, termasuk 7 test baru (unit dan integrasi API).
- Pengujian unit mencakup 270 kombinasi produk/ukuran/lebihan, dimensi tertukar, batas 5 cm, satu roll, meter lari, tidak muat, input invalid, snapshot palsu, grosir/promo/finishing/desain, pemetaan bahan/HPP, template, dan draft historis.
- Integrasi API mencakup order multi-item, request konfirmasi berulang bersamaan, edit draft, DP idempotent, repeat order, izin operator, penyelesaian item, serta stok roll yang tidak berubah.
- Chromium: keenam produk Outdoor pada **54 kombinasi produk/viewport**, termasuk layar 320 px, landscape, dan perangkat sentuh. Form desktop sesuai susunan referensi; tidak ada overflow atau error browser.
- Browser memeriksa keranjang/blinking, tutup-buka konfigurasi, simpan/edit draft baru dan lama, DP, nota/SPK, ukuran asli, snapshot, stok roll, dan template.
- Regresi seluruh 278 SKU bawaan pada 1440/390/320 px membandingkan preview dengan backend; 16 produk representatif pada enam viewport tambahan juga lulus. Kalkulator A3, harga tetap, finishing, desain, catatan, DTF stock blocking, dan sentuhan tetap berjalan.
- Regresi khusus Albatros pada sembilan viewport lulus, termasuk A1, rotasi, finishing desimal, DP/SPK, dan stok roll.

Seluruh QA menggunakan server memory terisolasi. Status rilis mengikuti commit GitHub dan deployment Railway; deployment batch ini tidak memerlukan migrasi database.

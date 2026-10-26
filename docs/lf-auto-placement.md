# Penempatan otomatis Luster, Canvas, dan LF Sticker

26 Oktober 2026. Melanjutkan Albatros dan Outdoor melalui algoritme serta konfigurator bersama.

## Cakupan

| Produk | Kapasitas fisik bawaan | Lebar nominal untuk harga |
| --- | --- | --- |
| Luster | 90 / 125 / 152 cm | 0,9 / 1,2 / 1,5 m |
| Canvas | 125 cm | 1,2 m |
| LF Sticker Transparant | 152 cm | 1,5 m |
| LF Sticker White Glossy / White Matte | 102 / 152 cm | 1 / 1,5 m |
| LF Sticker Sandblast Cetak / Tanpa Cetak | 102 / 152 cm | 1 / 1,5 m |
| LF Sticker Oneway Outdoor / HI-RES | 102 / 152 cm | 1 / 1,5 m |

Produk baru kategori LF Sticker dengan harga m² mengikuti aturan yang sama. Kapasitas dan lebar mengikuti konfigurasi produk; tabel adalah nilai bawaan. Produk satuan dan template tetap menggunakan aturan masing-masing.

## Perilaku

- Kasir mengisi ukuran asli dan jumlah; aplikasi membandingkan kedua orientasi pada semua roll yang tersedia. Prioritas luas bahan terpakai terkecil, kemudian unit tagihan terendah saat seri. Ini bisa berbeda dari harga termurah karena pembulatan dan minimum tagihan.
- Menggunakan kalkulasi Albatros yang sama: lebar nominal × panjang ditagihkan × tarif × jumlah. Minimum panjang 1 m, pembulatan bawaan 10 cm mengikuti `billingIncrement` produk. Tidak menambahkan lebihan Outdoor.
- Roll tunggal tetap dapat diputar. Kedua arah tidak muat menampilkan pesan dan memblokir penambahan pesanan.
- Detail perhitungan mencakup roll, arah, panjang tagihan, estimasi bahan, diagram dan perbandingan. Server menghitung ulang pilihan roll; override/snapshot klien tidak dipercaya.
- Ukuran asli disimpan terpisah dari snapshot penempatan, serta diteruskan ke detail/nota/Print SPK. Pilihan A1 yang tersedia memakai tarif per lembar. Finishing, grosir, promo, biaya desain dan pemetaan SKU/HPP mengikuti jalur existing.
- Draft historis tanpa snapshot mempertahankan perhitungan lama saat ukuran/jumlah/lebihan/lebar tidak berubah. Perubahan ukuran/jumlah, konfigurasi versi baru dan repeat order memakai aturan otomatis. Membuka/mencetak riwayat tidak menghitung ulang transaksi.
- Stok fisik roll dikeluarkan manual; estimasi luas bukan mutasi stok. Tidak memerlukan migrasi atau perubahan katalog/tarif.

## Validasi

- Unit: seluruh sembilan produk, 648 kombinasi dimensi dan pasangannya yang tertukar, batas kapasitas/desimal, produk baru, A1, invalid/no-fit, finishing/grosir/promo/desain, SKU bahan dan kompatibilitas draft/repeat.
- Integrasi API: seluruh sembilan produk, snapshot palsu, simpan/edit multi-item, retry bersamaan, DP idempotent, repeat, izin operator dan alur produksi hingga selesai dengan saldo roll tetap.
- Seluruh 263 automated tests lulus. Chromium memeriksa sembilan produk pada 1440/390/320 px: preview cocok dengan server, invalid/no-fit, A1, diagram dan layout. Alur simpan/edit draft, ukuran asli, DP dan Print SPK juga lulus. QA menggunakan server memory terisolasi, tanpa transaksi pengujian di produksi.

Rilis mengikuti GitHub main dan deployment Render.

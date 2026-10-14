# Stok pada pemilihan Sablon Kaos

Scope: Sablon Kaos saja. Basis production sebelum batch ini: ececea1d69fcfb1329720739d78e4f1ff039166c. Tidak ada migrasi, perubahan saldo, harga paket/XXL, permission baru, atau perluasan validasi ke produk lain.

## Temuan dan perilaku baru

Konfigurasi sebelumnya hanya menampilkan Tersedia n pcs. Tombol Tambah ke Pesanan memeriksa bilangan/duplikasi kombinasi, tetapi tidak memeriksa ketersediaan. Stok akhirnya diperiksa pada pembayaran melalui ensureShirtStock. Kasir baru melihat masalah setelah mengisi keranjang.

Perubahan:

- Dropdown ukuran menampilkan contoh **M — 8 pcs** dan **S — 0 pcs (Habis)** sesuai warna yang dipilih. Ukuran habis tetap terlihat dan bisa dipilih agar alasan jelas, tetapi tidak dapat ditambahkan.
- Warning merah #f01616 dengan ikon kecil muncul pada baris terkait jika habis atau jumlah melebihi stok. Pilihan ukuran/jumlah ditandai; tombol Tambah ke Pesanan nonaktif. Mengubah warna/ukuran/jumlah yang valid langsung memulihkan tombol.
- Jumlah harus integer positif. Kombinasi berulang atau dua pilihan yang dipetakan ke SKU fisik sama tidak dapat menggunakan saldo dua kali dalam satu baris produk.
- Stok dropdown memakai **stok fisik dikurangi reservasi pesanan terkonfirmasi, lalu dikurangi kaos dalam keranjang lokal**. Kaos dari paket berbeda tetap memakai saldo warna/ukuran yang sama. Perubahan pilihan dan membuka modal tidak mengubah saldo fisik atau reservasi.
- Data diperbarui saat membuka konfigurasi dan sekali lagi sebelum menambah ke keranjang. Bila stok berubah akibat pembayaran kasir lain, penambahan ditolak dan warning diperbarui. Klik ganda tidak mengirim request/menambahkan item dua kali.
- Cek ulang stok tersedia pada kondisi bermasalah; kegagalan koneksi tidak membolehkan penambahan menggunakan data lama. Pemeriksaan dibatasi 8 detik lalu dapat diulang. Response yang tiba setelah konfigurasi ditutup/diganti diabaikan.
- Tidak ada request pada setiap ketikan/perubahan warna. Paket, ukuran XXL, catatan, modal, tombol sticky dan layout existing dipertahankan.

## Pengaman backend dan batas reservasi

GET /api/pos/shirt-stock membutuhkan pos.view, mengembalikan sepuluh kombinasi warna/ukuran/materialId/available dan memakai Cache-Control: no-store. Tidak mengirim harga, nominal, invoice atau histori. Pembacaan read-only; tidak menggunakan Store.mutate.

ensureShirtStock pada konfirmasi pembayaran/DP/PO tetap berjalan di transaksi yang terkunci. Keranjang lokal dan draft tidak memesan stok. Dua kasir boleh melihat stok sama sebelum konfirmasi; konfirmasi pembayaran yang terjadi lebih dahulu menentukan reservasi, dan konfirmasi berikutnya yang tidak cukup ditolak. UI membantu lebih awal, tetapi tidak menggantikan pemeriksaan atomik backend. Alur penyimpanan draft dan pengurangan fisik saat produksi selesai tidak diubah.

## File dan validasi

- public/dtf-stock-selection.js: penghitungan sisa setelah keranjang, validasi dan controller warning/refresh.
- public/app.js: integrasi hanya pada configurator dtfShirt dan cleanup saat tutup/ganti modal.
- public/styles.css: style warning khusus DTF, tanpa redesign halaman lain.
- server.js: endpoint read-only stok kaos.
- test/dtf-stock-selection.test.js dan test/dtf-stock-selection-api.test.js: validasi dan API/permission/concurrent payment.

Seluruh **191 tests lulus, 0 gagal** (baseline 186 + lima tests baru). Tests mencakup stok nol, jumlah berlebih/tidak valid, saldo keranjang lintas paket, mapping ke SKU sama, pergantian warna, response stok hilang, tanpa nominal, permission, dan dua pembayaran bersamaan untuk saldo yang tidak cukup.

Browser Chromium memory terisolasi, desktop/mobile 1440/1024/768/390/320: label dropdown, warning langsung, nonaktif/aktif tombol, cart stok, reservasi baru ketika modal terbuka, double click, request gagal + retry, tanpa request per ketikan, produk LF tanpa perubahan, tanpa error browser/document overflow. Harga Logo 2 kaos tetap Rp190.000. Tidak ada transaksi QA pada produksi.

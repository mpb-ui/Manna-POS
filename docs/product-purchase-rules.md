# Harga grosir terukur dan minimum pembelian

27 Oktober 2026.

## Master Data Produk

- Tambah/Edit Produk menyediakan toggle **Minimum Pembelian**. Saat aktif, tampil input bilangan bulat **Jumlah minimum**. Saat nonaktif, jumlah minimum efektif 1. Kelipatan selalu 1; minimum 3 mengizinkan 3, 4, 5 dan seterusnya. Aturan berlaku per item pesanan, termasuk varian yang dipilih. Untuk cetakan roll minimum dihitung dalam lembar/cetakan, terpisah dari luas tagihan.
- Edit Sablon Kaos menyediakan toggle yang sama; minimum berlaku untuk jumlah gabungan warna/ukuran dalam item tersebut.
- Harga Grosir memiliki dasar **Jumlah pcs/lembar**, **Luas tagihan (m²)** atau **Panjang tagihan (m)**. Luas hanya tersedia untuk produk harga m²; panjang untuk meter lari. Produk baru mengikuti dasar perhitungannya pada form.
- Tingkat m²/meter hanya memasukkan **mulai** dan tarif. Ambang mendukung desimal; sebelum ambang pertama berlaku harga normal. Tarif tingkat terpilih berlaku pada seluruh luas/panjang, bukan tarif marginal. Simulasi menampilkan total sebelum promo, finishing dan desain.
- Produk/varian/sub-varian tetap memakai urutan sumber harga existing. Harga A1 tetap per lembar dan tidak memakai tingkat meteran.

## POS dan server

- Luas tagihan = lebar nominal roll × panjang yang telah dibulatkan × jumlah. Estimasi bahan fisik dan ukuran gambar asli tidak menentukan ambang grosir.
- Luas/panjang diakumulasi untuk produk, varian bahan, sub-varian, ukuran tetap dan pilihan produk yang sama dalam satu invoice. Dimensi, catatan dan finishing berbeda tidak memisahkan kelompok harga. Produk/bahan/sub-varian berbeda tidak digabung. Satuan jual tetap tidak digabung dengan meteran.
- Preview mempertimbangkan item keranjang lain; edit mengecualikan item yang sedang diganti. Server menghitung ulang dari master dan dimensi terverifikasi, mengabaikan angka akumulasi/harga kiriman klien. Tambah, edit dan hapus item menghitung ulang harga seluruh kelompok.
- POS menampilkan luas akumulasi dan tingkat aktif di bawah Jumlah. Tabel perbandingan roll juga menghitung tarif setiap kandidat sesuai luasnya sendiri.
- Jumlah awal mengikuti minimum. Tombol tambah/kurang berlangkah 1 dan tombol kurang berhenti di minimum. Input manual di bawah minimum memperlihatkan pesan dan memblokir Tambah ke Pesanan. Penjualan cepat memakai minimum saat pertama dipilih; produk tetap bisa dihapus dari keranjang.
- Server memvalidasi minimum saat preflight, buat/edit draft dan repeat. Draft lama yang belum dikonfirmasi juga diperiksa saat pembayaran pertama, tanpa menghitung ulang harga tersimpannya. Perubahan minimum di master tidak menghalangi pelunasan pesanan yang telah dikonfirmasi/dibayar sebelumnya.

## Kompatibilitas

Tidak ada migrasi database, seed ulang, atau perubahan massal tarif/minimum. Konfigurasi existing tanpa `wholesaleBasis` tetap berdasarkan quantity. Owner memilih **Luas tagihan (m²)** di Edit Produk lalu mengatur ambang/tarif untuk mengaktifkan aturan luas. Form quantity mempertahankan rentang minimum/maksimum existing. Produk tanpa toggle minimum tetap mulai dari 1.

Pesanan historis tidak dihitung ulang saat dibuka/dicetak. Perubahan ini tidak mengubah cara pengeluaran roll, waktu pengurangan bahan satuan, pembayaran maupun retur.

## Validasi

- Seluruh **271 automated tests** lulus, termasuk batas desimal, akumulasi lintas ukuran, varian/sub-varian, harga A1, promo/desain, kandidat roll, grosir quantity lama, minimum dan jumlah warna/ukuran DTF.
- Integrasi API mencakup penyimpanan master, preflight, buat/edit pesanan, minimum palsu/invalid, pembayaran pertama, retry idempotent, pelunasan historis, perubahan ambang dan mutasi stok.
- Chromium: Tambah Produk minimum 3, edit/nonaktifkan minimum, jumlah awal dan langkah 1, blokir jumlah 2, simpan draft 4 pcs, editor grosir luas, simulasi, preview/akumulasi/penghapusan keranjang, tingkat aktif dan layout 1440/390/320 px. Tidak ada error JavaScript atau mutasi stok akibat pengaturan/preview/draft.

Semua pengujian menggunakan server memory terisolasi. Rilis melalui GitHub main dan Render.

# Barcode POS

## Persiapan

1. Buka tab **Master Data → Registrasi Barcode**. Halaman **Daftar Produk** juga menyediakan pintasan ke tab ini dan bagian **Barcode Produk** di form Barang Dagangan.
2. Pilih baris produk atau kombinasi varian. Gunakan **Scan Barcode** untuk mendaftarkan kode pabrik atau klik **Generate Barcode** untuk membuat dan langsung menyimpan satu kode internal Manna berformat Code 128. Jika kode internal sudah ada, pilih kode tersebut saat mencetak ulang label.
3. Gunakan **Cetak Label** pada satu baris atau centang beberapa baris. Pilih kode, jumlah salinan, dan ukuran label. Ukuran awal 40 × 30 mm dengan opsi A4 atau A3+. Harga jual dapat ditampilkan melalui kotak centang.
4. Setelah label dan scanner diuji, aktifkan **Master Data → Pengaturan POS → Barcode Scanner** dengan akun Owner atau Admin. Muat ulang halaman POS yang terbuka di komputer kasir.

Registrasi dan cetak label dapat dilakukan saat pengaturan OFF. Kode internal tetap sama setelah perubahan nama, harga, atau SKU. Jika barcode ATK lama tersedia, form menawarkannya sebagai isian untuk ditinjau sebelum didaftarkan. UPC-A dan padanan EAN-13 yang valid mengarah ke barang yang sama. Ejaan barcode yang didaftarkan tetap tersimpan, termasuk nol di depan.

Untuk produk satuan lama di **Akrilik** atau **Frame Foto** yang belum memiliki jenis produk, pilih **Jadikan Barang Dagangan** pada barisnya bila dijual siap pakai. SKU terhubung ke **Stok Bahan**. Masukkan saldo fisik jika stoknya belum tercatat, lalu daftarkan barcode.

## Pemindaian dan stok

- Gunakan mode **HID Keyboard** dengan akhiran **Enter**. Dari kategori mana pun, pindai ketika POS siap dan fokus berada di luar kolom input lain atau di pencarian produk. Jika perlu, masukkan nomor barcode di pencarian secara manual dan tekan Enter.
- Pindai satu kali untuk menambah satu unit. Pindai kembali atau ubah jumlah di Ringkasan Pesanan. Produk yang memerlukan pilihan tambahan tetap dibuka melalui katalog.
- Pemindaian menampilkan harga yang dihitung ulang oleh kalkulator pesanan. Saldo dicek saat penambahan atau perubahan jumlah, lalu dicek lagi di transaksi pembayaran. Saat POS Scanner aktif, draft yang memuat barang dagangan menyimpan ketentuan cek saldo hingga pembayaran pertama, termasuk jika pengaturan kemudian dimatikan.
- DP pertama menggunakan aturan konfirmasi penjualan yang sama. Pelunasan dan retry pembayaran menggunakan penanda stok yang sudah dicatat. Barang dagangan yang diambil dapat ditukar lewat retur defect, dengan stok barang pengganti dicatat sesuai alur retur. Barang yang kembali layak jual dapat dicatat melalui mutasi retur fisik.

## Migrasi dan backup

Startup PostgreSQL membuat tabel `pos_product_barcodes` dan indeksnya di dalam transaksi yang mengunci `app_state`. Kode barcode bertipe teks dan menjadi primary key. Indeks target memakai ID produk dan kombinasi ID varian. Indeks unik parsial membatasi satu kode internal per target. Registrasi dan pembuatan kode menggunakan transaksi yang sama dengan audit dan pengunci katalog.

Nilai `posBarcodeEnabled` disimpan dalam `app_state`. Database lama tanpa pengaturan ini dibaca sebagai OFF. Backup menyimpan registri barcode dan pengaturan bersama data POS. Restore ke database kosong membawa keduanya kembali dan startup memindahkan registri ke tabel baru. Data produk, stok, dan histori yang sudah ada tidak memerlukan entri ulang.

## Uji scanner dan printer di meja kasir

1. Di Notepad, pindai kode pabrik dan kode internal 20 kali berturut-turut. Cek seluruh karakter, nol di depan, dan perpindahan baris setelah setiap scan. Bila ada karakter hilang, cek mode HID, layout keyboard Windows, koneksi, dan pengaturan jeda karakter di manual scanner. Aplikasi hanya menerima karakter yang dikirim scanner.
2. Cetak A4 dan A3+ pada skala **100% / Ukuran aktual** dan cocokkan ukuran fisik label dengan penggaris. Pindai label di baris pertama dan terakhir, termasuk label varian dan kode yang dicetak ulang. Pertahankan area putih di sisi garis barcode. Perbesar label jika kode panjang tidak muat.
3. Pindai barcode pabrik dan internal dari kategori lain di POS. Uji tiga scan cepat, gabungan dengan item manual, perubahan jumlah, dan produk nonaktif atau stok habis. Coba pindai kode bahan dan command untuk melihat penolakan.
4. Uji fokus nama pelanggan, WhatsApp, ukuran, catatan, dan pembayaran. Karena scanner HID bertindak seperti keyboard, karakter masih dapat masuk ke kolom yang sedang fokus. Selesaikan pengisian dan pindahkan fokus sebelum memindai barang.
5. Dengan data uji, konfirmasi DP lalu pelunasan dan cek Mutasi Stok. Gunakan dua sesi untuk mencoba membayar barang yang stoknya tinggal satu. Cek juga ulang Stock Scan gudang.

Input scanner diuji dengan simulasi keyboard Chromium. Profil scanner fisik Windows, kualitas kertas, printer, dan jarak pembacaan perlu dicek saat uji di toko.

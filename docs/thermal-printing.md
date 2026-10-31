# Struk Nota dan Work Order 80 mm

Nota Ulang dan Cetak Bukti pada Riwayat Pembayaran memakai satu template struk.
Print SPK menghasilkan Work Order berisi seluruh item invoice, tanpa nominal atau
informasi pembayaran. Print Tanda Terima, bukti mutasi deposit, bukti penerimaan /
pengembalian uang, PO PDF, laporan, dan slip gaji tetap dokumen terpisah.

## Komputer kasir

Target perangkat: iWare J82BT, Windows 11, USB, driver sudah terpasang.

1. Buka Nota Ulang / Cetak Bukti / Print SPK dari aplikasi.
2. Pada dialog cetak browser pilih printer iWare yang terpasang, kertas roll
   **80 mm**, skala **100%**, satu salinan, dan matikan header/footer browser.
3. Gunakan margin 4 mm (konten 72 mm). Aktifkan pencetakan latar belakang agar
   batang Grand Total tercetak hitam dengan teks putih. Template juga meminta
   warna cetak yang tepat melalui CSS.
4. Lakukan satu tes fisik nota dan Work Order. Periksa lebar, keterbacaan huruf,
   jarak potong, panjang feed, dan nominal sebelum pemakaian rutin. Ukuran roll /
   panjang feed mengikuti kemampuan driver; aplikasi tidak memaksa tinggi A4.

Cetak membuka dialog browser. Tidak memerlukan font terpasang di Windows,
QZ Tray, atau koneksi USB langsung dari server Render. Cetak otomatis tanpa
konfirmasi dan perintah cutter ESC/POS belum menjadi bagian alur ini.

## Isi dan sumber data

- Logo menggunakan file PNG yang diberikan pengguna, `manna-receipt-logo.png`.
  CSS cetak mengubahnya menjadi hitam untuk thermal monokrom.
- IBM Plex Sans Regular 400, SemiBold 600, Bold 700 dan Italic 400 disajikan dari
  aplikasi. Sumber resmi `@ibm/plex-sans` 1.1.0; lisensi OFL ada bersama font.
  Font dan logo ditunggu sebelum dialog cetak dibuka. Kegagalan aset menghentikan
  cetak dan menampilkan pesan agar nota tidak diam-diam memakai font pengganti.
- Tanggal kedua dokumen mengikuti tanggal pesanan, dalam WITA. Bukti pembayaran
  historis tetap memakai tanggal pesanan sesuai keputusan produk.
- Item memakai snapshot pesanan, termasuk varian, kombinasi warna/ukuran DTF,
  finishing, layanan desain, catatan, kalkulator lembar dan ukuran produksi.
  Subtotal sudah mencakup finishing/desain; rincian tidak ditambahkan ulang.
- Work Order memakai ukuran gambar/akhir dan penempatan fisik; panjang tertagih
  yang dibulatkan tidak dijadikan ukuran gambar. Deadline item dicetak jika
  berbeda dari deadline invoice. Varian Ukuran tetap label pilihan biasa.
- Nota Ulang menampilkan total dan saldo terkini. Bukti pembayaran memakai
  total, diskon, saldo sebelum/sesudah, serta petugas dari transaksi yang dipilih.
  Entri deposit dan uang masuk dengan `transactionId` sama menjadi satu nomor
  bukti. Kedua ID ledger lama tetap dapat dipakai pada endpoint bukti.
- `Bayar` adalah alokasi pembayaran invoice pada konfirmasi tersebut; `Uang
  diterima` adalah tender baru, `Kembali` kembalian tunai aktual, dan `Disimpan
  ke deposit` kelebihan yang dikreditkan. Penggunaan deposit tidak menjadi uang
  masuk baru. Jika tender lama tidak tercatat, nilainya tidak ditebak.
- DP / belum membayar: Belum Lunas dan sisa tagihan. PO bukan penerimaan uang.
  Diskon penuh menjadi Lunas hanya setelah konfirmasi, tanpa nomor pembayaran
  atau uang masuk palsu. Draft / pembatalan diberi penanda yang jelas.
- Membuka dan mencetak dokumen tidak menulis pesanan, stok atau saldo deposit.
  Bukti pembayaran tetap hanya untuk Owner, Manager, dan Kasir yang memiliki
  izin orders.view serta projects.money.

## Verifikasi implementasi

Tes Node mencakup pengelompokan pembayaran, DP historis, diskon, deposit,
kembalian, data lama, varian, ukuran produksi, escaping teks, dan kesiapan aset.
Verifikasi browser memakai tombol asli aplikasi, cetak 80 mm, PDF font tertanam,
kasus nama / nominal panjang, invoice banyak item, mobile, serta konfirmasi
pesanan dan stok tidak berubah setelah cetak. Uji fisik printer perlu dilakukan
di komputer kasir karena printer USB tidak terhubung ke lingkungan pengembangan.

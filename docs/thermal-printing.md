# Struk Nota dan Work Order 80 mm

Nota Ulang dan Cetak Bukti pada Riwayat Pembayaran memakai satu template struk.
Print SPK menghasilkan Work Order berisi seluruh item invoice, tanpa nominal atau
informasi pembayaran. Print Tanda Terima, bukti mutasi deposit, bukti penerimaan /
pengembalian uang, PO PDF, laporan, dan slip gaji tetap dokumen terpisah.

## Komputer kasir

Target perangkat: iWare J82BT, Windows 11, USB, driver sudah terpasang.

1. Unduh paket Windows Manna Print Helper, ekstrak seluruh ZIP, lalu jalankan
   `Install.cmd` satu kali pada akun Windows kasir. Panduan lengkap ada pada
   [print-helper.md](print-helper.md).
2. Buka Nota Ulang / Cetak Bukti / Print SPK dari aplikasi. Izinkan browser
   membuka Manna Print Helper. JasperViewer terbuka dengan dokumen yang sudah
   memiliki ukuran panjang sesuai seluruh isi.
3. Klik Print di JasperViewer, pilih printer iWare, kertas **80 mm**, skala
   **100%**, lalu cetak. Dokumen menggunakan area isi sekitar 72 mm.
4. Lakukan satu tes fisik nota dan Work Order. Periksa lebar, keterbacaan huruf,
   jarak potong, panjang feed dan nominal sebelum pemakaian rutin. Dukungan
   panjang kertas / cutter tetap mengikuti driver dan printer yang digunakan.

Helper menyertakan Java, JasperReports, JasperViewer, font dan logo. Tidak perlu
memasang Java atau font secara terpisah. Helper aktif saat ada permintaan cetak,
tanpa layanan permanen atau port HTTP lokal, lalu menampilkan JasperViewer.

Mulai Helper **1.0.2**, Grand Total memakai teks hitam tebal di latar putih pada
kedua jalur cetak. Cetak native menyesuaikan dokumen dengan lebar area cetak dan
margin driver yang dipilih di dialog printer. Jika driver membatasi panjang
roll, bagian berikutnya diteruskan tanpa mengulang header. Pasang ulang helper
dari paket terbaru agar perubahan native berlaku; refresh POS untuk jalur
browser. Bersihkan antrean cetak yang gagal sebelum menguji pembaruan.

Jika memakai pilihan **Cetak melalui browser** pada dialog peluncuran, pilih
roll 80 mm, skala 100%, matikan header/footer browser dan aktifkan grafis latar.
Fallback HTML tetap mengikuti ukuran kertas driver; jalur utama memakai ukuran
halaman JasperPrint yang dihitung berdasarkan isi. QZ Tray / ESC-POS dan cetak
fisik tanpa dialog belum menjadi bagian alur ini.

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

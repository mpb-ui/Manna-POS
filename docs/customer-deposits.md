# Pelanggan dan deposit

Revisi 20 Oktober 2026. Basis: 3e3a984ddcd60a9608502714a1753522122c3de6. Fitur terintegrasi dengan POS, pembayaran, Status Order, dokumen dan Laporan existing; tidak menambah dependency.

## Penggunaan

Master Data → Pelanggan menyediakan pencarian nama/WhatsApp, filter punya deposit, profil, riwayat pembelian dan mutasi saldo. Kasir hanya mendapatkan tab Pelanggan, tanpa akses master katalog. Owner/Admin dapat mengubah profil dan mencatat saldo awal terverifikasi, koreksi atau refund. Saldo bukan field profil yang dapat diedit langsung.

Pada Ringkasan Pesanan klik **Cari Pelanggan** di kanan label Nama pelanggan. Popup di area input menyediakan pencarian nama/WhatsApp, daftar saldo deposit (hanya jika saldo lebih dari nol), serta Tambah Pelanggan. Memilih hasil mengisi nama dan WhatsApp. Jika saldo positif, satu baris **Deposit Tersedia** tampil di footer tepat di atas Total; saldo nol tidak membuat baris atau jarak kosong. Tidak ada checkbox, field nominal deposit, penanda akun terhubung, atau sisa bayar di Ringkasan Pesanan. Total tetap harga pesanan; penggunaan deposit dipilih di Pembayaran, dengan saldo terbaru yang dimuat ulang. Input manual tetap tersedia tanpa memilih akun. Nomor 08/+62/62 dinormalisasi, nama sama tidak digabung otomatis. Pelanggan dengan nomor bersama tetap dipilih secara eksplisit. Mengedit nama/WhatsApp sehingga berbeda dari akun akan melepas tautan deposit. Popup mendukung Escape, klik di luar, navigasi panah/Enter, dan penyesuaian posisi saat viewport berubah.

Simpan Draft belum memotong saldo. Konfirmasi Pembayaran memotong saldo dan mencatat pelunasan parsial/penuh sekaligus. Deposit mengurangi sisa bayar, bukan harga/total produk. Pembayaran penuh deposit tidak memerlukan metode uang baru atau penerimaan fiktif Rp0. Pemakaian dapat digabung dengan transfer/QRIS/tunai. DP 50% dan PO existing tetap tersedia; pencatatan dokumen PO sendiri tidak memakai deposit.

Form pembayaran hanya menampilkan opsi **Gunakan deposit** jika akun yang terhubung memiliki saldo dan nota masih memiliki tagihan. Opsi berupa satu baris checkbox dan nominal, diikuti Total Tagihan setelah potongan deposit. Tidak ada input nominal deposit, referensi transfer, catatan pembayaran, opsi kembalian tunai, atau panel kelebihan di form ini. Menonaktifkan checkbox mengembalikan tagihan ke nilai sebelum deposit. Saldo selalu dimuat ulang sebelum konfirmasi; kegagalan membaca saldo memblokir pembayaran sampai form dibuka ulang.

Jika tagihan125.000 diterima152.000, klik Konfirmasi Pembayaran membuka popup **Kelebihan Pembayaran Rp27.000 — Simpan sebagai deposit?** dengan Cek Kembali dan Ya, Lanjutkan. Cek Kembali/tutup/Escape tidak mencatat pembayaran ataupun mutasi dan mempertahankan nominal input. Ya, Lanjutkan mengalokasikan125.000 ke nota dan27.000 ke saldo. Selisih dihitung terhadap sisa tagihan SETELAH deposit, bukan total produk; backend tetap memvalidasi dan menghitung ulang. Alur ini berlaku untuk Tunai/QRIS/Transfer. Pengembalian uang tetap melalui refund Owner/Admin terpisah agar dapat diaudit.

Popup menyebutkan nama dan WhatsApp tujuan saldo. Untuk nota belum tertaut, setelah Ya, Lanjutkan sistem mencari akun dengan nama DAN nomor yang sama; jika belum ada, akun dibuat sesuai permission pelanggan. Akun dengan nomor bersama tetapi nama berbeda tidak digunakan. Pembuatan akun kosong tidak memindahkan saldo; alokasi uang, pemakaian/pengisian deposit dan pembayaran tetap satu transaksi atomik pada backend. Tidak ada penautan akun/pembuatan akun hanya karena melihat form atau memilih Cek Kembali.

Pada Detail Pesanan tersedia Catat Transfer Tambahan, termasuk setelah lunas/Diambil. Transfer kedua125.000 pada nota lunas menambah saldo125.000 tanpa melipatgandakan paidAmount nota. Referensi bank dan catatan pada data historis tetap disimpan. Double-click/request ulang dengan requestId sama tidak menciptakan penerimaan atau deposit kedua.

## Data dan atomisitas

- customers: identitas permanen UUID, nama, WA, catatan; tidak ada saldo yang dapat ditimpa melalui profil.
- depositLedger: append-only, signed rupiah integer; tipe EXCESS, USE, OPENING, CORRECTION, REFUND, PAYMENT_REVERSAL dan CANCEL_CREDIT. Saldo dihitung dari mutasi. Menyimpan saldo sebelum/sesudah, petugas/waktu, snapshot identitas, alasan dan hubungan nota/penerimaan/pembalik.
- cashReceipts: satu penerimaan eksternal sebenarnya, berisi nominal diterima, alokasi nota, deposit, kembalian dan saldo setelah; refund bernilai negatif.
- customerOperations: identitas request dan fingerprint payload untuk idempotency global, termasuk pembayaran gabungan/kelebihan yang tidak menambah baris pembayaran nota.
- orders.customerId opsional; pesanan lama tidak ditautkan atau digabung saat migrasi/penelusuran data. Riwayat belum tertaut dapat ditampilkan jika nama DAN WA cocok; penautan finansial memerlukan pemilihan akun atau konfirmasi penyimpanan kelebihan pada popup dengan kecocokan kedua field. Edit nama/WA akun tidak menulis ulang identitas nota lama. Repeat membawa akun, tanpa menyalin pembayaran/deposit sebelumnya.

Pemotongan saldo, pembayaran, cash receipt, audit dan konfirmasi stok memakai satu Store.mutate, satu transaksi PostgreSQL dengan SELECT FOR UPDATE pada app_state. Semua perubahan berhasil/rollback bersama. Tidak ada saldo negatif dan tidak ada pemotongan saat melihat/mengedit data non-finansial. Dua kasir tidak dapat menggunakan saldo yang sama melebihi ketersediaan. Perubahan saldo selalu divalidasi ulang server.

Penyimpanan tetap mengikuti state JSONB existing untuk menjaga atomisitas dengan pesanan tanpa rewrite arsitektur. Mutasi hanya mengirim patch bagian state yang berubah. Endpoint saldo ringkas terpisah dari riwayat; pencarian/list/riwayat menggunakan pagination. POS/bootstrap tidak membawa seluruh pelanggan atau ledger. Cache tampilan saldo maksimal5detik, dibatalkan saat reload; pembayaran selalu mengambil saldo kembali. Perhitungan list saldo dilakukan dalam satu lintasan ledger.

## Dokumen, laporan dan akses

Nota mencantumkan pembayaran deposit sebagai bagian dibayar, dengan total harga tetap. Bukti pembayaran existing tetap memakai snapshot saat transaksi. Bukti penerimaan uang terpisah mencantumkan pembagian uang ke nota/deposit/kembalian. Bukti mutasi/refund dapat dicetak dari riwayat pelanggan, dengan saldo dan identitas historis.

Laporan uang masuk menggabungkan pembayaran lama yang belum mempunyai cashReceiptId dengan cashReceipts baru. Pembayaran melalui deposit tidak dihitung sebagai penerimaan uang baru. Filter kategori/mesin hanya mengalokasikan bagian uang yang melunasi nota; deposit belum terpakai tidak dijadikan pendapatan produk. Refund mengurangi penerimaan bersih. Total nota, HPP dan item tidak bertambah karena ada beberapa sumber pembayaran.

Tab Pembayaran menampilkan ringkasan deposit masuk, dipakai, refund, pemulihan, koreksi dan saldo per tanggal akhir. Ringkasan ini mencakup seluruh pelanggan pada rentang tanggal, terpisah dari filter produk/metode dan diberi label demikian. Riwayat laporan dibatasi100mutasi terbaru; riwayat lengkap dipaginasi di Pelanggan. Ekspor CSV/cetak laporan menyertakan ringkasan deposit.

Permission baru: customers.view/create/edit, deposit.use/manage. Preset Kasir/Manager mendapat view/create/use; edit profil dan pengelolaan saldo/refund membutuhkan izin terkait; pengelolaan saldo/refund/pembatalan juga dibatasi role Owner/Admin. Preset lama yang masih identik di-upgrade; akses custom dipertahankan. Operator tidak menerima nominal deposit melalui bootstrap, endpoint pelanggan, receipt, laporan, maupun riwayat pekerjaan.

## Pembatalan dan koreksi

Owner/Admin dapat membatalkan melalui Detail Pesanan dengan alasan dan konfirmasi. Deposit yang sebelumnya dipakai dikembalikan ke akun. Pembayaran uang yang dialokasikan pada nota dipilih menjadi deposit atau benar-benar di-refund dengan metode yang tercatat. Pembayaran positif lama tidak dihapus; baris REVERSAL ditambahkan. Kelebihan yang sudah masuk deposit sebelumnya tidak dikreditkan dua kali. Pembatalan idempotent; nota batal tidak menerima pembayaran baru, tidak tampil sebagai piutang atau pekerjaan berjalan, dan nota cetak tidak menagihkan sisa.

Pembatalan tidak otomatis menambah stok. Jika barang fisik benar-benar kembali, gunakan alur koreksi/retur stok existing secara terpisah. Koreksi deposit manual memerlukan alasan. Saldo awal/koreksi dapat dibalik tepat sekali, terhubung transaksi asal dan tetap tunduk pada saldo cukup. Pengembalian uang dilakukan melalui REFUND, bukan koreksi saldo biasa.

Tidak ada pemindahan saldo antar pelanggan, penggabungan akun, kedaluwarsa otomatis, barcode, bank integration atau alokasi otomatis satu transfer ke banyak nota. Jika satu transfer untuk beberapa nota, alokasikan pembayaran nota-nota yang dimaksud sebelum menetapkan sisanya sebagai deposit; tahap ini tidak menambah modul batch PO.

## Migrasi produksi dan backup

Store.init mengambil logical snapshot raw app_state ke app_state_backups dengan tag customer-deposits-v1 DI BAWAH ROW LOCK sebelum menambah metadata/ledger kosong dan upgrade preset. Insert backup dan migrasi berada dalam transaksi yang sama; kegagalan backup menggagalkan migrasi. Tidak ada reset, seed ulang yang menimpa data, konversi saldo, asumsi saldo historis, perubahan harga/pembayaran/riwayat maupun stok lama. Migrasi dapat dijalankan ulang tanpa membuat saldo/mutasi baru. Health endpoint menunjukkan customerSchemaVersion:1 dan customerBackupVerified:true pada PostgreSQL setelah backup berhasil diverifikasi.

## Validasi

229 automated tests (217 existing +12 baru) lulus: alokasi kelebihan/double transfer, penggunaan penuh/gabungan, kembalian, integer/izin/identitas, concurrency dan rollback, reversal/refund/pembatalan, laporan, escaping dan snapshot cetak, API end-to-end, serta backup/migrasi dan atomisitas jalur SQL PostgreSQL menggunakan database contract fixture. Tidak menggunakan koneksi produksi untuk transaksi QA.

Chromium lokal dengan database memory: tambah pelanggan dan saldo awal melalui UI, split transfer/deposit, nota dan receipt, transfer kedua setelah lunas, laporan, pemakaian penuh tanpa metode uang, pembatalan, permission Kasir, mobile touch, toggle deposit, DP50% dan pelunasan sebagian. Profil/penyesuaian diuji pada1440/1024/768/521/390/320px. Regresi edit/merge keranjang, A3, Outdoor, kaos, draft, DP, SPK lulus. Validasi layout36kombinasi kosong/pendek/panjang dan edit6viewport/touch lulus tanpa error JavaScript/overflow.

Revisi entry point Cari Pelanggan: 229 tests tetap lulus. Chromium lokal terautentikasi memverifikasi pencarian nama/WA, saldo nol/positif, keyboard dan Escape/klik luar, pemilihan/tambah/lepas akun, perubahan nama manual, persistensi saat keranjang dirender ulang, toggle deposit serta pembayaran tanpa mengurangi saldo sebelum konfirmasi. Layout popup lulus pada1440/1024/768/520/390/320px, viewport pendek420/320px, dan pemilihan melalui sentuhan390px; tanpa error JavaScript atau overflow horizontal. Pengujian memakai data memory terpisah dari produksi.

Revisi form pembayaran sederhana: 231 tests lulus (tambahan dua tests kalkulasi potongan/tagihan/kelebihan/PO). Browser terautentikasi memverifikasi saldo nol tanpa panel, bayar pas, Cek Kembali tanpa mutasi/pembuatan akun, lebih bayar/double transfer, pemakaian+pengisian deposit dalam satu pembayaran, klik konfirmasi berulang, nota belum tertaut dengan nomor bersama, saldo cukup untuk pembayaran penuh tanpa metode uang, DP50%, PO tanpa mutasi, dan kegagalan baca saldo tanpa mencatat pembayaran. Popup dan form lulus pada1440/768/520/390/320px serta sentuhan390px. Regresi Cari Pelanggan dan alur POS pembayaran awal juga lulus. Tidak ada error JavaScript atau transaksi QA pada produksi.

Revisi footer Ringkasan Pesanan: 231 tests tetap lulus. Browser memverifikasi posisi Deposit Tersedia langsung sebelum Total, total produk tidak terpotong di ringkasan, pergantian pelanggan saldo positif ke nol menyembunyikan seluruh baris, dan pemilihan akun tetap tersimpan saat keranjang dirender ulang. Keranjang delapan item membuat panel dapat digulir dengan footer/tombol tetap floating; animasi total existing dipertahankan. Enam lebar320–1440px dan sentuhan390px lulus tanpa overflow/error JavaScript. Pengujian pembayaran sederhana di atas diulang dan tetap lulus.

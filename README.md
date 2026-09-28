# Manna Print POS

MVP POS dan project management untuk digital printing Manna Print. Katalog awal berasal dari tab **Outdoor** pada Database Produk Manna Print.

## Fitur

- POS berbasis produk dengan opsi lebar dan finishing yang relevan.
- Print A3+ memiliki tab Kertas, Sticker, dan Produk Jadi. Kertas dan Sticker memakai pilihan cepat untuk produk populer serta dropdown lengkap; konfigurasi baru tampil setelah produk dipilih. Sticker tidak memiliki opsi dua sisi. HVS menawarkan Print BW (Rp1.500/Rp3.000 untuk satu/dua sisi) dan Print Warna (Rp4.000/Rp8.000). Harga dan finishing dihitung per SKU oleh server.
- Tab Produk Jadi Print A3+ memiliki 59 SKU pada dropdown yang dikelompokkan menurut Kartu Nama, Map Folder, Voucher Pad, Tent Card, Karcis Pad, Brosur, dan Buku Nota. Laminasi Kartu Nama 1/2 Sisi serta Rounded hanya ada pada Kartu Nama; Fee Design Nota hanya ada pada Buku Nota. Setiap finishing yang dipilih memiliki jumlah sendiri dan dihitung server sesuai harga daftar.
- ATK memakai tab jenis barang dan daftar produk langsung, dengan pencarian nama/SKU/barcode serta pengatur jumlah di tiap baris. Sebanyak 78 contoh SKU yang namanya terbaca pada screenshot tersedia dengan harga jual masing-masing; produk lama Kartu Nama tetap ada sebagai jasa. Barang ATK dapat dibuat melalui Master Data dengan jenis "Barang dagangan" tanpa mesin atau bahan produksi. Barcode opsional dan unik khusus ATK, disimpan sebagai teks agar nol di depan tidak hilang.
- Kategori Akrilik (27 SKU) dan Stempel (30 SKU) menampilkan semua produk langsung dengan pencarian serta tombol Pilih/pengatur jumlah seperti daftar ATK, tanpa subtab. Keduanya dijual per pcs sesuai harga daftar dan dapat ditambah melalui Master Data tanpa mesin atau bahan produksi.
- Data pelanggan dapat diisi sebelum item ditambahkan.
- Quantity finishing manual dengan saran awal berdasarkan ukuran.
- Catatan produksi tersimpan per item/file.
- Pembulatan panjang tagihan per 50 cm, minimum 1 meter.
- Alur kerja: Menunggu Pembayaran → Design → Cetak → Finishing → Selesai → Diambil.
- Draft dapat diedit selama masih Menunggu Pembayaran.
- Form **Pembayaran** tunggal untuk pelunasan/DP, shortcut 50%, serta format nominal Rupiah.
- Tab **Pembayaran PO** dengan nomor PO dan unggahan gambar PO opsional yang dapat ditelusuri dari Laporan.
- PIC Operator Design baru diisi setelah pembayaran dikonfirmasi.
- Tampilan operator menyembunyikan harga dan fokus ke spesifikasi kerja.
- SPK thermal 80 mm dan tanda terima.
- Audit trail setiap pesanan.
- Stok per material dan lebar roll dalam meter lari.
- Stok baru berkurang satu kali ketika order masuk status **Selesai**.
- Pencarian dan filter kategori stok, pencatatan stok masuk per bahan beserta tanggal, serta riwayat mutasi.
- Master Data mandiri untuk menambah dan mengedit bahan, produk, serta mesin.
- Kategori produk, satuan jual, dan dasar perhitungan dapat ditambahkan langsung dari form produk; kategori baru otomatis menjadi tab POS setelah dipakai produk.
- Input harga memakai prefix Rp dan pemisah ribuan; tombol Batal/Simpan tetap terlihat saat form produk digulir.
- Master Finishing dengan relasi kategori agar pilihan finishing produk tidak perlu diketik ulang.
- Sablon DTF: satu produk Sablon Kaos dengan sembilan paket harga, warna Hitam/Putih dan ukuran S–XXL. Stok kaos dicatat per kombinasi warna dan ukuran; XXL menambah Rp15.000 per kaos.
- BOM multi-bahan dan relasi multi-mesin pada setiap produk.
- Harga grosir bertingkat (3 tingkat awal, maksimum 10) dengan perhitungan otomatis di POS.
- Promo produk terjadwal dengan diskon persen/nominal, label DISKON, dan harga otomatis.
- Tab Semua berisi Produk Terlaris dan Promo Aktif; konfigurasi produk dibuka melalui popup.
- Print tanda terima untuk order selesai/diambil.
- Autentikasi PIN untuk deployment publik.

## Menjalankan lokal

```bash
npm install
npm test
npm start
```

### Login awal

- Username: `admin`
- PIN: nilai `APP_PIN`, atau `1234` jika `APP_PIN` tidak diatur pada lingkungan lokal.

Setelah login sebagai Owner, buka **Master Data → User & Akses** untuk membuat akun Admin, Kasir, Operator Design, Operator Cetak, dan Staff Gudang. Setiap user dapat memakai permission khusus di luar template role-nya.

Menu **Laporan** mengikuti permission server-side. User tanpa akses nilai uang tidak menerima field omzet, pembayaran, HPP, laba, atau margin dari API maupun file CSV.

Tanpa `DATABASE_URL`, aplikasi memakai penyimpanan memory untuk development. Untuk production gunakan PostgreSQL.

## Environment variables

| Variable | Keterangan |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `APP_PIN` | PIN login operasional |
| `SESSION_SECRET` | Secret untuk cookie sesi |
| `NODE_ENV` | Isi `production` pada Railway |

## Catatan data awal

Data bahan, produk, mesin, HPP, dan stok awal saat ini berupa dummy untuk tahap MVP. Ganti dengan data riil melalui menu **Master Data** dan **Stok Bahan** sebelum dipakai sebagai sumber data operasional.

Sepuluh SKU **Kaos Polos DTF** dimulai dari stok 0. Isi stok dan HPP masing-masing varian di Master Data/Stok Bahan sebelum mengonfirmasi pembayaran Sablon Kaos. Pesanan yang dibayar mencadangkan stok tersedia; stok fisik berkurang satu kali saat status **Selesai**. Harga paket Sablon Kaos dapat diubah melalui **Master Data → Produk → Edit Sablon Kaos**.

SKU Print A3+ baru memakai harga jual yang diberikan, tetapi sumber bahan dan HPP belum tersedia untuk semua varian. Hubungkan masing-masing SKU ke bahan riil di **Master Data** agar pemakaian stok dan margin tercatat akurat.

SKU barang ATK dari screenshot belum memiliki barcode, HPP, atau stok awal. Pengatur jumlah menambahkannya ke pesanan, tetapi stok ATK belum dilacak atau dikurangi otomatis. Lengkapi nama/harga produk yang terpotong di screenshot dari file sumber sebelum mengimpor sisa katalog.

SKU Akrilik dan Stempel juga belum memiliki HPP, bahan produksi, atau stok awal dari screenshot. Harga jual dan jumlah pesanan tercatat, tetapi pemakaian bahan dan stok kedua kategori belum dihitung otomatis.

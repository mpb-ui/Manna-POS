# Manna Print POS

MVP POS dan project management untuk digital printing Manna Print. Katalog awal berasal dari tab **Outdoor** pada Database Produk Manna Print.

## Fitur

- POS berbasis produk dengan opsi lebar dan finishing yang relevan.
- Edit Produk menampilkan hubungan stok bahan umum, per varian ukuran, per pilihan bahan, dan warna–ukuran DTF. Bahan varian ukuran menggantikan bahan umum saat diisi; bahan dari pilihan kasir selalu ditambahkan. X-Banner Mini memakai satu Kaki Mini dan satu lembar LMO Paper per set. Stok fisik berkurang saat status Selesai.
- Tambah/Edit Produk menyediakan checkbox **Produk Memiliki Varian Bahan** untuk menambah hingga 40 varian mandiri, masing-masing dengan nama, harga khusus opsional, dan satu atau lebih bahan stok. POS meminta satu pilihan Varian Bahan. Sub-varian opsional dapat ditambah hingga 10 pilihan dan ditampilkan sebagai pilihan kedua di POS; setiap kombinasi dapat memiliki harga jual, status tersedia, dan hingga 10 tingkat grosir sendiri. Varian bahan juga dapat memiliki harga grosir sendiri; prioritas harga adalah kombinasi, varian bahan, lalu produk. Stok sub-varian tetap memakai bahan varian utama. Bahan varian dan bahan umum (jika ada) dihitung sesuai dasar perhitungan produk, disimpan dalam snapshot pesanan, dan dikurangi saat Selesai.
- Varian kertas Print A3+ Akasia, Concorde, Copenhagen, Hammer (Cream/White), Java Cream, serta Art Paper AP 120/150/210/230/260/310 memiliki stok bahan per jenis. Cetak 1 atau 2 sisi mengurangi satu lembar bahan yang sama per lembar pesanan. AP 260 memakai stok bahan lama.
- Print A3+ memiliki tab Kertas, Sticker, dan Produk Jadi. Kertas dan Sticker memakai pilihan cepat untuk produk populer serta dropdown lengkap; konfigurasi baru tampil setelah produk dipilih. Sticker tidak memiliki opsi dua sisi. HVS menawarkan Print BW (Rp1.500/Rp3.000 untuk satu/dua sisi) dan Print Warna (Rp4.000/Rp8.000). Harga dan finishing dihitung per SKU oleh server.
- Tab Produk Jadi Print A3+ memiliki 59 SKU pada dropdown yang dikelompokkan menurut Kartu Nama, Map Folder, Voucher Pad, Tent Card, Karcis Pad, Brosur, dan Buku Nota. Laminasi Kartu Nama 1/2 Sisi serta Rounded hanya ada pada Kartu Nama; Fee Design Nota hanya ada pada Buku Nota. Setiap finishing yang dipilih memiliki jumlah sendiri dan dihitung server sesuai harga daftar.
- ATK memakai tab jenis barang dan daftar produk langsung, dengan pencarian nama/SKU/barcode serta pengatur jumlah di tiap baris. Sebanyak 78 contoh SKU yang namanya terbaca pada screenshot tersedia dengan harga jual masing-masing; produk lama Kartu Nama tetap ada sebagai jasa. Barang ATK dapat dibuat melalui Master Data dengan jenis "Barang dagangan" tanpa mesin atau bahan produksi. Barcode opsional dan unik khusus ATK, disimpan sebagai teks agar nol di depan tidak hilang.
- Kategori Akrilik (27 SKU) dan Stempel (30 SKU) menampilkan semua produk langsung dengan pencarian serta tombol Pilih/pengatur jumlah seperti daftar ATK, tanpa subtab. Keduanya dijual per pcs sesuai harga daftar dan dapat ditambah melalui Master Data tanpa mesin atau bahan produksi.
- Menu Karyawan khusus Admin/Owner (UI dan API), terpisah dari User/PIC, dengan daftar karyawan, Payroll Bulanan, dan Riwayat Slip. Seed awal hanya Maria (K003, mulai 1 September 2024, gaji pokok Rp2.000.000, tunjangan Rp0, bonus kehadiran Rp250.000, lembur Rp10.000/jam); jabatan dapat diisi melalui Edit Karyawan. Hapus mengarsipkan karyawan tanpa menghapus slip.
- Payroll memakai pembagi tetap 26; absen dan sakit tanpa surat dipotong dari gaji pokok, tunjangan utuh. Cuti dan sakit dengan surat tidak dipotong tetapi menggugurkan bonus; bonus juga gugur bila absen, terlambat, atau mulai bekerja setelah tanggal 1 periode itu. Terlambat Rp15.000/kejadian ditambah Rp1.000/menit setelah 08:00; tarif lembur per karyawan (default Rp10.000/jam; Gema otomatis Rp15.000/jam saat ditambah, tetap bisa diubah). Training otomatis tanpa tunjangan. Gaji bulan pertama dihitung dari hari Senin–Sabtu sejak masuk, dibagi 26 dan maksimum gaji pokok penuh; hari dasar dapat diubah untuk jadwal/libur khusus.
- Seluruh nominal slip dapat ditimpa manual dan di-reset otomatis, termasuk total. Penyesuaian total muncul sebagai baris terpisah agar rincian tetap cocok. Slip unik per karyawan/bulan, menyimpan snapshot gaji dan riwayat versi; final terkunci, pembukaan kembali memerlukan alasan, dan status Dibayar mencatat tanggal tanpa melakukan transfer bank. Cetak / PDF menggunakan dialog cetak browser dengan format A4, satu slip per halaman.
- Data pelanggan dapat diisi sebelum item ditambahkan.
- Pengatur jumlah pada daftar ATK, Akrilik, dan Stempel dapat diketik langsung; nol menghapus item dari keranjang.
- Tab kategori POS dapat digulir dengan panah kiri/kanan oleh seluruh user. Admin/Owner dapat menyimpan urutan global lewat ikon pensil.
- Master Data → Kategori mengelola kategori produk dan bahan. Pengubahan nama mempertahankan identitas konfigurasi khusus; penghapusan wajib memilih kategori pengganti dan memindahkan seluruh relasi produk, finishing, bahan, serta stok. Form Bahan memakai dropdown kategori; daftar Bahan dan Finishing menyediakan filter serta urutan kategori.
- Master Data → PIC mengelola nama penugasan mandiri, terpisah dari akun User. Perubahan nama memperbarui pesanan berjalan; penghapusan menutup pilihan baru dan mempertahankan penugasan lama. Pengaturan Kategori dan PIC hanya tersedia bagi Admin/Owner.
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
- Editor Produk, Bahan, Finishing, Mesin, dan User menyediakan tombol Hapus dengan konfirmasi. Hapus mengarsipkan data dan mencatat audit; pesanan serta mutasi lama tetap tersedia. Produk/finishing hilang dari pilihan pesanan baru. Bahan hanya dapat dihapus jika stoknya nol dan tidak dipakai produk aktif, finishing aktif, atau pesanan berjalan. Mesin harus dilepas dari produk aktif. User langsung kehilangan akses; akun sendiri dan Owner aktif terakhir tidak dapat dihapus. SKU/kode yang telah diarsipkan tetap dicadangkan demi riwayat.
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

Setelah login sebagai Owner, buka **Master Data → User & Akses** untuk membuat akun Admin, Manager, Kasir, Operator Design, Operator Cetak, dan Staff Gudang. Manager memakai gabungan awal Kasir, Operator Design, Operator Cetak, dan Staff Gudang. Setiap user dapat memakai permission khusus di luar template role-nya.

Menu **Laporan** mengikuti permission server-side. User tanpa akses nilai uang tidak menerima field omzet, pembayaran, HPP, laba, atau margin dari API maupun file CSV.

Dashboard menyediakan periode cepat dalam WITA, filter sumber pembayaran Tunai/QRIS/Transfer, notifikasi Perlu Perhatian saat hover/fokus, serta grafik yang tersembunyi sampai dibuka. Omzet mengikuti tanggal pesanan; Uang Masuk mengikuti tanggal setiap pembayaran, termasuk pembayaran atas pesanan bulan sebelumnya. Pada pembayaran campuran, filter sumber hanya menjumlahkan penerimaan dari metode terpilih; omzet menghitung pesanan yang memakai metode tersebut satu kali. Piutang mencakup pesanan sampai tanggal akhir periode dan mengurangi pembayaran yang tercatat sampai tanggal itu. Filter kategori/mesin mengalokasikan pembayaran menurut proporsi nilai item. Ekspor tab Pembayaran berisi penerimaan, dan tab Piutang berisi saldo pesanan. Data lama tanpa riwayat pembayaran bertanggal tidak dibuatkan tanggal penerimaan fiktif; saldo lama tetap memakai total pembayaran tersimpan.

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

### Harga grosir finishing

Tambah/Edit Finishing menyediakan **+ Tingkat Grosir** (maksimal 10 rentang). Setiap rentang berisi jumlah minimum, maksimum opsional, dan harga per satuan finishing. Rentang inklusif tidak boleh tumpang tindih; jumlah di luar rentang memakai harga biasa. Perhitungan memakai jumlah finishing per baris pesanan, sesuai dasar perhitungannya (unit, titik, m², atau meter), termasuk luas manual Kisscut LF. Preview POS dan server memakai fungsi harga yang sama. Menghapus semua tingkat mengembalikan harga biasa. Riwayat pesanan menyimpan harga saat transaksi dan tidak mengikuti perubahan master.

### Jumlah dan catatan biaya design

Pada bagian File, Biaya Design A–D memiliki tombol Catatan dan quantity selector (minimal 1, kelipatan 1, dapat diketik). Hanya kontrol pilihan aktif yang ditampilkan. Biaya design dihitung harga per design × jumlah design, terpisah dari jumlah cetak. File Siap Cetak tidak memiliki kontrol tersebut dan tetap tanpa biaya. Jumlah serta catatan tersimpan pada `fileService.quantity` dan `fileService.note`, ditampilkan pada ringkasan, detail, invoice, dan SPK, serta dipertahankan saat edit draft. Pesanan lama tanpa jumlah design memakai default 1.

## Aset dan penyusutan

Admin/Owner dapat mencatat aset di **Master Data → Aset**, menghubungkannya dengan mesin operasional, dan melihat penyusutan garis lurus bulanan. Komputer, UPS, AC, furnitur, dan peralatan lain dicatat terpisah dari Daftar Mesin. Data awal kosong. Panduan, kebijakan perhitungan, aturan riwayat, dan batas cakupan tersedia di [docs/assets.md](docs/assets.md).

## Pendamping pekerjaan

Briefing Hari Ini menampilkan seluruh pekerjaan sesuai peran dalam popup ringkas, dengan prioritas deadline dan pencatatan harian per akun. Ikon floating di kanan bawah membuka ulang popup tersebut. POS menyediakan pemeriksaan kelengkapan, saran repeat order memakai harga terbaru, dan kesiapan bahan. Detail Pesanan menyediakan penanda tertahan, checklist per produk, serta pengingat sisa pembayaran saat Diambil. Aturan akses, pemisahan draft/tagihan, dan perilaku data lama dijelaskan di [docs/order-assistance.md](docs/order-assistance.md).

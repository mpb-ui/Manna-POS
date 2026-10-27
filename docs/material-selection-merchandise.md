# Pencarian bahan dan kategori Sablon Kaos

27 Oktober 2026.

- Kolom Waste disembunyikan pada sumber bahan umum, varian bahan dan varian ukuran. Nilai existing tetap dikirim dan disimpan; tidak mereset persentase, HPP atau pemakaian bahan.
- Semua pilihan sumber bahan produk memakai panel pencarian nama/SKU dengan urutan A–Z/natural (contoh Art Paper 120, 150, 260). Select asli tetap menjadi sumber nilai untuk jalur simpan existing. Bahan yang dipilih tetap ditandai; pencarian kosong, hasil kosong, navigasi panah/Enter, Escape, tombol tutup dan pengembalian fokus ditangani. Panel menyesuaikan visual viewport saat keyboard mobile terbuka.
- Komponen dipakai pada sumber bahan umum, varian bahan, varian ukuran tetap, pilihan bahan produk dan pemetaan stok kaos DTF. Baris yang ditambahkan dinamis juga mendapat pencarian tanpa listener ganda.
- Sablon Kaos pindah ke Merchandise. Kategori produk Sablon DTF dihapus, termasuk identitas tab; produk lain yang masih merujuk kategori tersebut dan referensi finishing ikut dipindah agar tidak menjadi orphan. Kategori bahan Kaos Polos DTF tetap tersedia.
- Migrasi sekali `dtfMerchandiseVersion:1` mempertahankan ID produk, pengaturan custom, harga paket/XXL, minimum, pemetaan bahan, saldo, invoice dan histori. PostgreSQL membuat backup raw `app_state` bertag `dtf-merchandise-v1` di bawah row lock sebelum perubahan; gagal backup membatalkan migrasi. Health memverifikasi backup tersebut. Seed baru langsung memakai Merchandise.
- Dropdown ukuran kaos hanya menampilkan S/M/L/XL/XXL. Ketersediaan dan warning tetap muncul pada bodytext di bawah Jumlah. Pemeriksaan stok habis, jumlah berlebih, duplikasi SKU, reservasi pesanan terkonfirmasi dan keranjang lintas paket tidak berubah.
- Teks bantuan sumber bahan mengikuti aturan stok: roll dikeluarkan manual, bahan produksi satuan saat mulai Proses Cetak.

Validasi: seluruh **276 automated tests** lulus. Pengujian baru mencakup sorting/filter SKU, preservasi kategori/harga/stok/invoice, idempotensi dan rollback migrasi PostgreSQL. Chromium memeriksa pilihan umum/varian/pilihan/DTF, simpan dengan Waste 5 tetap 5 walau tersembunyi, baris dinamis, Escape/keyboard, kategori Merchandise dan stok kaos nol/tersedia/berlebih/keranjang. Layout 1440/390/320 px lulus tanpa overflow/error JavaScript. Semua QA memakai server memory terisolasi.

Rilis melalui GitHub main dan Render.

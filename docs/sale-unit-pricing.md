# Satuan Jual sebagai dasar perhitungan

Produk memakai satu Satuan Jual sebagai sumber rumus harga. `public/sale-units.js` dipakai bersama oleh form produk, normalisasi katalog, kalkulasi server dan validasi API.

- `m²` (termasuk alias `m2`, `m^2`, `meter persegi`) → `sqm`: harga × lebar nominal × panjang tertagih × jumlah.
- `m lari` (termasuk `Meter Lari`) → `linear_m`: harga × panjang tertagih × jumlah; lebar tetap dipilih untuk bahan/validasi ukuran, tanpa menjadi pengali harga utama.
- Satuan lainnya, termasuk pcs/lbr/pack/set/box/paket/rim dan satuan tambahan Owner → `unit`: harga × jumlah. Input ukuran lama diabaikan; widths kosong.

Tambah/Edit Produk tidak lagi memiliki pilihan Dasar Perhitungan. Label Harga/HPP mengikuti satuannya; pilihan lebar hanya terlihat dan aktif untuk satuan meter. Penambahan satuan baru langsung memperbarui kontrol terkait. Ini perubahan dasar pada form yang ada; alur dan desain menyeluruh tetap untuk pekerjaan berikutnya.

Server mengabaikan `priceBasis`, `priceBasisId` dan `priceBasisLabel` kiriman client saat menyimpan produk. Satuan harus terdaftar; alias dinormalisasi, duplikat satuan meter ditolak. Produk meter wajib memiliki lebar positif dan finite. Barang dagangan ATK tetap harus memakai satuan per unit; jasa ATK bisa menggunakan ukuran. Produk cepat Akrilik/Stempel hanya memakai konfigurator sederhana ketika satuannya per unit.

`priceBasis` tetap disimpan sebagai nilai turunan untuk kompatibilitas modul yang sudah ada. Harga varian A1/ukuran tetap, desain, finishing, pembulatan panjang, kuantitas minimum dan waktu pencatatan stok tetap mengikuti aturan masing-masing. Grosir dapat dipilih berdasarkan jumlah; opsi luas/panjang tersedia sesuai Satuan Jual. Produk baru menggunakan default luas/panjang sesuai satuannya, sementara produk lama mempertahankan dasar/rentang grosirnya. Mengubah satuan tidak otomatis mengonversi harga, HPP, jumlah bahan, saldo stok atau batas grosir; Owner tetap mengisi nilai yang sesuai satuan barunya.

Migrasi PostgreSQL `sale-unit-pricing-v1` mengambil backup state mentah di dalam row lock sebelum menormalkan katalog. Jika label lama berbeda dari rumus tersimpan, migrasi mempertahankan rumus dan harga lama dengan menyesuaikan label satuannya. Daftar koreksi disimpan pada `saleUnitPricingMigration.corrected`. Migrasi tidak mengubah invoice, pembayaran, snapshot item, kuantitas stok, maupun rentang grosir. Backup gagal membatalkan migrasi; pengulangan tidak mengulang perubahan.

Health exposes `saleUnitPricingVersion` and `saleUnitPricingBackupVerified`. Tests cover aliases, conflicting client fields, three pricing modes, material usage, fixed variants, existing invoice settlement, custom units, and the PostgreSQL backup/rollback path. Browser QA checks Add/Edit and POS at 1440/390/320 px, saved unit transitions, totals and width visibility, with no stock mutation.

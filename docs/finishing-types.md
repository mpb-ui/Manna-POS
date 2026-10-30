# Tipe finishing

Master Data → Finishing → Tambah/Edit Finishing memiliki pilihan wajib Cutting, Laminating, atau Finishing (`type`: `CUTTING`, `LAMINATING`, `FINISHING`). Daftar master menampilkan kolom Tipe dan filter Semua tipe yang dapat digabung dengan pencarian dan filter kategori.

Pada Tambah/Edit Produk, Finishing / Add-on ditampilkan dalam kelompok Cutting → Laminating → Finishing. Hanya kelompok yang memiliki pilihan ditampilkan. Pilihan tetap checkbox independen: lebih dari satu finishing dalam satu tipe maupun lintas tipe boleh dipilih. Filter kategori, aturan khusus kertas/sticker/kartu nama/nota A3, status aktif, dan ID pilihan yang tersimpan tetap berlaku.

Kartu memakai outline, nama dan harga seperti referensi, dengan tiga kolom pada ruang desktop yang cukup, dua kolom pada ruang lebih sempit dan satu kolom pada ponsel kecil. Nama dan harga menggunakan data asli; nominal dalam gambar referensi tidak mengganti harga katalog.

Data lama yang belum memiliki tipe mendapat klasifikasi awal dari nama/ID: cutting/potong/pisau/rounded/sudut bulat → Cutting; laminasi/laminating → Laminating; lainnya → Finishing. Pengelola dapat mengoreksi melalui Edit Finishing. Tipe yang sudah tersimpan eksplisit selalu diutamakan, termasuk setelah nama diganti. Kompatibilitas API lama dipertahankan: POST tanpa type memakai klasifikasi awal; PUT tanpa type mempertahankan tipe lama. Nilai tipe lain ditolak.

Klasifikasi dinormalisasi pada katalog yang sudah ada dan disimpan melalui transaksi Store biasa; tidak memerlukan migrasi harga atau konversi stok. Snapshot invoice lama berada di luar normalisasi ini. Tipe tidak menjadi dasar biaya, tarif grosir, kuantitas bahan, pemotongan stok, atau tahap produksi. `rule`, `price`, `priceTiers`, sumber bahan, dan waktu pengurangan stok tetap independen.

Validasi mencakup klasifikasi awal dan override, urutan/pengelompokan, input API tidak valid beserta rollback, akses Kasir, perubahan tipe pada produk terkait, kesamaan hasil quote, serta snapshot invoice lama. Browser QA memeriksa Tambah/Edit Finishing, filter tipe, pilihan produk lintas kelompok dan keyboard, penyimpanan pilihan, kategori, serta ukuran layar 1440/390/320 px.

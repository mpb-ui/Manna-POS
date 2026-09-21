# Manna Print POS

MVP POS dan project management untuk digital printing Manna Print. Katalog awal berasal dari tab **Outdoor** pada Database Produk Manna Print.

## Fitur

- POS berbasis produk dengan opsi lebar dan finishing yang relevan.
- Data pelanggan dapat diisi sebelum item ditambahkan.
- Quantity finishing manual dengan saran awal berdasarkan ukuran.
- Catatan produksi tersimpan per item/file.
- Pembulatan panjang tagihan per 50 cm, minimum 1 meter.
- Alur kerja: Menunggu Pembayaran → Design → Cetak → Finishing → Selesai → Diambil.
- Draft dapat diedit selama masih Menunggu Pembayaran.
- Form pembayaran terpisah dengan riwayat DP/pelunasan.
- PIC Operator Design baru diisi setelah pembayaran dikonfirmasi.
- Tampilan operator menyembunyikan harga dan fokus ke spesifikasi kerja.
- SPK thermal 80 mm dan tanda terima.
- Audit trail setiap pesanan.
- Stok per material dan lebar roll dalam meter lari.
- Stok baru berkurang satu kali ketika order masuk status **Selesai**.
- Penyesuaian stok dan riwayat mutasi.
- Master Data mandiri untuk menambah dan mengedit bahan, produk, serta mesin.
- Master Finishing dengan relasi kategori agar pilihan finishing produk tidak perlu diketik ulang.
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

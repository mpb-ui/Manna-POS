# Manna Print POS

MVP POS dan project management untuk digital printing Manna Print. Katalog awal berasal dari tab **Outdoor** pada Database Produk Manna Print.

## Fitur

- POS berbasis produk dengan opsi lebar dan finishing yang relevan.
- Pembulatan panjang tagihan per 50 cm, minimum 1 meter.
- Alur kerja: Menunggu Pembayaran → Design → Cetak → Finishing → Selesai → Diambil.
- PIC Operator Design dan audit trail setiap pesanan.
- Stok per material dan lebar roll dalam meter lari.
- Stok baru berkurang satu kali ketika order masuk status **Selesai**.
- Penyesuaian stok dan riwayat mutasi.
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

## Catatan stok awal

Semua stok awal dibuat `0` agar sistem tidak mengarang angka stok fisik. Masukkan stok riil melalui menu **Stok Bahan → Sesuaikan** sebelum dipakai sebagai sumber data operasional.

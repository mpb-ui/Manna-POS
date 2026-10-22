# Deployment Manna POS di Render

Render menjadi tujuan deployment Manna POS. Source: `mpb-ui/Manna-POS`, branch `main`.
Konfigurasi infrastruktur ada di `render.yaml`. Railway tetap menjadi sumber data
lama sampai pemindahan dan pemeriksaan data selesai.

## Resource aktif

Resource Render dibuat langsung di workspace **mpb** pada 22 Oktober 2026:

- Web service: `srv-dbcnj6mi0phs73fe1rpg`, https://manna-pos.onrender.com
- Database: `dpg-dbcnd3favr4c73dqtap0-a`, database `manna_pos_db`, user `manna_pos_db_user`.
- Web service dashboard: https://dashboard.render.com/web/srv-dbcnj6mi0phs73fe1rpg

Environment awal dikelola langsung di Render. Jangan membuat resource duplikat.
`render.yaml` diselaraskan dengan resource ini untuk dokumentasi dan adopsi Blueprint
di kemudian hari; resource belum dikelola oleh Blueprint sampai adopsi itu dilakukan.
`APP_PIN` awal dibuat acak dan dapat dilihat oleh Owner di Environment web service.

## Infrastruktur

| Resource | Konfigurasi |
| --- | --- |
| Web service | `manna-pos`, Node.js, Singapore, `0.5c-512mb` |
| PostgreSQL | `manna-pos-db`, Singapore, `0.1c-256mb`, penyimpanan awal 1 GB |
| Build / start | `npm ci --omit=dev` / pemeriksaan `DATABASE_URL`, lalu `npm start` |
| Health check | `/api/health` |
| Auto-deploy | Commit pada `main`, melalui integrasi GitHub yang terhubung ke Render |
| Database | Koneksi internal; koneksi publik diblokir secara default |

Ini memakai paket berbayar terkecil untuk operasi berkelanjutan. Tinjau harga
terkini dan ukuran database sumber sebelum menerapkan Blueprint. Kapasitas disk
dapat diperbesar bila data lama membutuhkan ruang lebih dari 1 GB. Jangan memakai
Postgres Free untuk data operasional: paket itu kedaluwarsa setelah 30 hari dan
dihapus setelah masa tenggang jika tidak ditingkatkan. Web Free juga tidur saat idle.

## Adopsi Blueprint atau instalasi ulang

Resource aktif di atas sudah dibuat. Langkah berikut adalah untuk adopsi Blueprint
atau instalasi baru; tinjau resource yang akan dikelola agar tidak membuat duplikat.

1. Pastikan workspace Render adalah **mpb** dan GitHub terhubung dengan akses ke repo ini.
2. Buka https://dashboard.render.com/blueprint/new?repo=https://github.com/mpb-ui/Manna-POS
3. Pilih branch `main`. Tinjau web service, database, region, dan biaya.
4. Isi `APP_PIN` dengan PIN awal yang kuat langsung di Render. Jangan commit nilainya.
   `SESSION_SECRET` dibuat baru oleh Render; `DATABASE_URL` diambil dari database
   Blueprint melalui koneksi internal. `NODE_ENV` ditetapkan `production`.
5. Terapkan Blueprint dan tunggu deployment berstatus `live`.

Database baru akan berisi katalog seed dan akun awal. **Status `live` belum berarti
data Railway sudah dipindahkan.** Jangan mulai transaksi operasional di Render
sebelum langkah pemindahan dan verifikasi di bawah selesai.

## Memindahkan data lama

1. Identifikasi aplikasi dan PostgreSQL Railway yang benar. Periksa versi PostgreSQL,
   ukuran database, dan backup yang tersedia. Jika integrasi meminta autentikasi ulang,
   sambungkan kembali Railway sebelum melanjutkan pembacaan data.
2. Jadwalkan jeda singkat input/transaksi pada aplikasi lama dan baru. Pastikan seluruh
   penulis database berhenti sebelum mengambil backup akhir; jangan gunakan kedua
   aplikasi untuk menerima transaksi selama cutover.
3. Buat backup penuh database Railway dengan `pg_dump --format=custom` menggunakan
   klien yang kompatibel dengan versi sumber. Simpan di lokasi aman di luar repository.
   Simpan juga jumlah pesanan, pembayaran, pelanggan, users, saldo stok, dan checksum
   snapshot `app_state` sebagai pembanding. Periksa arsip memakai `pg_restore --list`.
4. Hentikan web service Render sementara agar tidak menulis ke database selama restore.
   Buka akses database sementara hanya untuk IP mesin migrasi, atau jalankan restore
   dari lingkungan yang diizinkan pada private network. Jangan membuka akses ke semua IP.
5. Restore ke database Render baru yang telah diverifikasi sebagai target. Aplikasi
   dapat sudah membuat tabel seed `app_state` dan `app_state_backups`; ganti seed hanya
   setelah dipastikan belum ada transaksi/user operasional baru di target. Gunakan
   restore transaksional dan hentikan jika ada error. Jangan restore ke database sumber.
   Sertakan `app_state_backups`, bukan hanya snapshot utama. Jangan memakai kredensial
   lama sebagai kredensial database Render.
6. Sebelum aplikasi baru dihidupkan, cocokkan baris dan checksum tabel hasil restore
   dengan snapshot sumber. Periksa data pesanan, pembayaran, piutang/deposit, stok,
   master data, user, payroll/aset, dan lampiran PO yang tersimpan dalam data.
7. Aktifkan kembali web service. Startup dapat menjalankan migrasi data bawaan aplikasi;
   verifikasi backup migrasi serta kondisi data setelah startup.
8. Tutup akses database publik sementara, sehingga kembali sesuai `ipAllowList: []`.
   Perbarui bookmark/link operasional setelah seluruh pemeriksaan lulus.

Migrasi database mempertahankan akun dan hash PIN lama. `APP_PIN` hanya dipakai untuk
membuat Owner awal jika daftar user kosong; mengubah variable ini tidak mengganti
PIN akun yang sudah ada. Jika kredensial lama berpotensi bocor, ganti PIN akun melalui
Master Data → User & Akses. Secret sesi yang baru membuat sesi lama tidak berlaku
pada server baru.

Jangan hapus Railway atau backup sumber sebelum data dan operasi Render terverifikasi.
Jika perlu rollback sebelum transaksi baru masuk, hentikan Render dan aktifkan kembali
sumber. Jika Render sudah menerima transaksi, rekonsiliasi data baru terlebih dahulu
agar rollback tidak menghilangkan transaksi.

## Verifikasi dan deployment selanjutnya

- `/api/health` merespons sukses dan menampilkan `database: "postgres"`.
- Login, katalog, detail pesanan lama, pembayaran/piutang, stok, dan lampiran PO dapat dibuka.
- Flag backup migrasi stok, lebar roll, dan pelanggan pada health endpoint sesuai kondisi data.
- Data tetap ada setelah satu deployment ulang. Verifikasi akses role Kasir dan Operator.
- GitHub tersambung ke Render dan Auto-Deploy diatur **On Commit** untuk branch `main`.
  Pastikan deployment berikutnya memakai commit yang dimaksud dan benar-benar `live`.
- Nonaktifkan auto-deploy aplikasi lama di Railway setelah cutover terverifikasi.
  Menghapus `railway.toml` saja tidak memutus integrasi deploy Railway.

Jika resource kemudian diadopsi oleh Blueprint, konfigurasi resource dan environment
yang tercantum dikelola dari `render.yaml`; perubahan manual pada field tersebut bisa
ditimpa saat sync berikutnya. Selama belum diadopsi, pengaturan live dikelola di Render.
`APP_PIN` dikelola langsung di Render setelah pembuatan awal. Jangan menggandakan
perintah deploy manual ketika push sudah memicu auto-deploy.

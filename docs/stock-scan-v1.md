# Manna Stock Scan V1

## A. Audit fondasi stok

Baseline implementasi adalah `main` pada commit `3be1c2c`. Stok Bahan sudah memisahkan `ROLL` dan `UNIT`. `adjustPhysicalStock()` mengelola saldo dan mutasi manual, `recordPhysicalStockCount()` memvalidasi saldo lama lewat opname, dan `commitPhysicalStock()` melewati bahan roll ketika mengurangi bahan produksi otomatis.

| Temuan | Penanganan |
| --- | --- |
| Perubahan stok manual dan POS menyimpan state pada satu baris PostgreSQL. | Stock Scan mengambil kunci baris yang sama, memvalidasi seluruh item, lalu mencatat saldo, mutasi, dan audit dalam satu transaksi. |
| Request ID penyesuaian lama berlaku per mutasi. | Stock Scan menyimpan identitas permintaan dan sidik payload yang sama pada setiap mutasi dalam satu grup. Pemeriksaan retry manual mengecualikan mutasi scanner dan koreksinya. |
| ID bahan baru sebelumnya diturunkan dari SKU yang dapat diedit. | Bahan baru mendapat ID unik. Barcode memakai ID bahan tetap. Katalog scanner melewati ID lama dengan relasi ganda. |
| Retur existing membalik pemakaian produksi otomatis. | Koreksi barcode memakai mutasi kompensasi khusus dengan referensi ke mutasi asal, pemeriksaan fisik, dan batas jumlah. |
| Bootstrap Stok Bahan turut memuat data pesanan. | Halaman scanner mengambil sesi, katalog roll, dan satu halaman riwayat staf melalui endpoint terfokus. |

## B. Implementasi

Buka **Stock Scan** atau **Cetak Barcode** di header Stok Bahan. Halaman scanner tersedia melalui bookmark `/stock/scan`. Gunakan scanner HID Keyboard dengan akhiran Enter.

1. Pindai `CMD:OUT` atau `CMD:IN`, lalu pindai label bahan `MAT:<materialId>` dan barcode jumlah bila diperlukan. Jumlah awal 1 roll. Memindai ulang bahan akan mengaktifkannya kembali. Barcode jumlah menetapkan jumlah.
2. Pindai `CMD:REVIEW` untuk memeriksa bahan, lebar, SKU, jumlah, saldo sebelum dan estimasi saldo sesudah. Klik atau tap **Konfirmasi** untuk menyimpan. `CMD:CANCEL` membatalkan draft sebelum review. Tombol **Batalkan** menghapus draft dari review.
3. Jika data berubah sejak review, server mengirim snapshot terbaru dan halaman meminta konfirmasi ulang. Jika koneksi putus setelah pengiriman, buka kembali akun yang sama dan pilih **Cek & ulangi**. Browser menyimpan permintaan tertunda per akun untuk mengulang dengan ID dan isi yang sama.
4. Saldo dan Mutasi Stok diperbarui di halaman existing. Owner atau Manager dapat membuka **Koreksi** pada mutasi Barcode. Satu mutasi asal bisa dikoreksi satu kali, dengan jumlah hingga jumlah asal dan alasan yang wajib diisi.

| Akses | Kebutuhan |
| --- | --- |
| Scan dan riwayat sendiri | `stock.view` dan `stock.scan`, atau Owner/Manager dengan `stock.view` dan `stock.adjust` |
| Cetak barcode | `stock.view` dan `stock.scan.print`, atau Owner/Manager dengan `stock.view` dan `stock.adjust` |
| Koreksi | Owner/Manager dengan `stock.view` dan `stock.adjust` |
| Stok Masuk / Keluar biasa, Stok Opname, Master Data | Izin existing masing-masing |

Data tambahan tersimpan di entri `stockMovements` dan `auditLogs` JSONB existing. Setiap baris menyimpan ID mutasi, grup, permintaan, bahan, SKU, lebar dan nama bahan, metode, satuan, arah, jumlah, saldo sebelum/sesudah, identitas staf, waktu server, sumber dan alasan. Catatan opsional tersimpan bersama transaksi. ID stasiun belum diperlukan karena aplikasi belum memiliki identitas stasiun gudang. Rilis ini dapat dipasang tanpa migrasi skema atau pengisian ulang saldo.

| Endpoint | Kegunaan |
| --- | --- |
| `GET /api/stock/scan/catalog` | Roll aktif dengan identitas fisik dan saldo valid |
| `GET /api/stock/scan/catalog/:id` | Lookup satu bahan saat kode belum ada di katalog yang dimuat |
| `GET /api/stock/scan/history` | Riwayat barcode akun aktif, dipaginasi |
| `POST /api/stock/scan/commit` | Batch masuk/keluar atomik, maksimal 50 jenis bahan dan body 24 KB |
| `GET /api/stock/scan/movements/:id/correction` | Mutasi asal, saldo saat ini, dan status koreksi |
| `POST /api/stock/scan/movements/:id/correction` | Catat mutasi koreksi |
| `GET /api/stock-balances` | Muat ulang saldo untuk Stok Bahan |

| File | Peran |
| --- | --- |
| Baru `lib/stock-scan.js`, `lib/stock-scan-routes.js` | Validasi, transaksi, koreksi, dan API |
| Baru `public/stock-scan.html`, `public/stock-scan.css`, `public/stock-scan.js`, `public/stock-scan-machine.js`, `public/stock-scan-rules.js`, `public/stock-scan-session.js` | UI scanner, aturan input, dan sesi |
| Baru `public/stock-barcode.html`, `public/stock-barcode.css`, `public/stock-barcode.js` | Seleksi label dan pratinjau A4/A3+ |
| Baru `test/stock-scan.test.js`, `test/stock-scan-postgres.test.js`, `test/stock-scan-browser.test.js`, `test/helpers/stock-scan-server.js` | Uji frontend, HTTP, PostgreSQL, dan browser |
| Diubah `lib/access.js`, `lib/physical-stock.js`, `lib/store.js`, `server.js` | Izin, engine existing, proyeksi JSONB, dan integrasi server |
| Diubah `public/app.js`, `public/stock-ui.js`, `public/page-header.css` | Tautan, saldo, info Mutasi Stok, dan form koreksi |
| Diubah `package.json`, `package-lock.json` | JsBarcode Code 128 untuk halaman cetak |

## C. Tinjauan visual

Tinjauan dilakukan di Chromium pada desktop 1440 px dan tablet 768 px. Desktop menampilkan panel scanner dan daftar bahan berdampingan. Tablet menyusun panel secara vertikal. Dialog review selalu menampilkan saldo awal, perubahan, dan estimasi saldo akhir. Pratinjau kedua format kertas dan Mutasi Stok diperiksa menggunakan data sintetis.

## D. Hasil pengujian

Suite lengkap lokal mencatat **422 lulus, 0 gagal, 0 dilewati** dengan PostgreSQL terisolasi dan Chromium. Cakupan meliputi pengurangan otomatis Per Satuan, saldo roll, stok opname, retur, serta regresi POS, pembayaran, Status Order, Project Management, Master Data, laporan, dan autentikasi.

- Uji HTTP mencakup izin, CSRF, timeout, retry, dua sesi, perubahan saldo/metode, ID bahan setelah ganti SKU, penolakan bahan arsip, dan koreksi.
- Uji PostgreSQL memakai dua instance store untuk memeriksa kunci baris, replay idempoten, penolakan snapshot lama, rollback, pencatatan audit, dan penolakan sesi yang dicabut.
- Uji browser mensimulasikan tombol keyboard HID, Enter saat review, klik sintetis, klik mouse, double-click, tap, serta jaringan putus setelah server menyimpan. Uji tersebut juga membuka Stok Bahan di tab kedua dan memeriksa pembaruan saldo.
- PDF A4 dan A3+ masing-masing menghasilkan 11 kode uji yang terbaca oleh decoder Code 128 pada raster 203 dan 300 DPI. Hasil cetakan fisik dan scanner gudang perlu diverifikasi saat pilot.
- `npm audit --omit=dev --audit-level=moderate` melaporkan 0 kerentanan.

Pengujian browser opsional untuk lingkungan tanpa Chromium. Jalankan dengan `TEST_STOCK_SCAN_CHROME` mengarah ke executable Chromium dan Playwright tersedia melalui `TEST_STOCK_SCAN_PLAYWRIGHT` atau modul `playwright`. PostgreSQL memakai `TEST_SECURITY_DATABASE_URL` yang menunjuk instance uji. Gunakan `TEST_STOCK_SCAN_ARTIFACTS` untuk menyimpan tangkapan layar dan PDF uji dari browser.

## E. Performa

Benchmark HTTP loopback membandingkan `3be1c2c` dan Stock Scan pada PostgreSQL lokal. Dataset sintetis berisi 10.000 pesanan, 500 masih aktif, dan 50.000 mutasi. State terkompresi oleh PostgreSQL dan berukuran sekitar 17,1 MB sebelum kompresi. Angka memakai 3 pemanasan dan 15 pengukuran per skenario. Payload adalah total body respons tanpa kompresi.

| Skenario | Request | Payload median | p50 | p95 |
| --- | ---: | ---: | ---: | ---: |
| Buka alur stok existing (sesi, bootstrap, mutasi) | 3 | 754.599 B | 588,7 ms | 650,8 ms |
| Buka Stock Scan (sesi, katalog, riwayat) | 3 | 7.766 B | 72,8 ms | 113,1 ms |
| Simpan 3 jenis roll dengan penyesuaian manual | 3 | 2.316 B | 4.754,3 ms | 6.662,6 ms |
| Simpan 3 jenis roll dalam satu batch scan | 1 | 1.719 B | 1.246,4 ms | 1.608,8 ms |

Pengukuran simpan dimulai dari saat data bahan siap dan selesai setelah respons diterima. Penyesuaian manual dihitung lewat tiga PATCH berurutan, di luar pemuatan ulang UI. Payload pembukaan scanner lebih kecil 99% pada skenario uji ini.

| Aset HTML, JS, dan CSS yang diukur | Sebelum | Sesudah |
| --- | ---: | ---: |
| Berkas bersama kasir yang terdampak, gzip | 58.980 B | 59.124 B |
| Berkas bersama dan modul Stok Bahan yang terdampak, gzip | 66.776 B | 69.154 B |
| Halaman scanner dan modulnya, gzip | — | 12.683 B |
| Halaman Cetak Barcode termasuk dependensi, gzip | — | 15.734 B |

Ukuran di atas mengecualikan font, logo, dan berkas bersama yang tidak terdampak. Library Code 128 berukuran 6.429 B gzip, hanya dimuat oleh halaman cetak. Riwayat membaca kolom JSONB yang relevan dan mengembalikan satu halaman. Penulisan tetap mengunci satu baris dan menulis ulang dokumen dengan histori yang bertambah. Ini adalah batas kapasitas utama yang perlu diamati saat pilot.

## F. Kesiapan pilot

1. Gunakan satu komputer atau tablet dan satu scanner 2D dalam mode HID Keyboard. Cek suffix Enter dan keyboard layout perangkat.
2. Berikan **Lihat stok bahan** dan **Gunakan Stock Scan untuk bahan Per Roll** kepada staf peserta. Berikan **Cetak barcode Stock Scan** sesuai tugas.
3. Pilih 5–10 SKU Outdoor yang memiliki identitas lebar dan saldo roll berdasarkan hitung fisik. Bila saldo lama masih berbasis luas atau panjang, tetapkan saldo melalui **Stok Opname**.
4. Cetak label bahan, perintah dan jumlah pada skala 100%. Uji pemindaian dari label yang sudah ditempel. Pastikan lebar 110 cm, 220 cm, dan lebar lainnya terbaca sebagai bahan yang sesuai.
5. Uji stok keluar satu roll, penerimaan multi-bahan, penggantian jumlah, pembatalan dan keluar/masuk akun. Cocokkan saldo fisik, daftar Stok Bahan, dan Mutasi Stok WITA.
6. Putuskan koneksi sesaat ketika mengonfirmasi di lingkungan uji. Setelah tersambung kembali, gunakan **Cek & ulangi** dan pastikan satu grup transaksi tercatat.
7. Verifikasi koreksi dengan akun Owner/Manager dan periksa bahwa mutasi asal masih terlihat berdampingan dengan mutasi koreksi.

Persetujuan rilis dan pengujian perangkat fisik menentukan jadwal pilot produksi.

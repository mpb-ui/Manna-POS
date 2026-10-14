# LF Poster / LF Sticker: kapasitas roll dan SKU fisik

Keputusan 14 Oktober 2026: hanya pemilihan lebar otomatis seperti Outdoor. Tidak ada field Lebihan/sisi atau perubahan aturan harga LF. Oneway Outdoor dan HI-RES memakai bahan fisik bersama.

| Bahan | Lebar nominal → kapasitas aktual | SKU per lebar |
|---|---|---:|
| Albatros | 0,9 m → 90 cm; 1,2 m → 125 cm; 1,5 m → 152 cm | 3 |
| Luster | 0,9 m → 90 cm; 1,2 m → 125 cm; 1,5 m → 152 cm | 3 |
| Canvas | 1,2 m → 125 cm | 1 |
| LF Sticker Transparant | 1,5 m → 152 cm | 1 |
| LF Sticker Glossy | 1 m → 102 cm; 1,5 m → 152 cm | 2 |
| LF Sticker Matte | 1 m → 102 cm; 1,5 m → 152 cm | 2 |
| LF Sticker Sandblast | 1 m → 102 cm; 1,5 m → 152 cm | 2 |
| LF Sticker Oneway | 1 m → 102 cm; 1,5 m → 152 cm | 2 |

Total 16 SKU. Sandblast Cetak/Tanpa Cetak berbagi dua bahan; Oneway Outdoor/HI-RES juga berbagi dua bahan. Setiap SKU memiliki stockMethod=ROLL, stockUnit=roll, rollWidthCm, nominalRollWidth dan ID stabil.

Memasukkan lebar gambar memilih roll terkecil yang cukup: Albatros 88/90 cm → 0,9 m; 91–125 cm → 1,2 m; di atas 125 cm → 1,5 m. Sticker 102 cm → 1 m; 103 cm → 1,5 m. Kasir tetap dapat memilih roll manual; perubahan panjang tidak menimpa pilihan manual. Ukuran melampaui roll terbesar tetap memilih roll terbesar tanpa blokir baru, konsisten dengan Outdoor.

Harga menggunakan lebar nominal (misalnya 1,2), bukan kapasitas aktual 1,25. Pembulatan LF tetap per 10 cm. Fixed-size A1 dan produk Backlite Film per lembar tidak diubah. Allowance diabaikan untuk LF, termasuk pada request API. Ukuran asli/snapshot nota, pembayaran, finishing dan histori existing tetap.

## Bahan lama dan HPP

Saldo bahan generik lama **tidak dibagi, dipindahkan, atau digabung otomatis**. Material/row lama tetap tersedia dengan penanda bahan generik lama. SKU per lebar dimulai 0 roll; isi stok riil melalui pencatatan stok/stok opname yang sudah tersedia. Rekonsiliasi saldo generik dilakukan secara eksplisit dengan alasan, agar tidak menggandakan stok. Oneway dua saldo lama tidak dijumlahkan karena belum ada data bahwa barang fisiknya berbeda.

rollStockBindings memetakan sumber kalkulasi existing ke SKU fisik terpilih. Snapshot produksi menyebut materialId/SKU/nama per lebar, tetapi quantity, waste dan unitCost dihitung dari BOM existing. Ini memisahkan harga/HPP dari pencatatan roll. Oneway bisa berbagi stok fisik sambil mempertahankan biaya kalkulasi masing-masing produk. Pengaturan biaya produksi existing tetap pada sumber bahan kalkulasinya; tidak disatukan diam-diam melalui penggabungan stok. Sumber BOM tambahan yang tidak termasuk kelompok LF tidak dialihkan. Riwayat pesanan lama tidak direquote atau diganti materialnya.

SKU per lebar yang masih dipakai produk aktif tidak dapat dihapus, mengikuti proteksi bahan existing. Penggantian nama/SKU memakai ID material yang stabil.

Semua roll tetap keluar manual ketika dibuka; pesanan selesai tidak mengurangi roll. Mutasi satu lebar tidak memengaruhi lebar lainnya.

## Migrasi dan backup

lfRollWidthVersion=1 diterapkan satu kali. Runtime read bekerja pada salinan seperti normalizer existing. Pada PostgreSQL, Store.init membuat snapshot app_state mentah bertag **lf-roll-widths-v1** di app_state_backups sebelum migrasi, dalam transaksi dengan FOR UPDATE. Backup ini tidak ditimpa pada restart. Migrasi tidak menjalankan ulang seed/catalog terhadap data produksi. Benturan SKU menyebabkan rollback, bukan overwrite. Health menyediakan lfRollWidthVersion dan lfRollBackupVerified untuk pemeriksaan deployment nanti.

Backup logis berada dalam database yang sama, bukan backup offsite. Tidak ada reset/penghapusan data. Seluruh hubungan harga, pembayaran, histori dan saldo lama dipertahankan.

## File dan pengujian

Kapasitas/auto-select: public/outdoor-sizing.js, public/app.js, lib/order-assistance.js, lib/domain.js. SKU/binding/migrasi: lib/lf-rolls.js, lib/store.js. Penanda bahan lama: public/stock-ui.js. Verifikasi migration: server.js health serta test/stock-store-postgres.test.js. Test batas, harga/HPP, SKU bersama, stok manual, dan idempotensi: test/lf-roll-widths.test.js.

Pengujian existing 179 lulus. Dengan enam test LF dan satu contract test migrasi PostgreSQL tambahan, suite menjadi 186 test. PG contract memakai FakePool; browser/API memakai database memory terisolasi, bukan perubahan pada produksi. Browser desktop/mobile menguji semua produk LF, batas kapasitas, manual override, tampilan konfigurasi dan 16 bahan baru.

# Audit dan metode stok fisik — 14 Oktober 2026

Basis audit: `defe7f230131f51de2854f79571866b4334a866c` (main/production saat pekerjaan dimulai). Tidak ada perubahan lokal tertinggal saat audit dimulai. Tidak ada reset database, penghapusan histori, framework atau dependency baru.

## Temuan dan keputusan

| Temuan aktual | Perbaikan |
|---|---|
| Penyelesaian pesanan menggunakan estimasi konsumsi area/panjang untuk semua bahan, termasuk roll | Metode fisik ROLL melewati semua pengurangan otomatis; estimasi produksi dan HPP tetap memakai satuan kalkulasi |
| ATK Barang Dagangan belum selalu memiliki hubungan stok yang jelas | Hubungan langsung inventory.productId / retailStockSku, menggunakan saldo/SKU lama bila tersedia; tidak membuat Bahan duplikat |
| Marker pengurangan hanya per pesanan tidak cukup untuk invoice ATK + produksi | Marker per item dan fase SALE/PRODUCTION; transaksi atomik menjaga ledger dan marker bersama |
| Pengeluaran manual/pembayaran dapat terkirim ulang | UUID request + pemeriksaan idempotensi dalam transaksi terkunci; tombol/form juga menahan submit ganda |
| Legacy area/length tidak dapat dianggap jumlah roll | Saldo dan satuan lama tetap utuh, ditandai perlu stok opname; pengeluaran manual diblokir sampai hitung fisik |
| hydration membangun seluruh default catalog untuk setiap produk | Default index dibangun sekali, fallback individual di-clone agar tidak berbagi objek mutable |
| Auth membaca/hydrate seluruh state, lalu endpoint membacanya lagi | Auth/session membaca hanya users |
| Bootstrap memuat arsip dan data master/ledger lintas halaman | Frontend meminta profil halaman; arsip lazy melalui Status Order; timeline ringkas dan ledger berpaginasi |
| Mutasi mengirim seluruh state kembali ke PostgreSQL | Patch hanya top-level section yang berubah, dengan FOR UPDATE dan commit atomik yang sama |

## Aturan operasional

- Per Roll: stok masuk/keluar berupa bilangan roll utuh, keluar saat staf membuka/mengeluarkan roll. Tidak ada pengurangan ketika pesanan selesai. Setiap Bahan/SKU memiliki lebar roll sendiri. Stok tidak boleh negatif.
- Per Satuan: konsumsi BOM, varian, subvarian, dan finishing tetap menggunakan snapshot pemakaian item. Produksi dikurangi ketika seluruh item pesanan selesai, mengikuti timing workflow lama. Barang dagangan ATK baru dikurangi ketika penjualan dikonfirmasi melalui pembayaran lunas, DP atau PO; draft/quote tidak mengurangi stok.
- ATK siap diserahkan setelah konfirmasi. Pesanan murni ATK yang lunas langsung Diambil; DP/PO tetap Selesai agar konfirmasi pengambilan belum lunas yang sudah ada berlaku. Invoice campuran memiliki item retail selesai dan item produksi pada prosesnya sendiri. Nominal invoice/pembayaran tidak diduplikasi.
- Pembayaran susulan, request ulang, pergantian status berulang, dan request bersamaan tidak mengurangi item yang sudah memiliki marker stockCommitted. PostgreSQL mengunci row utama; memory test menggunakan antrean mutation dengan rollback.
- Pesanan lama yang sudah dibayar tetap pada timing produksi historis: migrasi tidak mendebitnya saat login/baca. Pesanan lama tertutup tanpa marker diberi marker skip historis, tanpa mengubah saldo, pembayaran, status atau timeline.
- Cancelled order tidak memicu pengurangan/pengembalian otomatis. Koreksi fisik berada pada Sesuaikan Stok: pilih mutasi AUTO_USE asal, konfirmasi barang telah kembali, dan masukkan jumlah yang benar-benar kembali. Total return dibatasi pemakaian asal. Tidak ditambahkan modul pembatalan, refund, revisi atau retur penjualan baru; fitur keuangan tersebut tidak tersedia dalam scope ini.
- Kuantitas/unit konsumsi diverifikasi; SKU fisik tidak boleh bertabrakan antara barang dan bahan. Penggantian nama/SKU yang diizinkan tetap memakai identitas productId/materialId. Perubahan satuan barang dengan saldo bukan nol ditolak. Kebijakan stok satuan negatif existing dipertahankan; aturan shortage/reservasi DTF tetap berlaku.
- Harga jual, estimasi luas/panjang, biaya finishing, kalkulasi HPP dan nota tidak memakai jumlah roll sebagai m². Nilai persediaan roll ditampilkan kosong karena belum ada harga beli per roll; tidak mengalikan harga HPP per m² dengan jumlah roll.

## Master Data dan migrasi

Tambah/Edit Bahan memiliki Metode Pencatatan Stok, Satuan kalkulasi/HPP, Satuan stok fisik dan Lebar roll. ROLL memakai stokUnit=roll, sedangkan material.unit dan cost tetap satuan konsumsi/HPP. UNIT memakai satuan konsumsi yang sama (alias lbr/lembar dikenali).

Untuk saldo roll lama dalam m²/m lari:

1. Buka Master Data → Bahan → Edit atau Stok Bahan → Tetapkan Saldo Roll.
2. Tetapkan lebar SKU yang benar dan hitung jumlah roll fisik.
3. Centang konfirmasi stok opname, isi saldo awal roll dan alasan. Review juga stok minimum sebagai ambang fisik baru.
4. Simpan. Ledger METHOD_OPENING mencatat saldo/unit lama, saldo/unit baru, actor dan alasan. Tidak ada konversi menggunakan ukuran roll.

Jika SKU lama generik menggabungkan beberapa lebar, administrator harus menetapkan SKU tersendiri per lebar berdasarkan hitung fisik yang nyata; sistem tidak memecah/membagi saldo atau hubungan historis dengan asumsi. Nama/SKU lama dan snapshot order tetap dipertahankan.

ATK tanpa stok lama memperoleh row inventory bersaldo 0; tetapkan saldo riil melalui Stok Bahan. Jika ada row lama terkait produk, saldo itu dipakai tanpa duplikasi.

### Backup sebelum migrasi produksi

Pada Store.init, di dalam transaksi dan setelah SELECT FOR UPDATE, state mentah app_state.main dicadangkan ke tabel PostgreSQL app_state_backups dengan tag stock-methods-v1 **sebelum** perubahan stockSchemaVersion. Backup ON CONFLICT DO NOTHING tidak ditimpa pada restart. Migrasi hanya menambahkan metadata workflow/stok; tidak menjalankan ulang syncCatalog/seed catalog sebagai migrasi. Startup lama INSERT ON CONFLICT DO NOTHING tetap tidak menimpa main yang sudah ada. Kesalahan migrasi menyebabkan rollback dan startup gagal, bukan melanjutkan dengan data setengah selesai.

Health mengembalikan stockSchemaVersion dan stockBackupVerified untuk memverifikasi keberadaan backup setelah deploy. Backup ini snapshot logis seluruh state aplikasi dalam database yang sama; bukan backup offsite, backup semua tabel PostgreSQL, atau pengganti disaster recovery Railway.

Pemulihan perlu maintenance/penutupan transaksi baru, snapshot tambahan state terkini, lalu inspeksi backup sebelum tindakan. Jangan restore snapshot penuh setelah transaksi baru berjalan tanpa rekonsiliasi: itu dapat menghilangkan order/pembayaran baru. Tidak disediakan tombol reset/restore otomatis.

## Performa dan batas arsitektur

Benchmark lokal memory terisolasi (script menolak koneksi PostgreSQL), 3.000 pesanan selesai, 10 timeline/order, lima request/profile:

| Request | Payload | Median |
|---|---:|---:|
| /api/bootstrap kompatibilitas penuh | 4.810.188 byte | 425,02 ms |
| /api/bootstrap?view=pos | 295.473 byte | 120,92 ms |
| /api/bootstrap?view=stock | 345.627 byte | 110,13 ms |

POS mengirim sekitar 93,9% lebih sedikit data dan median request sekitar 71,5% lebih cepat dibanding mode penuh pada fixture yang sama. Ini bukan pengukuran latency produksi. Script reproduksi: node scripts/stock-benchmark.mjs. Sebelum optimasi default catalog, read+serialize fixture sekitar 540–685 ms; setelah index sekitar 82–99 ms. Seluruh test baseline 165 selesai sekitar 90,35 detik; suite setelah perubahan jauh lebih cepat karena pekerjaan catalog berulang dihilangkan.

Stock UI lazy-import hanya saat diperlukan. Navigasi tidak lagi melakukan render/request PM ganda; loadSequence mencegah response lama menimpa halaman baru. Pencarian stok memfilter DOM row yang sudah ada tanpa membangun ulang tabel. Riwayat stok awal 15, selanjutnya per halaman; bootstrap tidak lagi memuat seluruh timeline order. Detail penuh tetap diminta pada halaman detail. API bootstrap tanpa view tetap kompatibel.

app.js/styles.css masih besar. Refactor massal/CSS rewrite tidak memberi keuntungan terukur yang sebanding dalam batch stok, sehingga hanya UI stok relevan diekstrak. Aktif order masih dimuat per profil yang membutuhkan; pencarian/history Status Order tetap endpoint berpaginasi existing.

PostgreSQL **masih satu dokumen JSONB dan satu row lock**. Patch mengurangi payload tulis dari aplikasi dan kerja JavaScript, tetapi PostgreSQL dapat tetap menulis ulang dokumen/TOAST. Tidak diklaim menghilangkan kontensi atau memisahkan ledger ke tabel. Table split ditunda karena membutuhkan dual-write/migrasi/reconciliation yang lebih besar; atomicity order+stock lebih diprioritaskan. Jika ukuran state/kontensi produksi meningkat, ukur SELECT/UPDATE, lock wait dan TOAST sebelum migrasi tabel terpisah.

## Validasi

Suite akhir: **179 tests lulus, 0 gagal**, 5,19 detik (npm test). Baseline awal 165 tests lulus.

Automated tests mencakup: roll 10 tetap saat selesai → keluar1=9 → masuk5=14, ATK100→95, paper1000→950, invoice campuran, draft, lunas/DP/PO, replay payment, concurrent completion, BOM/variant/custom DTF links, permission, saldo legacy, stok opname, historical closed skip, physical return dan konflik SKU. PG contract test memakai FakePool untuk verifikasi urutan backup-before-migration, lock/patch atomik dan rollback; bukan integrasi real PostgreSQL lokal.

Browser Chromium: desktop1440/1024/768, mobile390/320; Stock, Master Data, POS, Project Management, Status Order, Laporan. Form tambah/edit roll, count legacy, keluar/masuk, double submit, checkout ATK dan touch mobile lulus; tanpa error browser atau document overflow. Tabel lebar tetap dapat scroll horizontal dalam table-wrap seperti desain existing.

Perubahan utama: lib/physical-stock.js, public/stock-methods.js, public/stock-ui.js, lib/store.js, server.js, public/app.js. Integrasi konsumsi/varian/reservasi/laporan: lib/domain.js, lib/dtf-stock.js, lib/item-workflow-routes.js, lib/order-assistance.js, lib/reports.js. Tests/scripts berada di test/physical-stock*, test/stock-store-postgres.test.js dan scripts/stock-benchmark*. Tidak ada perubahan CSS/desain besar atau fitur scanner baru.

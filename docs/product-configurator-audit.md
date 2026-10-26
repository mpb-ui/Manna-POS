# Audit kalkulasi dan penyamaan konfigurasi produk

Tanggal: 17 Oktober 2026. Basis: `ca07edb9647b0cf3682091a25a3d54a713d71409`.

Pembaruan 26 Oktober 2026: optimasi roll/rotasi Luster, Canvas, dan seluruh LF Sticker telah ditambahkan. Lihat [lf-auto-placement.md](lf-auto-placement.md); bagian prioritas di bawah merekam kondisi saat audit awal.

Tindak lanjut: perhitungan otomatis seluruh Outdoor sudah diimplementasikan dalam batch berikutnya. Lihat [outdoor-auto-placement.md](outdoor-auto-placement.md) untuk aturan, cakupan, dan hasil pengujiannya. Temuan di bawah merekam kondisi pada batch UI awal.

Scope batch: analisis kebutuhan perhitungan otomatis dan penerapan UI Albatros ke seluruh konfigurasi produk. Batch ini tidak memperluas algoritme rotasi Albatros ke produk lain, mengganti tarif, atau memigrasikan data. Perluasan algoritme dapat mengubah tagihan dan dibedakan dari penerapan style.

## Katalog yang diperiksa

`new Store()` tanpa koneksi produksi menghasilkan 278 SKU bawaan repository. Jumlah ini merupakan inventaris kode/seed, bukan klaim jumlah SKU riil dalam database produksi. Renderer dan CSS bersama juga berlaku pada produk yang dibuat melalui Master Data, termasuk kategori, varian, dan sub-varian baru.

| Kelompok | SKU | Karakter konfigurasi |
| --- | ---: | --- |
| Outdoor | 7 | 4 roll m², 2 meter lari, 1 spanduk template |
| LF Poster | 4 | Albatros, Luster, Canvas; Backlite Film ukuran tetap |
| LF Sticker | 7 | Roll dengan lebar nominal/kapasitas aktual |
| Print A3+ | 116 | 45 paper, 11 sticker, 59 produk jadi, 1 quick card legacy |
| Display & Banner | 7 | Varian ukuran/paket dan opsi bahan, harga tetap |
| Sablon DTF | 1 | Paket harga, kombinasi warna/ukuran, stok kaos |
| ATK | 79 | Barang satuan |
| Akrilik | 27 | Produk satuan/ukuran tetap |
| Stempel | 30 | Produk satuan/ukuran tetap |

Merchandise tersedia sebagai kategori; katalog bawaan saat audit tidak memiliki SKU pada kategori tersebut. Produk yang ditambahkan tetap menggunakan konfigurasi bersama.

## Produk yang membutuhkan otomatisasi ukuran

### Prioritas pertama: roll m² LF

Albatros sudah otomatis memilih dua orientasi dan kapasitas roll berdasarkan pemakaian bahan terkecil. Sembilan SKU lain merupakan kandidat terdekat:

| Produk | Kapasitas aktual | Alasan |
| --- | --- | --- |
| Luster | 90 / 125 / 152 cm | Berbagai roll; kasus identik dengan Albatros |
| Canvas | 125 cm | Satu roll tetap mendapat manfaat dari rotasi |
| LF Sticker Transparant | 152 cm | Rotasi dapat memendekkan pemakaian roll |
| LF Sticker White Glossy | 102 / 152 cm | Pemilihan roll dan rotasi |
| LF Sticker White Matte | 102 / 152 cm | Pemilihan roll dan rotasi |
| LF Sticker Sandblast Cetak | 102 / 152 cm | Pemilihan roll dan rotasi |
| LF Sticker Sandblast Tanpa Cetak | 102 / 152 cm | Tetap memakai bahan roll walau tanpa proses cetak |
| LF Sticker Oneway Outdoor | 102 / 152 cm | Pemilihan roll dan rotasi |
| LF Sticker Oneway HI-RES | 102 / 152 cm | Pemilihan roll dan rotasi |

Varian A1 yang tersedia harus tetap memakai harga tetap. Pada batch UI ini, pemilihan lebar otomatis berdasarkan lebar gambar dan manual override existing tetap berlaku; optimasi rotasi Albatros belum diperluas.

### Prioritas berikutnya: Outdoor

FL 280 Glossy dan FL 380 Matte memiliki kapasitas 110/220/320 cm. FL 410 Glossy memiliki 220 cm, FL 440 Matte 320 cm. Keempat produk m² layak mendapat pemilihan arah otomatis, termasuk produk satu lebar. Algoritme harus memisahkan ukuran asli, footprint termasuk lebihan, panjang ditagihkan, dan lebar nominal. Aturan existing lebihan hingga 5 cm tidak menambah panjang tagihan harus diperhitungkan per orientasi, bukan mengganti input asli.

Cloth Banner dan NB Backlite 510 memakai **meter lari**, sehingga biaya tidak menggunakan rumus m² Albatros. NB Backlite memiliki kapasitas 320 cm. Cloth Banner belum memiliki mapping kapasitas aktual eksplisit; kode memakai fallback nominal. Lebar nyata Cloth perlu dipastikan sebelum optimasi bahan diaktifkan. Jangan mengganti dasar harga atau menebak kapasitas fisik.

Untuk semua kandidat, penghitungan harus dilakukan ulang di server, identitas SKU roll tetap benar, dan stok fisik roll tetap dikeluarkan manual. Kasus tidak muat pada kedua arah perlu pesan yang jelas; bukan sambungan otomatis. Pesanan historis tidak boleh dihitung ulang saat hanya dibuka/dicetak.

### A3/A3+: kalkulator kapasitas yang berbeda

Kertas dan sticker membutuhkan kapasitas pcs per lembar, bukan optimasi panjang roll. Katalog memiliki 77 SKU dengan kalkulator aktif: 45 paper, 11 sticker, 1 quick card legacy, dan 20 produk jadi/RIM yang terdeteksi dari nama saat inisialisasi lama.

- Area terkecil tetap A3 27 × 39,5 cm dan A3+ 30 × 45 cm; gap masing-masing 2/3 mm.
- Hasil kalkulator bersifat informasi kapasitas; kasir memasukkan lembar secara manual.
- Finishing tidak mengganti kapasitas.
- Pada produk jadi/rim/paket, hasil per lembar tidak boleh otomatis mengganti jumlah satuan jual. UI sekarang menjelaskan perbedaan ini pada panel kalkulator dan mempertahankan label Jumlah produk.
- Flag kalkulator lama tidak diubah atau dinonaktifkan diam-diam dalam batch UI ini. Pengaturan produk/varian tetap mengikuti Master Data.

### Tidak membutuhkan algoritme ukuran bebas

Backlite Film A4–A1, Display & Banner, spanduk template, ATK, Akrilik, dan Stempel memakai ukuran/paket/harga tetap atau jumlah satuan. Pertahankan varian dan jumlah, bukan menebak ukuran custom. DTF memerlukan total paket + tambahan XXL serta pemeriksaan stok warna/ukuran; seluruh fungsi ini sudah tersedia dan dipertahankan. Harga grosir, finishing, serta biaya design tetap dihitung otomatis sesuai definisi produk.

## Implementasi UI

- `public/product-configurator.js` menjadi sumber bersama section bernomor, Finishing, Biaya Design, Catatan produksi, footer, dan auto-height catatan beserta cleanup ResizeObserver.
- `public/product-configurator.css` menggantikan stylesheet khusus Albatros. Scope hanya popup konfigurasi produk, tidak memengaruhi detail order, pembayaran, laporan, atau form Master Data.
- Modal maksimum 650 px; header 24 px/800, harga 15 px, heading section 13 px/700, label/chip 14 px/700, teks pendukung 13 px. Radio 18 px dan warna terpilih #0A68F4/#E9F1FE mengikuti versi Albatros yang disetujui.
- Semua pilihan ukuran, bahan/sub-varian, A3, paket DTF, serta template memakai aturan chip yang sama. Label panjang dapat membungkus tanpa keluar popup.
- Finishing memakai satu baris desktop; kontrol dibagi pada layar kecil. Biaya Design empat kolom desktop/dua mobile. Catatan produksi langsung tampil dan membesar mengikuti isi.
- Outdoor mempertahankan susunan tiga field lebar dan dua field panjang; lebar tagihan sama dengan field lebihan. Mobile menyesuaikan baris.
- Kalkulator A3 terbuka tepat di section ukuran/jumlah, bukan memampatkan form 650 px menjadi dua kolom sempit.
- Footer tetap sticky, tombol utama di kanan dan turun satu baris pada mobile. Fokus keyboard, blinking Ringkasan Pesanan, simpan/edit draft, dan stock blocking DTF tetap berjalan.
- Penjualan cepat ATK/Akrilik/Stempel tetap menggunakan alur jumlah langsung; konfigurasi bersama digunakan ketika produk memerlukan popup/varian.

Tidak ada framework/dependency baru, migrasi, reset, perubahan izin akses, atau perubahan backend harga/stok.

## Validasi

- Seluruh 199 automated tests existing lulus.
- Browser Chromium: seluruh 278 SKU diperiksa pada lebar 1440, 390, dan 320 px; setiap preview default dibandingkan perhitungan backend. Tidak ada overflow/error JavaScript.
- 16 produk representatif diperiksa lagi pada 1280×800, 1024×768, 768×1024, 620×900, 521×800, dan 844×390; footer tetap terlihat.
- Interaksi: Outdoor ukuran/lebihan/manual override; A3 kapasitas/preview/perpindahan sisi; fixed A1; finishing desimal; desain dan catatan; simpan/edit draft; blinking; DTF stok nol, stok tersedia, kombinasi duplikat, serta interaksi mobile sentuh.
- Produk uji dinamis: label bahan panjang, sub-varian, kombinasi nonaktif, grosir per kombinasi, profil A3/A3+ per bahan, serta simpan sementara konfigurasi.
- Regresi Albatros: pemilihan bahan/rotasi, input invalid, A1, catatan, DP/SPK, stok roll, dan sembilan viewport tetap lulus.

QA dijalankan pada server memory terisolasi. Status push/deploy batch ini mengikuti catatan rilis GitHub dan Railway.

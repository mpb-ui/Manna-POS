# Albatros — penempatan otomatis dan konfigurasi Figma

Basis repository: `32c6577f763370e175173f0c36c08536dec3c73b`. Referensi visual: CSS ekspor Figma `Pasted text(8).txt`, 16 Oktober 2026. Scope produk `poster-albatros`, dengan dasar harga m². Outdoor, Luster, Sticker, dan produk lain mempertahankan perhitungannya.

## Aturan

Untuk Meteran dengan ukuran gambar asli, frontend dan backend menggunakan modul bersama `public/albatros-sizing.js`:

1. Bandingkan kedua arah gambar terhadap seluruh pilihan lebar Albatros yang terkonfigurasi; kapasitas aktual saat ini 90/125/152 cm untuk lebar nominal 0,9/1,2/1,5 m.
2. Pilih kapasitas roll × panjang aktual terkecil (estimasi per lembar). Jika sama, pilih luas tagihan terkecil, lalu lebar nominal terkecil, lalu dimensi penempatan sebagai penentu yang konsisten.
3. Harga/HPP tetap memakai lebar nominal × panjang ditagihkan × jumlah. Panjang mengikuti kelipatan produk (saat ini 10 cm) dan minimum 1 m yang sudah berlaku. Harga produk, grosir, promo, finishing, biaya design, dan BOM tidak diubah.
4. Memutar urutan input menghasilkan harga/roll/pemakaian yang sama. Urutan ukuran asli tetap disimpan. Lebihan tidak diperkenalkan pada LF Albatros, mengikuti perilaku LF existing.
5. Jika kedua arah tidak muat, tampilkan pesan dan blokir penambahan; API juga menolak. Tidak otomatis membuat sambungan atau mengubah produk.
6. A1 tetap memakai varian dan harga per lembar dari Master Data. A1 tidak diubah menjadi tagihan meteran dan tidak diberi asumsi dimensi baru pada data produksi.

Prioritas pemakaian bahan dapat menghasilkan tagihan lebih tinggi daripada pilihan lain akibat pembulatan. Contoh tarif katalog Rp150.000/m²: ukuran 70×100 cm memakai roll 125 cm sepanjang70 cm (0,875m²), dengan tagihan nominal1,2×minimum1m = Rp180.000. Alternatif roll90cm sepanjang100cm memakai0,9m² dengan tagihan Rp135.000. Ini mengikuti keputusan pemilik: hemat bahan terlebih dahulu. Estimasi bukan nesting beberapa gambar, bukan pemantauan sisa roll, dan bukan pengurangan stok m².

## Penyimpanan dan kompatibilitas

Backend memilih ulang dari ukuran asli; pilihan lebar dan snapshot penempatan dari client tidak dipercaya. Item baru menyimpan `rollPlacement` versi1 beserta `rollCalculationVersion`. Ukuran asli/akhir tetap terpisah dari `acrossCm`/`alongCm`; `actualLength` dan `billedLength` mengikuti arah penempatan yang dipilih.

Tidak ada migrasi, perubahan saldo, seed, atau modifikasi histori saat membaca data. Input historis tanpa ukuran asli tetap didukung. Pada edit draft lama yang ukuran, jumlah, dan lebar lamanya tidak berubah, penempatan lama dipertahankan; konfigurasi baru atau repeat dengan ukuran asli memakai perhitungan baru. Catatan dokumen berasal dari snapshot, sehingga tidak dihitung ulang saat mencetak histori.

A1 pernah masuk jalur adaptasi lebar roll saat dikonversi ke keranjang edit/repeat. Kondisi ini diperbaiki: varian ukuran tetap dikecualikan dari adaptasi meteran.

SKU bahan mengikuti roll yang terpilih; HPP tetap dari sumber kalkulasi existing. Penyelesaian dan pembayaran tidak mengurangi stok fisik roll. Tidak ada perubahan izin akses atau nominal yang ditampilkan kepada operator. Snapshot penempatan hanya berisi geometri/luas, tanpa nilai uang.

## UI

CSS dibatasi `.albatros-dialog`; modul konfigurasi terpisah. Modal650px, border#D7DFE9, radius12, header20×24px, judul24px/800, harga15px, paddingbody24px. Section memakai nomor20px dan judul13px. Meteran/A1 memakai radio18px sesuai referensi terbaru khusus Albatros; pilihan produk lain tetap menggunakan style existing.

Lebar dan panjang masing-masing144px di desktop, input44px/16px. Stepper144×40px. Detail perhitungan tertutup default; di dalamnya tersedia arah/roll, panjang tagihan, estimasi bahan, pratinjau, dan perbandingan. Kasir dapat mengabaikan detail. Finishing, catatan finishing, varian/sub-varian/opsi bahan, biaya design beserta jumlah/catatan, dan catatan produksi tetap memakai kontrol serta handler existing.

Footer putih sticky, bayangan sesuai referensi, nominal24px, tombol utama50px di kanan. Pada layar kecil tombol turun satu baris agar tetap terbaca. Tinggi804px pada Figma bukan tinggi tetap; isi berkembang dan menggulir sesuai viewport.

Ukuran asli dan penempatan tampil di keranjang, detail, nota/SPK, serta PDF PO. Harga total tetap satu per invoice.

## Validasi

- Seluruh197 automated tests lulus (191 existing + 5 unit tests baru + 1 API integration test).
- 126 kombinasi ukuran/dimensi terbalik, batas kapasitas, desimal, pembulatan, seri pilihan, nol/invalid/no-fit, pilihan bahan vs harga, A1, grosir/promo/finishing/design, draft lama, repeat, HPP, serta stok fisik roll.
- API: snapshot dihitung server, manipulasi client diabaikan, dua request pembuatan yang sama tidak menggandakan pesanan, DP retry tidak menggandakan pembayaran, Meteran+A1, edit draft, operator tidak dapat membuat pesanan/melihat nominal, seluruh item selesai tanpa mengurangi roll.
- Chromium dengan server memory terisolasi:1440×1100,1280×800,1024×768,768×1024,390×844,320×640,844×390. Tidak ada error browser atau overflow horizontal. Emulasi mobile sentuh390×844 juga lulus untuk radio A1, detail, dan preview.
- Browser: header/modal/field/radio/stepper diukur; detail keyboard, preview, invalid/blocked add, A1 saat ukuran Meteran invalid, tutup/buka konfigurasi, finishing area, design2x, blinking, save/edit draft, DP, SPK, ukuran asli/penempatan, dan produk lain.

Tidak ada transaksi QA pada production. Implementasi ini belum dipush atau dideploy.

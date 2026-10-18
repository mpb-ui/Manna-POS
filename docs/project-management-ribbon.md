# Project Management: draft ribbon dan filter

Tanggal: 18 Oktober 2026. Basis repository: `dfbe005fff6bb4b9afdff9af6d623ed197c93bc5`.

Mengikuti export Figma `Pasted text(20261018-032544).txt` dan referensi kelompok tertutup `image(20261017-122333).png`.

## Perilaku

- Dropdown status: Semua Status, Operator Design, Proses Cetak, Finishing, Selesai. Filter tetap memakai status item, bukan agregat invoice.
- Dropdown deadline: terdekat/terjauh. Default terdekat; pengurutan memakai timestamp penuh, stabil untuk deadline yang sama, dan item tanpa deadline tetap di bawah pada kedua arah. Urutan kelompok status tetap mengikuti alur produksi. Berlaku juga di Kanban dan tab Menunggu Pembayaran.
- Nomor lingkaran hanya posisi baris yang sedang terlihat, mulai 1 pada setiap kelompok. Tidak disimpan atau digunakan sebagai ID item/order. Pencarian/filter/sort tidak mengubah identitas item.
- Kolom desktop: Order, PIC, Produk, Jumlah, Deadline. Header kolom tetap tersedia secara semantik untuk aksesibilitas, tanpa judul kolom visual. Footer menghitung produk dan invoice unik secara terpisah.
- Kelompok dapat dibuka/ditutup melalui klik atau keyboard; fokus tetap pada tombol kelompok. Saat tertutup tetap terlihat label berwarna, bagian miring, dan garis tipis hingga sisi kanan.
- Header memakai tinggi 52 px dan bagian miring terpisah berukuran tetap 40 × 52 px. Label dipadatkan pada mobile; bagian miring tidak diskalakan. Layar hingga 900 px memakai susunan list bertingkat, tanpa scroll horizontal. Teks panjang dapat menambah tinggi baris.
- Baris berselang putih/pastel. Header solid hijau/biru/ungu/abu-abu untuk Design/Cetak/Finishing/Selesai. Teks utama 15 px/700, pendukung 13 px; header 20 px.
- Palet PIC hanya presentasi: warna tersimpan `yellow/green/blue/purple/rose/teal` ditampilkan sebagai kuning/pink/abu-abu/ungu/oranye/hijau dalam PM. Gema kuning, Qori pink, Cc/Ko abu-abu. ID dan warna historis tersimpan tidak diubah, sehingga rename/hapus tetap konsisten.
- Label approval lama ditampilkan sebagai **Menunggu ACC** pada list, Kanban, detail, briefing, Status Order, dan pilihan penanda tertahan. Pencarian PM juga mengenali label baru. Nilai alasan API dan pesan audit historis tidak ditulis ulang.
- Navigation mengikuti warna `#15314E`, garis bawah `#65A3F6`, tombol aktif `#0A68F4`, serta label lebih tebal. Badge hitungan pada menu PM disembunyikan sesuai draft. Perhitungan dan navigasi berbasis izin tetap berlaku.

Tidak ada perubahan harga, pembayaran, status produksi, stok, API, schema database, atau izin. Produk identik pada satu invoice tetap dapat diproses secara independen. Tidak ada dependency baru.

## Verifikasi

- **210 automated tests lulus**, termasuk empat test baru untuk pengurutan timestamp/tie/null, identitas item/invoice, warna PIC setelah rename/hapus, serta alias alasan ACC.
- Browser Chromium pada 15 viewport dari 320 hingga 1920 px, termasuk landscape. Data uji 16 item, empat tahap produksi, produk identik, satu invoice lintas status, DP, draft, PO belum dibayar, serta teks dinamis panjang.
- Filter, pencarian, urutan deadline kedua arah, nomor tampilan, kelompok tertutup/terbuka, keyboard, sentuhan, dan fokus ke item yang diklik lulus. PIC hanya mengubah item yang dituju; pembayaran dan stok tidak berubah.
- Pemeriksaan layout mencakup overflow, tumpang tindih nama/PIC, area grid mobile, label Jumlah/Deadline, keterbacaan pilihan PIC, serta ukuran bagian miring pada semua viewport.
- Akun Operator Cetak tetap tidak mendapat tab Menunggu Pembayaran, kontrol assign PIC, ataupun nominal pembayaran/harga yang tidak diizinkan.
- Navigasi tujuh halaman diperiksa pada delapan lebar layar (56 kombinasi), termasuk menu mobile. Perhitungan otomatis Outdoor dan modal konfigurasi POS 650 px tetap berjalan.
- Tidak ditemukan error JavaScript browser. Seluruh QA memakai server memory lokal terisolasi; tidak menulis data produksi.

Status rilis mengikuti commit GitHub dan deployment Railway. Batch ini tidak memerlukan migrasi database.

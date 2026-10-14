# Ringkasan Pesanan — UI Figma

Basis: 8ad265953380d9c39d669097f01daee0a8440997. Referensi: CSS ekspor Figma yang diberikan 14 Oktober 2026, Pasted text(3).txt. Scope hanya tampilan Ringkasan Pesanan pada POS; tidak mengubah server, schema, stok, perhitungan harga atau workflow.

## Perubahan visual

- Island desktop 480px, canvas #FAF9F7, border #D7DFE9, radius12.
- Header minimum56px, padding horizontal24px, background #15314E, judul/count20px bold. Top navigation tetap memakai style existing.
- Kartu putih berjarak12px, padding16px, radius8; nomor item dalam lingkaran biru24px. Nama15px bold dan harga16px bold sejajar, detail/jumlah/finishing14px, ukuran asli semibold. Hapus sejajar baris finishing dan memiliki label aksesibel sesuai produk.
- Total #E9F1FE, label18px dan nominal28px biru #0A68F4.
- Body padding20px, jarak antarkelompok20px. Label pelanggan14px semibold, input48px. Tombol Pembayaran dan Simpan Draft minimum50px, radius8 dan gap10px.
- Tinggi845px/card128px pada Figma dipakai sebagai acuan isi standar, bukan tinggi tetap. Nama/deskripsi panjang, notes, breakdown Spanduk Template dan informasi tambahan tetap terlihat. Layar kecil memakai lebar tersedia, padding16px, dan ukuran nominal total yang menyesuaikan.

## Behavior dipertahankan

cartHtml hanya menyusun ulang markup; semua teks, ukuran asli/lebihan, design template, finishing, catatan dan harga menggunakan nilai existing. data-remove tetap memakai index item yang sama; penomoran mengikuti urutan setelah penghapusan.

checkoutHtml, syncDraft, tombol/form submit, kalkulasi total, pembayaran, histori, stock validation dan permission tidak diubah. blinkCartTotal dan keyframes/timing existing tetap, termasuk dukungan prefers-reduced-motion. UI tidak menambah API request. Bantuan stok/repeat tetap berada pada form; wrapper stok yang kosong disembunyikan secara visual agar tidak menambah ruang kosong dan kembali tampil ketika berisi warning.

CSS terpisah public/order-summary.css dimuat setelah style existing, dengan selector yang dibatasi pos-layout/sticky-summary. public/index.html hanya menambahkan stylesheet. public/app.js hanya perubahan markup kartu.

## Validasi

191 automated tests existing lulus, 0 gagal. Tidak ditambahkan unit test yang hanya menyalin CSS/markup.

Chromium lokal, database memory terisolasi: 1440,1280,1150,1024,768,390,320px; tanpa error browser/document overflow. Pengukuran actual: island480px, header20px, badge24×24px, input48px dan tombol50px.

Uji browser mencakup:

- Empty cart: Pembayaran/Draft nonaktif.
- Tambah produk: nomor/harga benar; ukuran asli/lebihan serta detail template masih terlihat.
- Blinking: animationName cart-total-blink, duration0.55s, iteration3, class terhapus setelah selesai.
- Nama/WA/deadline dipertahankan ketika menambah atau menghapus produk; total berubah sesuai item.
- Long-content stress: nama tanpa spasi panjang, finishing panjang dan nominal besar tetap berada di dalam kartu.
- Save Draft: input pelanggan/ukuran/quantity/total tersimpan benar, belum dibayar, tanpa pengurangan stok.
- Pembayaran ATK: modal pembayaran dan detail Diambil tetap terbuka; penjualan2pcs mengubah stok100→98 seperti workflow existing.

Tidak ada transaksi QA atau perubahan data pada produksi.

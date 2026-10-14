# Ringkasan Pesanan — UI Figma

Basis revisi compact: 0e6fa80b1c2384af29c9ff6a5d3adff0d67601c3. Referensi terbaru: CSS ekspor Figma yang diberikan 14 Oktober 2026, Pasted text(7).txt. Menggantikan ukuran pada Pasted text(3).txt. Scope hanya tampilan Ringkasan Pesanan pada POS; tidak mengubah server, schema, stok, perhitungan harga atau workflow.

## Perubahan visual

- Island desktop 480px, canvas #FAF9F7, border #D7DFE9, radius12.
- Header minimum48px, padding horizontal24px, background #15314E, judul18px dan count16px bold. Top navigation tetap memakai style existing.
- Kartu putih berjarak12px, padding16px, radius8; nomor item dalam lingkaran biru20px. Nama/harga14px bold sejajar, detail/jumlah/finishing12px, ukuran asli semibold. Hapus sejajar baris finishing dan memiliki label aksesibel sesuai produk.
- Total #E9F1FE, label18px dan nominal24px biru #0A68F4. Total membentang selebar panel sesuai referensi.
- Body padding20px, jarak antarkelompok20px. Label pelanggan12px semibold, input44px. Nama pelanggan satu baris penuh, WhatsApp/deadline satu baris di desktop dan bertumpuk pada layar ≤480px agar input tanggal terbaca. Tombol Pembayaran dan Simpan Draft minimum48px, radius8 dan gap10px, dengan garis pemisah di atas.
- Tinggi716px/card116px pada Figma dipakai sebagai acuan isi standar, bukan tinggi tetap. Nama/deskripsi panjang, notes, breakdown Spanduk Template dan informasi tambahan tetap terlihat. Layar kecil memakai lebar tersedia, padding16px, dan ukuran nominal total yang menyesuaikan. Tinggi maksimum panel mengikuti viewport; isi panjang menggulir di dalam panel. Tombol memakai sticky bottom dan tetap dalam alur normal ketika isi pendek. Padding gulir mencegah field fokus tertutup tombol, termasuk saat Batal Edit tersedia, dan memperhitungkan safe area. Panel desktop tetap terlihat saat halaman katalog digulir; tablet/mobile mengikuti alur halaman.

## Behavior dipertahankan

Markup kartu dari batch sebelumnya dipertahankan; semua teks, ukuran asli/lebihan, design template, finishing, catatan dan harga menggunakan nilai existing. data-remove tetap memakai index item yang sama; penomoran mengikuti urutan setelah penghapusan.

checkoutHtml, syncDraft, tombol/form submit, kalkulasi total, pembayaran, histori, stock validation dan permission tidak diubah. blinkCartTotal dan keyframes/timing existing tetap, termasuk dukungan prefers-reduced-motion. UI tidak menambah API request. Bantuan stok/repeat tetap berada pada form; wrapper stok yang kosong disembunyikan secara visual agar tidak menambah ruang kosong dan kembali tampil ketika berisi warning.

Revisi ini hanya mengubah public/order-summary.css dan dokumen ini. CSS dimuat setelah style existing, dengan selector yang dibatasi pos-layout/sticky-summary. Form checkout memakai display:contents agar tombol sticky mengikuti scroll panel tanpa menduplikasi kontrol, memindahkan input, menambah event listener atau request API. FormData, required fields, reportValidity dan event submit tetap memakai form asli.

## Validasi

191 automated tests existing lulus, 0 gagal. Tidak ditambahkan unit test yang hanya menyalin CSS/markup.

Chromium lokal, database memory terisolasi: 1440,1280,1150,1024,768,390,320px; tanpa error browser/document overflow. Pengukuran actual: island480px, header18px, badge20×20px, input44px dan tombol48px.

Uji browser mencakup:

- Empty cart: Pembayaran/Draft nonaktif.
- Tambah produk: nomor/harga benar; ukuran asli/lebihan serta detail template masih terlihat.
- Blinking: animationName cart-total-blink, duration0.55s, iteration3, class terhapus setelah selesai.
- Nama/WA/deadline dipertahankan ketika menambah atau menghapus produk; total berubah sesuai item.
- Long-content stress: nama tanpa spasi panjang, finishing panjang dan nominal besar tetap berada di dalam kartu.
- Save Draft pesanan panjang 8 item: input pelanggan/ukuran/quantity/total Rp480.000 tersimpan benar, belum dibayar, tanpa pengurangan stok.
- Pembayaran ATK: modal pembayaran dan detail Diambil tetap terbuka; penjualan2pcs mengubah stok100→98 seperti workflow existing.

Pengujian tambahan floating:

- Delapan item aktual, termasuk produk yang sama pada beberapa baris. Dua tombol tetap terlihat dan dapat diklik pada posisi scroll awal/tengah/akhir.
- Viewport 1440×900, 1280×720, 1024×768, 768×1024, 390×844, 320×640, 844×390 dan 1280×500 lulus.
- Fokus keyboard dan validasi required membuka field pelanggan yang tersembunyi di atas tombol. Pembayaran dengan nama kosong tidak membuat request pesanan.
- Warning stok tetap terlihat di area scroll, tidak tertutup tombol; wrapper kosong tetap disembunyikan. Tombol Batal Edit tambahan tidak menutupi field fokus pada layar pendek.

Tidak ada transaksi QA atau perubahan data pada produksi. Revisi compact/floating belum dipush atau dideploy.

# Detail invoice pada Status Order

Detail dari Status Order menampilkan seluruh item dalam satu invoice. Acuan visual:
Figma Work `2146:227728` dan `2146:227534`, termasuk gambar keadaan Lunas dan Selesai.
Dialog berukuran 650 px pada desktop, menyesuaikan layar kecil, dengan header dan
footer tetap terlihat saat isi digulir.

- Ringkasan: status pembayaran, total pesanan, diskon bila ada, total tagihan setelah
  diskon, serta sisa pembayaran untuk pesanan belum lunas. Transaksi batal dan
  pesanan yang sudah diambil memiliki keterangan tersendiri.
- Setiap kartu: nomor item, nama produk, badge status pekerjaan, varian dan jumlah,
  spesifikasi ukuran yang benar-benar tersimpan, finishing, dan layanan file.
  Varian bernama seperti FL410 Glossy tetap varian; tidak diberi label ukuran.
- Detail ini hanya membaca informasi item. Catatan, link Drive, pengaturan PIC,
  deadline, perubahan status produksi, dan aksi Tertahan berada pada alur produksi.
  Detail Project Management tetap khusus satu item.
- Detail tidak membuka atau menyisipkan form pembayaran, termasuk untuk draft dan
  pesanan belum lunas. Form dibuka dari tombol **Konfirmasi Pembayaran** pada
  Status Order. Tidak ada tombol Catat Transfer Tambahan di detail invoice.
- Riwayat Pembayaran selalu terbuka bagi akun yang berhak. Nomor Print Bukti
  mengikuti urutan penerimaan uang; kombinasi deposit dan uang baru dalam satu
  transaksi tetap satu bukti. PO/tempo dan refund ditampilkan tersendiri, bukan
  dihitung sebagai penerimaan uang baru. Dokumen PO masih dapat dilihat.
- Riwayat Pekerjaan tertutup setiap kali detail dibuka. Chevron atau keyboard
  membuka timeline gabungan seluruh item, terbaru dahulu. Kejadian item memiliki
  nama produk dan nomor item; pembayaran, pemakaian/kelebihan deposit, dan pelunasan
  melalui diskon tidak masuk timeline pekerjaan. Data timeline asli tidak diubah.
- Footer menyediakan Print SPK, Nota Ulang, Print Tanda Terima, Edit Pesanan draft,
  Retur Barang, dan Pesanan Diterima sesuai kondisi serta hak akses yang sudah ada.
  Tombol pembatalan tetap menggunakan alur Refund/Jadikan Deposit yang sama.
- Pesanan Diterima berlaku untuk seluruh invoice setelah semua item Selesai.
  Pesanan belum lunas memerlukan konfirmasi sisa tagihan; penerimaan barang tidak
  menghapus atau mengurangi piutang. Kondisi terbaru diperiksa sebelum permintaan.
- Klik di luar dialog atau Escape menutup detail. Saat penerimaan barang sedang
  disimpan, penutupan diblokir hingga permintaan selesai. Hak melihat nominal,
  pembayaran, pembatalan, retur, dan penerimaan barang tetap diperiksa server.

Presentasi ada di `public/invoice-detail.js` dan `public/invoice-detail.css`.
Ikon ekspor Figma disimpan lokal di `public/invoice-assets/` pada ukuran aslinya.
Data tetap memakai endpoint order-history, cash-receipts, pembayaran, dan status
yang sudah ada; perubahan ini tidak memigrasikan data atau rumus harga/stok.

Pengujian mencakup ringkasan bersyarat, beberapa status item, pemisahan timeline,
urutan bukti pembayaran, deposit/PO/refund, hak akses, escaping, serta pickup
belum lunas. Pemeriksaan browser memakai server memori terisolasi, termasuk
desktop 1440/1024 px, mobile 390/320 px, touch, footer, dan integrasi tombol cetak.

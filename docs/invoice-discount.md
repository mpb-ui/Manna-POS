# Diskon nominal pesanan

Pop-up Pembayaran dan Form Pembayaran pada Detail memakai komponen yang sama: checkbox Diskon, input rupiah saat aktif, lalu Total Tagihan. Pembatalan/penutupan pop-up tidak menyimpan perubahan. Diskon berlaku setelah seluruh harga produk (termasuk promo/grosir), finishing dan jasa dijumlahkan; harga katalog dan snapshot item tidak diubah.

`POST /api/orders/:id/payments` menerima `invoiceDiscountAmount` sebagai integer rupiah 0 sampai Total Pesanan. Hak akses mengikuti `pos.payment`. Nilai diperiksa dan disimpan dalam transaksi Store yang sama dengan pembayaran, deposit, audit dan stok. Kesalahan apa pun membatalkan seluruh perubahan. Payload diskon masuk fingerprint idempotensi pembayaran. Perubahan diskon ditolak setelah konfirmasi pertama, termasuk DP/PO; mengirim kembali nominal tersimpan diperbolehkan untuk pelunasan.

Snapshot pesanan: `grossTotal`, `invoiceDiscount: { amount, appliedAt, actorId, actor }`, dan `total` sebagai tagihan bersih. Item `subtotal` tetap harga sebelum diskon pesanan. Pesanan lama tanpa snapshot tetap memakai nilai semula. Pembayaran positif menyimpan `orderGrossTotal` dan `invoiceDiscountAmount` di samping snapshot saldo yang sudah ada. Bukti pembayaran lama tetap memakai snapshot aslinya. Peran tanpa akses nominal tidak menerima snapshot diskon/gross.

Deposit mengurangi tagihan setelah diskon. Tombol DP 50% menargetkan separuh tagihan bersih, memperhitungkan uang/deposit yang sudah dialokasikan. Sisa tagihan, pelunasan, pengembalian setelah pembatalan, dan Total Belanja pelanggan menggunakan nilai bersih; Total Belanja tetap hanya invoice lunas. Diskon penuh boleh menghasilkan tagihan nol: konfirmasi tetap menjalankan stok/workflow sekali, menandai Lunas, tanpa menciptakan penerimaan uang/deposit fiktif.

Laporan membagi diskon proporsional ke setiap item dalam integer rupiah dengan largest remainder, tie mengikuti urutan item. Total kategori/produk/mesin dan alokasi pembayaran/piutang memakai nilai bersih; HPP, kuantitas, stok, dan harga asal tetap. Nota Ulang, Tanda Terima, bukti pembayaran, dan PDF PO memperlihatkan total asal, diskon dan tagihan bersih jika ada diskon. SPK tetap tidak menampilkan harga.

Verifikasi: `npm test`, termasuk unit alokasi/pembulatan besar, laporan per kategori, snapshot nota, DP/deposit, rollback, lock PO, idempotensi, akses peran, refund bersih, dan diskon penuh dengan stok retail. QA browser memeriksa ukuran desktop, 390px, 320px, perubahan total/DP, validasi, penutupan tanpa simpan, dan pelunasan.

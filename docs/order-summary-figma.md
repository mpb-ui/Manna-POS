# Ringkasan Pesanan: penggabungan dan edit item

Revisi 19 Oktober 2026, berdasarkan CSS Figma Pasted text(20261019-022240).txt serta screenshot Ringkasan Pesanan yang disetujui. Basis commit: e5ac9910c6a692ff4485f934b970560bb2782e08.

## Perilaku

- Semua jalur penambahan (pencarian, konfigurator, dan katalog barang langsung jual) menggunakan operasi keranjang yang sama. Produk dengan konfigurasi identik bergabung dan jumlahnya dijumlahkan. Harga grosir dihitung ulang dari jumlah gabungan oleh backend.
- Kunci konfigurasi mencakup produk, ukuran asli dan lebihan, lebar bahan, ukuran tetap, varian/sub-varian, pilihan tambahan, snapshot kalkulator, finishing dan catatannya, kategori/catatan desain, catatan produksi, serta paket dan kombinasi warna/ukuran kaos. Produk sama dengan konfigurasi berbeda tetap terpisah. Finishing manual dibandingkan berdasarkan jumlah per produk; finishing area otomatis dihitung ulang oleh backend.
- Biaya Design A/B/C/D yang dimasukkan kembali ikut dijumlahkan. Contoh: Design A ×1 ditambah Design A ×1 menjadi ×2, Rp50.000. Mengedit jumlah cetak tidak otomatis mengubah jumlah desain atau finishing manual. Kasir dapat mengubah keduanya secara eksplisit.
- Design Template juga memiliki jumlah eksplisit agar penggabungan tidak menghilangkan biaya yang sudah ditambahkan. Data lama tanpa field ini tetap dikenai satu biaya template seperti sebelumnya.
- Klik kartu atau tekan Enter/Space pada nama produk membuka konfigurasi tersimpan. Simpan Perubahan mengganti baris yang dipilih; Batal tidak mengubah keranjang. Edit tidak menggabungkan baris lain yang kebetulan menjadi identik.
- Setiap baris mempunyai cartId lokal yang stabil. itemId draft dipertahankan ketika SKU tetap sama; mengganti SKU melalui pilihan A3 menggunakan identitas item baru sesuai alur existing. Baris historis identik tidak digabung secara massal.
- Ukuran/finishing/desain/catatan, A1, pilihan bahan/sub-varian, sisi A3 dan kalkulator, serta kombinasi kaos dikembalikan ke kontrol edit. Draft Outdoor lama mempertahankan perhitungan lama ketika ukuran dan jumlah tidak berubah.
- Stok kaos saat edit menghitung ketersediaan tanpa menggandakan pemakaian baris yang sedang diedit; baris lain tetap diperhitungkan. Kekurangan stok tetap memblokir penambahan/perubahan.

## Harga dan konkurensi

POST /api/orders/check menerima includeItems:true secara opsional untuk mengembalikan baris hasil perhitungan server. Respons default tetap kompatibel. Endpoint mengikuti permission POS, memvalidasi akses draft, dan tidak menulis pesanan, pembayaran, stok, maupun riwayat.

Operasi keranjang diserialisasi dalam antrean. Klik tambah ganda pada popup diblokir; klik cepat stepper katalog tetap dijumlahkan. Pembayaran/simpan draft dinonaktifkan selama harga diperbarui. Hasil request hanya diterapkan jika akun, draft, referensi keranjang, dan popup masih sesuai. Menutup popup atau kegagalan request tidak mengubah keranjang. Request mempunyai batas waktu 10 detik dan dapat dicoba ulang.

Hasil pemeriksaan stok dari quotation dipakai kembali oleh UI maksimal 5 detik untuk keranjang yang sama, sehingga penambahan tidak langsung menimbulkan request pemeriksaan kedua. Reload membatalkan cache. Checkout dan backend tetap memvalidasi kondisi aktual sesuai alur existing.

## Tampilan

- Island 480px, canvas #FAF9F7, header #15314E; nomor item biru, kartu putih, nama/harga14px dan detail12px mengikuti patokan existing.
- Kartu diringkas menjadi nama/harga, jumlah/ukuran, ukuran asli/lebihan, desain/catatan jika ada, dan finishing/Hapus. Detail penempatan roll lengkap tetap tersedia pada detail pesanan/SPK.
- Nama pelanggan berada di atas WhatsApp dan deadline. Pada layar kecil kedua field terakhir bertumpuk agar tanggal terbaca.
- Total putih ditempatkan setelah data pelanggan. Total dan dua tombol dalam satu footer sticky: Simpan Draft di kiri, Pembayaran di kanan. Batal Edit berada pada baris tambahan saat mengedit draft.
- Blinking nominal total mempertahankan class, keyframes, durasi, pengulangan, dan dukungan reduced motion existing. Tidak ada perubahan navigasi atau halaman lain.

## Validasi batch

- Seluruh 217 automated tests lulus, termasuk 7 test baru untuk merge/edit, grosir, biaya desain/template, finishing, stok kaos, permission quotation, request bersamaan, identitas draft, pembayaran dan tidak adanya mutasi saat quotation.
- Browser Chromium dengan database memory terisolasi: alur tambah melalui pencarian/katalog, edit/batal/keyboard, request gagal dan retry, double-click, pembatalan saat request berjalan, perbedaan konfigurasi, biaya desain dan finishing, template, kalkulator dan sisi A3, stok kaos, draft lama/baru, DP dan SPK lulus tanpa error JavaScript.
- Varian/sub-varian dinamis, kombinasi nonaktif, harga grosir, pergantian profil kalkulator, A1, finishing manual pecahan, catatan Design C, serta pilihan ukuran/opsi Display lulus.
- 36 kombinasi layout (kosong/2/35 item pada 12 viewport), edit pada 6 viewport dan interaksi sentuh mobile lulus tanpa overflow. Total/tombol tetap terlihat pada pesanan panjang.
- Konfigurasi default seluruh 278 produk diperiksa pada lebar 1440/390/320px, termasuk kesamaan preview harga dengan backend. Enam viewport tambahan diperiksa menggunakan produk perwakilan.
- Tidak ada transaksi QA pada produksi. Batch ini tidak memerlukan migrasi schema atau reset database.

## File

public/cart.js dan public/cart-editor.js memisahkan identitas/penggabungan serta pemulihan editor dari app.js. Integrasi berada pada app.js, order-assistance-ui.js, dtf-stock-selection.js, sheet-calculator-ui.js dan roll-configurator.js. Tampilan pada order-summary.css. Backend hanya mengubah quotation opsional dan jumlah biaya template di assistance-routes.js/domain.js. Test baru: test/cart.test.js dan test/cart-api.test.js.

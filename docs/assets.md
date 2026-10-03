# Aset dan penyusutan Manna POS

## Penggunaan

Admin/Owner membuka **Master Data → Aset**. Daftar awal kosong; aplikasi tidak menebak harga atau tanggal dari Daftar Mesin. Tambahkan setiap unit mesin, komputer, UPS, AC, furnitur, atau peralatan lain sebagai aset tersendiri.

Data wajib: nama, kode unik, kategori, tanggal perolehan, tanggal siap digunakan, harga perolehan dalam rupiah, nilai residu, dan masa manfaat dalam bulan. Data opsional: lokasi, penanggung jawab, nomor seri, catatan, dan hubungan ke mesin produksi.

Satu mesin operasional dapat terhubung ke satu aset yang belum dilepas. Setelah aset dilepas, mesin dapat dihubungkan ke aset pengganti. Harga perolehan dan informasi keuangan tidak ditambahkan ke katalog produk. Status mesin Maintenance/Nonaktif dan penghapusan mesin tidak menghentikan penyusutan atau menghapus riwayat aset.

Edit Mesin menampilkan harga perolehan, penyusutan bulan berjalan, nilai buku, dan tombol untuk membuka/mencatat aset. Aset menyimpan identitas mesin saat dihubungkan agar tetap dapat ditelusuri sesudah mesin diarsipkan.

## Kebijakan perhitungan internal

- Metode garis lurus bulanan: `(harga perolehan - residu) / masa manfaat dalam bulan`.
- Beban satu bulan penuh dimulai pada bulan siap digunakan. Perhitungan tidak menggunakan prorata hari.
- Nilai buku akhir bulan dihitung dari saldo kumulatif yang dibulatkan ke rupiah. Beban bulanan adalah selisih saldo sehingga akhir masa manfaat tepat mencapai residu.
- Aset lama dihitung dari tanggal siap digunakan aslinya, bukan tanggal dimasukkan ke aplikasi. Ini bukan impor saldo akumulasi penyusutan dari pembukuan eksternal.
- Aset habis disusutkan tetap terdaftar; nilai buku tidak turun di bawah residu.
- Aset masa depan memiliki nilai buku/beban nol sampai bulan siap digunakan.
- Perolehan/tanggal/residu/masa manfaat awal dapat dikoreksi sebelum bulan penyusutan dimulai. Setelah itu data awal dikunci. Identitas, lokasi, penanggung jawab, catatan, dan hubungan mesin masih bisa diedit.
- **Ubah Estimasi** mencatat sisa masa manfaat baru, residu baru, tambahan nilai, bulan efektif, dan alasan. Berlaku paling awal bulan berikutnya dan setelah bulan mulai penggunaan. Perubahan harus berurutan setelah estimasi terakhir. Bulan sebelumnya tidak dihitung ulang.
- Tambahan nilai meningkatkan nilai buku pada awal bulan efektif sebelum beban penyusutan bulan tersebut dihitung. Residu baru tidak boleh lebih tinggi daripada saldo awal ditambah tambahan nilai.

## Pelepasan dan arsip

**Catat Pelepasan** merekam Dijual atau Dilepas/Rusak, tanggal, hasil pelepasan, dan alasan. Memerlukan checkbox konfirmasi. Tanggal hanya boleh dalam bulan berjalan sampai hari ini serta tidak mendahului tanggal siap digunakan. Ini melindungi angka bulan lampau.

Beban berhenti pada bulan pelepasan (bulan pelepasan tidak dibebankan). Nilai buku sebelum pelepasan dan laba/rugi pelepasan tetap tercatat. Laba/rugi = hasil pelepasan - nilai buku sebelum pelepasan. Perubahan estimasi yang dijadwalkan setelah pelepasan tidak diterapkan; catatan rencananya tetap tersimpan.

Aset aktif tidak dapat dihapus. **Arsipkan Aset** tersedia setelah pelepasan, atau untuk membatalkan aset yang belum mulai disusutkan. Tidak ada penghapusan fisik data. Jadwal historis aset yang telah dilepas/diarsipkan tetap dihitung dan dapat diekspor.

## Laporan dan akses

Daftar Aset menyediakan bulan laporan, pencarian, filter kategori/status, detail, jadwal hingga 120 bulan per permintaan, riwayat perubahan, CSV, dan Cetak/PDF. Ringkasan harga perolehan/akumulasi/nilai buku menghitung aset yang sudah mulai digunakan dan belum dilepas pada bulan terpilih; total beban mencakup semua aset yang menimbulkan penyusutan bulan itu.

Tab **Laporan → Aset & Penyusutan** tersedia bagi Admin/Owner dengan akses biaya laporan. Menampilkan bulan dari tanggal akhir laporan, dengan label bahwa nilai dihitung sampai akhir bulan. Filter pesanan (kategori produk, mesin, sumber pembayaran) tidak memfilter daftar aset. Ekspor dan print pada tab ini menggunakan data aset.

Penyusutan ditampilkan terpisah dan tidak otomatis dikurangkan dari Laba Kotor Estimasi, biaya per produk, uang masuk, saldo pembayaran, payroll, atau stok. Dengan demikian belum ada perhitungan laba bersih maupun alokasi penyusutan ke HPP yang berisiko menghitung biaya dua kali.

Ini adalah daftar penyusutan untuk pengelolaan internal, bukan jadwal penyusutan fiskal. Kelompok pajak, rekonsiliasi fiskal, jurnal buku besar, dana penggantian, dan penyusutan berbasis volume belum diotomatisasi.

Semua endpoint aset dibatasi di server untuk Admin/Owner. Detail finansial hubungan mesin tidak dikirim ke Kasir/Operator/Gudang. Perubahan memerlukan revisi terakhir untuk mencegah overwrite; riwayat aset dan audit mencatat pelaku serta waktu. Penyimpanan menggunakan array `assets` pada PostgreSQL app_state yang sama tanpa migrasi tabel atau perubahan katalog lama.

# Pendamping pekerjaan dan akses Manager

## Briefing harian

Briefing memakai tanggal WITA (`Asia/Makassar`). Popup otomatis tampil satu kali per akun pada hari itu apabila ada pekerjaan outstanding. Waktu tampil dan dibaca disimpan di data akun pada PostgreSQL, sehingga sesi/perangkat lain tidak menampilkan ulang popup. Menutup melalui ×, Escape, atau Sudah Dibaca menandainya dibaca. Tombol **Briefing Hari Ini** membuka ulang secara manual. Popup tidak mengambil alih Detail Pesanan yang terbuka atau payroll yang belum disimpan.

Urutan: deadline sudah lewat, deadline hari ini, lalu pekerjaan lain. Dalam setiap kelompok, pekerjaan paling lama menunggu didahulukan; penanda tertahan memakai waktu mulai tertahan. Popup menampilkan empat pesanan teratas (dua pada layar kecil), jumlah sisanya, dan jalan menuju Dashboard atau Detail Pesanan. Dashboard menampilkan lima pesanan awal dan dapat diperluas bertahap.

| Profil awal | Pesanan |
| --- | --- |
| Owner, Admin, Manager | Semua outstanding yang boleh diakses |
| CS/Kasir | Sisa pembayaran, Proses Cetak, dan Proses Finishing |
| Operator Design | Operator Design |
| Operator Cetak | Proses Cetak, serta Operator Design dengan file yang sudah dikonfirmasi Siap Cetak |
| Staff Gudang | Tanpa briefing otomatis |

**Master Data → User & Akses → Profil Briefing Pagi** menyediakan profil Tim Finishing untuk akun yang mengerjakan finishing. Profil mengatur isi briefing, tidak menambah permission. Nominal hanya dikirim apabila akun memiliki `projects.money`.

Draft yang disimpan tanpa konfirmasi dipisahkan dari tagihan aktif; tombol Pembayaran mengonfirmasi invoice, dan pencatatan pembayaran juga mengonfirmasinya. Pesanan batal tidak masuk briefing. Pesanan Diambil yang masih memiliki sisa pembayaran tetap muncul bagi profil penagihan/seluruh outstanding. Data lama memakai penanda konfirmasi yang tersedia; tidak dibuatkan pembayaran baru.

## Kelengkapan, tertahan, dan checklist

Kelengkapan memeriksa ukuran yang memang dibutuhkan, kesiapan file, dan deadline. ATK, Akrilik, dan Stempel yang dijual langsung tidak diminta file/deadline. Pilihan layanan File Siap Cetak/Biaya Design tetap mengatur harga; kesiapan file merupakan konfirmasi operasional tersendiri. Data lama tanpa konfirmasi memakai **Belum dikonfirmasi**.

Penanda tertahan menyimpan alasan, catatan, waktu mulai, dan pelaku tanpa mengganti status produksi. Perubahan masuk riwayat. Status produksi tidak dapat dilanjutkan selama penanda belum dilepas. Pengguna dengan akses edit pesanan, penugasan, atau status dapat mengelola penanda dan kesiapan file sesuai visibilitas pesanan.

Checklist tersimpan per baris produk, mengikuti konfigurasi dan finishing yang benar-benar dipilih, termasuk jumlah kelompok finishing. Akun dengan `projects.status` dapat mencentang. Sebelum pindah tahap, UI mengingatkan checklist tahap saat ini yang belum lengkap; pengguna dapat melanjutkan dengan konfirmasi yang dicatat di riwayat. Pemeriksaan ini membantu pekerjaan tanpa mengubah aturan perpindahan status pada API lama. Edit isi draft menyusun ulang checklist; riwayat perubahan tetap disimpan.

## Repeat order dan stok

Saran repeat order mencocokkan nama dan nomor WhatsApp. Nama sama dengan beberapa nomor harus diperjelas dengan nomor. Hanya pesanan terkonfirmasi yang boleh diakses akun tersebut ditawarkan. Quote dihitung ulang dengan produk aktif, varian, finishing, dan harga grosir saat ini. Pilihan yang telah dihapus/tidak tersedia mengharuskan pemilihan ulang. Pembayaran, deadline, kesiapan file, dan biaya design lama tidak disalin; kasir mengonfirmasi kebutuhan design kembali.

Kesiapan stok menjumlahkan kebutuhan setiap bahan/varian, kemudian mengurangi alokasi dari pesanan lain yang telah dikonfirmasi pembayarannya dan masih di Design/Cetak/Finishing. Draft, pesanan batal, dan pesanan yang stoknya sudah diproses tidak menjadi alokasi. Bahan yang belum terhubung ditandai untuk diperiksa. Pemeriksaan tidak mengubah stok; pengurangan fisik tetap satu kali saat **Selesai**, mengikuti aturan stok yang sudah ada. Saat pesanan akan Diambil, pengingat pembayaran membaca sisa terbaru dari server.

## Manager

Preset **Manager** merupakan gabungan tepat permission Kasir, Operator Design, Operator Cetak, dan Staff Gudang. Manager dapat menjalankan POS/pembayaran, mengelola tahapan produksi/PIC, dan mengelola stok menurut gabungan tersebut. Edit deadline mengikuti izin edit pesanan. Preset ini tidak otomatis memberi pengelolaan user, master data, payroll, aset, atau HPP.

Owner/Admin dapat memilih role Manager ketika membuat atau mengedit user, kemudian mengubah checkbox permission seperti role lainnya. Tombol Gunakan Template Role mengembalikan gabungan awal. Perubahan permission berlaku pada request berikutnya, termasuk sesi yang masih aktif. Tidak ada akun Manager yang dibuat otomatis.

Semua data fitur ini disimpan dalam struktur `app_state` yang sudah ada. Tidak ada perubahan schema SQL, seed karyawan, katalog, maupun stok production.

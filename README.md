# monitoring-Kadis

Dashboard monitoring untuk Kepala Desa: satu tempat untuk laporan seluruh aplikasi desa, termasuk data kependudukan dari SIAK.

- `index.html`: tampilan rinci (filter, tabel, isi data warga).
- `tv.html`: tampilan TV satu layar tanpa scroll (hanya angka gabungan, tidak pernah nama/NIK).

## Isi dashboard

Bagian atas: **layanan digital terselesaikan** (angka utama), **status tiap bagian**, dan daftar **perlu perhatian** yang dihitung otomatis.

1. Aplikasi Mobile Warga: pengguna aktif, pengajuan layanan, tingkat penyelesaian, pengaduan terbuka
2. Aplikasi Kiosk: kiosk online/offline, transaksi, layanan terpopuler, status tiap kiosk
3. Inventaris Aset: jumlah, nilai, kondisi per kategori
4. **Data Kependudukan (SIAK)**: lihat di bawah
5. Monitoring Server: uptime, CPU, RAM, disk, backup, masa berlaku SSL
6. Monitoring Blangko: terpakai, rusak, dan sisa dari total per jenis blangko

Filter periode (7 / 30 / 90 hari) berlaku untuk grafik tren bagian 1, 2, 5, dan 6. Setiap grafik punya tombol **Tabel**, dan ada mode terang/gelap.

## Data Kependudukan (SIAK)

Data dibaca **per warga** (bukan angka yang sudah dijumlah), sehingga semua angka bisa disaring dan isinya bisa dilihat.

**Filter** (boleh digabung; hasilnya mengikuti semua filter sekaligus):
- Status perkawinan: Menikah, Lajang, Janda, Duda. Janda/duda diturunkan dari status cerai (hidup atau mati) dan jenis kelamin.
- Usia: Balita 0–5, Anak 6–16, Remaja 17–24, Dewasa 25–59, Lansia 60+, atau rentang usia bebas.
- Strata pendidikan: Tidak/Belum sekolah, SD, SMP, SMA, Diploma (D1–D3), Sarjana (D4/S1), Pascasarjana (S2/S3).
- Kepemilikan kartu: sudah/belum punya KTP-el (wajib usia 17+ atau sudah kawin), sudah/belum punya KIA (anak < 17 yang belum kawin).
- Pencarian nama, NIK, atau No. KK.

Filter tersimpan di URL (kecuali kata pencarian), jadi tautan bisa dibagikan, mis. `index.html?status=janda&usia=60-150&pend=sd`.

**Yang ditampilkan**: jumlah warga, KK, cakupan KTP-el dan KIA, kualitas data (NIK tidak valid/ganda, isian kosong), sebaran status, usia, pendidikan, dusun, dan **daftar warga**. Klik nama warga untuk melihat isi datanya (identitas, kependudukan, pendidikan/pekerjaan, status KTP-el/KIA, anggota keluarga). NIK disamarkan dan baru terlihat bila tombol "Tampilkan" ditekan.

### Sumber data

| Sumber | Cara |
|---|---|
| Data contoh | Bawaan (`data.js`), sintetis; NIK/KK berawalan `999999` bukan nomor sungguhan. |
| Impor CSV SIAK | Tombol **Impor CSV dari SIAK…** di bagian 4. File dibaca langsung di browser dan tidak dikirim ke mana pun; hilang saat halaman dimuat ulang. Hanya CSV (di Excel pilih *Simpan sebagai CSV*). Hasil impor menampilkan laporan: baris diimpor/dilewati, kolom dikenali, kolom yang tidak ada. |
| API | Isi `apiPenduduk` di `config.js` dengan alamat endpoint JSON buatan Anda (array data warga, atau `{ "records": [...] }`, bentuk di `warga.js`). Dipakai juga oleh tampilan TV, yang mengambil ulang tiap 5 menit. Bila gagal, halaman memakai data sebelumnya dan menampilkan pemberitahuan. |

**Belum diuji dengan ekspor SIAK yang asli.** Pembaca CSV mengenali nama kolom yang umum (mis. `NIK`, `NO_KK`, `NAMA_LGKP`, `JENIS_KELAMIN`, `TGL_LHR`, `STAT_KWN`, `PDDK_AKH`) berdasarkan perkiraan; daftar alias ada di `warga.js` (`ALIAS`) dan mudah ditambah. Kolom wajib hanya nama dan tanggal lahir. Status KTP-el/KIA dibaca bila ada kolomnya; bila tidak ada, cakupan kartu tidak dihitung (bukan dianggap 0%). Selalu periksa laporan impor.

**Soal akses SIAK**: SIAK dikelola Dukcapil dan aksesnya berizin. Dashboard ini tidak menyimpan kredensial SIAK dan tidak memanggil SIAK langsung. Jalur yang disarankan: ekspor resmi dari operator yang berwenang (CSV), atau endpoint server-side milik desa/dinas yang memeriksa hak akses lalu meneruskan data ke `apiPenduduk`.

### Privasi (penting)

NIK dan nama adalah data pribadi. File HTML statis ini **tidak punya login**: siapa pun yang bisa membuka halaman dan data/API-nya bisa melihat isi data warga. Untuk data nyata, sajikan lewat server dengan autentikasi, jangan unggah ke hosting publik, dan jangan tampilkan `index.html` di layar umum. Tampilan TV sengaja hanya menampilkan angka gabungan.

## Tampilan TV (satu layar, tanpa scroll)

Buka `tv.html`. Semua 6 laporan, angka utama, jam, dan peringatan muat dalam satu layar 16:9 (1920×1080, otomatis diskalakan; layar non-16:9 diberi pinggiran kosong). Tanpa klik atau hover, font besar, kursor hilang saat diam. Daftar "Perlu perhatian" berganti halaman tiap 8 detik.

Parameter URL (opsional): `?days=7|30|90`, `?theme=light|dark` (bawaan gelap), `?refresh=<menit>`, `?page=<detik>`, dan filter data warga (hanya panel 4): `?status=janda`, `?usia=17-24`, `?pend=sd,sma`, `?kartu=ktp-belum`. Tombol **Filter warga** di pojok kiri atas (atau panah kiri/kanan di keyboard/remote) mengganti status perkawinan.
Pasang di TV: buka di browser layar penuh (F11), mis. `chrome --kiosk tv.html`.

## Menjalankan

Tidak perlu build. Buka `index.html` di browser (atau `python3 -m http.server` lalu buka `http://localhost:8000`; wajib bila memakai `apiPenduduk`).

## Data selain kependudukan

Bagian 1, 2, 3, 5, dan 6 masih **data contoh** dari `data.js` (ditandai badge di halaman). Ganti isi `window.DASHBOARD_DATA` dengan data dari masing-masing aplikasi (bentuk data sama), lalu set `meta.dataContoh` ke `false`. Ambang peringatan blangko ada di `data.js` (`blangko.ambangRusakPersen`, `blangko.ambangSisaPersen`); ambang disk server (75% / 90%) dan cakupan kartu/kualitas data (90% / 75%) ada di `app.js` dan `shared.js`. Semua ambang adalah nilai awal; sesuaikan dengan kebijakan desa.

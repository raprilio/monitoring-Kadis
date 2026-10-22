# monitoring-Kadis

Dashboard ringkasan untuk Kepala Desa: satu halaman yang menampilkan laporan dari seluruh aplikasi desa.

## Isi dashboard

Bagian atas: **layanan digital terselesaikan** (angka utama), **status tiap bagian**, dan daftar **perlu perhatian** yang dihitung otomatis dari data.

1. Aplikasi Mobile Warga: pengguna aktif, pengajuan layanan, tingkat penyelesaian, pengaduan terbuka
2. Aplikasi Kiosk: kiosk online/offline, transaksi, layanan terpopuler, status tiap kiosk
3. Inventaris Aset: jumlah, nilai, kondisi (baik / perlu perbaikan / rusak) per kategori
4. Data Digital Warga: penduduk, KK, per dusun, per usia, kelengkapan data, mutasi
5. Monitoring Server: uptime, CPU, RAM, disk, backup, masa berlaku SSL
6. Monitoring Blangko: terpakai, rusak, dan sisa dari total per jenis blangko, tren tingkat rusak

Filter periode (7 / 30 / 90 hari) berlaku untuk seluruh grafik dan angka tren.

**Filter status perkawinan** (Semua / Menikah / Lajang / Cerai) berlaku untuk: aplikasi warga, transaksi kiosk, dan seluruh data warga (jumlah, dusun, usia, kelengkapan, mutasi), termasuk angka utama dan daftar "Perlu perhatian". Server, aset, dan blangko tidak punya kaitan dengan status perkawinan sehingga tidak ikut terfilter (diberi label). Di `index.html` pilih lewat tombol filter; di TV lewat tombol "Status" atau panah kiri/kanan; keduanya juga bisa lewat URL `?status=menikah`. Bagian "Data Digital Warga" menampilkan jumlah warga per status. Setiap grafik punya tombol **Tabel** dan ada mode terang/gelap.

## Tampilan TV (satu layar, tanpa scroll)

Buka `tv.html`. Semua 6 laporan, angka utama, jam, dan peringatan muat dalam satu layar 16:9 (1920×1080, otomatis diskalakan ke ukuran TV; layar non-16:9 diberi pinggiran kosong). Tanpa klik atau hover, font besar, kursor hilang saat diam. Daftar "Perlu perhatian" berganti halaman otomatis tiap 8 detik, dan tampilan dirender ulang tiap 5 menit.

Parameter URL (opsional): `tv.html?days=7|30|90`, `?status=semua|menikah|lajang|cerai`, `?theme=light|dark` (bawaan gelap), `?refresh=<menit>`, `?page=<detik>`.
Pasang di TV: buka di browser layar penuh (F11), misalnya Chrome mode kiosk `chrome --kiosk tv.html`.

## Menjalankan

Tidak perlu build. Buka `index.html` di browser (atau `python3 -m http.server` lalu buka `http://localhost:8000`).

## Data

Saat ini seluruh angka adalah **data contoh** (dibuat otomatis di `data.js`, ditandai badge "Data contoh" di halaman). Untuk memakai data nyata, ganti isi `window.DASHBOARD_DATA` di `data.js` dengan data dari masing-masing aplikasi (bentuk data sama, lihat komentar di bagian atas file). Set `meta.dataContoh` ke `false` agar badge hilang.

Agar filter status bekerja dengan data nyata, data warga harus dipecah per status (`warga.perStatus` di `data.js`; jumlah "semua" dihitung otomatis dari ketiganya). Aktivitas aplikasi warga dan kiosk dipecah memakai `porsiStatus`; angka itu sekarang perkiraan contoh. Pada data nyata, simpan status warga (dari NIK) di setiap pengguna/transaksi lalu hitung porsinya dari sana.

Ambang peringatan blangko ada di `data.js` (`blangko.ambangRusakPersen`, `blangko.ambangSisaPersen`). Ambang disk server (75% / 90%) dan kelengkapan data (90% / 75%) ada di `app.js`; angka-angka ini nilai awal, sesuaikan dengan kebijakan desa.

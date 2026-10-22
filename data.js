/*
 * DATA CONTOH (dummy) — bukan data desa yang sebenarnya.
 *
 * Dashboard membaca semua angka dari `window.DASHBOARD_DATA`. Untuk memakai
 * data nyata, ganti isi file ini (atau isi `window.DASHBOARD_DATA` dari hasil
 * fetch API / ekspor tiap aplikasi) dengan bentuk data yang sama.
 * Deret harian (`*Harian`, `cpu`, `ram`, ...) harus sepanjang `tanggal`,
 * urut dari yang terlama ke yang terbaru, dan minimal 2× periode terpanjang
 * pada filter (90 hari) supaya perbandingan "vs periode sebelumnya" bisa dihitung.
 */
(function () {
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rnd = mulberry32(20261022);
  const noise = (amp) => (rnd() - 0.5) * 2 * amp;

  const DAYS = 180;
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tanggal = [];
  const hariKerja = [];
  for (let i = 0; i < DAYS; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - (DAYS - 1 - i));
    tanggal.push(ymd(d));
    const dow = d.getDay();
    hariKerja.push(dow >= 1 && dow <= 5 ? 1 : 0.55);
  }
  const seri = (fn) => tanggal.map((_, i) => fn(i));
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  const pengajuan = seri((i) => Math.max(0, Math.round((30 + i * 0.05) * hariKerja[i] + noise(6))));
  const selesai = pengajuan.map((v) => Math.round(v * clamp(0.86 + noise(0.06), 0.6, 1)));

  window.DASHBOARD_DATA = {
    meta: {
      desa: 'Desa Contoh',
      kecamatan: 'Kecamatan Contoh',
      kabupaten: 'Kabupaten Contoh',
      diperbarui: new Date().toISOString(),
      dataContoh: true,
    },
    tanggal,

    // Porsi aktivitas menurut status perkawinan (jumlah tiap baris = 1). Dipakai untuk memecah deret
    // harian aplikasi warga dan kiosk saat filter status dipilih. Pada data nyata, catat status warga
    // (dari NIK) di setiap pengguna/transaksi lalu hitung porsi ini dari sana.
    porsiStatus: {
      penggunaAktif: { menikah: 0.58, lajang: 0.3, cerai: 0.12 },
      pengajuan: { menikah: 0.62, lajang: 0.3, cerai: 0.08 },
      transaksiKiosk: { menikah: 0.55, lajang: 0.37, cerai: 0.08 },
    },

    // 1. Aplikasi Mobile Warga
    mobile: {
      penggunaAktifHarian: seri((i) => Math.round((700 + i * 1.8) * (hariKerja[i] === 1 ? 1 : 0.82) * (1 + noise(0.04)))),
      pengajuanHarian: pengajuan,
      selesaiHarian: selesai,
      rating: 4.6,
      jumlahUlasan: 318,
      pengaduanPerStatus: {
        menikah: { terbuka: 7, lebih7Hari: 2 },
        lajang: { terbuka: 4, lebih7Hari: 1 },
        cerai: { terbuka: 1, lebih7Hari: 0 },
      },
      // bobot relatif; jumlah per periode = bobot × total pengajuan periode
      pengajuanPerJenis: [
        { label: 'Surat keterangan domisili', bobot: 0.27 },
        { label: 'Surat pengantar KTP / KK', bobot: 0.22 },
        { label: 'Surat keterangan usaha', bobot: 0.15 },
        { label: 'Surat keterangan tidak mampu', bobot: 0.13 },
        { label: 'Pengaduan & aspirasi', bobot: 0.11 },
        { label: 'Lainnya', bobot: 0.12 },
      ],
    },

    // 2. Aplikasi Kiosk
    kiosk: {
      transaksiHarian: seri((i) => Math.max(0, Math.round((48 + i * 0.04) * hariKerja[i] + noise(8)))),
      waktuLayananMenit: 2.4,
      perangkat: [
        { nama: 'Kiosk Balai Desa', lokasi: 'Lobi Balai Desa', status: 'online', uptime30: 99.8, transaksiHariIni: 41, kertasPersen: 72, catatan: '—' },
        { nama: 'Kiosk Kantor Dusun 1', lokasi: 'Dusun Krajan', status: 'online', uptime30: 99.1, transaksiHariIni: 18, kertasPersen: 55, catatan: '—' },
        { nama: 'Kiosk Kantor Dusun 2', lokasi: 'Dusun Sumber', status: 'online', uptime30: 98.7, transaksiHariIni: 12, kertasPersen: 14, catatan: 'Kertas hampir habis' },
        { nama: 'Kiosk Pasar Desa', lokasi: 'Pasar Desa', status: 'offline', uptime30: 91.4, transaksiHariIni: 0, kertasPersen: 60, catatan: 'Tidak terhubung sejak 2 jam lalu' },
        { nama: 'Kiosk Pustu', lokasi: 'Puskesmas Pembantu', status: 'online', uptime30: 99.5, transaksiHariIni: 9, kertasPersen: 81, catatan: '—' },
      ],
      layananPopuler: [
        { label: 'Cetak surat keterangan domisili', bobot: 0.31 },
        { label: 'Cetak Kartu Keluarga (salinan)', bobot: 0.2 },
        { label: 'Cek status pengajuan', bobot: 0.17 },
        { label: 'Surat pengantar', bobot: 0.14 },
        { label: 'Info bantuan sosial', bobot: 0.1 },
        { label: 'Lainnya', bobot: 0.08 },
      ],
    },

    // 3. Inventaris Aset Desa
    aset: {
      kategori: [
        { nama: 'Tanah & bangunan', baik: 14, perbaikan: 3, rusak: 1, nilai: 4200000000 },
        { nama: 'Kendaraan', baik: 5, perbaikan: 2, rusak: 1, nilai: 610000000 },
        { nama: 'Peralatan kantor', baik: 62, perbaikan: 9, rusak: 6, nilai: 185000000 },
        { nama: 'Perangkat IT', baik: 38, perbaikan: 7, rusak: 5, nilai: 242000000 },
        { nama: 'Mebel & perlengkapan', baik: 120, perbaikan: 14, rusak: 11, nilai: 96000000 },
        { nama: 'Fasilitas umum', baik: 21, perbaikan: 6, rusak: 2, nilai: 1350000000 },
      ],
      perluPerhatian: [
        { nama: 'Mobil operasional desa', kategori: 'Kendaraan', kondisi: 'rusak', lokasi: 'Garasi Balai Desa', catatan: 'Mesin perlu turun mesin' },
        { nama: 'Atap Balai Dusun 2', kategori: 'Tanah & bangunan', kondisi: 'rusak', lokasi: 'Dusun Sumber', catatan: 'Bocor, rawan roboh' },
        { nama: 'Printer sertifikat (2 unit)', kategori: 'Perangkat IT', kondisi: 'perbaikan', lokasi: 'Kantor Desa', catatan: 'Menunggu servis' },
        { nama: 'Pos ronda RW 03', kategori: 'Fasilitas umum', kondisi: 'perbaikan', lokasi: 'RW 03', catatan: 'Lantai retak' },
        { nama: 'Proyektor balai', kategori: 'Perangkat IT', kondisi: 'rusak', lokasi: 'Balai Desa', catatan: 'Lampu mati' },
      ],
    },

    // 4. Data Digital Warga
    // Dipecah menurut status perkawinan (kunci: menikah, lajang, cerai). Jumlah "semua" dihitung
    // dashboard dengan menjumlahkan ketiganya, jadi tidak perlu diisi terpisah.
    //  - lajang = belum kawin (termasuk anak-anak); cerai = cerai hidup + cerai mati (janda/duda).
    //  - perDusun / perUsia / kelengkapan mengikuti urutan `dusun` / `kelompokUsia` / `indikator`.
    //  - kelengkapan = % warga di status itu yang datanya sudah lengkap.
    warga: {
      dusun: ['Dusun Krajan', 'Dusun Sumber', 'Dusun Tegalan', 'Dusun Karanganyar'],
      kelompokUsia: ['0–5 tahun', '6–17 tahun', '18–59 tahun', '60 tahun ke atas'],
      indikator: [
        'NIK terverifikasi',
        'Kartu Keluarga terdigitalisasi',
        'Dokumen pendukung ter-scan',
        'Nomor HP tercatat',
        'Terdaftar di aplikasi warga',
      ],
      perStatus: {
        menikah: {
          penduduk: 2105, kepalaKeluarga: 1010, lakiLaki: 1050, perempuan: 1055,
          perDusun: [724, 531, 440, 410], perUsia: [0, 0, 1590, 515],
          kelengkapan: [98.5, 94.0, 88.0, 90.0, 80.0], terdaftarApp: 1684,
          mutasi30Hari: { lahir: 0, meninggal: 1, datang: 5, pindah: 4 },
        },
        lajang: {
          penduduk: 1998, kepalaKeluarga: 160, lakiLaki: 1060, perempuan: 938,
          perDusun: [694, 549, 424, 331], perUsia: [312, 861, 800, 25],
          kelengkapan: [93.5, 88.0, 80.0, 62.0, 42.0], terdaftarApp: 839,
          mutasi30Hari: { lahir: 7, meninggal: 1, datang: 5, pindah: 4 },
        },
        cerai: {
          penduduk: 183, kepalaKeluarga: 142, lakiLaki: 41, perempuan: 142,
          perDusun: [62, 45, 41, 35], perUsia: [0, 0, 114, 69],
          kelengkapan: [97.0, 90.0, 85.0, 85.0, 70.0], terdaftarApp: 128,
          mutasi30Hari: { lahir: 0, meninggal: 1, datang: 1, pindah: 1 },
        },
      },
    },

    // 5. Monitoring Server
    server: {
      uptime30: 99.93,
      cpu: seri((i) => clamp(Math.round(38 + 6 * Math.sin(i / 7) + noise(4)), 5, 100)),
      ram: seri((i) => clamp(Math.round(56 + i * 0.07 + noise(2)), 5, 100)),
      backupTerakhir: { waktu: '02:00 tadi pagi', status: 'berhasil' },
      sslSisaHari: 23,
      perangkat: [
        { nama: 'srv-aplikasi', peran: 'Aplikasi warga & kiosk (API)', status: 'ok', cpu: 41, ram: 66, disk: 58, uptimeHari: 63 },
        { nama: 'srv-database', peran: 'Basis data kependudukan', status: 'ok', cpu: 33, ram: 71, disk: 86, uptimeHari: 63 },
        { nama: 'srv-backup', peran: 'Penyimpanan cadangan (NAS)', status: 'ok', cpu: 8, ram: 34, disk: 64, uptimeHari: 120 },
        { nama: 'router-balai', peran: 'Jaringan Balai Desa', status: 'warning', cpu: 52, ram: 61, disk: 22, uptimeHari: 9 },
      ],
    },

    // 6. Blangko (stok pengadaan = terpakai + rusak + sisa)
    blangko: {
      ambangRusakPersen: 3, // % rusak dari yang dicetak, di atas ini = perlu perhatian
      ambangSisaPersen: 15, // sisa stok di bawah ini = perlu pengadaan
      jenis: [
        { nama: 'KTP-el', total: 1000, terpakai: 640, rusak: 15 },
        { nama: 'Kartu Keluarga', total: 1500, terpakai: 910, rusak: 14 },
        { nama: 'Akta Kelahiran', total: 800, terpakai: 410, rusak: 9 },
        { nama: 'Akta Kematian', total: 300, terpakai: 96, rusak: 2 },
        { nama: 'Kartu Identitas Anak (KIA)', total: 600, terpakai: 288, rusak: 25 },
        { nama: 'Surat Pindah', total: 400, terpakai: 331, rusak: 8 },
      ],
      terpakaiHarian: seri((i) => Math.max(0, Math.round(9 * hariKerja[i] + noise(3)))),
      rusakHarian: seri(() => (rnd() < 0.28 ? 1 : 0) + (rnd() < 0.04 ? 1 : 0)),
    },
  };
})();

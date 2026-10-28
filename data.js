(window.__ver = window.__ver || {})['data.js'] = '2026-10-28.2';
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


  /* ---------- data warga contoh (sintetis; NIK/KK berawalan 999999 = bukan nomor sungguhan) ---------- */
  function buatWarga() {
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const wpick = (items, w) => {
      let t = rnd() * w.reduce((x, y) => x + y, 0);
      for (let i = 0; i < items.length; i++) { t -= w[i]; if (t <= 0) return items[i]; }
      return items[items.length - 1];
    };
    const NAMA_L = ['Ahmad', 'Budi', 'Slamet', 'Agus', 'Hendra', 'Joko', 'Wahyu', 'Eko', 'Dedi', 'Rudi', 'Bambang', 'Sugeng', 'Andi', 'Fajar', 'Rizki', 'Dimas', 'Yusuf', 'Imam', 'Hasan', 'Taufik'];
    const NAMA_P = ['Siti', 'Sri', 'Ani', 'Dewi', 'Rina', 'Wati', 'Lestari', 'Fitri', 'Yuni', 'Endang', 'Nur', 'Aminah', 'Maya', 'Putri', 'Ratna', 'Intan', 'Ayu', 'Tutik', 'Sari', 'Lilis'];
    const BELAKANG = ['Santoso', 'Wijaya', 'Rahayu', 'Hidayat', 'Saputra', 'Utami', 'Prasetyo', 'Kurniawan', 'Setiawan', 'Handayani', 'Nugroho', 'Pratama', 'Susanto', 'Wibowo', 'Purnomo', 'Aryani', 'Permana', 'Yulianti', 'Mulyadi', 'Suryani'];
    const DUSUN = ['Dusun Krajan', 'Dusun Sumber', 'Dusun Tegalan', 'Dusun Karanganyar'];
    const PEKERJAAN = ['Petani/Pekebun', 'Buruh Harian Lepas', 'Wiraswasta', 'Pedagang', 'Karyawan Swasta', 'PNS', 'Guru', 'Perangkat Desa', 'Mengurus Rumah Tangga', 'Belum/Tidak Bekerja', 'Pensiunan'];

    // strata pendidikan tertinggi menurut kelompok umur (bobot untuk 10 jenjang SIAK)
    const pendOf = (usia) => {
      if (usia < 7) return 0;
      if (usia < 13) return 1;
      if (usia < 16) return 2;
      if (usia < 19) return wpick([2, 3], [0.15, 0.85]);
      const w = usia < 23 ? [0, 0, 0.04, 0.2, 0.62, 0.03, 0.05, 0.06, 0, 0]
        : usia < 40 ? [0, 0.01, 0.06, 0.18, 0.55, 0.02, 0.05, 0.12, 0.01, 0]
        : usia < 60 ? [0.02, 0.06, 0.25, 0.25, 0.34, 0.01, 0.02, 0.05, 0.01, 0]
        : [0.1, 0.2, 0.4, 0.15, 0.1, 0, 0.01, 0.04, 0, 0];
      return wpick([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], w);
    };
    const pekerjaanOf = (usia, jk, pend) => {
      if (usia < 7) return 'Belum/Tidak Bekerja';
      if (usia < 23 && pend <= 4 && rnd() < 0.8) return 'Pelajar/Mahasiswa';
      if (usia >= 65) return wpick(['Pensiunan', 'Petani/Pekebun', 'Belum/Tidak Bekerja', 'Mengurus Rumah Tangga'], [0.2, 0.4, 0.25, 0.15]);
      if (jk === 'P') return wpick(PEKERJAAN, [0.1, 0.06, 0.1, 0.1, 0.08, 0.03, 0.05, 0.01, 0.4, 0.05, 0.02]);
      return wpick(PEKERJAAN, [0.3, 0.2, 0.15, 0.1, 0.12, 0.03, 0.02, 0.03, 0, 0.04, 0.01]);
    };
    const lahir = (usia) => {
      const d = new Date(today);
      d.setFullYear(d.getFullYear() - usia);
      d.setDate(d.getDate() - Math.floor(rnd() * 365));
      return ymd(d);
    };

    const out = [];
    let nikSeq = 1;
    const orang = (kk, usia, jk, statusKawin, hubungan) => {
      const tgl = lahir(usia);
      const [y, m, d] = tgl.split('-');
      const nik = '999999' + String(Number(d) + (jk === 'P' ? 40 : 0)).padStart(2, '0') + m + y.slice(2) + String(nikSeq++).padStart(4, '0');
      const pend = pendOf(usia);
      const pernah = statusKawin !== 'BELUM KAWIN';
      const ktpWajib = usia >= 17 || pernah, kiaWajib = usia < 17 && !pernah;
      const r = {
        nik, noKK: kk.noKK, nama: (() => { const dep = pick(jk === 'L' ? NAMA_L : NAMA_P); const tgh = rnd() < 0.35 ? pick(jk === 'L' ? NAMA_L : NAMA_P) : ''; return dep + (tgh && tgh !== dep ? ' ' + tgh : '') + ' ' + kk.marga; })(),
        jk, tglLahir: tgl, tempatLahir: pick(['Kabupaten Contoh', 'Kota Contoh', 'Kabupaten Sebelah']),
        statusKawin, pend, pekerjaan: pekerjaanOf(usia, jk, pend),
        agama: wpick(['Islam', 'Kristen', 'Katolik', 'Hindu'], [0.95, 0.03, 0.01, 0.01]),
        golDarah: wpick(['O', 'A', 'B', 'AB'], [0.4, 0.28, 0.25, 0.07]),
        hubungan, dusun: kk.dusun, rt: String(kk.rt).padStart(2, '0'), rw: String(kk.rw).padStart(2, '0'),
        alamat: `${kk.dusun}, RT ${String(kk.rt).padStart(2, '0')}/RW ${String(kk.rw).padStart(2, '0')}`,
        ktpEl: ktpWajib ? (rnd() < (usia < 20 ? 0.65 : 0.96) ? 'sudah' : 'belum') : null,
        kia: kiaWajib ? (rnd() < (usia < 5 ? 0.55 : 0.8) ? 'sudah' : 'belum') : null,
        aplikasi: usia < 12 ? false : usia < 18 ? rnd() < 0.2 : usia < 60 ? rnd() < 0.72 : rnd() < 0.3,
      };
      out.push(r);
      return r;
    };
    const anak = (kk, usiaIbu, maks) => {
      const n = Math.floor(rnd() * (maks + 1));
      for (let i = 0; i < n; i++) {
        const batas = Math.min(usiaIbu - 19, 30);
        if (batas < 0) break;
        orang(kk, Math.floor(rnd() * (batas + 1)), rnd() < 0.5 ? 'L' : 'P', 'BELUM KAWIN', 'ANAK');
      }
    };
    const cerai = () => (rnd() < 0.75 ? 'CERAI MATI' : 'CERAI HIDUP');

    for (let n = 1; n <= 1312; n++) {
      const kk = {
        noKK: '999999' + String(n).padStart(10, '0'), marga: pick(BELAKANG),
        dusun: wpick(DUSUN, [1480, 1125, 905, 776]), rt: 1 + Math.floor(rnd() * 4), rw: 1 + Math.floor(rnd() * 3),
      };
      const t = rnd();
      if (t < 0.55) { // pasangan + anak
        const u = 26 + Math.floor(rnd() * 38);
        orang(kk, u, 'L', 'KAWIN', 'KEPALA KELUARGA');
        const ui = Math.max(18, u - 6 + Math.floor(rnd() * 8));
        orang(kk, ui, 'P', 'KAWIN', 'ISTRI');
        anak(kk, ui, 4);
      } else if (t < 0.65) { // pasangan lansia
        const u = 60 + Math.floor(rnd() * 26);
        orang(kk, u, 'L', 'KAWIN', 'KEPALA KELUARGA');
        const ui = Math.max(55, u - 5 + Math.floor(rnd() * 6));
        orang(kk, ui, 'P', 'KAWIN', 'ISTRI');
        if (rnd() < 0.3) orang(kk, 25 + Math.floor(rnd() * 15), rnd() < 0.5 ? 'L' : 'P', 'BELUM KAWIN', 'ANAK');
      } else if (t < 0.76) { // janda
        const u = 35 + Math.floor(rnd() * 50);
        orang(kk, u, 'P', cerai(), 'KEPALA KELUARGA');
        anak(kk, u, 3);
      } else if (t < 0.82) { // duda
        const u = 40 + Math.floor(rnd() * 46);
        orang(kk, u, 'L', cerai(), 'KEPALA KELUARGA');
        anak(kk, u - 8, 2);
      } else if (t < 0.92) { // lajang
        orang(kk, 19 + Math.floor(rnd() * 22), rnd() < 0.55 ? 'L' : 'P', 'BELUM KAWIN', 'KEPALA KELUARGA');
      } else { // pasangan muda
        const u = 20 + Math.floor(rnd() * 11);
        orang(kk, u, 'L', 'KAWIN', 'KEPALA KELUARGA');
        const ui = Math.max(18, u - 3 + Math.floor(rnd() * 4));
        orang(kk, ui, 'P', 'KAWIN', 'ISTRI');
        anak(kk, ui, 1);
      }
    }

    // masalah kualitas data yang sengaja disisipkan, supaya pemantauan kualitas data terlihat bekerja
    for (let i = 0; i < 7; i++) { const r = out[Math.floor(rnd() * out.length)]; r.nik = r.nik.slice(0, 15); }
    for (let i = 0; i < 5; i++) { out[Math.floor(rnd() * out.length)].nik = out[Math.floor(rnd() * out.length)].nik; }
    for (let i = 0; i < 13; i++) out[Math.floor(rnd() * out.length)].noKK = '';
    out.forEach((r) => { if (rnd() < 0.03) r.pekerjaan = ''; });
    return out;
  }
  const warga = buatWarga();

  /* ---------- data sekolah contoh (sintetis), diturunkan dari warga usia sekolah ---------- */
  function buatSekolah(wg) {
    // data "terakhir diperbarui" pertengahan Mei (akhir tahun ajaran); setelah 1 Juli dashboard menaikkan kelas otomatis
    const snap = new Date(today.getFullYear(), 4, 15);
    if (today < snap) snap.setFullYear(snap.getFullYear() - 1);
    const taY = snap.getMonth() >= 6 ? snap.getFullYear() : snap.getFullYear() - 1;
    const ta = taY + '/' + (taY + 1);
    const taNow = (today.getMonth() >= 6 ? today.getFullYear() : today.getFullYear() - 1);
    const ageAt = (iso, d0) => { const [y, m, dd] = iso.split('-').map(Number); let a = d0.getFullYear() - y; if (d0.getMonth() + 1 < m || (d0.getMonth() + 1 === m && d0.getDate() < dd)) a--; return a; };
    const sekolah = [
      { id: 'sd1', npsn: '20300001', nama: 'SDN 1 Contoh', jenjang: 'SD', dusun: 'Dusun Krajan' },
      { id: 'sd2', npsn: '20300002', nama: 'SDN 2 Contoh', jenjang: 'SD', dusun: 'Dusun Sumber' },
      { id: 'smp1', npsn: '20300101', nama: 'SMPN 1 Contoh', jenjang: 'SMP', dusun: 'Dusun Krajan' },
      { id: 'smk1', npsn: '20300201', nama: 'SMKN 1 Contoh', jenjang: 'SMK', dusun: 'Dusun Tegalan' },
      { id: 'smk2', npsn: '20300202', nama: 'SMK Nusantara Contoh', jenjang: 'SMK', dusun: 'Dusun Karanganyar' },
    ];
    const byJ = (j) => sekolah.filter((s) => s.jenjang === j);
    const pilih = (j, dusun) => { const l = byJ(j), sama = l.filter((s) => s.dusun === dusun); return (sama.length && rnd() < 0.7 ? sama : l)[Math.floor(rnd() * (sama.length && rnd() < 0.7 ? sama : l).length)] || l[0]; };
    const siswa = [];
    let seq = 1;
    const rec = (w, s, jenjang, kelas, tahun) => ({ nisn: '00' + String(seq++).padStart(8, '0'), nik: w.nik, nama: w.nama, jk: w.jk, tglLahir: w.tglLahir, sekolahId: s.id, sekolah: s.nama, npsn: s.npsn, jenjang, kelas, tahunAjaran: tahun, status: 'aktif' });
    wg.forEach((w) => {
      const a = ageAt(w.tglLahir, snap);
      let jenjang, kelas, p;
      if (a >= 7 && a <= 12) { jenjang = 'SD'; kelas = a - 6; p = 0.98; }
      else if (a >= 13 && a <= 15) { jenjang = 'SMP'; kelas = a - 6; p = 0.94; }
      else if (a >= 16 && a <= 18) { jenjang = 'SMK'; kelas = a - 6; p = 0.6; }
      else return;
      if (rnd() > p) return;
      if (rnd() < 0.06 && kelas > (jenjang === 'SD' ? 1 : jenjang === 'SMP' ? 7 : 10)) kelas--; // sebagian tinggal kelas
      const s = pilih(jenjang, w.dusun);
      siswa.push(rec(w, s, jenjang, kelas, ta));
      // pendaftar baru kelas 1 SD pada tahun ajaran baru (anak yang kini berusia 7 tahun; sebagian pendaftaran sudah masuk)
      // (ditangani di bawah, di luar loop jenjang)
      // lulusan SD/SMP yang sudah terdaftar di jenjang berikutnya pada tahun ajaran baru (pendaftaran sudah masuk)
      if (taNow > taY && ((jenjang === 'SD' && kelas === 6) || (jenjang === 'SMP' && kelas === 9)) && rnd() < 0.55) {
        const nj = jenjang === 'SD' ? 'SMP' : 'SMK';
        siswa.push(rec(w, pilih(nj, w.dusun), nj, nj === 'SMP' ? 7 : 10, taNow + '/' + (taNow + 1)));
      }
    });
    if (taNow > taY) {
      const jul = new Date(taNow, 6, 1);
      wg.forEach((w) => { if (ageAt(w.tglLahir, jul) === 7 && rnd() < 0.55) siswa.push(rec(w, pilih('SD', w.dusun), 'SD', 1, taNow + '/' + (taNow + 1))); });
    }
    return { diperbarui: snap.toISOString(), sekolah, siswa };
  }
  const dataSekolah = buatSekolah(warga);

  /* ---------- keuangan desa (APBDes) contoh ---------- */
  const keuangan = {
    tahun: today.getFullYear(),
    diperbarui: new Date(today.getTime() - 3 * 86400000).toISOString(),
    // ambang peringatan (nilai awal; sesuaikan): realisasi tertinggal dari porsi waktu berjalan sebanyak ... poin persen
    ambang: { tertinggalWaspada: 15, tertinggalKritis: 30 },
    pendapatan: [
      { uraian: 'Pendapatan Asli Desa', anggaran: 85000000, realisasi: 61000000 },
      { uraian: 'Dana Desa (DD)', anggaran: 1150000000, realisasi: 920000000 },
      { uraian: 'Bagi Hasil Pajak & Retribusi', anggaran: 42000000, realisasi: 30000000 },
      { uraian: 'Alokasi Dana Desa (ADD)', anggaran: 640000000, realisasi: 480000000 },
      { uraian: 'Bantuan Keuangan Kab./Provinsi', anggaran: 250000000, realisasi: 100000000 },
    ],
    // tanpaTarget = dana cadangan yang wajar belum terpakai (tidak dinilai tertinggal)
    belanja: [
      { uraian: 'Penyelenggaraan Pemerintahan Desa', anggaran: 780000000, realisasi: 690000000 },
      { uraian: 'Pelaksanaan Pembangunan Desa', anggaran: 920000000, realisasi: 520000000 },
      { uraian: 'Pembinaan Kemasyarakatan Desa', anggaran: 140000000, realisasi: 98000000 },
      { uraian: 'Pemberdayaan Masyarakat Desa', anggaran: 255000000, realisasi: 120000000 },
      { uraian: 'Penanggulangan Bencana, Darurat & Mendesak', anggaran: 72000000, realisasi: 0, tanpaTarget: true },
    ],
  };

  /* ---------- bantuan sosial contoh, diturunkan dari kepala keluarga pada data warga ---------- */
  function buatBansos(wg) {
    const program = [
      { id: 'blt', nama: 'BLT Dana Desa', sumber: 'Dana Desa', kuota: 120, nilai: 300000, periode: 'per bulan' },
      { id: 'pkh', nama: 'PKH', sumber: 'Kemensos', kuota: 90, nilai: 750000, periode: 'per tahap' },
      { id: 'bpnt', nama: 'Sembako (BPNT)', sumber: 'Kemensos', kuota: 140, nilai: 200000, periode: 'per bulan' },
    ];
    const kk = wg.filter((r) => r.hubungan === 'KEPALA KELUARGA' && r.noKK);
    const acak = [...kk].sort(() => rnd() - 0.5);
    const penerima = [];
    const isi = (p, n, mulai) => acak.slice(mulai, mulai + n).forEach((r) => penerima.push({ program: p.id, nik: r.nik, noKK: r.noKK, nama: r.nama, status: rnd() < 0.92 ? 'tersalur' : rnd() < 0.5 ? 'belum' : 'ditunda' }));
    isi(program[0], 112, 0); isi(program[1], 84, 20); isi(program[2], 138, 40);
    // masalah data yang sengaja disisipkan: NIK tak ada di data penduduk, dan penerima ganda
    for (let i = 0; i < 3; i++) penerima.push({ program: 'blt', nik: '99999900000' + String(90000 + i), noKK: '', nama: 'Penerima ' + (i + 1), status: 'tersalur' });
    penerima.push({ ...penerima[2] }, { ...penerima[3] });
    return { diperbarui: new Date(today.getTime() - 5 * 86400000).toISOString(), tahun: today.getFullYear(), program, penerima };
  }
  const bansos = buatBansos(warga);

  window.DASHBOARD_DATA = {
    meta: {
      desa: 'Desa Contoh',
      kecamatan: 'Kecamatan Contoh',
      kabupaten: 'Kabupaten Contoh',
      diperbarui: new Date().toISOString(),
      dataContoh: true,
    },
    tanggal,

    // Peta desa SKEMATIK (bukan peta sungguhan): koordinat 0–160 (x) × 0–105 (y) hanya untuk gambar.
    // Pada penerapan nyata, ganti dengan koordinat lintang/bujur dan peta dasar asli (mis. Leaflet + OpenStreetMap).
    // `ref` menghubungkan titik ke data: nama kiosk, nama aset (aset.perluPerhatian), atau 'server' untuk Balai Desa.
    peta: {
      lebar: 160, tinggi: 105,
      // Peta nyata (OpenStreetMap). KOORDINAT DI BAWAH ADALAH CONTOH, bukan lokasi desa Anda: ganti `batas` (sudut barat daya & timur laut
      // area desa, [lintang, bujur]) dan, bila ada, `dusunGeojson` (batas dusun nyata, FeatureCollection dengan properties.nama).
      // Titik tanpa `lat`/`lng` ditempatkan dari koordinat skematik x,y di dalam `batas`; isi `lat`/`lng` untuk posisi sebenarnya.
      geo: {
        contoh: true,
        batas: [[-7.3695, 109.8855], [-7.3505, 109.9145]],
        minZoom: 13, maxZoom: 18,
        tiles: { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19 },
        dusunGeojson: null,
      },
      dusun: [
        { nama: 'Dusun Krajan', poligon: [[8, 22], [62, 13], [74, 42], [66, 74], [20, 78], [6, 50]], label: [36, 47] },
        { nama: 'Dusun Sumber', poligon: [[62, 13], [112, 8], [120, 38], [100, 55], [74, 42]], label: [94, 30] },
        { nama: 'Dusun Karanganyar', poligon: [[112, 8], [154, 17], [152, 58], [124, 63], [120, 38]], label: [136, 38] },
        { nama: 'Dusun Tegalan', poligon: [[66, 74], [74, 42], [100, 55], [124, 63], [118, 94], [72, 97]], label: [90, 74] },
      ],
      jalan: [
        'M0 58 C30 54 60 61 90 49 S140 43 160 47',
        'M70 4 C73 32 68 62 75 101',
        'M100 55 C108 70 112 80 118 100',
      ],
      sungai: 'M0 92 C30 84 50 100 80 88 S130 100 160 84',
      titik: [
        { id: 'balai', jenis: 'balai', nama: 'Balai Desa', ref: 'server', x: 72, y: 50 },
        { id: 'k1', jenis: 'kiosk', nama: 'Kiosk Balai Desa', ref: 'Kiosk Balai Desa', x: 62, y: 56 },
        { id: 'k2', jenis: 'kiosk', nama: 'Kiosk Kantor Dusun 1', ref: 'Kiosk Kantor Dusun 1', x: 32, y: 40 },
        { id: 'k3', jenis: 'kiosk', nama: 'Kiosk Kantor Dusun 2', ref: 'Kiosk Kantor Dusun 2', x: 96, y: 24 },
        { id: 'k4', jenis: 'kiosk', nama: 'Kiosk Pasar Desa', ref: 'Kiosk Pasar Desa', x: 108, y: 70 },
        { id: 'k5', jenis: 'kiosk', nama: 'Kiosk Pustu', ref: 'Kiosk Pustu', x: 134, y: 28 },
        { id: 'a1', jenis: 'aset', nama: 'Atap Balai Dusun 2', ref: 'Atap Balai Dusun 2', x: 84, y: 18 },
        { id: 'a2', jenis: 'aset', nama: 'Pos ronda RW 03', ref: 'Pos ronda RW 03', x: 22, y: 62 },
        { id: 'a3', jenis: 'aset', nama: 'Mobil operasional desa', ref: 'Mobil operasional desa', x: 82, y: 56 },
      ],
    },

    // 1. Aplikasi Mobile Warga
    mobile: {
      penggunaAktifHarian: seri((i) => Math.round((700 + i * 1.8) * (hariKerja[i] === 1 ? 1 : 0.82) * (1 + noise(0.04)))),
      pengajuanHarian: pengajuan,
      selesaiHarian: selesai,
      rating: 4.6,
      jumlahUlasan: 318,
      wargaTerdaftar: warga.filter((r) => r.aplikasi).length, // dari data warga contoh; pada data nyata isi dari aplikasi
      pengaduanTerbuka: 12,
      pengaduanLebih7Hari: 3,
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

    // 8. Keuangan desa (APBDes) dan 9. Bantuan sosial: bentuk data di keuangan.js dan bansos.js. Data di bawah SINTETIS.
    keuangan,
    bansos,

    // 7. Data sekolah (SD/SMP/SMK): bentuk data ada di sekolah.js. Data di bawah SINTETIS; ganti lewat impor CSV atau DASHBOARD_CONFIG.apiSekolah.
    sekolah: dataSekolah,

    // 4. Data kependudukan (SIAK): satu baris per warga (bentuk data: lihat warga.js). Data di bawah SINTETIS.
    // Ganti dengan hasil impor CSV SIAK di halaman, atau isi lewat API (DASHBOARD_CONFIG.apiPenduduk di config.js).
    warga: { records: warga },

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

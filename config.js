(window.__ver = window.__ver || {})['config.js'] = '2026-10-28.2';
/*
 * Konfigurasi sumber data.
 * apiPenduduk: alamat endpoint JSON yang mengembalikan daftar warga (array, atau { records: [...] })
 * dengan bentuk data seperti di warga.js. Biarkan kosong untuk memakai data contoh di data.js.
 * Endpoint ini sebaiknya buatan Anda sendiri (server-side) yang mengambil dari SIAK dan memeriksa
 * hak akses; jangan menaruh token/kredensial SIAK di file ini.
 */
/*
 * apiSekolah: alamat endpoint JSON data sekolah (array siswa, atau { siswa: [...], diperbarui }), bentuk data di sekolah.js.
 * apiKeuangan / apiBansos: endpoint JSON data keuangan desa (bentuk di keuangan.js) dan bantuan sosial (bansos.js).
 * pengaturan: pengaturan wilayah peta; diisi otomatis bila Anda mengunduh config.js dari dialog Pengaturan di index.html.
 */
window.DASHBOARD_CONFIG = {
  apiPenduduk: '',
  apiSekolah: '',
  apiKeuangan: '',
  apiBansos: '',
  tvGantian: 25, // detik; TV bergantian antara layar operasional dan layar keuangan & bantuan sosial. 0 = tetap di layar pertama
  pengaturan: null,
};

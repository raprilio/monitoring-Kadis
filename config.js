/*
 * Konfigurasi sumber data.
 * apiPenduduk: alamat endpoint JSON yang mengembalikan daftar warga (array, atau { records: [...] })
 * dengan bentuk data seperti di warga.js. Biarkan kosong untuk memakai data contoh di data.js.
 * Endpoint ini sebaiknya buatan Anda sendiri (server-side) yang mengambil dari SIAK dan memeriksa
 * hak akses; jangan menaruh token/kredensial SIAK di file ini.
 */
window.DASHBOARD_CONFIG = {
  apiPenduduk: '',
};

import type { Strings } from '../i18n';

/** Loaded only on pages in this language (ADR-041). */
const id: Strings = {
  langName: 'Bahasa Indonesia',
  language: 'Bahasa',
  privacyChip: 'Tidak ada yang keluar dari tab ini',
  worksOffline: 'Bisa dipakai offline',

  heroChip: 'Gambar · font · kode · seluruh situs',
  taskChip: 'Gratis · pribadi · bisa offline',
  heroHeading: ['Buat file Anda', 'lebih ringan.'],
  heroLede:
    'Kecilkan gambar, font, dan kode Anda, lalu dapatkan kode untuk memakainya. File dibaca di tab ini dan tidak pernah dikirim ke mana pun — tidak ada server untuk menerimanya.',
  srOptimize: 'Pare — optimalkan file Anda',
  backToStart: 'Pare — kembali ke awal',

  whatPareDoes: 'Apa yang dilakukan Pare',
  features: [
    ['Gambar', 'AVIF, WebP, dan file asli yang dioptimalkan di setiap lebar yang Anda pilih — plus tag <picture> untuk ditempel.'],
    ['Font', 'Dipecah per aksara agar halaman hanya memuat yang diperlukan, atau dipangkas ke karakter yang Anda pakai. WOFF2 dan @font-face disertakan.'],
    ['Kode', 'CSS, JavaScript, HTML, dan SVG diminifikasi. Ditulis ulang, tidak pernah dihapus — yang tadinya jalan tetap jalan.'],
    ['Seluruh situs', 'Taruh sebuah folder: setiap file mengecil di tempatnya, dan setiap halaman dicek sebelum dan sesudah sebelum Anda bisa mengunduh.'],
  ],
  steps: [
    ['Taruh', 'Sebuah folder, beberapa file, atau tangkapan layar yang ditempel.'],
    ['Atur', 'Setiap pilihan berupa sakelar, dan efeknya terlihat sebelum dijalankan.'],
    ['Ambil', 'Sebuah zip, sebuah folder, dan kode untuk ditempel.'],
  ],

  dropHere: 'Taruh folder atau file di sini',
  dropMore: 'Taruh, tempel, atau pilih file lain untuk mulai lagi',
  reading: 'Membaca file…',
  dropOverlay: 'Lepaskan untuk menambahkan file ini',
  dropOverlaySub: 'File tetap di tab ini.',
  dropHint: 'Atau sebuah .zip, atau tempel gambar. Tidak ada yang diunggah — semuanya berjalan di tab browser ini.',
  chooseFolder: 'Pilih folder',
  chooseFiles: 'Pilih file',
  trySample: 'Tidak ada file? Coba dengan foto contoh',
  sampleFailed: 'Contoh tidak bisa dimuat. Coba lagi saat sudah online.',
  nothingReadable: 'Tidak ada yang bisa dibaca di situ.',

  optimizeFiles: (n) => `Optimalkan ${n} file`,
  optimizeSite: 'Optimalkan situs',
  working: 'Sedang bekerja…',
  startOver: 'Mulai lagi',
  dropped: (n, workers) => `${n} ditambahkan · ${workers} proses`,
  kindCount: (n, kind) => `${n} ${kind === 'image' ? 'gambar' : kind === 'font' ? 'font' : kind === 'code' ? 'kode' : 'lainnya'}`,
  checkingPages: 'Memeriksa halaman',
  optimizing: 'Mengoptimalkan',
  doneOf: (done, total) => `${done} dari ${total} selesai`,
  filesFinished: 'File selesai',
  modeSite: (parts) => `Optimalkan seluruh situs (${parts})`,
  siteParts: (pages, templates) =>
    [pages > 0 ? `${pages} halaman` : '', templates > 0 ? `${templates} template` : ''].filter(Boolean).join(', '),
  modeSiteHint: 'Setiap file mengecil di tempatnya, alamat tetap benar, dan setiap halaman dicek sebelum Anda bisa mengunduh.',
  modeSiteHintTemplates:
    'Setiap file mengecil dengan namanya sendiri. Template tidak pernah disentuh, jadi situs WordPress atau PHP tetap berjalan.',
  modeFiles: 'Cukup beri saya file yang dioptimalkan dan kodenya',
  modeFilesHint: 'AVIF, WebP, font, dan kode yang diminifikasi, dengan HTML untuk ditempel di mana saja.',
  whatToDo: 'Apa yang dilakukan',

  downloadZip: 'Unduh zip',
  saveToFolder: 'Simpan ke folder…',
  copySnippet: 'Salin kode',
  copyAllSnippets: (n) => `Salin semua ${n} cuplikan`,
  savingsReport: 'Laporan penghematan',
  zipNote: 'Termasuk snippets.html berisi setiap tag yang dibuat. File asli Anda tidak diubah.',
  englishNote: 'Catatan untuk tiap file masih dalam bahasa Inggris untuk saat ini.',

  noUpload: 'Tanpa unggahan, tanpa akun, tanpa server.',
  offlineNote: ' Apa pun yang pernah Anda pakai di browser ini tetap berjalan tanpa internet.',
  tools: 'Alat',
  everything: 'Semua yang bisa dilakukan Pare',
  bugReport: 'Salin detail untuk laporan masalah',

  colFile: 'File',
  colBefore: 'Sebelum',
  colAfter: 'Sesudah',
  colChange: 'Perubahan',
  smaller: (n) => `${n}% lebih kecil`,
  noChange: 'tidak berubah',
  waiting: 'menunggu',
  save: 'Simpan',
  share: 'Bagikan',
  saveFile: (name) => `Simpan ${name}`,
  shareFile: (name) => `Bagikan ${name}`,
  locationRemoved: 'Lokasi dihapus',
  locationTitle: 'Foto ini mencatat tempat foto diambil. File buatan Pare tidak.',

  savingsLabel: 'Penghematan',
  visitorDownloads: 'Yang diunduh pengunjung',
  savingsExplain: (zip) =>
    `Untuk gambar, format ukuran penuh terkecil yang dibaca browsernya; untuk font yang dipecah, hanya file pertama; untuk kode, salinan terkompresi terkecil. Zip berisi ${zip} untuk semua varian — tidak ada yang mengunduh semuanya.`,
  locationsRemoved: (n) =>
    n === 1
      ? 'Satu foto mencatat tempat foto itu diambil. Lokasi itu tidak ada di file yang Anda unduh.'
      : `${n} foto mencatat tempat foto diambil. Lokasi itu tidak ada di file yang Anda unduh.`,
  skippedNote: (n) => `${n} file dibiarkan tanpa perubahan. Alasannya ada di barisnya.`,

  outputResponsive: 'Beberapa ukuran',
  outputSingle: 'Satu ukuran',
  outputTarget: 'Di bawah ukuran file',
  outputIcons: 'Ikon aplikasi',
  hintResponsive: 'Beberapa lebar, dan HTML yang membuat setiap layar mengunduh yang dibutuhkannya saja.',
  hintSingle: 'Satu file per format pada ukuran yang Anda tentukan. Untuk thumbnail, avatar, atau gambar yang Anda tempatkan sendiri.',
  hintTarget: 'Satu file per format, masing-masing seukuran itu atau lebih kecil — untuk formulir unggah, email, atau chat.',
  hintIcons:
    'favicon.ico, ikon sentuh Apple, ikon untuk situs yang dipasang, ikon maskable untuk Android, serta manifest dan tag yang mencantumkannya — dari satu gambar yang hampir persegi, 512px atau lebih.',
  everyFileUnder: 'Setiap file sebesar ini atau lebih kecil',
  sizeLimits: 'Batas ukuran umum',
  anySize: 'Atau ukuran berapa pun, dalam KB',
  targetExplain:
    'Pare menurunkan kualitas dulu dan baru mengecilkan gambar bila perlu, lalu memberi tahu apa yang diubah. Foto tanpa transparansi menjadi JPEG, format yang diminta kebanyakan formulir unggah.',
  formPresets: "Untuk formulir",
  formPhoto: "Foto formulir",
  signature: "Tanda tangan",
  passport: "Foto paspor",
  avatar: "Foto profil",
  presetsHint: "Setiap formulir berbeda: periksa ukuran yang diminta formulir Anda.",
  exactSize: "Ukuran persis, dalam piksel (opsional)",
  width: "Lebar",
  height: "Tinggi",
  exactSizeHint: "Jika keduanya diisi, bagian tengah gambar dipotong ke bentuk itu. Lalu Pare hanya menurunkan kualitas — ukurannya tetap persis — dan memberi tahu bila batasnya tidak tercapai.",
};

export default id;

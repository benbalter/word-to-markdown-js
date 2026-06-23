import type { UIStrings } from './types';

// Indonesian (Bahasa Indonesia).
// Machine-translated first pass — flagged for native review before launch.
// "open source" and "Markdown" are kept untranslated (standard usage in
// Indonesian developer writing). Google Docs menu labels follow the localized
// Indonesian UI ("Unduh" = Download).
export const id: UIStrings = {
  eyebrow: 'Gratis · Open source · 100% di peramban',
  tagline:
    'Ubah file Word (.docx) menjadi Markdown yang rapi — sepenuhnya di peramban Anda. File Anda tidak pernah diunggah.',

  flowFromAlt: 'Dokumen Word',
  flowToAlt: 'File Markdown',

  dropzoneTitle: 'Letakkan file .docx Anda di sini',
  dropzoneBrowsePrefix: 'atau ',
  dropzoneBrowseLink: 'klik untuk memilih file',
  googleDocHint: 'Punya Google Doc? File → Unduh → Microsoft Word (.docx)',
  convertSectionAria: 'Konversi dokumen',

  convertedLabel: 'Dikonversi',
  copyButton: 'Salin Markdown',
  downloadButton: 'Unduh .md',
  panelMarkdown: 'Markdown',
  panelPreview: 'Pratinjau',

  steps: [
    { t: 'Unggah', d: 'Seret file .docx, atau klik untuk memilih.' },
    {
      t: 'Konversi',
      d: 'Dikonversi di peramban Anda — tanpa server, tanpa menunggu.',
    },
    { t: 'Salin atau simpan', d: 'Salin Markdown, atau unduh file .md.' },
  ],

  faqHeading: 'Pertanyaan yang sering diajukan',
  faqs: [
    {
      q: 'Bagaimana cara mengonversi dokumen Word ke Markdown?',
      a: 'Seret file .docx ke halaman (atau klik untuk memilih). Word to Markdown mengonversinya di peramban Anda dan langsung menampilkan Markdown — salin atau unduh sebagai file .md.',
    },
    {
      q: 'Apakah Word to Markdown gratis?',
      a: 'Ya. Sepenuhnya gratis dan open source — tanpa pendaftaran, tanpa batas ukuran file, dan tanpa iklan.',
    },
    {
      q: 'Apakah dokumen saya diunggah ke server?',
      a: 'Tidak. Konversi terjadi sepenuhnya di peramban Anda menggunakan JavaScript. File Anda tidak pernah meninggalkan perangkat dan tidak pernah diunggah, disimpan, atau dicatat.',
    },
    {
      q: 'Bagaimana cara mengonversi Google Doc ke Markdown?',
      a: 'Di Google Docs, pilih File → Unduh → Microsoft Word (.docx), lalu letakkan file .docx tersebut ke Word to Markdown.',
    },
    {
      q: 'Format apa saja yang dipertahankan?',
      a: 'Judul, teks tebal dan miring, daftar berurutan dan bertingkat, tabel, tautan, dan kode dikonversi menjadi Markdown bergaya GitHub yang rapi.',
    },
  ],

  footer: {
    feedback: 'Masukan',
    source: 'Kode sumber',
    donate: 'Donasi',
    terms: 'Ketentuan',
    privacy: 'Privasi',
  },
  footerTagline: 'Dikonversi di peramban Anda · tidak ada yang diunggah',
  homeAria: 'Word to Markdown — beranda',

  metaTitle: 'Word to Markdown — Konverter .docx ke Markdown Gratis',
  metaDescription:
    'Ubah Word (.docx) dan Google Docs menjadi Markdown bergaya GitHub yang rapi — gratis, open source, dan sepenuhnya di peramban Anda.',
  schemaDescription:
    'Alat gratis dan open source yang mengonversi Word (.docx) dan Google Docs menjadi Markdown bergaya GitHub yang rapi, sepenuhnya di peramban Anda.',
  schemaFeatureList: [
    'Konversi Word (.docx) ke Markdown',
    'Konversi Google Docs ke Markdown',
    'Keluaran Markdown bergaya GitHub',
    '100% di sisi klien — tidak ada yang diunggah',
  ],

  errorGeneric:
    'Terjadi kesalahan tak terduga saat mengonversi dokumen. Silakan coba lagi.',
  dismiss: 'Tutup',
};

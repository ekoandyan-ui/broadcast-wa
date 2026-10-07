# WA Broadcast (lokal)

1. Pasang Node.js 22.5 atau lebih baru (disarankan LTS terbaru), lalu buka folder ini di VS Code.
2. Terminal VS Code (Ctrl+`):  `npm install`  lalu  `npm start`
3. Buka http://localhost:3000, scan QR dengan WhatsApp di HP.
4. Tambah/impor kontak, tulis pesan, klik "Kirim sekarang".

Sesi login tersimpan di `.wwebjs_auth`, jadi QR hanya perlu di-scan sekali.
Catatan: memakai library tidak resmi (whatsapp-web.js); ada risiko nomor dibatasi. Gunakan hanya untuk penerima yang sudah setuju.

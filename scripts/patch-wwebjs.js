// Tambalan untuk bug whatsapp-web.js 1.34.x: kirim gambar gagal dengan
// "Data passed to getter must include an id property".
// Skrip ini jalan otomatis setelah `npm install` (aman dijalankan berulang kali).
const fs = require('fs');
const path = require('path');
const f = path.join(__dirname, '..', 'node_modules', 'whatsapp-web.js', 'src', 'util', 'Injected', 'Utils.js');
const marker = "// Bot's won't reply if canonicalUrl is set (linking)";
const fix = "// [patch] hapus id internal media yang bentrok dengan id pesan\n        delete message.__x_id;\n\n        ";
try {
  let s = fs.readFileSync(f, 'utf8');
  if (s.includes('delete message.__x_id')) return console.log('[patch] sudah ditambal.');
  if (!s.includes(marker)) return console.log('[patch] pola kode tidak ditemukan; mungkin library sudah diperbarui. Dilewati.');
  fs.writeFileSync(f, s.replace(marker, fix + marker));
  console.log('[patch] whatsapp-web.js berhasil ditambal (kirim gambar).');
} catch (e) { console.log('[patch] dilewati:', e.message); }

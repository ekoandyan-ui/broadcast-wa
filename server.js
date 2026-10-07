const express = require('express');
const { DatabaseSync } = require('node:sqlite'); // bawaan Node 22.5+, tanpa kompilasi
const QR = require('qrcode');
const { Client, LocalAuth } = require('whatsapp-web.js');

const PORT = process.env.PORT || 3000;
const db = new DatabaseSync('data.db');
db.exec(`
CREATE TABLE IF NOT EXISTS contacts(id INTEGER PRIMARY KEY, nama TEXT NOT NULL, nomor TEXT UNIQUE NOT NULL, grup TEXT DEFAULT 'Umum');
CREATE TABLE IF NOT EXISTS logs(id INTEGER PRIMARY KEY, waktu TEXT DEFAULT CURRENT_TIMESTAMP, nama TEXT, nomor TEXT, pesan TEXT, status TEXT, error TEXT);
`);

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(express.static('public'));

// ---- WhatsApp client ----
const state = { status: 'starting', qr: null, job: { running: false, total: 0, done: 0, ok: 0, fail: 0 } };
const wa = new Client({ authStrategy: new LocalAuth(), puppeteer: { args: ['--no-sandbox'] } });
wa.on('qr', async q => { state.status = 'scan'; state.qr = await QR.toDataURL(q); });
wa.on('ready', () => { state.status = 'ready'; state.qr = null; });
wa.on('auth_failure', () => { state.status = 'auth_failure'; });
wa.on('disconnected', () => { state.status = 'disconnected'; });
wa.initialize();

// ---- Helpers ----
const normalize = n => {
  let d = String(n).replace(/\D/g, '');
  if (d.startsWith('0')) d = '62' + d.slice(1);
  else if (d.startsWith('8')) d = '62' + d;
  return d;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rand = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const fill = (t, c) => t.replace(/{{\s*(\w+)\s*}}/g, (_, k) => c[k] ?? '');

// ---- API ----
app.get('/api/status', (_, res) => res.json(state));

app.get('/api/contacts', (_, res) => res.json(db.prepare('SELECT * FROM contacts ORDER BY nama').all()));
app.get('/api/groups', (_, res) => res.json(db.prepare('SELECT grup, COUNT(*) jumlah FROM contacts GROUP BY grup').all()));

app.post('/api/contacts', (req, res) => {
  const { nama, nomor, grup } = req.body;
  const n = normalize(nomor || '');
  if (!nama || n.length < 10) return res.status(400).json({ error: 'Nama wajib diisi dan nomor harus valid.' });
  try {
    db.prepare('INSERT INTO contacts(nama,nomor,grup) VALUES(?,?,?)').run(nama.trim(), n, (grup || 'Umum').trim());
    res.json({ ok: true });
  } catch { res.status(409).json({ error: 'Nomor sudah terdaftar.' }); }
});

// Impor: satu baris per kontak -> nama,nomor,grup (grup opsional). Pemisah koma, titik koma, atau tab.
app.post('/api/contacts/import', (req, res) => {
  const ins = db.prepare('INSERT OR IGNORE INTO contacts(nama,nomor,grup) VALUES(?,?,?)');
  let masuk = 0, lewat = 0;
  db.exec('BEGIN');
  try {
    for (const line of String(req.body.text || '').split(/\r?\n/)) {
      const [nama, nomor, grup] = line.split(/[,;\t]/).map(s => s && s.trim());
      const n = normalize(nomor || '');
      if (!nama || n.length < 10) { if (line.trim()) lewat++; continue; }
      ins.run(nama, n, grup || 'Umum').changes ? masuk++ : lewat++;
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); return res.status(500).json({ error: e.message }); }
  res.json({ masuk, lewat });
});

app.delete('/api/contacts/:id', (req, res) => { db.prepare('DELETE FROM contacts WHERE id=?').run(req.params.id); res.json({ ok: true }); });

app.post('/api/broadcast', (req, res) => {
  if (state.status !== 'ready') return res.status(400).json({ error: 'WhatsApp belum terhubung. Scan QR dulu.' });
  if (state.job.running) return res.status(400).json({ error: 'Masih ada broadcast yang berjalan.' });
  const { pesan, grup, minDelay = 5, maxDelay = 15 } = req.body;
  if (!pesan || !pesan.trim()) return res.status(400).json({ error: 'Pesan tidak boleh kosong.' });
  const list = grup && grup !== '*' ? db.prepare('SELECT * FROM contacts WHERE grup=?').all(grup) : db.prepare('SELECT * FROM contacts').all();
  if (!list.length) return res.status(400).json({ error: 'Tidak ada penerima.' });
  state.job = { running: true, total: list.length, done: 0, ok: 0, fail: 0 };
  res.json({ ok: true, total: list.length });
  (async () => {
    const log = db.prepare('INSERT INTO logs(nama,nomor,pesan,status,error) VALUES(?,?,?,?,?)');
    for (const c of list) {
      if (!state.job.running) break; // dihentikan
      const teks = fill(pesan, c);
      try {
        const id = await wa.getNumberId(c.nomor);
        if (!id) throw new Error('Nomor tidak terdaftar di WhatsApp');
        await wa.sendMessage(id._serialized, teks);
        log.run(c.nama, c.nomor, teks, 'terkirim', null); state.job.ok++;
      } catch (e) { log.run(c.nama, c.nomor, teks, 'gagal', e.message); state.job.fail++; }
      state.job.done++;
      await sleep(rand(minDelay, maxDelay) * 1000);
    }
    state.job.running = false;
  })();
});

app.post('/api/stop', (_, res) => { state.job.running = false; res.json({ ok: true }); });
app.get('/api/logs', (_, res) => res.json(db.prepare('SELECT * FROM logs ORDER BY id DESC LIMIT 300').all()));
app.delete('/api/logs', (_, res) => { db.prepare('DELETE FROM logs').run(); res.json({ ok: true }); });

app.listen(PORT, () => console.log(`Buka http://localhost:${PORT}`));

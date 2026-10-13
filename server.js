require('dotenv').config();
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
const TOKEN_PATH = path.join(DATA_DIR, 'google-token.json');
const TWIBBON_PATH = path.join(DATA_DIR, 'twibbon.png');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
const twibbonUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } });
app.disable('x-powered-by');
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '100kb' }));

function googleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI);
}
function oauthClient() {
  if (!googleConfigured()) throw new Error('Google Drive belum dikonfigurasi. Isi GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, dan GOOGLE_REDIRECT_URI di .env.');
  return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);
}
function readGoogleTokens() {
  try { return JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8')); } catch { return null; }
}
function safePart(value, fallback) {
  const cleaned = String(value || '').normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._ -]/g, '')
    .trim().replace(/[ ._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80);
  return cleaned || fallback;
}
function makeFilename({ nama, kelompok, desa }) {
  return `${safePart(nama, 'Tanpa_Nama')}_${safePart(kelompok, 'Tanpa_Kelompok')}_${safePart(desa, 'Tanpa_Desa')}.jpg`;
}
function getCloudStatus() {
  const ncReady = Boolean(
    process.env.NEXTCLOUD_URL && process.env.NEXTCLOUD_SHARE_TOKEN
  );
  const gReady = googleConfigured();
  const tokens = readGoogleTokens();
  return {
    nextcloud: {
      configured: ncReady,
      target: process.env.NEXTCLOUD_REMOTE_DIR || 'Folder share Nextcloud'
    },
    googleDrive: {
      configured: gReady,
      connected: Boolean(tokens && tokens.refresh_token),
      folderConfigured: Boolean(process.env.GOOGLE_DRIVE_FOLDER_ID)
    }
  };
}
app.get('/api/status', (_req, res) => res.json(getCloudStatus()));

// Twibbon bersama: disimpan pada volume persisten /app/data dan hanya bisa diunggah sekali.
app.get('/api/twibbon/status', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ configured: fs.existsSync(TWIBBON_PATH) });
});
app.get('/api/twibbon', (_req, res) => {
  if (!fs.existsSync(TWIBBON_PATH)) return res.status(404).json({ error: 'Twibbon belum diunggah.' });
  res.set('Cache-Control', 'no-store');
  res.type('png').sendFile(TWIBBON_PATH);
});
app.post('/api/twibbon', twibbonUpload.single('twibbon'), async (req, res) => {
  if (fs.existsSync(TWIBBON_PATH)) return res.status(409).json({ error: 'Twibbon bersama sudah tersedia.' });
  if (!req.file) return res.status(400).json({ error: 'File twibbon tidak ditemukan.' });
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (req.file.mimetype !== 'image/png' || !req.file.buffer.subarray(0, 8).equals(pngSignature)) {
    return res.status(415).json({ error: 'Twibbon harus berupa file PNG yang valid.' });
  }
  let handle;
  try {
    // wx mencegah dua perangkat menimpa file jika mengunggah hampir bersamaan.
    handle = await fs.promises.open(TWIBBON_PATH, 'wx', 0o600);
    await handle.writeFile(req.file.buffer);
    await handle.close();
    handle = null;
    res.status(201).json({ ok: true, configured: true });
  } catch (e) {
    if (handle) await handle.close().catch(() => {});
    if (e.code === 'EEXIST') return res.status(409).json({ error: 'Twibbon bersama sudah tersedia.' });
    console.error('[twibbon]', e.message);
    res.status(500).json({ error: 'Twibbon gagal disimpan di server.' });
  }
});

app.get('/auth/google', (_req, res, next) => {
  try {
    const client = oauthClient();
    const url = client.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: ['https://www.googleapis.com/auth/drive'] });
    res.redirect(url);
  } catch (e) { next(e); }
});
app.get('/auth/google/callback', async (req, res, next) => {
  try {
    if (req.query.error) return res.status(400).send('Otorisasi Google dibatalkan. Silakan kembali ke aplikasi.');
    if (!req.query.code) return res.status(400).send('Kode otorisasi Google tidak ditemukan.');
    const client = oauthClient();
    const { tokens } = await client.getToken(String(req.query.code));
    const previous = readGoogleTokens() || {};
    const combined = { ...previous, ...tokens, refresh_token: tokens.refresh_token || previous.refresh_token };
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(combined, null, 2), { mode: 0o600 });
    res.redirect('/?google=connected');
  } catch (e) { next(e); }
});
app.post('/auth/google/disconnect', (_req, res) => {
  try { if (fs.existsSync(TOKEN_PATH)) fs.unlinkSync(TOKEN_PATH); } catch {}
  res.json({ ok: true });
});

function encodePath(p) {
  return String(p).split('/').filter(Boolean).map(encodeURIComponent).join('/');
}
async function nextcloudUpload(filename, buffer, mime, daerah) {
  const base = String(process.env.NEXTCLOUD_URL || '').replace(/\/+$/, '');
  const token = process.env.NEXTCLOUD_SHARE_TOKEN;
  const password = process.env.NEXTCLOUD_SHARE_PASSWORD || '';

  if (!base || !token) {
    throw new Error('NEXTCLOUD_URL dan NEXTCLOUD_SHARE_TOKEN wajib diisi di .env.');
  }

  const auth = 'Basic ' + Buffer.from(`${token}:${password}`).toString('base64');
  let current = `${base}/public.php/dav/files/${encodeURIComponent(token)}`;
  if (!['Balikpapan', 'Samarinda'].includes(daerah)) {
    throw new Error('Pilih daerah Balikpapan atau Samarinda.');
  }

  const baseDir = String(process.env.NEXTCLOUD_REMOTE_DIR || '')
    .replace(/^\/+|\/+$/g, '');
  const remoteDir = [baseDir, daerah].filter(Boolean).join('/');

  for (const segment of remoteDir.split('/').filter(Boolean)) {
    current += '/' + encodeURIComponent(segment);
    const r = await fetch(current, {
      method: 'MKCOL',
      headers: { Authorization: auth }
    });

    if (![201, 405].includes(r.status)) {
      const detail = await r.text().catch(() => '');
      throw new Error(`Gagal membuka folder Nextcloud (${r.status}). ${detail.slice(0, 180)}`);
    }
  }

  const target = `${current}/${encodeURIComponent(filename)}`;
  const response = await fetch(target, {
    method: 'PUT',
    headers: {
      Authorization: auth,
      'Content-Type': mime
    },
    body: buffer
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Upload Nextcloud gagal (${response.status}). ${detail.slice(0, 180)}`);
  }

  return {
    provider: 'Nextcloud',
    filename,
    location: `/${remoteDir ? remoteDir + '/' : ''}${filename}`
  };
}
async function googleDriveUpload(filename, buffer, mime) {
  if (!googleConfigured()) throw new Error('Google Drive belum dikonfigurasi di .env.');
  const tokens = readGoogleTokens();
  if (!tokens || !tokens.refresh_token) throw new Error('Google Drive belum terhubung. Klik Hubungkan Google Drive terlebih dahulu.');
  const auth = oauthClient();
  auth.setCredentials(tokens);
  auth.on('tokens', newTokens => {
    const old = readGoogleTokens() || {};
    fs.writeFileSync(TOKEN_PATH, JSON.stringify({ ...old, ...newTokens, refresh_token: newTokens.refresh_token || old.refresh_token }, null, 2), { mode: 0o600 });
  });
  const drive = google.drive({ version: 'v3', auth });
  const metadata = { name: filename, mimeType: mime };
  if (process.env.GOOGLE_DRIVE_FOLDER_ID) metadata.parents = [process.env.GOOGLE_DRIVE_FOLDER_ID];
  const result = await drive.files.create({ requestBody: metadata, media: { mimeType: mime, body: require('stream').Readable.from(buffer) }, fields: 'id,name,webViewLink' });
  return { provider: 'Google Drive', filename: result.data.name, fileId: result.data.id, url: result.data.webViewLink || null };
}
app.post('/api/upload', upload.fields([
  { name: 'photo', maxCount: 1 },
  { name: 'rawPhoto', maxCount: 1 }
]), async (req, res) => {
  try {
    console.log('[upload-debug]', {
      fields: Object.keys(req.files || {}),
      photoCount: req.files?.photo?.length || 0,
      rawPhotoCount: req.files?.rawPhoto?.length || 0
    });
    const { nama, kelompok, desa, daerah, provider } = req.body;
    if (![nama, kelompok, desa].every(v => typeof v === 'string' && v.trim())) {
      return res.status(400).json({ error: 'Nama, Kelompok, dan Desa wajib diisi.' });
    }
    if (!['Balikpapan', 'Samarinda'].includes(daerah)) {
      return res.status(400).json({ error: 'Pilih daerah Balikpapan atau Samarinda.' });
    }

    const photo = req.files?.photo?.[0];
    const rawPhoto = req.files?.rawPhoto?.[0];
    if (!photo || !rawPhoto) {
      return res.status(400).json({ error: 'Foto bertwibbon dan foto raw wajib dikirim bersamaan.' });
    }
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(photo.mimetype) || !allowed.includes(rawPhoto.mimetype)) {
      return res.status(415).json({ error: 'Format foto harus JPEG, PNG, atau WebP.' });
    }
    if (!['nextcloud', 'gdrive'].includes(provider)) {
      return res.status(400).json({ error: 'Pilih tujuan upload yang valid.' });
    }

    const filename = makeFilename({ nama, kelompok, desa });
    const rawFilename = filename.replace(/\.jpg$/i, '_raw.jpg');

    // Simpan hasil bertwibbon dan raw ke tujuan cloud yang sama.
    const saveFile = (name, file) => provider === 'nextcloud'
      ? nextcloudUpload(name, file.buffer, file.mimetype, daerah)
      : googleDriveUpload(name, file.buffer, file.mimetype);

    const result = await saveFile(filename, photo);
    const rawResult = await saveFile(rawFilename, rawPhoto);

    res.json({
      ok: true,
      ...result,
      rawFilename: rawResult.filename,
      rawLocation: rawResult.location || null,
      rawUrl: rawResult.url || null
    });
  } catch (e) {
    console.error('[upload]', e.message);
    res.status(500).json({ error: e.message || 'Upload gagal.' });
  }
});

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: err.field === 'twibbon' ? 'Ukuran twibbon maksimal 12 MB.' : 'Ukuran foto maksimal 15 MB.' });
  console.error('[server]', err.message);
  res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
});
app.listen(PORT, '0.0.0.0', () => console.log(`Foto Peserta berjalan pada port ${PORT}`));

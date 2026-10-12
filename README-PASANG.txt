# Foto Peserta — twibbon bersama

File yang diperbarui: `server.js`, `public/app.js`, dan `public/index.html`. `docker-compose.yml` disertakan untuk referensi dan tetap memakai volume persisten `./data:/app/data`.

## Pasang di server
1. Buat backup: `cp server.js server.js.bak && cp public/app.js public/app.js.bak && cp public/index.html public/index.html.bak`
2. Salin file `server.js` hasil paket ke `/var/www/foto-peserta/server.js`.
3. Salin `public/app.js` dan `public/index.html` hasil paket ke `/var/www/foto-peserta/public/`.
4. Pastikan direktori `data` tetap dipetakan ke `/app/data` seperti di `docker-compose.yml`.
5. Jalankan `docker compose up -d --build foto-peserta`.
6. Cek `curl -s http://127.0.0.1:3000/api/twibbon/status`.

Saat belum ada twibbon, perangkat pertama dapat mengunggah file PNG transparan maksimal 12 MB. Setelah tersimpan, semua perangkat memuat twibbon yang sama otomatis. Endpoint sengaja menolak unggahan kedua agar twibbon tidak bisa tertimpa dari perangkat lain. Untuk mengganti twibbon di kemudian hari, admin harus menghapus `data/twibbon.png` secara manual dan restart container.

Catatan: pengaturan penempatan dan transparansi masih berlaku lokal per perangkat; gambar twibbon-nya yang dibagikan bersama.

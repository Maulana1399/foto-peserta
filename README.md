# Foto Peserta

Aplikasi web responsif untuk mengambil foto peserta, menambahkan twibbon PNG transparan, membuat nama file otomatis (`Nama_Kelompok_Desa.jpg`), dan mengunggah foto ke Nextcloud atau Google Drive.

## Fitur

- Kamera laptop/HP menggunakan browser; pemilihan perangkat kamera jika tersedia.
- Tombol shutter dan pergantian kamera (front/back bila browser/perangkat menyediakan).
- Pembalikan tampilan kamera seperti cermin. Efek cermin hanya untuk preview; file foto disimpan sesuai orientasi kamera asli.
- Twibbon PNG/WebP yang dapat diganti dari menu pengaturan, pengaturan cover/contain dan transparansi.
- Pratinjau sebelum upload, nama file otomatis, status koneksi cloud, serta alur peserta berikutnya.
- Kredensial cloud berada di backend, tidak dikirim ke JavaScript frontend.

## Jalankan dengan Docker

```bash
cp .env.example .env
nano .env
mkdir -p data
chmod 700 data
docker compose up -d --build
docker compose logs -f
```

Buka `http://IP-SERVER:3000` untuk pengujian jaringan lokal. Akses kamera dari HP/laptop melalui jaringan atau domain **memerlukan HTTPS**; pengecualian umumnya hanya `localhost`. Untuk penggunaan nyata, pasang reverse proxy HTTPS (misalnya Nginx Proxy Manager, Nginx, atau Caddy) dan arahkan ke port 3000. Jangan membuka port aplikasi ke internet tanpa HTTPS dan pembatasan akses.

## Konfigurasi Nextcloud

1. Di Nextcloud, buka pengaturan akun → Security/Keamanan → buat **app password** khusus aplikasi ini.
2. Isi `.env`:

```dotenv
NEXTCLOUD_URL=https://cloud.domain-anda.com
NEXTCLOUD_USERNAME=nama_pengguna
NEXTCLOUD_APP_PASSWORD=password_aplikasi
NEXTCLOUD_REMOTE_DIR=/Foto-Peserta
```

`NEXTCLOUD_REMOTE_DIR` adalah folder relatif terhadap root file akun. Folder akan dibuat otomatis bila belum ada. Gunakan HTTPS dan jangan gunakan password utama akun.

## Konfigurasi Google Drive (opsional)

1. Buka [Google Cloud Console](https://console.cloud.google.com/), buat/pilih project dan aktifkan **Google Drive API**.
2. Konfigurasikan OAuth consent screen. Untuk penggunaan pribadi, tambahkan akun Google sebagai test user bila aplikasi masih berstatus Testing.
3. Buat OAuth Client ID bertipe **Web application**.
4. Daftarkan Authorized redirect URI yang persis sama dengan `GOOGLE_REDIRECT_URI`, misalnya `https://foto.domain-anda.com/auth/google/callback`.
5. Isi `.env`:

```dotenv
GOOGLE_CLIENT_ID=client-id-dari-google
GOOGLE_CLIENT_SECRET=client-secret-dari-google
GOOGLE_REDIRECT_URI=https://foto.domain-anda.com/auth/google/callback
GOOGLE_DRIVE_FOLDER_ID=
```

Kosongkan `GOOGLE_DRIVE_FOLDER_ID` untuk upload ke My Drive. Jika ingin folder tertentu, isi dengan ID folder dari URL Google Drive. Setelah restart container, pilih Google Drive pada aplikasi lalu klik **Hubungkan Google Drive** dan login akun Google yang dituju.

```bash
docker compose up -d --build
```

Token OAuth disimpan di `./data/google-token.json`. Lindungi folder `data`, file `.env`, serta backup-nya. Untuk memutuskan akun, gunakan tombol Putuskan Google Drive di aplikasi.

## Port dan domain

- Port container: `3000`
- Port host default: `3000`; dapat diganti dengan `HOST_PORT=3080` saat menjalankan Compose.
- Aplikasi tidak memerlukan database.
- Twibbon dipilih dari perangkat dan berlaku di tab/browser tersebut; pilih ulang bila memakai browser/perangkat lain.

## Catatan operasional

- Maksimum file foto: 15 MB; twibbon: 12 MB.
- Nama file dibersihkan dari karakter yang tidak aman dan dibatasi panjangnya. Jika dua peserta memiliki nama/kelompok/desa sama, nama file dapat sama; pertimbangkan menambahkan nomor peserta/timestamp bila perlu menghindari duplikasi.
- Server mengizinkan upload kepada siapa pun yang dapat mengakses endpoint. Sebelum dipakai di internet atau acara ramai, letakkan di belakang VPN/reverse proxy dengan autentikasi.
- Twibbon paling cocok berupa PNG transparan berukuran sama dengan komposisi foto yang diinginkan. Posisi objek foto tetap bergantung pada framing kamera.

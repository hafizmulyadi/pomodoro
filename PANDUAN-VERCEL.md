# Hosting Lofi Focus di Vercel

Paket ini menggunakan Vercel untuk website/API dan satu proyek Supabase untuk database serta upload. Anda mengelola keduanya di akun sendiri. Tidak memerlukan akun Spotify, Client ID Spotify, atau API key YouTube.

## 1. Siapkan Supabase

1. Masuk ke https://supabase.com/dashboard dan buat proyek baru.
2. Tunggu proyek siap, lalu buka **SQL Editor → New query**.
3. Salin seluruh isi file `supabase/setup.sql`, lalu jalankan **Run**.
4. Periksa bahwa tabel `lofi_profiles` dan `lofi_uploads` tersedia.
5. Di Storage, pastikan bucket `lofi-backgrounds` tersedia dan bersifat **Private**. Skrip sudah membuatnya dengan batas 25 MB dan tipe gambar/video yang didukung. Tidak perlu membuat kebijakan akses publik.
6. Dari pengaturan proyek, catat **Project URL** dan **service_role key** (server-side/legacy JWT key). Gunakan service_role, bukan anon/publishable key. Kunci ini hanya dimasukkan di Vercel, tidak di file frontend atau GitHub.

## 2. Masukkan proyek ke GitHub

1. Ekstrak ZIP ini.
2. Buat repositori GitHub milik Anda; boleh privat.
3. Unggah isi folder `lofi-focus`, sehingga `package.json`, `vercel.json`, `api`, `public`, `src`, dan `supabase` berada langsung di root repositori.
4. Jangan unggah `.env`, `.data`, atau `node_modules`.

Jika memakai Git di terminal, jalankan `git init` dalam folder proyek, lalu buat commit dan push ke repositori Anda. `.gitignore` sudah disediakan. Jangan hanya mengunggah folder `dist`, karena API dan source juga diperlukan.

## 3. Import di Vercel

1. Masuk ke https://vercel.com/new.
2. Import repositori GitHub tadi.
3. Gunakan **Framework Preset: Other**.
4. Pastikan **Root Directory** adalah folder yang memuat `package.json` dan `vercel.json`.
5. Gunakan **Node.js 24.x**. Paket sudah menetapkannya melalui `package.json`.
6. Konfigurasi berikut sudah ditulis dalam `vercel.json`:

| Pengaturan | Nilai |
| --- | --- |
| Install Command | `npm ci` |
| Build Command | `npm run build:vercel` |
| Output Directory | `dist/client` |

## 4. Tambahkan environment variables

Sebelum menekan Deploy, tambahkan:

| Nama | Nilai |
| --- | --- |
| `SUPABASE_URL` | Project URL Anda, misalnya `https://xxxxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key dari proyek yang sama |

Aktifkan untuk **Production**. Jika ingin memakai deployment **Preview**, isi juga pada Preview; gunakan proyek Supabase terpisah bila ingin data pengembangan terpisah. Jangan memberi awalan `NEXT_PUBLIC_` atau `VITE_` pada kunci tersebut.

`PORT` dan `PUBLIC_ORIGIN` hanya untuk server Node lokal/VPS. Keduanya tidak diperlukan untuk Function Vercel. Jangan memakai Project URL contoh secara harfiah.

Klik **Deploy**. Jika environment baru diisi setelah deployment pertama, jalankan **Redeploy** agar Function membaca konfigurasi baru.

## 5. Periksa setelah deployment

- Buka domain Vercel yang diterbitkan. Status penyimpanan harus menunjukkan **Tersimpan di server**.
- Tambahkan task, muat ulang halaman, dan pastikan task masih ada.
- Mulai, jeda, dan lanjutkan timer.
- Pilih salah satu background bawaan, lalu coba upload gambar dan video kecil. Muat ulang untuk memastikan background tetap tersedia.
- Di Musik, tempel tautan video/playlist YouTube, klik Muat, lalu Play. Uji favorit dan volume.
- Coba browser privat: profil task dan background upload harus terpisah dari browser utama.

Domain baru memakai cookie profil baru. Data pada situs lama atau server lokal tidak otomatis dipindahkan. Profil tersimpan berdasarkan cookie browser, belum berupa akun login lintas perangkat. Menghapus cookie menghilangkan akses browser itu ke profil lama.

## Jika ada masalah

| Gejala | Yang diperiksa |
| --- | --- |
| Penyimpanan belum siap / timer tidak bisa dimulai | Kedua environment sudah diisi, service_role benar, `setup.sql` sudah dijalankan, kemudian Redeploy |
| API 404 | Root Directory benar, folder `api` ikut diunggah, dan `vercel.json` tidak diganti dengan konfigurasi SPA umum |
| Build tidak menemukan package.json | Import isi folder `lofi-focus`, atau pilih folder itu sebagai Root Directory |
| Upload gagal | Bucket `lofi-backgrounds` sudah dibuat, limit bucket minimal 25 MB, format PNG/JPEG/WebP/GIF/MP4/WebM, koneksi stabil |
| Penyimpanan background penuh | Hapus background melalui aplikasi; batas aplikasi 100 file atau total 500 MB per profil |
| YouTube tidak bisa diputar | Video mungkin melarang embed atau dibatasi; coba video lain atau Buka di YouTube |

Upload video melewati browser langsung ke Supabase; Vercel hanya menerbitkan izin upload dan memverifikasi file. Media diakses melalui URL baca yang berlaku satu jam setelah pemilik profil diizinkan. Link sementara itu adalah akses baca sampai kedaluwarsa.

Jika browser ditutup di tengah upload, entri belum selesai bisa tetap tersimpan. Administrator dapat memeriksa baris `lofi_uploads` dengan `ready=false` dan `created_at` lebih dari satu hari. Hapus objek terkait melalui **Storage API/Dashboard**, lalu baris reservasinya. Jangan menghapus langsung baris `storage.objects` lewat SQL. Batas akun/billing masing-masing penyedia tetap berlaku.

## Pengembangan

Gunakan Node.js 24 dan buka terminal dalam folder proyek:

```sh
npm ci
npm test
npm run dev
```

`npm run dev` menjalankan mode lokal dengan SQLite di `.data/`. Buka http://127.0.0.1:4173/. Mode ini tidak menggunakan Supabase, jadi bisa mengembangkan UI tanpa akun cloud. Untuk mencoba rute Vercel dengan konfigurasi cloud, gunakan Vercel CLI (`vercel dev`) setelah menghubungkan proyek dan menambahkan environment development milik Anda.

| File/folder | Kegunaan |
| --- | --- |
| `public/index.html`, `public/style.css` | Tampilan dan tema |
| `public/app.js`, `public/core.mjs` | Interaksi, timer, task, statistik |
| `public/youtube.js` | Pemutar YouTube dan koleksi |
| `public/upload.mjs` | Upload langsung ke storage |
| `api/router.js` | Function Vercel |
| `src/vercel-handler.mjs`, `src/supabase.mjs` | API Vercel dan koneksi Supabase |
| `src/worker.mjs` | Validasi state/API bersama dan server lokal |
| `supabase/setup.sql` | Schema, fungsi transaksi, dan bucket cloud |
| `drizzle/`, `server.mjs` | Database dan server lokal |
| `test/` | 18 pengujian otomatis |

## Status pengujian paket

Build frontend dan 18 tes otomatis lulus. Skrip SQL juga diuji pada PostgreSQL berbasis PGlite untuk penerapan ulang, revisi data, upload, dan akses anonim. Kredensial cloud pengguna tidak disertakan, sehingga koneksi Supabase serta deployment Vercel nyata harus diverifikasi setelah langkah pemasangan di atas.

Dokumentasi resmi:
- Vercel Node.js Functions: https://vercel.com/docs/functions/runtimes/node-js
- Konfigurasi Vercel: https://vercel.com/docs/project-configuration/vercel-json
- Batas Function: https://vercel.com/docs/functions/limitations
- Supabase Storage: https://supabase.com/docs/guides/storage
- Bucket dan pembatasan file: https://supabase.com/docs/guides/storage/buckets/creating-buckets

## Study Room dan kolaborasi
Paket ini juga menyertakan chat, room, teman, shared goals, progres akun, serta integrasi voice. Setelah setup dasar di atas, ikuti STUDY-ROOM.md untuk migrasi sosial, Supabase Auth/Realtime, dan LiveKit.

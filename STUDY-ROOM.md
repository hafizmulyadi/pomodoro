# Study Room: pemasangan dan pengujian

Paket ini mempertahankan UI Pomodoro dan menambahkan panel Study Room. Desktop menggunakan kolom terpisah; layar 900 px ke bawah menempatkannya setelah fitur utama. Chat, anggota, target, aktivitas, teman, progres, dan akun dibuka lewat tab agar tidak ramai.

## Aktivasi di Vercel
1. Ikuti PANDUAN-VERCEL.md dan jalankan supabase/setup.sql.
2. Jalankan seluruh supabase/social.sql di SQL Editor Supabase. Migrasi dapat dijalankan ulang; tidak menghapus data lama.
3. Tambahkan SUPABASE_ANON_KEY di Environment Variables Vercel, selain SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY. Gunakan anon key proyek yang sama. Anon key memang dapat dibaca browser; service_role hanya boleh berada di server.
4. Di Supabase Authentication, aktifkan Email, atur Site URL ke domain Vercel Anda, dan izinkan URL domain tersebut untuk redirect konfirmasi email. Gunakan SMTP sendiri untuk pengiriman email produksi.
5. Pastikan Realtime aktif. Migrasi menambahkan public.af_updates ke publikasi supabase_realtime dan kebijakan private channel pada realtime.messages. Jangan membuat tabel chat dapat diakses anonim.
6. Redeploy Vercel. Buka Study Room, daftar, konfirmasi email, masuk, lalu pilih username.

## Voice dengan LiveKit Cloud
Tambahkan tiga variabel server berikut, lalu redeploy:
- LIVEKIT_URL=wss://PROJECT.livekit.cloud
- LIVEKIT_API_KEY=...
- LIVEKIT_API_SECRET=...

Voice menggunakan ruang maksimal 8 peserta. Token hanya diterbitkan untuk anggota room. Mic mulai mati dan harus diaktifkan pengguna. Mute host membatasi izin publish; mengizinkan kembali tidak menyalakan mic otomatis. Pergantian tab Fokus/Task/Musik/Statistik tidak memutus voice. Refresh browser memutus koneksi dan pengguna perlu gabung voice kembali. Pilihan output audio bergantung dukungan browser; HTTPS diperlukan untuk mikrofon.

Tanpa konfigurasi LiveKit, chat dan fitur lainnya tetap berjalan; tombol voice menampilkan pesan konfigurasi belum tersedia. Tidak ada kredensial layanan atau akun produksi yang disertakan.

## Data dan perilaku
- Timer/task/background pribadi tetap menggunakan penyimpanan lama. Statistik akun sosial hanya menghitung sesi yang dimulai saat sudah masuk dan terhubung ke server. Sesi lama tidak diimpor sebagai XP.
- Server mengukur waktu mulai/jeda/selesai, menolak penyelesaian terlalu cepat, dan mencegah penghitungan ganda. Skip/reset tidak mendapat XP.
- XP: 1 per menit fokus, 10 per sesi selesai, 20 untuk hari dengan minimal 120 menit. Level naik setiap 500 XP. Angka ini dapat dikembangkan di public/social-stats.mjs.
- Shared goals menit/sesi bertambah dari sesi selesai; task ditandai selesai per anggota.
- Gambar dikompres browser maksimal 1600 px, disimpan sebagai WebP maksimal 2 MB. Maksimal 3 upload/menit dan kuota 100 MB per akun. Gambar disimpan privat di lofi-chat. Pesan/gambar yang dihapus tidak tampil lagi, tetapi berkas disimpan sampai pemilik layanan membersihkannya; kuota tidak otomatis kembali.
- Link tetap dapat diklik dengan aman. Metadata preview tersedia untuk GitHub, MDN, YouTube, Wikipedia Inggris/Indonesia; domain lain tampil sebagai tautan. Server tidak mengikuti redirect dan tidak mengambil URL arbitrer/internal.
- Chat menampilkan 100 pesan terbaru dan aktivitas 30 terbaru. Pesan lama masih ada di database.
- Report disimpan pada af_reports untuk ditinjau pemilik layanan melalui Supabase. Belum ada dashboard admin lintas room.
- Online diperbarui dengan heartbeat dan private presence; fallback pemuatan 30 detik tersedia ketika realtime terputus. Room terakhir dipulihkan ketika masuk kembali.
- Suara ambience dan voice reminder tetap dikelola Pengaturan utama. Fokus tidak mematikan mic/deafen secara otomatis.

## Menjalankan dan memeriksa
Node.js 24.x:
```sh
npm ci
npm run build
npm test
npm run test:social-db
node --env-file=.env server.mjs
```
Salin .env.example ke .env untuk pengembangan. Server lokal menyimpan timer di SQLite; fitur sosial tetap membutuhkan Supabase yang dikonfigurasi. Gunakan PUBLIC_ORIGIN yang sama dengan URL browser.

Uji penerimaan setelah deploy dengan dua akun berbeda: buat room privat, join dengan kode, chat/reply/edit/delete/reaction, upload gambar, undang teman, voice/mute/deafen/kick/ban, selesaikan sesi, dan refresh untuk restore room. Uji ulang di ponsel. Pengujian lokal database dan UI tidak menggantikan pemeriksaan koneksi Supabase Realtime, SMTP, Storage, dan LiveKit pada akun hosting Anda.

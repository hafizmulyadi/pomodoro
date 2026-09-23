# Lofi Focus

**Paket Vercel + Supabase.** Mulai dari [PANDUAN-VERCEL.md](PANDUAN-VERCEL.md). Kode ini sudah disesuaikan dari versi Cloudflare/Sites, sehingga ZIP lama tidak diperlukan.

Web Pomodoro berbahasa Indonesia dengan empat gambar pilihan pengguna, sepuluh preset lofi, timer, voice reminder, task, statistik, achievement, YouTube, dan ambience mixer.

## Menjalankan lokal

Gunakan Node.js 24 atau lebih baru. Jalankan `node server.mjs`, lalu buka `http://127.0.0.1:4173/`. Aplikasi lokal tidak memerlukan instalasi paket. SQLite dan upload disimpan di `.data/`; cadangkan folder ini jika memindahkan server. Untuk mengubah schema: `npm ci`, ubah `db/schema.ts`, kemudian `npm run db:generate`.

`npm test` menjalankan tes timer, sesi, statistik, penyimpanan, batas akses profil, dan upload. `npm run build` menyiapkan aset Vercel di `dist/client`. Function Vercel berada di `api/router.js`.

## Hosting

Vercel menyajikan antarmuka dan API. Supabase Postgres menyimpan profil; Supabase Storage menyimpan background di bucket privat. Jalankan `supabase/setup.sql` di SQL Editor Supabase, lalu isi `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY` di environment Vercel. `vercel.json` sudah mengatur build, routing, dan direktori hasil.

Upload browser menuju URL bertanda tangan langsung ke Supabase. API memeriksa kepemilikan, ukuran, tipe dan signature file sebelum mengaktifkan background. Media yang sudah disahkan disajikan melalui URL baca sementara setelah pemeriksaan cookie profil. Maksimal 25 MB per file, 100 file atau 500 MB per profil. Tidak ada service_role key pada JavaScript browser. Hosting statis saja tidak cukup karena task/statistik/upload membutuhkan API.

Server Node lokal hanya mendengar di 127.0.0.1. Untuk VPS, tempatkan reverse proxy HTTPS seperti Caddy/nginx di depan localhost:4173 dan sesuaikan origin server melalui `PUBLIC_ORIGIN`. Profil disimpan berdasarkan cookie acak HttpOnly, SameSite=Lax; bukan akun lintas perangkat. Menghapus cookie menghilangkan akses ke profil lama. Setiap profil terisolasi di server. Jangan menghapus `.data/` tanpa cadangan.

## Musik YouTube

Buka Musik, tempel tautan video atau playlist publik YouTube, lalu klik Muat video / playlist dan Play. Tidak perlu API key atau login YouTube. Mendukung tautan watch, youtu.be, Shorts, live, playlist, dan timestamp. Koleksi, favorit, riwayat pemutaran aplikasi, serta volume disimpan di profil server. Riwayat ini bukan riwayat akun YouTube. Kontrol next/previous berlaku untuk playlist.

Pemutar memakai YouTube IFrame Player API resmi, dengan video dan kontrol asli tetap terlihat. Ukuran video minimal 200×200. Menutup mini player, masuk Zen, atau meninggalkan tab menjeda video. Tidak menyediakan audio-only/background playback. Video yang privat, dibatasi wilayah/usia, atau melarang embed mungkin tidak dapat diputar; tersedia tautan Buka di YouTube. Autoplay browser dapat diblokir; klik Play pada iframe. Metadata judul/kanal memakai oEmbed resmi; pemutar tetap dapat digunakan ketika metadata gagal.

Referensi: https://developers.google.com/youtube/iframe_api_reference

## Perilaku penting

- Timer berbasis deadline waktu nyata, bukan hitungan interval. Pause/resume mempertahankan sisa waktu. Reset membuang sesi berjalan. Skip tidak menambah statistik.
- Sesi fokus penuh dicatat sekali dan terkait dengan task yang dipilih saat sesi dimulai. Break terakhir mengakhiri siklus. Saat halaman ditutup, notifikasi/voice tidak berjalan; saat dibuka kembali timer merekonsiliasi sesi aktif tanpa menghitung sesi fiktif selama aplikasi tertutup.
- Satu tab per profil mengendalikan timer. Tab lain bersifat non-pengendali; konflik penyimpanan meminta muat ulang untuk melindungi data.
- Voice memakai Web Speech API. Pilihan otomatis mengutamakan voice bahasa Indonesia. Browser tidak menyediakan metadata gender baku, jadi pilihan perempuan/laki-laki memakai nama voice; pilihan nama voice manual memberi hasil paling pasti. Ketersediaan voice mengikuti perangkat.
- Ambience sepuluh kanal disintesis dengan Web Audio. Tidak memakai rekaman alam atau percakapan manusia. Audio memerlukan interaksi pengguna, dan tidak otomatis menyala saat reload.
- Animasi lofi memakai gerak kamera halus pada gambar; video loop mendukung upload MP4/WebM. Upload maksimal 25 MB. Empat gambar pengguna disertakan apa adanya. Preset tambahan menggunakan artwork AI dalam atlas 3×3.
- Data task/statistik/upload disimpan di server, tidak di localStorage. Cookie profil adalah kunci akses profil browser. Riwayat tidak tersinkron lintas perangkat.
- Pintasan: Space mulai/jeda saat tidak mengetik, Z masuk/keluar Zen, Esc keluar Zen. Mode fullscreen memerlukan dukungan browser.

## Validasi

18 tes otomatis lulus, mencakup timer, task, statistik, persistensi, isolasi profil, YouTube, rute Vercel, upload langsung, pembersihan upload gagal, validasi isi file dan penolakan permintaan lintas origin. `supabase/setup.sql` diuji pada PostgreSQL lokal berbasis PGlite, termasuk penerapan ulang, revisi data, reservasi upload dan larangan akses anonim. Belum diuji dengan akun Supabase/Vercel milik pengguna; verifikasi setelah deployment dijelaskan dalam panduan. Ketersediaan embed YouTube dan voice mengikuti browser serta pembatasan pemilik video.

# Hasil pemeriksaan paket

- 21 tes otomatis lulus: timer, penyimpanan, upload, YouTube, endpoint sosial, batas akses, preview URL, XP/streak.
- Pengujian PostgreSQL lokal (PGlite) lulus: migrasi berulang, room privat, kapasitas, kepemilikan pesan, reaksi, moderasi, waktu sesi server, idempotensi, shared goals, pertemanan, blokir, ban, dan pembatasan akses anonim.
- Browser lokal dengan fixture database: masuk akun uji, restore room, kirim pesan dan verifikasi tersimpan, target room, progres akun.
- Layout diperiksa pada desktop sekitar 1265 px, ponsel 390 px, tablet 768 px. Panel mengambil kolom sendiri atau berada di bawah area utama; tidak ada overflow horizontal yang terdeteksi pada ukuran ponsel/tablet tersebut.
- Bundle frontend dibuat dan source API diperiksa. Build lokal memakai esbuild CLI langsung karena proses anak dibatasi lingkungan pengujian; build Vercel memakai npm run build secara normal.

Belum diuji dengan akun layanan produksi: konfirmasi email SMTP, Supabase Realtime antarperangkat, Supabase Storage gambar chat, LiveKit voice antarperangkat, dan deployment Vercel milik pengguna. Ikuti STUDY-ROOM.md dan lakukan uji penerimaan setelah memasang kredensial. Paket tidak menyertakan kredensial atau data akun uji.

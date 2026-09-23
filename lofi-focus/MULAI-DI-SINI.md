# Lofi Focus untuk Vercel

1. Baca PANDUAN-VERCEL.md.
2. Buat proyek Supabase dan jalankan supabase/setup.sql.
3. Unggah kode ini ke repositori GitHub, lalu import ke Vercel.
4. Tambahkan SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY di Vercel.
5. Deploy. Konfigurasi build sudah tersedia dalam vercel.json.

Untuk mencoba di komputer: gunakan Node.js 24, jalankan `node server.mjs`, kemudian buka http://127.0.0.1:4173/. Mode lokal memakai SQLite; data lokal tidak otomatis dipindahkan ke Supabase.

Paket ini tidak memuat password, API key, data pengguna, atau node_modules. Semua background dan kode YouTube disertakan. Ini paket siap dikonfigurasi, belum merupakan deployment di akun Vercel Anda.

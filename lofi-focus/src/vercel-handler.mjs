import worker from './worker.mjs';
import { createSupabase } from './supabase.mjs';
const MAX_SIZE = 25 * 1024 * 1024;
const TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4', 'video/webm'];
const reply = (body, status = 200, headers = {}) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
const fail = (message, status = 400) => reply({ error: message }, status);
export function validMedia(type, bytes) {
  if (bytes.length < 12) return false;
  const s = new TextDecoder('latin1').decode(bytes);
  return { 'image/png': bytes[0] === 137 && s.slice(1,4) === 'PNG', 'image/jpeg': bytes[0] === 255 && bytes[1] === 216, 'image/webp': s.startsWith('RIFF') && s.slice(8,12) === 'WEBP', 'image/gif': s.startsWith('GIF8'), 'video/mp4': s.slice(4,8) === 'ftyp', 'video/webm': bytes[0] === 26 && bytes[1] === 69 && bytes[2] === 223 && bytes[3] === 163 }[type] === true;
}
async function smallJSON(request) {
  if (Number(request.headers.get('Content-Length')) > 2048) return null;
  const text = await request.text();
  if (text.length > 2048) return null;
  try { return JSON.parse(text); } catch { return null; }
}
// Injectable storage lets the serverless routes be tested without cloud credentials.
export function createHandler(getStore = () => createSupabase()) {
  return async function handle(request) {
    try {
      let url = new URL(request.url);
      // Vercel rewrite destinations may expose their route as a query parameter.
      const route = url.searchParams.get('route');
      if (url.pathname === '/api/router' && route) {
        if (!/^[a-zA-Z0-9/-]+$/.test(route)) return fail('Rute tidak valid.', 404);
        url.pathname = '/api/' + route; url.searchParams.delete('route');
        request = new Request(url, request);
      }
      const path = url.pathname;
      if (!['GET', 'HEAD'].includes(request.method) && request.headers.get('Origin') !== url.origin) return fail('Permintaan lintas situs ditolak.', 403);
      if (path === '/api/youtube/info') return worker.fetch(request, {});
      if (!['/api/state','/api/upload/prepare','/api/upload/complete'].includes(path) && !path.startsWith('/api/media/')) return fail('Tidak ditemukan.', 404);
      const store = getStore();
      if (path === '/api/state') return worker.fetch(request, { DB: store.DB });
      const owner = request.headers.get('Cookie')?.match(/(?:^|;\s*)lofi_profile=([a-f0-9]{64})(?:;|$)/)?.[1];
      if (!owner) return fail('Profil tidak ditemukan. Muat ulang halaman.', 401);
      if (path === '/api/upload/prepare' && request.method === 'POST') {
        const body = await smallJSON(request);
        if (!body || !TYPES.includes(body.type) || !Number.isInteger(body.size) || body.size < 12 || body.size > MAX_SIZE) return fail('Pilih gambar atau video yang valid, maksimal 25 MB.');
        const id = crypto.randomUUID();
        if (!(await store.reserve(owner, id, body.type, body.size))) return fail('Penyimpanan background penuh. Hapus background lama terlebih dahulu.', 413);
        try { return reply({ id, uploadURL: await store.uploadURL(owner, id) }); }
        catch (e) { await store.remove(owner, id).catch(() => {}); throw e; }
      }
      if (path === '/api/upload/complete' && request.method === 'POST') {
        const body = await smallJSON(request);
        if (!/^[a-f0-9-]{36}$/.test(body?.id || '')) return fail('ID upload tidak valid.');
        const item = await store.media(owner, body.id);
        if (!item) return fail('Upload tidak ditemukan.', 404);
        if (!item.ready) {
          const file = await store.readPrefix(owner, body.id);
          if (file.size !== item.size || file.type !== item.type || !validMedia(item.type, file.bytes)) {
            await store.remove(owner, body.id);
            return fail('Isi atau ukuran file tidak sesuai jenis yang dipilih.');
          }
          await store.complete(owner, body.id);
        }
        return reply({ id: body.id, url: '/api/media/' + body.id, type: item.type });
      }
      if (path.startsWith('/api/media/')) {
        const id = path.slice(11);
        if (!/^[a-f0-9-]{36}$/.test(id)) return fail('Tidak ditemukan.', 404);
        const item = await store.media(owner, id);
        if (!item) return fail('File tidak ditemukan.', 404);
        if (request.method === 'DELETE') { await store.remove(owner, id); return reply({ ok: true }); }
        if (!['GET','HEAD'].includes(request.method)) return fail('Metode tidak didukung.', 405);
        if (!item.ready) return fail('Upload belum selesai.', 404);
        // Redirect after authorization: video bytes and range requests bypass Function payload limits.
        return new Response(null, { status: 307, headers: { Location: await store.downloadURL(owner, id), 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } });
      }
      return fail('Metode tidak didukung.', 405);
    } catch (error) {
      console.error('Lofi storage request failed:', error.name);
      return fail('Penyimpanan belum siap. Periksa konfigurasi Supabase dan jalankan setup.sql, lalu deploy ulang.', 503);
    }
  };
}

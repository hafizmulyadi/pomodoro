// Server-only adapter. Never import this module from public/.
export function createSupabase(env = process.env, fetcher = fetch) {
  const origin = env.SUPABASE_URL?.replace(/\/$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!origin || !key) throw new Error('Isi SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY di pengaturan Vercel, lalu deploy ulang.');
  if (new URL(origin).protocol !== 'https:') throw new Error('SUPABASE_URL harus menggunakan HTTPS.');
  const bucket = 'lofi-backgrounds';
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  async function call(path, options = {}) {
    const r = await fetcher(origin + path, { ...options, headers: { ...headers, ...options.headers }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) {
      // Do not return service credentials or upstream request details to a browser.
      throw new Error(r.status === 401 || r.status === 403 ? 'Koneksi database ditolak. Periksa service_role key di Vercel.' : 'Penyimpanan belum siap. Pastikan supabase/setup.sql sudah dijalankan.');
    }
    return r;
  }
  async function json(path, method = 'GET', body, extra = {}) {
    const r = await call(path, { method, headers: { 'Content-Type': 'application/json', ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return r.status === 204 ? null : r.json();
  }
  const filter = (owner, id) => `owner_id=eq.${encodeURIComponent(owner)}&id=eq.${encodeURIComponent(id)}`;
  const objectPath = (owner, id) => `${bucket}/${owner}/${id}`;
  function signedURL(relative) {
    if (typeof relative !== 'string' || !relative.startsWith('/object/')) throw new Error('Tautan penyimpanan tidak valid.');
    return origin + '/storage/v1' + relative;
  }
  return {
    DB: {
      prepare(sql) {
        return { bind(...args) { return {
          async first() { return (await json(`/rest/v1/lofi_profiles?id=eq.${encodeURIComponent(args[0])}&select=data,revision`))[0] || null; },
          async run() {
            const revision = await json('/rest/v1/rpc/lofi_save_profile', 'POST', { p_id: args[0], p_data: args[1], p_revision: args[2] });
            return { meta: { changes: revision === null ? 0 : 1 } };
          }
        }; } };
      }
    },
    async reserve(owner, id, type, size) {
      return json('/rest/v1/rpc/lofi_reserve_upload', 'POST', { p_owner: owner, p_id: id, p_type: type, p_size: size });
    },
    async uploadURL(owner, id) {
      const result = await json('/storage/v1/object/upload/sign/' + objectPath(owner, id), 'POST', {});
      return signedURL(result.url);
    },
    async media(owner, id) { return (await json('/rest/v1/lofi_uploads?' + filter(owner, id) + '&select=id,type,size,ready'))[0] || null; },
    async readPrefix(owner, id) {
      const r = await call('/storage/v1/object/authenticated/' + objectPath(owner, id), { headers: { Range: 'bytes=0-15' } });
      const total = r.headers.get('Content-Range')?.match(/\/(\d+)$/)?.[1] ?? r.headers.get('Content-Length');
      const reader = r.body.getReader();
      const prefix = new Uint8Array(16); let filled = 0;
      try { while (filled < 16) { const part = await reader.read(); if (part.done) break; const n = Math.min(16 - filled, part.value.length); prefix.set(part.value.subarray(0, n), filled); filled += n; } }
      finally { await reader.cancel(); }
      return { bytes: prefix.subarray(0, filled), size: Number(total), type: r.headers.get('Content-Type')?.split(';')[0] };
    },
    async complete(owner, id) { await json('/rest/v1/lofi_uploads?' + filter(owner, id), 'PATCH', { ready: true }); },
    async downloadURL(owner, id) {
      const result = await json('/storage/v1/object/sign/' + objectPath(owner, id), 'POST', { expiresIn: 3600 });
      return signedURL(result.signedURL);
    },
    async remove(owner, id) {
      await json('/storage/v1/object/' + bucket, 'DELETE', { prefixes: [`${owner}/${id}`] });
      await json('/rest/v1/lofi_uploads?' + filter(owner, id), 'DELETE');
    }
  };
}

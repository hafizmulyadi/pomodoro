async function result(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Upload gagal. Periksa koneksi dan coba lagi.');
  return data;
}
export async function uploadBackground(file, fetcher = fetch) {
  const prepared = await fetcher('/api/upload/prepare', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: file.type, size: file.size }) });
  // The bundled SQLite local server retains the original upload route.
  if (prepared.status === 404) return result(await fetcher('/api/upload', { method: 'POST', headers: { 'Content-Type': file.type }, body: file }));
  const session = await result(prepared);
  try {
    const uploaded = await fetcher(session.uploadURL, { method: 'PUT', credentials: 'omit', headers: { 'Content-Type': file.type, 'Cache-Control': 'max-age=3600' }, body: file });
    await result(uploaded);
    return await result(await fetcher('/api/upload/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: session.id }) }));
  } catch (error) {
    await fetcher('/api/media/' + session.id, { method: 'DELETE' }).catch(() => {});
    throw error;
  }
}

const response=(obj,status=200,headers={})=>Response.json(obj,{status,headers:{'Cache-Control':'no-store',...headers}});
const bad=(msg,status=400)=>response({error:msg},status);
export async function handle(request,env){
 const url=new URL(request.url);const p=url.pathname;
 if(!p.startsWith('/api/'))return env.ASSETS.fetch(request);
 if(!['GET','HEAD'].includes(request.method)&&request.headers.get('Origin')!==url.origin)return bad('Permintaan lintas situs ditolak.',403);
 if(p==='/api/youtube/info'&&request.method==='GET'){
  const video=url.searchParams.get('video');if(!/^[A-Za-z0-9_-]{11}$/.test(video||''))return bad('ID video tidak valid.');
  try{const r=await fetch('https://www.youtube.com/oembed?format=json&url='+encodeURIComponent('https://www.youtube.com/watch?v='+video),{signal:AbortSignal.timeout(8000)});if(!r.ok)return bad('Informasi video tidak tersedia.',404);const info=await r.json();return response({title:String(info.title||'Video YouTube').slice(0,200),author:String(info.author_name||'YouTube').slice(0,120),thumbnail:'https://i.ytimg.com/vi/'+video+'/hqdefault.jpg'},200,{'Cache-Control':'public, max-age=3600'});}catch{return bad('Informasi video belum tersedia.',502);}
 }
 let id=request.headers.get('Cookie')?.match(/(?:^|;\s*)lofi_profile=([a-f0-9]{64})(?:;|$)/)?.[1];let cookie={};
 if(!id){if(p!=='/api/state'||request.method!=='GET')return bad('Profil tidak ditemukan. Muat ulang halaman.',401);id=Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');cookie={'Set-Cookie':`lofi_profile=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${url.protocol==='https:'?'; Secure':''}`};}
 if(p==='/api/state'){
  if(!env.DB)return bad('Penyimpanan belum tersedia. Coba lagi nanti.',503);
  if(request.method==='GET'){const row=await env.DB.prepare('SELECT data,revision FROM profiles WHERE id = ?').bind(id).first();return response({data:row?JSON.parse(row.data):null,revision:row?.revision??0},200,cookie);}
  if(request.method==='PUT'){
   if(Number(request.headers.get('Content-Length'))>2000000)return bad('Data terlalu besar.',413);
   const raw=await request.text();if(raw.length>2000000)return bad('Data terlalu besar.',413);let body;try{body=JSON.parse(raw);}catch{return bad('Format data salah.');}
   const d=body.data;if(!d||!Array.isArray(d.tasks)||!Array.isArray(d.logs)||d.tasks.length>2000||d.logs.length>20000||!Number.isInteger(body.revision)||!d.settings)return bad('Data tidak valid.');
   for(const [key,min,max] of [['focusMinutes',1,180],['breakMinutes',1,60],['sessionCount',1,12]])if(!Number.isInteger(d.settings[key])||d.settings[key]<min||d.settings[key]>max)return bad('Pengaturan timer tidak valid.');
   if(d.tasks.some(t=>typeof t.title!=='string'||t.title.length>180||typeof t.id!=='string'))return bad('Task tidak valid.');
   const result=await env.DB.prepare('INSERT INTO profiles (id,data,revision) VALUES (?, ?, 1) ON CONFLICT(id) DO UPDATE SET data=excluded.data, revision=profiles.revision+1 WHERE profiles.revision = ?').bind(id,JSON.stringify(d),body.revision).run();
   if(!result.meta.changes)return bad('Data berubah di tab lain. Muat ulang sebelum melanjutkan.',409);
   return response({revision:body.revision+1});
  }return bad('Metode tidak didukung.',405);
 }
 if(p==='/api/upload'&&request.method==='POST'){
  if(!env.UPLOADS)return bad('Penyimpanan upload belum tersedia.',503);
  const max=25*1024*1024;if(Number(request.headers.get('Content-Length'))>max)return bad('Maksimal 25 MB.',413);
  const type=request.headers.get('Content-Type')?.split(';')[0];if(!['image/png','image/jpeg','image/webp','image/gif','video/mp4','video/webm'].includes(type))return bad('Jenis file tidak didukung.');
  const bytes=await request.arrayBuffer();if(bytes.byteLength>max||bytes.byteLength<12)return bad('File kosong atau lebih dari 25 MB.',413);
  const b=new Uint8Array(bytes),str=new TextDecoder('latin1').decode(b.slice(0,16));
  const valid={'image/png':b[0]===137&&str.slice(1,4)==='PNG','image/jpeg':b[0]===255&&b[1]===216,'image/webp':str.startsWith('RIFF')&&str.slice(8,12)==='WEBP','image/gif':str.startsWith('GIF8'),'video/mp4':str.slice(4,8)==='ftyp','video/webm':b[0]===26&&b[1]===69&&b[2]===223&&b[3]===163};if(!valid[type])return bad('Isi file tidak sesuai jenisnya.');
  const key=crypto.randomUUID();await env.UPLOADS.put(`${id}/${key}`,bytes,{httpMetadata:{contentType:type}});return response({id:key,url:`/api/media/${key}`,type});
 }
 if(p.startsWith('/api/media/')){
  const key=p.slice(11);if(!/^[a-f0-9-]{36}$/.test(key))return bad('Tidak ditemukan.',404);const path=`${id}/${key}`;
  if(request.method==='DELETE'){await env.UPLOADS.delete(path);return response({ok:true});}
  if(!['GET','HEAD'].includes(request.method))return bad('Metode tidak didukung.',405);
  const head=await env.UPLOADS.head(path);if(!head)return bad('File tidak ditemukan.',404);
  const headers={'Content-Type':head.httpMetadata?.contentType||'application/octet-stream','Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff','Accept-Ranges':'bytes','Content-Length':String(head.size)};
  if(request.method==='HEAD')return new Response(null,{headers});
  let range;const match=request.headers.get('Range')?.match(/^bytes=(\d+)-(\d*)$/);if(match){const start=Number(match[1]),end=match[2]?Math.min(Number(match[2]),head.size-1):head.size-1;if(start>end||start>=head.size)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${head.size}`}});range={offset:start,length:end-start+1};headers['Content-Length']=String(range.length);headers['Content-Range']=`bytes ${start}-${end}/${head.size}`;}
  const obj=await env.UPLOADS.get(path,range?{range}:undefined);return new Response(obj.body,{status:range?206:200,headers});
 }
 return bad('Tidak ditemukan.',404);
}
export default {async fetch(request,env){try{const r=await handle(request,env);const h=new Headers(r.headers);h.set('X-Content-Type-Options','nosniff');h.set('Referrer-Policy','strict-origin-when-cross-origin');return new Response(r.body,{status:r.status,headers:h});}catch(error){console.error('Request failed',error.message);return bad('Layanan sedang bermasalah. Data belum tersimpan; coba lagi.',503);}}};

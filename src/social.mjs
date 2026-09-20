import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk';
const json=(x,status=200)=>Response.json(x,{status,headers:{'Cache-Control':'no-store'}});
const uuid=x=>/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(x||'');
export const previewHosts=new Set(['github.com','developer.mozilla.org','www.youtube.com','en.wikipedia.org','id.wikipedia.org']);
export function safePreviewURL(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&previewHosts.has(u.hostname)?u:null;}catch{return null;}}
export async function socialHandler(request,env=process.env){
 const url=new URL(request.url),route=url.pathname.split('/').pop();
 const base=env.SUPABASE_URL?.replace(/\/$/,''),key=env.SUPABASE_ANON_KEY,voice=!!(env.LIVEKIT_URL&&env.LIVEKIT_API_KEY&&env.LIVEKIT_API_SECRET);
 if(route==='config'&&request.method==='GET')return json({configured:!!(base&&key&&env.SUPABASE_SERVICE_ROLE_KEY),url:base||'',key:key||'',voice});
 if(!base||!key||!env.SUPABASE_SERVICE_ROLE_KEY)return json({error:'Study Room belum dikonfigurasi oleh pemilik website.'},503);
 if(!['GET','POST'].includes(request.method))return json({error:'Metode tidak diizinkan.'},405);
 if(request.method==='POST'&&request.headers.get('Origin')!==url.origin)return json({error:'Permintaan lintas situs ditolak.'},403);
 const token=request.headers.get('Authorization');if(!/^Bearer [\w.-]+$/.test(token||''))return json({error:'Masuk terlebih dahulu.'},401);
 const call=async(path,body,admin=false,method='POST')=>{
  const r=await fetch(base+path,{method,headers:{apikey:admin?env.SUPABASE_SERVICE_ROLE_KEY:key,Authorization:admin?'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY:token,'Content-Type':'application/json'},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  const x=await r.json().catch(()=>({}));if(!r.ok)throw new Error(x.message||x.error_description||'Koneksi layanan gagal.');return x;
 };
 const rpc=(op,p={})=>call('/rest/v1/rpc/af_action',{op,p});
 const service=()=>new RoomServiceClient(env.LIVEKIT_URL,env.LIVEKIT_API_KEY,env.LIVEKIT_API_SECRET);
 try{
  if(route==='image'&&request.method==='POST'){
   const room=url.searchParams.get('room'),type=request.headers.get('Content-Type');if(!uuid(room)||!['image/jpeg','image/png','image/webp'].includes(type)||Number(request.headers.get('Content-Length'))>2097152)throw Error('Pilih JPG, PNG, atau WebP maksimal 2 MB.');
   const user=await call('/auth/v1/user',undefined,false,'GET');const member=await rpc('voice_access',{room});if(!member?.user_id)throw Error('Gabung room terlebih dahulu.');
   const chunks=[];let size=0;for await(const c of request.body){size+=c.length;if(size>2097152)throw Error('Gambar maksimal 2 MB.');chunks.push(c);}const bytes=Buffer.concat(chunks);
   const valid=bytes.length>=12&&({'image/jpeg':bytes[0]===255&&bytes[1]===216,'image/png':bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'image/webp':bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'}[type]);if(!valid)throw Error('File gambar tidak valid.');
   const id=crypto.randomUUID(),path=`${room}/${user.id}/${id}`;
   const upload=await fetch(`${base}/storage/v1/object/lofi-chat/${path}`,{method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':type},body:bytes});if(!upload.ok)throw Error('Upload gagal. Coba lagi.');
   try{await call('/rest/v1/rpc/af_register_image',{uid:user.id,rid:room,iid:id,object_path:path,mime:type,bytes:size},true);}catch(e){await call('/storage/v1/object/lofi-chat',{prefixes:[path]},true,'DELETE').catch(()=>{});throw e;}return json({id});
  }
  if(route==='image'&&request.method==='GET'){
   const item=await rpc('image_access',{room:url.searchParams.get('room'),image:url.searchParams.get('image')});if(!item?.path)return json({error:'Gambar tidak tersedia.'},404);
   const signed=await call('/storage/v1/object/sign/lofi-chat/'+item.path,{expiresIn:300},true);return json({url:base+'/storage/v1'+signed.signedURL});
  }
  const text=await request.text();if(text.length>16384)throw Error('Permintaan terlalu besar.');const body=JSON.parse(text||'{}');
  if(route==='action'&&request.method==='POST'){
   const p=body.p||{},result=await rpc(body.op,p);
   if(voice&&['kick','ban','voice_mute','voice_allow','leave'].includes(body.op)&&!result.needsProfile){
    const id=body.op==='leave'?(await call('/auth/v1/user',undefined,false,'GET')).id:p.user;
    try{if(['kick','ban','leave'].includes(body.op))await service().removeParticipant('af-'+p.room,id);else await service().updateParticipant('af-'+p.room,id,{permission:{canPublish:body.op==='voice_allow',canSubscribe:true,canPublishData:false,canPublishSources:[TrackSource.MICROPHONE]}});}catch(e){if(!/not.?found/i.test(e.message))return json({...result,warning:'Pengaturan tersimpan, tetapi sinkronisasi voice gagal. Coba lagi.'});}
   }
   return json(result);
  }
  if(route==='voice'&&request.method==='POST'){
   if(!voice)return json({error:'Voice belum diaktifkan oleh pemilik website.'},503);
   const m=await rpc('voice_access',{room:body.room});if(!m?.user_id)throw Error('Gabung room terlebih dahulu.');
   await service().createRoom({name:'af-'+body.room,maxParticipants:8,emptyTimeout:120});
   const t=new AccessToken(env.LIVEKIT_API_KEY,env.LIVEKIT_API_SECRET,{identity:m.user_id,name:m.username,ttl:'2m'});
   t.addGrant({roomJoin:true,room:'af-'+body.room,canPublish:!m.voice_muted,canSubscribe:true,canPublishData:false,canPublishSources:[TrackSource.MICROPHONE]});
   return json({token:await t.toJwt(),url:env.LIVEKIT_URL,muted:m.voice_muted});
  }
  if(route==='preview'&&request.method==='POST'){
   await rpc('voice_access',{room:body.room});const u=safePreviewURL(body.url);if(!u)return json({title:'',description:''});
   const response=await fetch(u,{redirect:'error',signal:AbortSignal.timeout(4000),headers:{'User-Agent':'LofiFocusPreview/1.0'}});if(!response.ok||!response.headers.get('content-type')?.includes('text/html'))return json({});
   let html='',size=0;for await(const c of response.body){size+=c.length;if(size>131072)break;html+=new TextDecoder().decode(c);}
   const title=html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g,'').trim().slice(0,160)||u.hostname;
   const description=html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)/i)?.[1]?.slice(0,240)||'';return json({title,description});
  }
  return json({error:'Tidak ditemukan.'},404);
 }catch(e){const msg=e.message||'';return json({error:/duplicate key/.test(msg)?'Nama ini sudah digunakan.':/invalid input|violates|syntax|column|relation|permission denied/.test(msg)?'Data tidak valid atau akses tidak tersedia.':msg.slice(0,240)||'Layanan belum tersedia.'},400);}
}

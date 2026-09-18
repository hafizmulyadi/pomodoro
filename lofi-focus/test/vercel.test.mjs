import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../src/vercel-handler.mjs';
import { createSupabase } from '../src/supabase.mjs';
import { uploadBackground } from '../public/upload.mjs';
const origin = 'https://lofi.example';
const owner = 'a'.repeat(64), other = 'b'.repeat(64);
const png = new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]);
const request = (path, method = 'GET', body, who = owner, extra = {}) => new Request(origin + path, { method, headers: { Origin: origin, Cookie: 'lofi_profile=' + who, 'Content-Type':'application/json', ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
function fixture() {
  const items = new Map(); let prefix = { bytes: png, type:'image/png', size:16 };
  const store = {
    async reserve(who,id,type,size) { items.set(who+'/'+id,{id,type,size,ready:false}); return true; },
    async uploadURL(who,id) { return 'https://store.supabase.co/storage/v1/object/upload/sign/'+who+'/'+id+'?token=upload-only'; },
    async media(who,id) { return items.get(who+'/'+id); },
    async readPrefix() { return prefix; },
    async complete(who,id) { items.get(who+'/'+id).ready=true; },
    async remove(who,id) { items.delete(who+'/'+id); },
    async downloadURL(who,id) { return 'https://store.supabase.co/storage/v1/object/sign/'+who+'/'+id+'?token=read-only'; }
  };
  return { handle:createHandler(()=>store), items, corrupt(){prefix={...prefix,bytes:new Uint8Array(16)};} };
}
test('Vercel signed upload validates files, authorizes downloads and isolates owners', async()=>{
  const {handle,items}=fixture();
  const prepared=await handle(request('/api/upload/prepare','POST',{type:'image/png',size:16}));
  assert.equal(prepared.status,200);const session=await prepared.json();
  assert.match(session.uploadURL,/token=upload-only/);
  assert.equal((await handle(request('/api/media/'+session.id))).status,404);
  assert.equal((await handle(request('/api/upload/complete','POST',{id:session.id},other))).status,404);
  const completed=await handle(request('/api/upload/complete','POST',{id:session.id}));
  assert.equal(completed.status,200);const media=await completed.json();
  const download=await handle(request(media.url));assert.equal(download.status,307);assert.equal(download.headers.get('Cache-Control'),'private, no-store');
  assert.equal((await handle(request(media.url,'GET',undefined,other))).status,404);
  assert.equal((await handle(request(media.url,'DELETE',undefined,other))).status,404);
  assert.equal((await handle(request(media.url,'DELETE'))).status,200);assert.equal(items.size,0);
});
test('Vercel rejects unsupported uploads, cross-origin writes and corrupt content',async()=>{
  const f=fixture();
  for(const body of [{type:'text/html',size:20},{type:'image/png',size:26214401},{type:'image/png',size:-1}]) assert.equal((await f.handle(request('/api/upload/prepare','POST',body))).status,400);
  assert.equal((await f.handle(request('/api/upload/prepare','POST',{type:'image/png',size:16},owner,{Origin:'https://evil.example'}))).status,403);
  assert.equal((await f.handle(request('/api/upload/prepare','POST',{type:'image/png',size:16},''))).status,401);
  const {id}=await (await f.handle(request('/api/upload/prepare','POST',{type:'image/png',size:16}))).json();f.corrupt();
  assert.equal((await f.handle(request('/api/upload/complete','POST',{id}))).status,400);assert.equal(f.items.size,0);
});
test('Vercel routing and missing cloud configuration fail explicitly',async()=>{
  const f=fixture();
  assert.equal((await f.handle(request('/api/router?route=upload/prepare','POST',{type:'image/png',size:16}))).status,200);
  assert.equal((await f.handle(request('/api/router?route=..%2Fsecret'))).status,404);
  const missing=createHandler(()=>createSupabase({}));
  const r=await missing(request('/api/state'));assert.equal(r.status,503);assert.match((await r.json()).error,/Supabase/);
});
test('Supabase adapter uses server-only credentials, atomic save RPC, and scoped signed URLs',async()=>{
  const calls=[];let conflict=false;
  const storage=createSupabase({SUPABASE_URL:'https://store.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'server-secret'},async(url,opt)=>{
    calls.push({url,opt});
    if(url.includes('lofi_profiles?'))return Response.json([{data:'{}',revision:2}]);
    if(url.includes('lofi_save_profile'))return Response.json(conflict?null:3);
    if(url.includes('/upload/sign/'))return Response.json({url:'/object/upload/sign/lofi-backgrounds/file?token=scoped'});
    if(url.includes('/object/sign/'))return Response.json({signedURL:'/object/sign/lofi-backgrounds/file?token=read'});
    if(url.includes('/authenticated/'))return new Response(png,{status:206,headers:{'Content-Range':'bytes 0-15/16','Content-Type':'image/png'}});
    return new Response(null,{status:204});
  });
  assert.equal((await storage.DB.prepare('SELECT').bind(owner).first()).revision,2);
  assert.equal((await storage.DB.prepare('INSERT').bind(owner,'{}',2).run()).meta.changes,1);
  conflict=true;assert.equal((await storage.DB.prepare('INSERT').bind(owner,'{}',2).run()).meta.changes,0);
  assert.deepEqual(JSON.parse(calls[1].opt.body),{p_id:owner,p_data:'{}',p_revision:2});
  assert.equal(calls[0].opt.headers.apikey,'server-secret');
  assert.equal((await storage.uploadURL(owner,'file')).includes('server-secret'),false);
  assert.match(await storage.downloadURL(owner,'file'),/token=read/);
  assert.deepEqual((await storage.readPrefix(owner,'file')).bytes,png);
});
test('Browser uploads large bytes directly and only registers completed media',async()=>{
  const file=new Blob([png],{type:'image/png'});const calls=[];
  const result=await uploadBackground(file,async(url,opt)=>{
    calls.push({url,opt});
    if(url==='/api/upload/prepare')return Response.json({id:'upload-id',uploadURL:'https://storage.example/upload?token=scoped'});
    if(url.startsWith('https:'))return Response.json({Key:'file'});
    return Response.json({id:'upload-id',url:'/api/media/upload-id',type:'image/png'});
  });
  assert.equal(calls[1].opt.body,file);assert.equal(calls[1].opt.credentials,'omit');assert.equal(calls[1].opt.headers.Authorization,undefined);
  assert.equal(calls[2].url,'/api/upload/complete');assert.equal(result.id,'upload-id');
});
test('Browser cleans incomplete upload on failure and supports the local server',async()=>{
  const file=new Blob([png],{type:'image/png'});const calls=[];
  await assert.rejects(uploadBackground(file,async(url)=>{calls.push(url);if(url==='/api/upload/prepare')return Response.json({id:'failed',uploadURL:'https://store.example/upload'});return Response.json({error:'Connection error'},{status:500});}),/Connection error/);
  assert.equal(calls.at(-1),'/api/media/failed');
  const result=await uploadBackground(file,async(url)=>url==='/api/upload/prepare'?new Response(null,{status:404}):Response.json({id:'local'}));assert.equal(result.id,'local');
});

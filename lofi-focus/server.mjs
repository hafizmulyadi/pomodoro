import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import {DatabaseSync} from 'node:sqlite';import worker from './src/worker.mjs';
fs.mkdirSync('.data/uploads',{recursive:true});const db=new DatabaseSync('.data/lofi.sqlite');db.exec('PRAGMA journal_mode=WAL;');
db.exec('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY)');
for(const file of fs.readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort()){if(!db.prepare('SELECT name FROM _migrations WHERE name=?').get(file)){db.exec(fs.readFileSync(`drizzle/${file}`,'utf8'));db.prepare('INSERT INTO _migrations(name) VALUES (?)').run(file);}}
const DB={
 prepare(sql){return {
  bind(...args){return {
   async first(){return db.prepare(sql).get(...args);},
   async run(){const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}};}
  };}
 };}
};
const UPLOADS={async put(key,bytes,meta){const f=path.join('.data/uploads',key);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,Buffer.from(bytes));fs.writeFileSync(f+'.json',JSON.stringify(meta))},async head(key){const f=path.join('.data/uploads',key);if(!fs.existsSync(f))return null;return {size:fs.statSync(f).size,...JSON.parse(fs.readFileSync(f+'.json','utf8'))}},async get(key,opt){const f=path.join('.data/uploads',key),buf=fs.readFileSync(f);return {body:opt?.range?buf.subarray(opt.range.offset,opt.range.offset+opt.range.length):buf}},async delete(key){for(const suffix of ['', '.json'])fs.rmSync(path.join('.data/uploads',key)+suffix,{force:true})}};
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'};
const ASSETS={async fetch(req){let p=decodeURIComponent(new URL(req.url).pathname);if(p==='/')p='/index.html';const root=path.resolve('public');const full=path.resolve(root,'.'+p);if(!full.startsWith(root+path.sep)||!fs.existsSync(full)||fs.statSync(full).isDirectory())return new Response('Not found',{status:404});return new Response(fs.readFileSync(full),{headers:{'Content-Type':mime[path.extname(full)]||'application/octet-stream','Cache-Control':'no-cache'}})}};
http.createServer(async(req,res)=>{try{const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>27*1024*1024){res.writeHead(413);res.end();return;}chunks.push(chunk);}const origin=process.env.PUBLIC_ORIGIN||`http://127.0.0.1:${process.env.PORT||4173}`;const request=new Request(origin+req.url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});const result=await worker.fetch(request,{DB,UPLOADS,ASSETS});res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));}catch(e){res.writeHead(500);res.end('Server error');console.error(e.message);}}).listen(Number(process.env.PORT)||4173,'127.0.0.1',()=>console.log(`Local: http://127.0.0.1:${process.env.PORT||4173}`));

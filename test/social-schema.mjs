import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';import assert from 'node:assert/strict';
const db=new PGlite();
await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create schema realtime;create table realtime.messages(id bigint,topic text);grant usage on schema auth to authenticated;grant usage on schema realtime to authenticated;grant all on realtime.messages to authenticated;");
const sql=fs.readFileSync(new URL('../supabase/social.sql',import.meta.url),'utf8');
try{await db.exec(sql);await db.exec(sql);console.log('PASS migration repeatability');}catch(e){console.log(e.message,e.position,sql.slice(Number(e.position)-200,Number(e.position)+200));process.exit(1);}
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',c='33333333-3333-4333-8333-333333333333';
await db.query('insert into auth.users values($1),($2),($3)',[a,b,c]);
async function act(user,op,p={}){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role authenticated');return (await db.query('select public.af_action($1,$2) as result',[op,p])).rows[0].result;}
try{
for(const [id,name]of[[a,'host'],[b,'member'],[c,'outsider']])await act(id,'profile',{username:name,timezone:'Asia/Jakarta'});
const r=(await act(a,'create',{name:'Private room',capacity:2,expiry:24})).room;
await assert.rejects(act(b,'join',{room:r}),/Undangan/);const room=await act(a,'room',{room:r});await act(b,'join',{code:room.room.code.toLowerCase()});await assert.rejects(act(c,'join',{code:room.room.code}),/penuh/);
await act(a,'message_send',{room:r,body:'hello @member'});const snap=await act(b,'room',{room:r});assert.equal(snap.messages.length,1);const message=snap.messages[0].id;await assert.rejects(act(b,'message_edit',{room:r,message,body:'changed'}),/Tidak boleh/);await assert.rejects(act(c,'room',{room:r}),/bukan anggota/);
await act(b,'reaction',{room:r,message,emoji:'👍'});assert.equal((await act(a,'room',{room:r})).messages[0].reactions.length,1);
await act(a,'voice_mute',{room:r,user:b});assert.equal((await act(b,'voice_access',{room:r})).voice_muted,true);await assert.rejects(act(b,'kick',{room:r,user:a}),/diizinkan/);
await act(a,'goal_create',{room:r,title:'Study',kind:'sessions',target:2});const id='44444444-4444-4444-8444-444444444444';await act(a,'focus',{room:r,id,duration:60,state:'start'});await assert.rejects(act(a,'focus',{id,state:'finish'}),/belum selesai/);await db.exec('reset role');await db.query("update public.af_focus set started_at=now()-interval '65 seconds' where id=$1",[id]);await act(a,'focus',{id,state:'finish'});await act(a,'focus',{id,state:'finish'});assert.equal((await act(a,'stats')).sessions.length,1);assert.equal((await act(a,'room',{room:r})).goals[0].progress[0].value,1);
await act(a,'friend_request',{user:b});await act(b,'friend_accept',{user:a});assert.equal((await act(a,'home')).friends[0].accepted,true);
await act(a,'ban',{room:r,user:b});await assert.rejects(act(b,'room',{room:r}),/bukan anggota/);await assert.rejects(act(b,'join',{code:room.room.code}),/diblokir/);await act(a,'block',{user:b});assert.equal((await act(a,'home')).friends.length,0);
await db.exec('set role anon');await assert.rejects(db.query("select public.af_action('home','{}')"),/permission denied/);await assert.rejects(db.query('select * from public.af_messages'),/permission denied/);
console.log('PASS private membership, capacity, message ownership, reactions, host moderation, server-timed idempotent focus, shared goals, friends, blocks, ban enforcement and anonymous isolation');
}catch(e){console.error('FAIL',e.message,e.where,e.detail);process.exitCode=1;}finally{await db.close();}


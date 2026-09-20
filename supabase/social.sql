-- Run AFTER setup.sql. Supabase Auth supplies user IDs; anonymous visitors keep the existing timer.
begin;
create table if not exists public.af_profiles(id uuid primary key references auth.users(id) on delete cascade, username text unique not null check(username ~ '^[a-z0-9_]{3,24}$'), share_status boolean not null default true, timezone text not null default 'UTC', preferences jsonb not null default '{}', last_room uuid, seen_at timestamptz not null default now());
create table if not exists public.af_rooms(id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 60), host uuid not null references public.af_profiles(id), public boolean not null default false, code text unique not null default upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)), expires_at timestamptz, capacity integer not null default 8 check(capacity between 2 and 8), locked boolean not null default false, chat_enabled boolean not null default true, created_at timestamptz not null default now());
create table if not exists public.af_members(room_id uuid references public.af_rooms(id) on delete cascade, user_id uuid references public.af_profiles(id) on delete cascade, role text not null default 'member' check(role in ('host','moderator','member')), status text not null default 'online' check(status in ('online','focusing','break','away','offline')), seen_at timestamptz not null default now(), voice_muted boolean not null default false, primary key(room_id,user_id));
create table if not exists public.af_bans(room_id uuid references public.af_rooms(id) on delete cascade,user_id uuid references public.af_profiles(id),primary key(room_id,user_id));
create table if not exists public.af_blocks(user_id uuid references public.af_profiles(id),target uuid references public.af_profiles(id),primary key(user_id,target),check(user_id<>target));
create table if not exists public.af_friends(sender uuid references public.af_profiles(id),recipient uuid references public.af_profiles(id),accepted boolean not null default false,created_at timestamptz not null default now(),primary key(sender,recipient),check(sender<>recipient));
create unique index if not exists af_friend_pair on public.af_friends(least(sender,recipient),greatest(sender,recipient));
create table if not exists public.af_images(id uuid primary key default gen_random_uuid(),room_id uuid references public.af_rooms(id),author uuid references public.af_profiles(id),path text unique not null,type text not null,size integer not null check(size between 12 and 2097152),deleted boolean not null default false,created_at timestamptz not null default now());
create table if not exists public.af_messages(id uuid primary key default gen_random_uuid(),room_id uuid references public.af_rooms(id) on delete cascade,author uuid references public.af_profiles(id),body text not null default '' check(length(body)<=2000),parent uuid references public.af_messages(id),image_id uuid references public.af_images(id),edited_at timestamptz,deleted boolean not null default false,created_at timestamptz not null default now());
create index if not exists af_messages_room on public.af_messages(room_id,created_at desc);
create table if not exists public.af_reactions(message_id uuid references public.af_messages(id) on delete cascade,user_id uuid references public.af_profiles(id),emoji text check(emoji in ('👍','❤️','🎉','🔥','👏')),primary key(message_id,user_id,emoji));
create table if not exists public.af_goals(id uuid primary key default gen_random_uuid(),room_id uuid references public.af_rooms(id) on delete cascade,title text not null check(length(title) between 1 and 100),target integer not null check(target between 1 and 10080),kind text not null check(kind in ('minutes','sessions','task')),author uuid references public.af_profiles(id),created_at timestamptz not null default now());
create table if not exists public.af_progress(goal_id uuid references public.af_goals(id) on delete cascade,user_id uuid references public.af_profiles(id),value integer not null default 0,primary key(goal_id,user_id));
create table if not exists public.af_focus(id uuid primary key,user_id uuid references public.af_profiles(id),room_id uuid references public.af_rooms(id),duration integer not null check(duration between 60 and 10800),elapsed double precision not null default 0,started_at timestamptz not null default now(),state text not null check(state in ('running','paused','completed','cancelled')),completed_at timestamptz);
create unique index if not exists af_focus_active on public.af_focus(user_id) where state in ('running','paused');
create table if not exists public.af_notifications(id uuid primary key default gen_random_uuid(),recipient uuid references public.af_profiles(id) on delete cascade,kind text not null,body text not null,room_id uuid,read boolean not null default false,created_at timestamptz not null default now());
create table if not exists public.af_activity(id bigint generated always as identity primary key,room_id uuid references public.af_rooms(id) on delete cascade,body text not null,created_at timestamptz not null default now());
create table if not exists public.af_reports(id uuid primary key default gen_random_uuid(),reporter uuid references public.af_profiles(id),target uuid references public.af_profiles(id),room_id uuid,reason text not null check(length(reason) between 5 and 500),created_at timestamptz not null default now());
create table if not exists public.af_achievements(user_id uuid references public.af_profiles(id),badge text,created_at timestamptz not null default now(),primary key(user_id,badge));
create table if not exists public.af_rate(user_id uuid,kind text,slot bigint,count integer not null default 1,primary key(user_id,kind));
create table if not exists public.af_updates(id bigint generated always as identity primary key,recipient uuid not null,room_id uuid,created_at timestamptz not null default now());
create index if not exists af_updates_recipient on public.af_updates(recipient,id);

create or replace function public.af_is_member(r uuid,u uuid default auth.uid()) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.af_members where room_id=r and user_id=u); $$;
create or replace function public.af_blocked(a uuid,b uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.af_blocks where (user_id=a and target=b) or (user_id=b and target=a)); $$;
create or replace function public.af_notify(u uuid,k text,b text,r uuid default null) returns void language plpgsql security definer set search_path='' as $$ begin
 if coalesce((select preferences->>k from public.af_profiles where id=u),'true') <> 'false' then insert into public.af_notifications(recipient,kind,body,room_id) values(u,k,b,r); end if;
 insert into public.af_updates(recipient,room_id) values(u,r);
end; $$;
create or replace function public.af_touch(r uuid,b text default null) returns void language plpgsql security definer set search_path='' as $$ begin
 if b is not null then insert into public.af_activity(room_id,body) values(r,b); end if;
 insert into public.af_updates(recipient,room_id) select user_id,r from public.af_members where room_id=r;
 delete from public.af_updates where created_at<now()-interval '1 day';
end; $$;

create or replace function public.af_award_focus(who uuid) returns void language plpgsql security definer set search_path='' as $$
declare minutes_total integer; sessions_total integer; longest integer; together boolean; deep boolean; early boolean; night boolean; zone text; award text; inserted text;
begin
 select timezone into zone from public.af_profiles where id=who;
 select coalesce(sum(duration)/60,0),count(*),coalesce(bool_or(room_id is not null),false),coalesce(bool_or(duration>=3000),false),coalesce(bool_or(extract(hour from completed_at at time zone zone)>=4 and extract(hour from completed_at at time zone zone)<8),false),coalesce(bool_or(extract(hour from completed_at at time zone zone)>=22 or extract(hour from completed_at at time zone zone)<4),false) into minutes_total,sessions_total,together,deep,early,night from public.af_focus where user_id=who and state='completed';
 select coalesce(max(n),0) into longest from (select count(*) n from (select d-row_number() over(order by d)::integer as island from (select distinct (completed_at at time zone zone)::date d from public.af_focus where user_id=who and state='completed') days) islands group by island) runs;
 for award in select name from (values('First Focus',sessions_total>=1),('10 Sessions',sessions_total>=10),('10 Hours',minutes_total>=600),('7 Day Streak',longest>=7),('30 Day Streak',longest>=30),('Together',together),('Deep Focus',deep),('Early Bird',early),('Night Owl',night)) b(name,earned) where earned loop
  inserted:=null;insert into public.af_achievements(user_id,badge) values(who,award) on conflict do nothing returning badge into inserted;
  if inserted is not null then perform public.af_notify(who,case when award like '%Streak' then 'streak' else 'achievement' end,'Achievement: '||award);end if;
 end loop;
end;$$;

create or replace function public.af_action(op text,p jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); r uuid; t uuid; mid uuid; n integer; slot bigint; role_name text; uname text; room public.af_rooms%rowtype; msg public.af_messages%rowtype; focus_row public.af_focus%rowtype; elapsed_seconds double precision; out jsonb; myprofile public.af_profiles%rowtype; text_body text;
begin
 if u is null then raise exception 'Masuk terlebih dahulu.'; end if;
 if op='profile' then
  if coalesce(p->>'username','') !~ '^[a-z0-9_]{3,24}$' then raise exception 'Username: 3–24 huruf kecil, angka, atau underscore.'; end if;
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=coalesce(p->>'timezone','UTC')) then raise exception 'Zona waktu tidak valid.'; end if;
  insert into public.af_profiles(id,username,timezone) values(u,p->>'username',coalesce(p->>'timezone','UTC')) on conflict(id) do update set username=excluded.username,timezone=excluded.timezone;
  return jsonb_build_object('ok',true);
 end if;
 select * into myprofile from public.af_profiles where id=u; if not found then return jsonb_build_object('needsProfile',true); end if; uname:=myprofile.username;
 if op not in ('home','room','stats','leaderboard','voice_access','image_access') then
  slot:=floor(extract(epoch from now())/10); insert into public.af_rate(user_id,kind,slot) values(u,case when op like 'message%' then 'chat' else 'general' end,slot)
  on conflict(user_id,kind) do update set count=case when af_rate.slot=excluded.slot then af_rate.count+1 else 1 end,slot=excluded.slot returning count into n;
  if n>(case when op like 'message%' then 6 else 30 end) then raise exception 'Terlalu cepat. Tunggu beberapa detik.'; end if;
 end if;
 r:=nullif(p->>'room','')::uuid; t:=nullif(p->>'user','')::uuid;
 if r is not null then select * into room from public.af_rooms where id=r; end if;
 if op='home' then
  return jsonb_build_object('profile',to_jsonb(myprofile),'rooms',(select coalesce(jsonb_agg(x),'[]') from (select a.id,a.name,a.public,a.capacity,a.locked,(select count(*) from public.af_members m where m.room_id=a.id and m.seen_at>now()-interval '90 seconds') as online,public.af_is_member(a.id,u) as joined from public.af_rooms a where a.public or public.af_is_member(a.id,u) order by a.created_at desc limit 50)x),
   'friends',(select coalesce(jsonb_agg(x),'[]') from (select z.id,z.username,f.sender,f.recipient,f.accepted,case when z.share_status then (select m.status from public.af_members m where m.user_id=z.id order by m.seen_at desc limit 1) end as status,z.share_status and z.seen_at>now()-interval '90 seconds' as online from public.af_friends f join public.af_profiles z on z.id=case when f.sender=u then f.recipient else f.sender end where (f.sender=u or f.recipient=u) and not public.af_blocked(u,z.id))x),
   'notifications',(select coalesce(jsonb_agg(x),'[]') from (select * from public.af_notifications where recipient=u order by created_at desc limit 40)x));
 elsif op='preferences' then
  update public.af_profiles set share_status=coalesce((p->>'share')::boolean,share_status),preferences=coalesce(p->'preferences',preferences) where id=u;
 elsif op='search' then
  return (select coalesce(jsonb_agg(x),'[]') from (select id,username from public.af_profiles where username ilike '%'||left(p->>'query',24)||'%' and id<>u and not public.af_blocked(u,id) limit 15)x);
 elsif op='friend_request' then
  if t=u or public.af_blocked(u,t) then raise exception 'Permintaan tidak tersedia.'; end if;
  insert into public.af_friends(sender,recipient) values(u,t) on conflict do nothing; perform public.af_notify(t,'friend',uname||' mengirim permintaan teman.');
 elsif op='friend_accept' then
  update public.af_friends set accepted=true where sender=t and recipient=u; perform public.af_notify(t,'friend',uname||' menerima permintaan teman.');
 elsif op in ('friend_reject','friend_remove') then
  delete from public.af_friends where (sender=t and recipient=u) or (sender=u and recipient=t);
 elsif op='block' then
  insert into public.af_blocks values(u,t) on conflict do nothing; delete from public.af_friends where (sender=t and recipient=u) or (sender=u and recipient=t);
 elsif op='report' then
  insert into public.af_reports(reporter,target,room_id,reason) values(u,t,r,left(p->>'reason',500));
 elsif op='notifications_read' then update public.af_notifications set read=true where recipient=u;
 elsif op='create' then
  if (select count(*) from public.af_rooms where host=u)>=5 then raise exception 'Maksimal lima room milik sendiri.'; end if;
  insert into public.af_rooms(name,host,public,capacity,expires_at) values(trim(p->>'name'),u,coalesce((p->>'public')::boolean,false),coalesce((p->>'capacity')::integer,8),case when coalesce((p->>'expiry')::integer,24)=0 then null else now()+make_interval(hours=>least(168,greatest(1,(p->>'expiry')::integer))) end) returning id into r;
  insert into public.af_members(room_id,user_id,role) values(r,u,'host'); update public.af_profiles set last_room=r where id=u; perform public.af_touch(r,uname||' membuat room.'); return jsonb_build_object('room',r);
 elsif op='join' then
  if p ? 'code' then select * into room from public.af_rooms where code=upper(trim(p->>'code')) for update; else select * into room from public.af_rooms where id=r for update; end if;
  if room.id is null then raise exception 'Room atau kode tidak ditemukan.'; end if; r:=room.id;
  if exists(select 1 from public.af_bans where room_id=r and user_id=u) then raise exception 'Akses room diblokir.'; end if;
  if not public.af_is_member(r,u) then
   if room.locked then raise exception 'Room sedang dikunci.'; end if;
   if not room.public and (upper(trim(coalesce(p->>'code','')))<>room.code or (room.expires_at is not null and room.expires_at<now())) then raise exception 'Undangan tidak berlaku.'; end if;
   if (select count(*) from public.af_members where room_id=r)>=room.capacity then raise exception 'Room penuh.'; end if;
   insert into public.af_members(room_id,user_id) values(r,u); perform public.af_touch(r,uname||' bergabung.');
  end if; update public.af_profiles set last_room=r where id=u; return jsonb_build_object('room',r);
 elsif op in ('stats','leaderboard') then
  if op='stats' then return jsonb_build_object('sessions',(select coalesce(jsonb_agg(x),'[]') from (select id,duration,room_id,completed_at,to_char(completed_at at time zone myprofile.timezone,'YYYY-MM-DD') as day,extract(hour from completed_at at time zone myprofile.timezone) as hour from public.af_focus where user_id=u and state='completed' order by completed_at)x),'active',(select to_jsonb(x) from public.af_focus x where user_id=u and state in ('running','paused') limit 1)); end if;
  if p->>'scope'='room' and not public.af_is_member(r,u) then raise exception 'Gabung room terlebih dahulu.'; end if;
  return (select coalesce(jsonb_agg(x),'[]') from (select z.username,sum(f.duration)/60 as minutes from public.af_focus f join public.af_profiles z on z.id=f.user_id where f.state='completed' and f.completed_at>=date_trunc(case when p->>'period'='month' then 'month' else 'week' end,now()) and not public.af_blocked(u,z.id) and ((p->>'scope'='room' and f.room_id=r) or (p->>'scope'<>'room' and (f.user_id=u or exists(select 1 from public.af_friends fr where fr.accepted and ((fr.sender=u and fr.recipient=f.user_id) or (fr.recipient=u and fr.sender=f.user_id)))))) group by z.username order by minutes desc limit 30)x);
 elsif op='focus' then
  mid:=(p->>'id')::uuid; perform pg_advisory_xact_lock(hashtextextended(u::text,1));
  select * into focus_row from public.af_focus where id=mid and user_id=u for update;
  if p->>'state'='start' and focus_row.id is null then
   if r is not null and not public.af_is_member(r,u) then r:=null; end if;
   update public.af_focus set state='cancelled' where user_id=u and state in ('running','paused');
   insert into public.af_focus(id,user_id,room_id,duration,state) values(mid,u,r,(p->>'duration')::integer,'running');
   if r is not null then perform public.af_touch(r,uname||' mulai fokus.'); end if;
  elsif focus_row.state in ('running','paused') then
   elapsed_seconds:=focus_row.elapsed+case when focus_row.state='running' then extract(epoch from now()-focus_row.started_at) else 0 end;
   if p->>'state'='pause' then update public.af_focus set elapsed=least(elapsed_seconds,duration),state='paused',started_at=now() where id=mid;
   elsif p->>'state'='resume' and focus_row.state='paused' then update public.af_focus set state='running',started_at=now() where id=mid;
   elsif p->>'state'='cancel' then update public.af_focus set state='cancelled' where id=mid;
   elsif p->>'state'='finish' then
    if elapsed_seconds<focus_row.duration-2 then raise exception 'Sesi fokus belum selesai menurut waktu server.'; end if;
    update public.af_focus set elapsed=duration,state='completed',completed_at=now() where id=mid;
    insert into public.af_progress(goal_id,user_id,value) select id,u,case when kind='minutes' then focus_row.duration/60 else 1 end from public.af_goals where room_id=focus_row.room_id and kind<>'task' on conflict(goal_id,user_id) do update set value=af_progress.value+excluded.value;
    perform public.af_notify(u,'focus','Sesi fokus selesai. Waktunya istirahat.',focus_row.room_id);
    if focus_row.room_id is not null then perform public.af_touch(focus_row.room_id,uname||' menyelesaikan sesi fokus.'); end if;
    select count(*) into n from public.af_focus where user_id=u and state='completed';
    perform public.af_award_focus(u);
   end if;
  end if;
 else
  if not public.af_is_member(r,u) then raise exception 'Kamu bukan anggota room ini.'; end if;
  select role into role_name from public.af_members where room_id=r and user_id=u;
  if op='room' then
   return jsonb_build_object('room',to_jsonb(room),'members',(select coalesce(jsonb_agg(x),'[]') from (select m.*,z.username from public.af_members m join public.af_profiles z on z.id=m.user_id where m.room_id=r order by case m.role when 'host' then 0 when 'moderator' then 1 else 2 end,z.username)x),
   'messages',(select coalesce(jsonb_agg(x order by x.created_at),'[]') from (select a.*,z.username,(select coalesce(jsonb_agg(jsonb_build_object('user',b.user_id,'emoji',b.emoji)),'[]') from public.af_reactions b where b.message_id=a.id) as reactions from public.af_messages a join public.af_profiles z on z.id=a.author where a.room_id=r and not public.af_blocked(u,a.author) order by a.created_at desc limit 100)x),
   'goals',(select coalesce(jsonb_agg(to_jsonb(g)||jsonb_build_object('progress',(select coalesce(jsonb_agg(to_jsonb(v)||jsonb_build_object('username',z.username)),'[]') from public.af_progress v join public.af_profiles z on z.id=v.user_id where v.goal_id=g.id))),'[]') from public.af_goals g where g.room_id=r),
   'activity',(select coalesce(jsonb_agg(x),'[]') from (select body,created_at from public.af_activity where room_id=r order by created_at desc limit 30)x));
  elsif op='presence' then
   update public.af_members set status=coalesce(p->>'status','online'),seen_at=now() where room_id=r and user_id=u; update public.af_profiles set seen_at=now() where id=u; return jsonb_build_object('ok',true);
  elsif op='leave' then
   if role_name='host' then
    select user_id into t from public.af_members where room_id=r and user_id<>u order by seen_at desc limit 1;
    if t is not null then update public.af_members set role='host' where room_id=r and user_id=t; update public.af_rooms set host=t where id=r; else update public.af_rooms set public=false,locked=true where id=r; end if;
   end if;
   delete from public.af_members where room_id=r and user_id=u; update public.af_profiles set last_room=null where id=u; perform public.af_touch(r,uname||' keluar dari room.');
  elsif op='invite' then
   if public.af_blocked(u,t) or not exists(select 1 from public.af_friends where accepted and ((sender=u and recipient=t) or (recipient=u and sender=t))) then raise exception 'Pilih teman yang sudah terhubung.'; end if;
   perform public.af_notify(t,'invite',uname||' mengundangmu ke '||room.name||'. Kode: '||room.code,r);
  elsif op='room_settings' then
   if role_name not in ('host','moderator') then raise exception 'Khusus host/moderator.'; end if;
   update public.af_rooms set locked=coalesce((p->>'locked')::boolean,locked),chat_enabled=coalesce((p->>'chat')::boolean,chat_enabled) where id=r;
   if role_name='host' and p ? 'expiry' then update public.af_rooms set code=upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),expires_at=case when (p->>'expiry')::integer=0 then null else now()+make_interval(hours=>least(168,greatest(1,(p->>'expiry')::integer))) end where id=r; end if;
  elsif op in ('kick','ban','moderator','voice_mute','voice_allow') then
   if role_name not in ('host','moderator') or t=u or not exists(select 1 from public.af_members where room_id=r and user_id=t and role<>'host' and (role_name='host' or role='member')) then raise exception 'Tindakan tidak diizinkan.'; end if;
   if op='moderator' then if role_name<>'host' then raise exception 'Khusus host.'; end if; update public.af_members set role=case when coalesce((p->>'enabled')::boolean,true) then 'moderator' else 'member' end where room_id=r and user_id=t;
   elsif op in ('voice_mute','voice_allow') then update public.af_members set voice_muted=(op='voice_mute') where room_id=r and user_id=t;
   else
    if op='ban' then insert into public.af_bans values(r,t) on conflict do nothing; end if;
    delete from public.af_members where room_id=r and user_id=t; insert into public.af_updates(recipient,room_id) values(t,r);
   end if; perform public.af_notify(t,'moderation','Status akses atau voice kamu di room telah diperbarui.',r);
  elsif op='voice_access' then return (select to_jsonb(m)||jsonb_build_object('username',uname) from public.af_members m where room_id=r and user_id=u);
  elsif op='voice_join' then perform public.af_touch(r,uname||' bergabung ke voice.');
  elsif op='image_access' then return (select jsonb_build_object('path',path) from public.af_images where id=(p->>'image')::uuid and room_id=r and not deleted and not public.af_blocked(u,author));
  elsif op='message_send' then
   if not room.chat_enabled then raise exception 'Chat sedang dinonaktifkan host.'; end if;
   text_body:=trim(coalesce(p->>'body','')); if length(text_body)>2000 or (text_body='' and not p ? 'image') then raise exception 'Pesan kosong atau terlalu panjang.'; end if;
   text_body:=regexp_replace(text_body,'\m(bangsat|kontol|memek)\M','***','gi');
   if exists(select 1 from public.af_messages where author=u and room_id=r and body=text_body and created_at>now()-interval '10 seconds') then raise exception 'Pesan yang sama baru dikirim.'; end if;
   if p ? 'parent' and not exists(select 1 from public.af_messages where id=(p->>'parent')::uuid and room_id=r) then raise exception 'Balasan tidak valid.'; end if;
   if p ? 'image' and not exists(select 1 from public.af_images where id=(p->>'image')::uuid and room_id=r and author=u and not deleted) then raise exception 'Gambar tidak valid.'; end if;
   insert into public.af_messages(room_id,author,body,parent,image_id) values(r,u,text_body,nullif(p->>'parent','')::uuid,nullif(p->>'image','')::uuid) returning id into mid;
   for t in select m.user_id from public.af_members m join public.af_profiles z on z.id=m.user_id where m.room_id=r and m.user_id<>u and not public.af_blocked(u,m.user_id) and position('@'||z.username in text_body)>0 loop perform public.af_notify(t,'mention',uname||' menyebutmu di '||room.name,r); end loop;
   if p ? 'parent' then select author into t from public.af_messages where id=(p->>'parent')::uuid; if t<>u and not public.af_blocked(u,t) then perform public.af_notify(t,'reply',uname||' membalas pesanmu.',r); end if; end if;
  elsif op in ('message_edit','message_delete','reaction') then
   select * into msg from public.af_messages where id=(p->>'message')::uuid and room_id=r for update; if msg.id is null then raise exception 'Pesan tidak ditemukan.'; end if;
   if op='reaction' then
    if msg.deleted or public.af_blocked(u,msg.author) then raise exception 'Pesan tidak tersedia.'; end if;
    if exists(select 1 from public.af_reactions where message_id=msg.id and user_id=u and emoji=p->>'emoji') then delete from public.af_reactions where message_id=msg.id and user_id=u and emoji=p->>'emoji'; else insert into public.af_reactions values(msg.id,u,p->>'emoji'); end if;
   else
    if msg.author<>u and not(op='message_delete' and role_name in ('host','moderator')) then raise exception 'Tidak boleh mengubah pesan ini.'; end if;
    if op='message_edit' then if msg.deleted or length(trim(p->>'body')) not between 1 and 2000 then raise exception 'Pesan tidak valid.'; end if; update public.af_messages set body=regexp_replace(trim(p->>'body'),'\m(bangsat|kontol|memek)\M','***','gi'),edited_at=now() where id=msg.id;
    else update public.af_messages set body='',deleted=true where id=msg.id; update public.af_images set deleted=true where id=msg.image_id; end if;
   end if;
  elsif op='goal_create' then
   if (select count(*) from public.af_goals where room_id=r)>=20 then raise exception 'Maksimal 20 target per room.'; end if;
   insert into public.af_goals(room_id,title,target,kind,author) values(r,trim(p->>'title'),(p->>'target')::integer,p->>'kind',u);
  elsif op='goal_done' then
   if not exists(select 1 from public.af_goals where id=(p->>'goal')::uuid and room_id=r and kind='task') then raise exception 'Target ini dihitung dari sesi fokus.'; end if;
   insert into public.af_progress(goal_id,user_id,value) values((p->>'goal')::uuid,u,1) on conflict(goal_id,user_id) do update set value=1;
  else raise exception 'Aksi tidak dikenal.';
  end if;
  if op not in ('room','presence','voice_access','image_access') then perform public.af_touch(r); end if;
 end if;
 return jsonb_build_object('ok',true);
end; $$;

-- Service-only image registration; clients cannot forge uploaded media records.
create or replace function public.af_register_image(uid uuid,rid uuid,iid uuid,object_path text,mime text,bytes integer) returns void language plpgsql security definer set search_path='' as $$ begin
 perform pg_advisory_xact_lock(hashtextextended(uid::text,2));
 if not public.af_is_member(rid,uid) then raise exception 'Bukan anggota.'; end if;
 if (select count(*) from public.af_images where author=uid and created_at>now()-interval '1 minute')>=3 then raise exception 'Maksimal tiga upload per menit.'; end if;
 if (select coalesce(sum(size),0) from public.af_images where author=uid)>=104857600 then raise exception 'Kuota gambar chat 100 MB tercapai.'; end if;
 insert into public.af_images(id,room_id,author,path,type,size) values(iid,rid,uid,object_path,mime,bytes);
end; $$;

do $$ declare t text; begin
 foreach t in array array['af_achievements','af_profiles','af_rooms','af_members','af_bans','af_blocks','af_friends','af_images','af_messages','af_reactions','af_goals','af_progress','af_focus','af_notifications','af_activity','af_reports','af_rate','af_updates'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
revoke all on function public.af_award_focus(uuid) from public,anon,authenticated;
revoke all on function public.af_notify(uuid,text,text,uuid),public.af_touch(uuid,text),public.af_blocked(uuid,uuid),public.af_register_image(uuid,uuid,uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.af_register_image(uuid,uuid,uuid,text,text,integer) to service_role;
revoke all on function public.af_action(text,jsonb),public.af_is_member(uuid,uuid) from public,anon;
grant execute on function public.af_action(text,jsonb),public.af_is_member(uuid,uuid) to authenticated,service_role;
grant select on public.af_updates to authenticated;
drop policy if exists af_updates_own on public.af_updates;
create policy af_updates_own on public.af_updates for select to authenticated using(recipient=auth.uid());
do $$ begin if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='af_updates') then alter publication supabase_realtime add table public.af_updates; end if; end $$;
-- Private presence and typing topics: af:<room UUID>. Membership is checked on subscription.
drop policy if exists af_realtime_read on realtime.messages;
create policy af_realtime_read on realtime.messages for select to authenticated using (case when topic ~ '^af:[a-f0-9]{8}-([a-f0-9]{4}-){3}[a-f0-9]{12}$' then public.af_is_member(substring(topic from 4)::uuid) else false end);
drop policy if exists af_realtime_write on realtime.messages;
create policy af_realtime_write on realtime.messages for insert to authenticated with check(case when topic ~ '^af:[a-f0-9]{8}-([a-f0-9]{4}-){3}[a-f0-9]{12}$' then public.af_is_member(substring(topic from 4)::uuid) else false end);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('lofi-chat','lofi-chat',false,2097152,array['image/jpeg','image/png','image/webp']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
commit;





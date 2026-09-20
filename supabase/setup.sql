-- Run once in the SQL Editor of your own Supabase project.
begin;
create table if not exists public.lofi_profiles (
  id text primary key check (id ~ '^[a-f0-9]{64}$'),
  data text not null check (octet_length(data) <= 2000000),
  revision bigint not null default 1,
  updated_at timestamptz not null default now()
);
create table if not exists public.lofi_uploads (
  id uuid primary key,
  owner_id text not null check (owner_id ~ '^[a-f0-9]{64}$'),
  type text not null check (type in ('image/png','image/jpeg','image/webp','image/gif','video/mp4','video/webm')),
  size bigint not null check (size between 12 and 26214400),
  ready boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists lofi_uploads_owner on public.lofi_uploads(owner_id);
alter table public.lofi_profiles enable row level security;
alter table public.lofi_uploads enable row level security;
revoke all on public.lofi_profiles, public.lofi_uploads from public, anon, authenticated;
grant all on public.lofi_profiles, public.lofi_uploads to service_role;

create or replace function public.lofi_save_profile(p_id text, p_data text, p_revision bigint)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare next_revision bigint;
begin
  if p_revision = 0 then
    insert into public.lofi_profiles(id,data,revision) values(p_id,p_data,1)
    on conflict(id) do nothing returning revision into next_revision;
  else
    update public.lofi_profiles set data=p_data, revision=revision+1, updated_at=now()
    where id=p_id and revision=p_revision returning revision into next_revision;
  end if;
  return next_revision;
end;
$$;
revoke all on function public.lofi_save_profile(text,text,bigint) from public, anon, authenticated;
grant execute on function public.lofi_save_profile(text,text,bigint) to service_role;

create or replace function public.lofi_reserve_upload(p_owner text, p_id uuid, p_type text, p_size bigint)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner, 0));
  if (select count(*) >= 100 or coalesce(sum(size),0) + p_size > 524288000 from public.lofi_uploads where owner_id=p_owner) then
    return false;
  end if;
  insert into public.lofi_uploads(id,owner_id,type,size) values(p_id,p_owner,p_type,p_size);
  return true;
end;
$$;
revoke all on function public.lofi_reserve_upload(text,uuid,text,bigint) from public, anon, authenticated;
grant execute on function public.lofi_reserve_upload(text,uuid,text,bigint) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('lofi-backgrounds','lofi-backgrounds',false,26214400,
 array['image/png','image/jpeg','image/webp','image/gif','video/mp4','video/webm'])
on conflict(id) do update set public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
-- No public Storage policy is required. Server generates scoped upload/download URLs.
commit;

-- Apply ONLY to leczxapskgixlzykdovz. Do not run against any other project.
begin;
create table public.app_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.app_users enable row level security;
create policy read_own_membership on public.app_users for select to authenticated using (user_id = (select auth.uid()));
grant select on public.app_users to authenticated;
revoke all on public.app_users from anon;

create table public.facilities (
  owner_id uuid not null default auth.uid() references public.app_users(user_id),
  facility_id text not null check (length(facility_id) between 1 and 100),
  name text not null check (length(btrim(name)) between 1 and 500),
  prefecture text not null check(length(btrim(prefecture)) between 1 and 20),
  postal_code text not null default '', address text not null default '',
  beds integer not null check (beds between 0 and 100000),
  owner_type text not null check(length(btrim(owner_type)) between 1 and 100),
  departments text[] not null default '{}',
  coverage_complete boolean not null default false,
  coverage_as_of date,
  primary key(owner_id,facility_id),
  check (not coverage_complete or coverage_as_of is not null)
);
create table public.filing_catalog (
  owner_id uuid not null default auth.uid() references public.app_users(user_id),
  code text not null check(length(btrim(code)) between 1 and 100),
  official_name text not null check(length(btrim(official_name)) between 1 and 500),
  primary key(owner_id,code)
);
-- Official names are primary display/search data. Abbreviations are source-specific aliases only.
create table public.filing_aliases (
  owner_id uuid not null default auth.uid(),
  bureau text not null, abbreviation text not null,
  valid_from date not null, valid_to date,
  code text not null, source_url text not null check(source_url ~ '^https://(kouseikyoku[.]mhlw[.]go[.]jp|www[.]mhlw[.]go[.]jp)/'),
  primary key(owner_id,bureau,abbreviation,valid_from),
  foreign key(owner_id,code) references public.filing_catalog(owner_id,code) on delete cascade,
  check(valid_to is null or valid_to>=valid_from)
);
create table public.facility_filings (
  owner_id uuid not null default auth.uid(), facility_id text not null,
  code text not null, accepted_on date,
  primary key(owner_id,facility_id,code),
  foreign key(owner_id,facility_id) references public.facilities(owner_id,facility_id) on delete cascade,
  foreign key(owner_id,code) references public.filing_catalog(owner_id,code) on delete cascade
);
create table public.clients (
  owner_id uuid not null default auth.uid(), facility_id text not null,
  note text not null default '' check(length(note)<=4000),
  primary key(owner_id,facility_id),
  foreign key(owner_id,facility_id) references public.facilities(owner_id,facility_id) on delete cascade
);
create table public.workspace_meta (
  owner_id uuid primary key default auth.uid() references public.app_users(user_id),
  updated_at timestamptz not null default now(),
  source_manifest jsonb not null default '[]'
);
create index facilities_filters on public.facilities(owner_id,prefecture,owner_type,beds);
create index facility_filings_code on public.facility_filings(owner_id,code);

-- Both membership and row ownership are required. No anonymous access.
do $$ declare t text; begin
  foreach t in array array['facilities','filing_catalog','filing_aliases','facility_filings','clients','workspace_meta'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy own_member_rows on public.%I for all to authenticated using (owner_id = (select auth.uid()) and exists (select 1 from public.app_users where user_id = (select auth.uid()))) with check (owner_id = (select auth.uid()) and exists (select 1 from public.app_users where user_id = (select auth.uid())))',t);
    execute format('revoke all on public.%I from anon',t);
    execute format('grant select, insert, update, delete on public.%I to authenticated',t);
  end loop;
end $$;

create function public.get_workspace() returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
 if not exists(select 1 from public.app_users where user_id=auth.uid()) then raise exception '利用者が許可されていません' using errcode='42501'; end if;
 return jsonb_build_object(
  'facilities',coalesce((select jsonb_agg(to_jsonb(f)-'owner_id' order by f.facility_id) from public.facilities f where owner_id=auth.uid()),'[]'::jsonb),
  'filings',coalesce((select jsonb_agg(jsonb_build_object('facility_id',f.facility_id,'code',f.code,'official_name',c.official_name,'accepted_on',f.accepted_on)) from public.facility_filings f join public.filing_catalog c using(owner_id,code) where f.owner_id=auth.uid()),'[]'::jsonb),
  'clients',coalesce((select jsonb_agg(to_jsonb(c)-'owner_id') from public.clients c where owner_id=auth.uid()),'[]'::jsonb),
  'meta',(select to_jsonb(m)-'owner_id' from public.workspace_meta m where owner_id=auth.uid())
 );
end $$;

create function public.replace_dataset(payload jsonb) returns void language plpgsql security invoker set search_path = '' as $$
declare uid uuid := auth.uid();
begin
 if uid is null or not exists(select 1 from public.app_users where user_id=uid) then raise exception '利用者が許可されていません' using errcode='42501'; end if;
 if jsonb_typeof(payload->'facilities') is distinct from 'array' or jsonb_typeof(payload->'filings') is distinct from 'array' then raise exception '不正なデータ形式'; end if;
 if jsonb_array_length(payload->'facilities') not between 1 and 100000 or jsonb_array_length(payload->'filings')>1000000 then raise exception '取込件数が範囲外'; end if;
 if exists(select code from jsonb_to_recordset(payload->'filings') as f(code text,official_name text) group by code having count(distinct official_name)>1) then raise exception '届出名称の不一致'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 -- Transactional replacement; errors roll back every write.
 delete from public.facility_filings where owner_id=uid;
 delete from public.filing_catalog where owner_id=uid;
 insert into public.facilities(owner_id,facility_id,name,prefecture,postal_code,address,beds,owner_type,departments,coverage_complete,coverage_as_of)
 select uid,f.* from jsonb_to_recordset(payload->'facilities') as f(facility_id text,name text,prefecture text,postal_code text,address text,beds integer,owner_type text,departments text[],coverage_complete boolean,coverage_as_of date)
 on conflict(owner_id,facility_id) do update set name=excluded.name,prefecture=excluded.prefecture,postal_code=excluded.postal_code,address=excluded.address,beds=excluded.beds,owner_type=excluded.owner_type,departments=excluded.departments,coverage_complete=excluded.coverage_complete,coverage_as_of=excluded.coverage_as_of;
 delete from public.facilities where owner_id=uid and facility_id not in (select value->>'facility_id' from jsonb_array_elements(payload->'facilities'));
 insert into public.filing_catalog(owner_id,code,official_name) select uid,code,min(official_name) from jsonb_to_recordset(payload->'filings') as f(code text,official_name text) group by code;
 insert into public.facility_filings(owner_id,facility_id,code,accepted_on) select uid,f.* from jsonb_to_recordset(payload->'filings') as f(facility_id text,code text,accepted_on date);
 insert into public.workspace_meta(owner_id,updated_at,source_manifest) values(uid,now(),coalesce(payload->'source_manifest','[]'::jsonb)) on conflict(owner_id) do update set updated_at=excluded.updated_at,source_manifest=excluded.source_manifest;
end $$;
revoke all on function public.get_workspace() from public,anon;
revoke all on function public.replace_dataset(jsonb) from public,anon;
grant execute on function public.get_workspace(), public.replace_dataset(jsonb) to authenticated;
commit;

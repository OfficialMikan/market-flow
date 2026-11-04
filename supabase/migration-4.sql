-- Run once in Supabase > SQL Editor AFTER migration-3.sql (paste the text of this file, not its name). Safe to run twice.
-- Push the new dashboard files to GitHub first: this migration replaces the old settings functions.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists private; -- never exposed through the public API

-- 1. More listing details: location, extra fields, photo check, price repair
alter table listings add column if not exists place text;
alter table listings add column if not exists region text;
alter table listings add column if not exists geo_precision text;
alter table listings add column if not exists lat numeric;
alter table listings add column if not exists lng numeric;
alter table listings add column if not exists model text;
alter table listings add column if not exists color text;
alter table listings add column if not exists year int;
alter table listings add column if not exists quantity int default 1;
alter table listings add column if not exists warranty text;
alter table listings add column if not exists has_receipt boolean default false;
alter table listings add column if not exists reason text;
alter table listings add column if not exists delivery text;
alter table listings add column if not exists extra jsonb default '{}';
alter table listings add column if not exists defects text[] default '{}';
alter table listings add column if not exists inclusions text[] default '{}';
alter table listings add column if not exists case_note text;
alter table listings add column if not exists photo_notes text;
alter table listings add column if not exists mismatch boolean default false;
alter table listings add column if not exists has_details boolean default false;
alter table listings add column if not exists vision_done boolean default false;
alter table listings add column if not exists ai_demand int;
alter table listings add column if not exists ai_resale numeric;
alter table listings add column if not exists price_note text;
alter table listings add column if not exists listed_price numeric;
alter table listing_private add column if not exists lat numeric;
alter table listing_private add column if not exists lng numeric;
create index if not exists price_history_hash_idx on price_history (hash, seen_at);
create index if not exists listings_place_idx on listings (place);

-- 2. Settings: zones and fees (near/nearby/far, haggling and platform fees)
alter table settings add column if not exists near_km numeric default 15;
alter table settings add column if not exists far_km numeric default 50;
alter table settings add column if not exists haggle_pct numeric default 5;
alter table settings add column if not exists fee_pct numeric default 3;

-- 3. Private tables (no policies: the public key cannot read them)
create table if not exists settings_private (id int primary key default 1 check (id = 1), home_lat numeric, home_lng numeric, home_name text, updated_at timestamptz default now());
insert into settings_private (id) values (1) on conflict do nothing;
create table if not exists geo_cache (q text primary key, found boolean, la numeric, lo numeric, d text, at timestamptz default now());
create table if not exists fb_groups (url text primary key, name text, status text default 'candidate', score numeric, posts_seen int, sell_ratio numeric, local_ratio numeric,
  source text default 'discovered', reason text, found_at timestamptz default now(), checked_at timestamptz);
create table if not exists auth_attempts (id bigserial primary key, at timestamptz default now());
alter table settings_private enable row level security;
alter table geo_cache enable row level security;
alter table fb_groups enable row level security;
alter table auth_attempts enable row level security;
alter table settings enable row level security;
drop policy if exists "public read settings" on settings; -- settings are now readable only with the passcode

-- 4. Passcode: stored as a bcrypt hash, 10 wrong guesses in 10 minutes locks guessing out
alter table app_secret add column if not exists pass_hash text;
alter table app_secret alter column passcode drop not null;
update app_secret set pass_hash = extensions.crypt(passcode, extensions.gen_salt('bf')) where pass_hash is null and passcode is not null;
update app_secret set passcode = null where pass_hash is not null;
create or replace function private.check_pass(p text) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
  if (select count(*) from auth_attempts where at > now() - interval '10 minutes') >= 10 then
    return jsonb_build_object('ok', false, 'error', 'Too many wrong attempts. Wait 10 minutes.');
  end if;
  if p is not null and exists (select 1 from app_secret where id = 1 and pass_hash is not null and pass_hash = extensions.crypt(p, pass_hash)) then
    return jsonb_build_object('ok', true);
  end if;
  insert into auth_attempts default values; -- recorded because wrong guesses return normally instead of raising an error
  perform pg_sleep(1);
  return jsonb_build_object('ok', false, 'error', 'Wrong passcode.');
end $$;
delete from auth_attempts where at < now() - interval '1 day';

-- 5. Passcode-protected functions (every one returns {ok, ...})
drop function if exists save_settings(text, text[], text[], text[], numeric, numeric, numeric, numeric);
drop function if exists save_settings(text, text[], numeric, numeric, numeric);
drop function if exists get_private(text, text[]);

create or replace function mf_check(p_pass text) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin return private.check_pass(p_pass); end $$;

create or replace function mf_public_config() returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object('near_km', near_km, 'far_km', far_km, 'haggle_pct', haggle_pct, 'fee_pct', fee_pct) from settings where id = 1 $$;

create or replace function mf_get_settings(p_pass text) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare c jsonb := private.check_pass(p_pass);
begin
  if not (c->>'ok')::boolean then return c; end if;
  return jsonb_build_object('ok', true, 'settings', (select to_jsonb(s) from settings s where id = 1),
    'home', (select jsonb_build_object('lat', home_lat, 'lng', home_lng, 'name', home_name) from settings_private where id = 1),
    'groups', coalesce((select jsonb_agg(to_jsonb(g) order by g.score desc nulls last) from fb_groups g), '[]'::jsonb));
end $$;

create or replace function mf_save_settings(p_pass text, p jsonb) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare c jsonb := private.check_pass(p_pass);
begin
  if not (c->>'ok')::boolean then return c; end if;
  if coalesce((p->>'near_km')::numeric, 15) not between 1 and 500 or coalesce((p->>'far_km')::numeric, 50) not between 1 and 2000
     or coalesce((p->>'haggle_pct')::numeric, 5) not between 0 and 40 or coalesce((p->>'fee_pct')::numeric, 3) not between 0 and 40 then
    return jsonb_build_object('ok', false, 'error', 'A value is out of range.');
  end if;
  update settings set
    watch = coalesce(array(select jsonb_array_elements_text(p->'watch')), '{}'),
    categories = coalesce(array(select jsonb_array_elements_text(p->'categories')), '{}'),
    groups = coalesce(array(select jsonb_array_elements_text(p->'groups')), '{}'),
    min_margin = coalesce(nullif(p->>'min_margin', '')::numeric, 0), min_net = nullif(p->>'min_net', '')::numeric,
    max_price = nullif(p->>'max_price', '')::numeric, max_km = nullif(p->>'max_km', '')::numeric,
    near_km = coalesce(nullif(p->>'near_km', '')::numeric, 15), far_km = coalesce(nullif(p->>'far_km', '')::numeric, 50),
    haggle_pct = coalesce(nullif(p->>'haggle_pct', '')::numeric, 5), fee_pct = coalesce(nullif(p->>'fee_pct', '')::numeric, 3), updated_at = now()
  where id = 1;
  return jsonb_build_object('ok', true);
end $$;

create or replace function mf_save_home(p_pass text, p_lat numeric, p_lng numeric, p_name text) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare c jsonb := private.check_pass(p_pass);
begin
  if not (c->>'ok')::boolean then return c; end if;
  if p_lat not between -90 and 90 or p_lng not between -180 and 180 then return jsonb_build_object('ok', false, 'error', 'Not a valid location.'); end if;
  update settings_private set home_lat = p_lat, home_lng = p_lng, home_name = left(coalesce(p_name, ''), 80), updated_at = now() where id = 1;
  return jsonb_build_object('ok', true);
end $$;

create or replace function mf_set_group(p_pass text, p_url text, p_status text) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare c jsonb := private.check_pass(p_pass);
begin
  if not (c->>'ok')::boolean then return c; end if;
  if p_status not in ('active', 'muted', 'rejected', 'candidate') or p_url !~* '^https://www\.facebook\.com/groups/[A-Za-z0-9._-]+$' then
    return jsonb_build_object('ok', false, 'error', 'Not a valid group link or status.');
  end if;
  insert into fb_groups (url, status, source) values (p_url, p_status, 'manual') on conflict (url) do update set status = excluded.status;
  return jsonb_build_object('ok', true);
end $$;

create or replace function mf_get_private(p_pass text, p_hashes text[]) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare c jsonb := private.check_pass(p_pass);
begin
  if not (c->>'ok')::boolean then return c; end if;
  return jsonb_build_object('ok', true, 'rows', coalesce((select jsonb_agg(to_jsonb(l) - 'lat' - 'lng') from listing_private l where l.hash = any(p_hashes)), '[]'::jsonb));
end $$;

create or replace function mf_change_pass(p_pass text, p_new text) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare c jsonb := private.check_pass(p_pass);
begin
  if not (c->>'ok')::boolean then return c; end if;
  if length(coalesce(p_new, '')) < 12 then return jsonb_build_object('ok', false, 'error', 'Use at least 12 characters.'); end if;
  update app_secret set pass_hash = extensions.crypt(p_new, extensions.gen_salt('bf')), passcode = null where id = 1;
  return jsonb_build_object('ok', true);
end $$;

-- only the public key may call them, nothing else can
revoke all on schema private from public, anon, authenticated;
revoke execute on function mf_check(text), mf_public_config(), mf_get_settings(text), mf_save_settings(text, jsonb), mf_save_home(text, numeric, numeric, text),
  mf_set_group(text, text, text), mf_get_private(text, text[]), mf_change_pass(text, text) from public, authenticated;
grant execute on function mf_check(text), mf_public_config(), mf_get_settings(text), mf_save_settings(text, jsonb), mf_save_home(text, numeric, numeric, text),
  mf_set_group(text, text, text), mf_get_private(text, text[]), mf_change_pass(text, text) to anon;

-- Run once in Supabase > SQL Editor AFTER migration-2.sql (paste the text of this file, not its name). Safe to run twice.
-- 1. New listing fields (buyers, specs, issues, profit math, price drops)
alter table listings add column if not exists intent text default 'sell';
alter table listings add column if not exists kind text default 'listing';
alter table listings add column if not exists brand text;
alter table listings add column if not exists specs text[] default '{}';
alter table listings add column if not exists condition text;
alter table listings add column if not exists issues text[] default '{}';
alter table listings add column if not exists issue_level int default 0;
alter table listings add column if not exists summary text;
alter table listings add column if not exists images text[] default '{}';
alter table listings add column if not exists sell_price numeric;
alter table listings add column if not exists sell_basis text;
alter table listings add column if not exists confidence text;
alter table listings add column if not exists net_profit numeric;
alter table listings add column if not exists travel_cost numeric;
alter table listings add column if not exists offer_price numeric;
alter table listings add column if not exists prev_price numeric;
alter table listings add column if not exists price_drop_pct numeric default 0;
alter table listings add column if not exists matches jsonb default '[]';
alter table listings add column if not exists negotiable boolean;
alter table listings add column if not exists area text;
alter table listings alter column price drop not null; -- "wanted" posts may state no budget
create index if not exists listings_intent_idx on listings (intent);

-- 2. More settings
alter table settings add column if not exists categories text[] default '{}';
alter table settings add column if not exists groups text[] default '{}';
alter table settings add column if not exists cursor int default 0;
alter table settings add column if not exists min_net numeric;

-- 3. Seller names, profile links and full descriptions live here. The public key cannot read this table.
create table if not exists listing_private (
  hash text primary key, seller_name text, seller_url text, seller_rating numeric, seller_reviews int, seller_tenure numeric,
  seller_score int, description text, meetup text, updated_at timestamptz default now()
);
alter table listing_private enable row level security; -- no policies on purpose

-- 4. Passcode-protected functions used by the dashboard
drop function if exists save_settings(text, text[], numeric, numeric, numeric);
create or replace function save_settings(p_pass text, p_watch text[], p_categories text[], p_groups text[], p_min_margin numeric, p_max_price numeric, p_max_km numeric, p_min_net numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from app_secret where passcode = p_pass) then perform pg_sleep(1); raise exception 'wrong passcode'; end if;
  update settings set watch = coalesce(p_watch, '{}'), categories = coalesce(p_categories, '{}'), groups = coalesce(p_groups, '{}'),
    min_margin = coalesce(p_min_margin, 0), max_price = p_max_price, max_km = p_max_km, min_net = p_min_net, updated_at = now() where id = 1;
end $$;
grant execute on function save_settings(text, text[], text[], text[], numeric, numeric, numeric, numeric) to anon;

create or replace function get_private(p_pass text, p_hashes text[])
returns setof listing_private language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from app_secret where passcode = p_pass) then perform pg_sleep(1); raise exception 'wrong passcode'; end if;
  return query select * from listing_private where hash = any(p_hashes);
end $$;
grant execute on function get_private(text, text[]) to anon;

-- Run once in Supabase > SQL Editor (paste the text of this file, not its name).
-- Step 1 of 2: new columns for sold tracking
alter table listings add column if not exists q text;
alter table listings add column if not exists removed_at timestamptz;
alter table listings add column if not exists sell_days numeric;

-- Step 2 of 2: settings you can edit from the dashboard
create table if not exists settings (
  id int primary key default 1 check (id = 1),
  watch text[] default '{}', min_margin numeric default 0, max_price numeric, max_km numeric,
  updated_at timestamptz default now()
);
insert into settings (id) values (1) on conflict do nothing;
create table if not exists app_secret (id int primary key default 1 check (id = 1), passcode text not null);
alter table settings enable row level security;
alter table app_secret enable row level security; -- no policies: the public key can never read the passcode
drop policy if exists "public read settings" on settings;
create policy "public read settings" on settings for select using (true);

create or replace function save_settings(p_pass text, p_watch text[], p_min_margin numeric, p_max_price numeric, p_max_km numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from app_secret where passcode = p_pass) then
    perform pg_sleep(1);
    raise exception 'wrong passcode';
  end if;
  update settings set watch = p_watch, min_margin = coalesce(p_min_margin, 0), max_price = p_max_price, max_km = p_max_km, updated_at = now() where id = 1;
end $$;
grant execute on function save_settings(text, text[], numeric, numeric, numeric) to anon;

-- CHANGE THE TEXT BELOW to a long random passcode (20+ characters) before running:
insert into app_secret (id, passcode) values (1, 'AVeryLongPasswordForMarketFlow')
on conflict (id) do update set passcode = excluded.passcode;

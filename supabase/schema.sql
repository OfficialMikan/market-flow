create table if not exists listings (
  hash text primary key, source text not null, url text not null, title text not null,
  name text, category text, price numeric, resale numeric, margin_pct numeric,
  demand int, score int, distance_km numeric, location_text text, image_url text,
  comments int default 0, posted_at timestamptz,
  first_seen timestamptz default now(), last_seen timestamptz default now(), alerted boolean default false
);
create index if not exists listings_score_idx on listings (score desc);
create index if not exists listings_seen_idx on listings (last_seen desc);
create table if not exists price_history (
  id bigserial primary key, hash text references listings(hash) on delete cascade,
  price numeric, seen_at timestamptz default now()
);
alter table listings enable row level security;
alter table price_history enable row level security;
create policy "public read listings" on listings for select using (true);
create policy "public read history" on price_history for select using (true);

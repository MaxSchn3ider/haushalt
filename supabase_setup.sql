-- =====================================================================
-- Haushalt-App: gemeinsame Datenbank (Supabase, kostenloser Plan)
-- Einmalig im Supabase-Dashboard unter "SQL Editor" einfügen und "Run".
-- =====================================================================

create table if not exists public.hh_records (
  household  text        not null,          -- geheimer Haushalts-Schlüssel (aus der App)
  id         text        not null,          -- Datensatz-ID
  kind       text        not null,          -- cat | rule | receipt | fixed | setting
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null,          -- Zeitpunkt der Änderung (Gerät)
  deleted    boolean     not null default false,
  synced_at  timestamptz not null default clock_timestamp(),  -- Server-Zeit
  primary key (household, id)
);
create index if not exists hh_records_sync_idx on public.hh_records (household, synced_at);

-- Direkter Tabellenzugriff von außen komplett gesperrt.
alter table public.hh_records enable row level security;
revoke all on public.hh_records from anon, authenticated;

-- Änderungen holen (nur für den eigenen Haushalts-Schlüssel)
create or replace function public.hh_pull(p_hh text, p_since timestamptz)
returns setof public.hh_records
language sql security definer set search_path = public as $$
  select * from public.hh_records
  where household = p_hh and length(p_hh) >= 24 and synced_at >= p_since
  order by synced_at asc
  limit 2000;
$$;

-- Änderungen speichern (neuere Version gewinnt)
create or replace function public.hh_push(p_hh text, p_rows jsonb)
returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if p_hh is null or length(p_hh) < 24 then raise exception 'invalid household'; end if;
  insert into public.hh_records as t (household, id, kind, data, updated_at, deleted, synced_at)
  select p_hh, r->>'id', r->>'kind', coalesce(r->'data', '{}'::jsonb),
         (r->>'updated_at')::timestamptz, coalesce((r->>'deleted')::boolean, false), clock_timestamp()
  from jsonb_array_elements(p_rows) as r
  on conflict (household, id) do update
    set kind = excluded.kind, data = excluded.data, updated_at = excluded.updated_at,
        deleted = excluded.deleted, synced_at = clock_timestamp()
    where excluded.updated_at >= t.updated_at;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.hh_pull(text, timestamptz) from public;
revoke all on function public.hh_push(text, jsonb) from public;
grant execute on function public.hh_pull(text, timestamptz) to anon, authenticated;
grant execute on function public.hh_push(text, jsonb) to anon, authenticated;

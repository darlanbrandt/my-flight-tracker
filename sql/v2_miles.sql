-- ============================================================================
-- Acompanhamento por milhas/pontos + saldos de programas
--
-- - prices ganha payment_type ('cash'|'miles'), program, miles_out/back
--   (o complemento em R$ vai em price_out/price_back quando for milhas)
-- - mileage_balances: saldo de pontos por programa (editável na tela de config)
-- ============================================================================

-- 1. Novas colunas em prices (tudo que existe vira 'cash' automaticamente)
alter table prices
  add column if not exists payment_type text not null default 'cash'
    check (payment_type in ('cash', 'miles')),
  add column if not exists program   text    not null default '',
  add column if not exists miles_out  integer,
  add column if not exists miles_back integer;

alter table prices
  add column if not exists miles_total integer
    generated always as (coalesce(miles_out, 0) + coalesce(miles_back, 0)) stored;

-- 2. Refaz a constraint única incluindo payment_type e program
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'prices'::regclass and contype = 'u'
  loop
    execute 'alter table prices drop constraint ' || quote_ident(c);
  end loop;
end $$;

alter table prices add constraint prices_unique
  unique (trip_id, date, airline, origin, destination, trip_type, source, payment_type, program);

-- 3. Saldos de pontos por programa
create table if not exists mileage_balances (
  id         bigint generated always as identity primary key,
  program    text not null unique,
  balance    integer not null default 0,
  updated_at timestamptz default now()
);

alter table mileage_balances enable row level security;
create policy "balances public read"   on mileage_balances for select using (true);
create policy "balances auth write"    on mileage_balances for all to authenticated using (true) with check (true);
create policy "balances service write" on mileage_balances for all to service_role  using (true) with check (true);

-- Programas iniciais (edite os saldos depois na tela de configuração)
insert into mileage_balances (program, balance) values
  ('Latam Pass', 0),
  ('Smiles', 0)
on conflict (program) do nothing;

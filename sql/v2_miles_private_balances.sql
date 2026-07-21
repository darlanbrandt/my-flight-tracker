-- ============================================================================
-- Torna o saldo de milhas privado: só usuários autenticados podem LER.
-- (A escrita já era restrita a authenticated/service_role.)
-- ============================================================================

drop policy if exists "balances public read" on mileage_balances;

create policy "balances auth read"
  on mileage_balances for select
  to authenticated
  using (true);

-- As políticas de escrita (auth/service) continuam como estavam.

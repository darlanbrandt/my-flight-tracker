-- ============================================================================
-- Ocultar viagens do seletor sem apagar o histórico.
-- Viagens com hidden=true somem do seletor principal, mas continuam na tela
-- ⚙ Viagens (para reexibir) e mantêm todos os registros de preços/pontos.
-- ============================================================================

alter table trips
  add column if not exists hidden boolean not null default false;

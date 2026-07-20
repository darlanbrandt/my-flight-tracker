-- ============================================================================
-- Migração para SerpAPI + acompanhamento São Paulo (FLN↔GRU, nov/2026)
--
-- - Desativa todas as buscas antigas (NY, Talordata e RapidAPI)
-- - Cria a viagem "São Paulo" (22 → 30 nov)
-- - Cadastra 6 buscas SerpAPI: Gol e Latam × (ida, volta, ida-e-volta)
-- ============================================================================

-- 1. Aposenta tudo que estava rodando (NY encontrada; Talordata/RapidAPI saem)
update tracked_searches set active = false;

-- 2. Nova viagem
insert into trips (name, period, kind, date_out, date_back)
values ('São Paulo', 'Nov/2026', 'domestica', '2026-11-22', '2026-11-30')
returning id;   -- anote o id retornado; usado abaixo como :trip

-- 3. Buscas SerpAPI (substitua 5 pelo id retornado acima, se for diferente)
--    Ida:   22/11 entre 00h e 12h  →  outbound_times '0,12'
--    Volta: 30/11 entre 18h e 24h  →  '18,23'
--    Somente voos diretos          →  max_stops 0
insert into tracked_searches
  (trip_id, api, airline, airline_match, origin, destination, trip_type,
   max_stops, outbound_times, return_times, active)
values
  -- só ida (FLN→GRU, 22/11 manhã)
  (5, 'serpapi', 'Gol',   'Gol',   'FLN', 'GRU', 'outbound',   0, '0,12', null,   true),
  (5, 'serpapi', 'Latam', 'LATAM', 'FLN', 'GRU', 'outbound',   0, '0,12', null,   true),
  -- só volta (GRU→FLN, 30/11 noite) — origin/destination na direção da ida
  (5, 'serpapi', 'Gol',   'Gol',   'FLN', 'GRU', 'return',     0, '18,23', null,  true),
  (5, 'serpapi', 'Latam', 'LATAM', 'FLN', 'GRU', 'return',     0, '18,23', null,  true),
  -- ida e volta (pacote round trip, mesma janela em cada trecho)
  (5, 'serpapi', 'Gol',   'Gol',   'FLN', 'GRU', 'round_trip', 0, '0,12', '18,23', true),
  (5, 'serpapi', 'Latam', 'LATAM', 'FLN', 'GRU', 'round_trip', 0, '0,12', '18,23', true);

-- 4. Conferência
select t.name, s.airline, s.trip_type, s.outbound_times, s.return_times, s.active
from tracked_searches s join trips t on t.id = s.trip_id
where s.active
order by s.trip_type, s.airline;

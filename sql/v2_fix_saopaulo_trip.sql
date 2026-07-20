-- ============================================================================
-- Correção: as 6 buscas de FLN↔GRU foram anexadas à viagem errada (id fixo 5).
-- Reaponta para a viagem "São Paulo" (22→30 nov) usando o nome, sem id fixo.
-- ============================================================================

update tracked_searches s
set trip_id = (
  select id from trips
  where name = 'São Paulo' and date_out = '2026-11-22'
  order by id desc
  limit 1
)
where s.origin = 'FLN' and s.destination = 'GRU'
  and s.api = 'serpapi'
  and s.trip_id = (
    select id from trips where name = 'Europa' limit 1
  );

-- Conferência: deve listar as 6 buscas sob "São Paulo"
select t.name, s.airline, s.trip_type, s.outbound_times, s.return_times, s.active
from tracked_searches s join trips t on t.id = s.trip_id
where s.origin = 'FLN' and s.destination = 'GRU' and s.active
order by t.name, s.trip_type, s.airline;

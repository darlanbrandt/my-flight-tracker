-- ============================================================================
-- Acompanhamento automático dinâmico (SerpAPI) dirigido pela viagem.
--
-- Uma viagem pode ser marcada como "auto_track": a tarefa agendada do SerpAPI
-- passa a buscar automaticamente pelos aeroportos/datas dela. Só UMA viagem
-- pode estar marcada por vez (índice único parcial). Ao excluir a viagem,
-- não há mais viagem marcada → a tarefa não faz nada.
-- ============================================================================

alter table trips
  add column if not exists auto_track          boolean not null default false,
  add column if not exists track_origin         text,
  add column if not exists track_destination    text,
  add column if not exists track_nonstop        boolean not null default true,
  add column if not exists track_outbound_times text,   -- ex: '6,12' (saída da ida)
  add column if not exists track_return_times   text;   -- ex: '12,18' (saída da volta)

-- Garante no máximo uma viagem com auto_track = true
create unique index if not exists trips_one_auto_track
  on trips (auto_track) where auto_track;

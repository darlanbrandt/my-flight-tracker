-- ============================================================================
-- Normaliza nomes de companhias em prices para o formato canônico,
-- unificando variações como "LATAM" e "Latam".
-- ============================================================================

update prices set airline = 'Latam'   where lower(airline) = 'latam'   and airline <> 'Latam';
update prices set airline = 'Gol'     where lower(airline) = 'gol'     and airline <> 'Gol';
update prices set airline = 'Azul'    where lower(airline) = 'azul'    and airline <> 'Azul';
update prices set airline = 'Avianca' where lower(airline) = 'avianca' and airline <> 'Avianca';
update prices set airline = 'Arajet'  where lower(airline) = 'arajet'  and airline <> 'Arajet';

-- Conferência: variações remanescentes por companhia
select airline, count(*) from prices group by airline order by airline;

"""
fetch_prices.py
Busca preços no Google Flights via fast-flights e salva no Supabase.
Roda via GitHub Actions todo dia às 09:00 UTC (06:00 Brasília).
"""

import os
import sys
import logging
from datetime import date
from dataclasses import dataclass

import httpx
from fast_flights import create_query, get_flights, Passengers, FlightQuery, FlightsNotFound

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]  # service role key

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates,return=minimal",
}

@dataclass
class Route:
    airline_display: str   # nome exibido no app
    airline_iata: str      # código IATA para filtrar resultados
    origin: str
    destination: str
    date_out: str          # YYYY-MM-DD
    date_back: str         # YYYY-MM-DD

ROUTES: list[Route] = [
    Route("Arajet",   "DM", "GRU", "EWR", "2026-11-19", "2026-11-28"),
    Route("Avianca",  "AV", "GRU", "IAD", "2026-11-19", "2026-11-28"),
    Route("Avianca",  "AV", "GIG", "IAD", "2026-11-19", "2026-11-28"),
    Route("American", "AA", "GIG", "JFK", "2026-11-19", "2026-11-28"),
]


def fetch_best_price(route: Route) -> float | None:
    log.info(f"Buscando {route.airline_display} {route.origin}→{route.destination} ...")
    query = create_query(
        flights=[
            FlightQuery(
                date=route.date_out,
                from_airport=route.origin,
                to_airport=route.destination,
            ),
            FlightQuery(
                date=route.date_back,
                from_airport=route.destination,
                to_airport=route.origin,
            ),
        ],
        trip="round-trip",
        seat="economy",
        passengers=Passengers(adults=1),
        currency="BRL",
        language="pt-BR",
        max_stops=1,
    )
    try:
        results = get_flights(query)
    except FlightsNotFound:
        log.warning(f"  Nenhum voo encontrado para {route.airline_display} {route.origin}→{route.destination}")
        log.warning(f"  (A rota pode não existir no Google Flights ou não ter disponibilidade na data)")
        return None
    except Exception as e:
        log.warning(f"  Erro inesperado: {e}")
        return None

    if not results:
        log.warning("  Lista de resultados vazia.")
        return None

    # filtra pela companhia na resposta também (segurança dupla)
    matching = [r for r in results if route.airline_iata in r.airlines]

    if not matching:
        found = set(code for r in results for code in r.airlines)
        log.warning(f"  {route.airline_iata} não encontrada nos resultados. Disponíveis: {found}")
        log.info(f"  Usando o melhor preço geral como fallback.")
        matching = results  # usa qualquer voo disponível como fallback

    best = min(matching, key=lambda r: r.price)
    price_brl = best.price / 100  # fast-flights retorna em centavos
    airlines_str = ", ".join(set(code for r in matching for code in r.airlines))
    log.info(f"  Melhor preço: R$ {price_brl:,.2f} (companhias: {airlines_str})")
    return price_brl


def split_price(total: float) -> tuple[float, float]:
    """Divide o total igualmente entre ida e volta."""
    half = round(total / 2, 2)
    return half, round(total - half, 2)


def upsert_to_supabase(route: Route, price_out: float, price_back: float) -> bool:
    today = date.today().isoformat()
    payload = {
        "date":        today,
        "airline":     route.airline_display,
        "origin":      route.origin,
        "destination": route.destination,
        "price_out":   price_out,
        "price_back":  price_back,
        "notes":       "Automático — sem bagagem despachada",
    }
    try:
        resp = httpx.post(
            f"{SUPABASE_URL}/rest/v1/flight_prices",
            headers=HEADERS,
            json=payload,
            timeout=15,
        )
        if resp.status_code in (200, 201):
            log.info(f"  Salvo: R$ {price_out + price_back:,.2f}")
            return True
        log.error(f"  Supabase {resp.status_code}: {resp.text}")
        return False
    except Exception as e:
        log.error(f"  Erro ao salvar: {e}")
        return False


def main():
    log.info(f"=== Iniciando — {date.today().isoformat()} ===")
    success, failed = 0, 0
    for route in ROUTES:
        total = fetch_best_price(route)
        if total is None:
            failed += 1
            continue
        price_out, price_back = split_price(total)
        if upsert_to_supabase(route, price_out, price_back):
            success += 1
        else:
            failed += 1

    log.info(f"=== Concluído: {success} salvos, {failed} falhas ===")
    if failed > 0 and success == 0:
        sys.exit(1)


if __name__ == "__main__":
    main()

"""
fetch_prices.py
Busca preços via proxy SerpAPI (serpapi.talordata.net) e salva no Supabase.
Roda via GitHub Actions todo dia às 09:00 UTC (06:00 Brasília).
"""

import os
import sys
import json
import logging
from datetime import date
from dataclasses import dataclass

import httpx

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
SERPAPI_KEY  = os.environ["SERPAPI_KEY"]

SUPABASE_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates,return=minimal",
}

SERPAPI_URL = "https://serpapi.com/search.json"

@dataclass
class Route:
    airline_display: str
    airline_name: str      # nome como aparece nos resultados
    origin: str
    destination: str
    date_out: str          # YYYY-MM-DD
    date_back: str         # YYYY-MM-DD

ROUTES: list[Route] = [
    Route("Arajet",   "Arajet",   "GRU", "EWR", "2026-11-19", "2026-11-28"),
    Route("Avianca",  "Avianca",  "GRU", "IAD", "2026-11-19", "2026-11-28"),
    Route("Avianca",  "Avianca",  "GIG", "IAD", "2026-11-19", "2026-11-28"),
    Route("American", "American", "GIG", "JFK", "2026-11-19", "2026-11-28"),
]


def fetch_best_price(route: Route) -> float | None:
    log.info(f"Buscando {route.airline_display} {route.origin}→{route.destination} ...")
    try:
        resp = httpx.get(SERPAPI_URL, params={
            "engine":        "google_flights",
            "departure_id":  route.origin,
            "arrival_id":    route.destination,
            "outbound_date": route.date_out,
            "return_date":   route.date_back,
            "currency":      "BRL",
            "hl":            "en",
            "type":          "1",
            "max_stops":     "1",
            "api_key":       SERPAPI_KEY,
        }, timeout=30)
        resp.raise_for_status()
    except Exception as e:
        log.warning(f"  Erro na requisição: {e}")
        return None

    try:
        data = resp.json()
    except Exception:
        log.warning(f"  Resposta não é JSON. Primeiros 500 chars: {resp.text[:500]}")
        return None

    # Log da estrutura de topo para entender o formato
    log.info(f"  Chaves na resposta: {list(data.keys())}")

    if "error" in data:
        log.warning(f"  Erro da API: {data['error']}")
        return None

    all_offers = data.get("best_flights", []) + data.get("other_flights", [])

    if not all_offers:
        log.warning(f"  Nenhuma oferta em best_flights/other_flights. Resposta completa:")
        log.warning(json.dumps(data, ensure_ascii=False)[:1000])
        return None

    log.info(f"  {len(all_offers)} oferta(s) recebida(s).")

    def is_target(offer: dict) -> bool:
        for leg in offer.get("flights", []):
            if route.airline_name not in leg.get("airline", ""):
                return False
        return True

    matching = [o for o in all_offers if is_target(o)]

    if not matching:
        found = set(
            leg.get("airline", "?")
            for o in all_offers
            for leg in o.get("flights", [])
        )
        log.warning(f"  '{route.airline_name}' não encontrada. Disponíveis: {found}")
        return None

    best = min(matching, key=lambda o: o["price"])
    price_brl = float(best["price"])
    log.info(f"  Melhor preço: R$ {price_brl:,.2f}")
    return price_brl


def split_price(total: float) -> tuple[float, float]:
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
            headers=SUPABASE_HEADERS,
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

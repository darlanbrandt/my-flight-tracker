"""
fetch_prices.py
Busca preços via Amadeus Flight Offers Search API e salva no Supabase.
Roda via GitHub Actions todo dia às 09:00 UTC (06:00 Brasília).
"""

import os
import sys
import logging
from datetime import date
from dataclasses import dataclass

import httpx
from amadeus import Client, ResponseError

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]  # service role key

SUPABASE_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates,return=minimal",
}

amadeus = Client(
    client_id=os.environ["AMADEUS_CLIENT_ID"],
    client_secret=os.environ["AMADEUS_CLIENT_SECRET"],
)

@dataclass
class Route:
    airline_display: str   # nome exibido no app e no banco
    airline_iata: str      # código IATA da companhia (para filtrar resultados)
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
    try:
        response = amadeus.shopping.flight_offers_search.get(
            originLocationCode=route.origin,
            destinationLocationCode=route.destination,
            departureDate=route.date_out,
            returnDate=route.date_back,
            adults=1,
            currencyCode="BRL",
            max=50,
        )
    except ResponseError as e:
        log.warning(f"  Erro Amadeus: {e}")
        return None

    offers = response.data
    if not offers:
        log.warning(f"  Nenhuma oferta encontrada.")
        return None

    log.info(f"  {len(offers)} oferta(s) recebida(s).")

    # Filtra ofertas onde todos os segmentos são operados pela companhia alvo
    def is_target_airline(offer: dict) -> bool:
        for itinerary in offer["itineraries"]:
            for segment in itinerary["segments"]:
                # carrierCode é o código IATA do voo marketing; operatingCarrierCode é o operador real
                carrier = segment.get("operating", {}).get("carrierCode") or segment["carrierCode"]
                if carrier != route.airline_iata:
                    return False
        return True

    matching = [o for o in offers if is_target_airline(o)]

    if not matching:
        found = set()
        for o in offers:
            for itin in o["itineraries"]:
                for seg in itin["segments"]:
                    found.add(seg["carrierCode"])
        log.warning(f"  '{route.airline_iata}' não encontrada. Disponíveis: {found}")
        log.warning(f"  Pulando — não salvar preço de outra companhia como {route.airline_display}.")
        return None

    best = min(matching, key=lambda o: float(o["price"]["grandTotal"]))
    price_brl = float(best["price"]["grandTotal"])
    log.info(f"  Melhor preço: R$ {price_brl:,.2f}")
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

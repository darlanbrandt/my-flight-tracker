"""
fetch_domestic.py
Busca tarifas de ida e volta via Talordata (SerpAPI proxy) e salva no Supabase.
Roda via GitHub Actions seg–sáb às 10:00 UTC (07:00 Brasília) — 3 req/dia, ~78/mês.

Datas configuradas via GitHub Actions vars:
  DOMESTIC_DATE_OUT  — dia de saída de FLN (ex: 2026-11-18)
  DOMESTIC_DATE_BACK — dia de volta para FLN (ex: 2026-11-29)

3 pesquisas por dia (round_trip):
  FLN↔GRU  Gol
  FLN↔GRU  Latam
  FLN↔GIG  Gol
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

SUPABASE_URL    = os.environ["SUPABASE_URL"]
SUPABASE_KEY    = os.environ["SUPABASE_KEY"]
TALORDATA_TOKEN = os.environ["TALORDATA_TOKEN"]

DATE_OUT  = os.environ["DOMESTIC_DATE_OUT"]   # saída de FLN
DATE_BACK = os.environ["DOMESTIC_DATE_BACK"]  # volta para FLN

SUPABASE_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates,return=minimal",
}

TALORDATA_URL     = "https://serpapi.talordata.net/serp/v1/request"
TALORDATA_HEADERS = {
    "Authorization": f"Bearer {TALORDATA_TOKEN}",
    "Content-Type": "application/x-www-form-urlencoded",
}


@dataclass
class Route:
    airline_display: str   # 'Gol' ou 'Latam' (como salvar no banco)
    airline_match: str     # substring para filtrar na resposta da API
    search_origin: str
    search_dest: str
    db_origin: str
    db_destination: str


ROUTES: list[Route] = [
    Route("Gol",   "Gol",   "FLN", "GRU", "GRU", "FLN"),
    Route("Latam", "LATAM", "FLN", "GRU", "GRU", "FLN"),
    Route("Gol",   "Gol",   "FLN", "GIG", "GIG", "FLN"),
]


def fetch_best_price(route: Route) -> float | None:
    label = f"{route.airline_display} FLN↔{route.search_dest}"
    log.info(f"Buscando {label} ...")

    form: dict = {
        "engine":        "google_flights",
        "departure_id":  route.search_origin,
        "arrival_id":    route.search_dest,
        "outbound_date": DATE_OUT,
        "return_date":   DATE_BACK,
        "type":          "1",          # round trip
        "currency":      "BRL",
        "hl":            "pt",
        "gl":            "br",
        "google_domain": "google.com.br",
        "max_stops":     "0",
        "json":          "1",
    }

    try:
        resp = httpx.post(TALORDATA_URL, headers=TALORDATA_HEADERS, data=form, timeout=30)
        resp.raise_for_status()
    except Exception as e:
        log.warning(f"  Erro na requisição: {e}")
        return None

    try:
        data = resp.json()
    except Exception:
        log.warning(f"  Resposta não é JSON: {resp.text[:500]}")
        return None

    # Talordata envolve a resposta em {"code": 0, "data": {...}}
    payload = data.get("data", data)

    if "error" in payload:
        log.warning(f"  Erro da API: {payload['error']}")
        return None

    all_offers = (
        payload.get("best_flights", []) +
        payload.get("other_flights", []) +
        payload.get("other_departing_flights", [])
    )

    if not all_offers:
        log.warning(f"  Nenhuma oferta. Resposta: {json.dumps(data, ensure_ascii=False)[:800]}")
        return None

    log.info(f"  {len(all_offers)} oferta(s) recebida(s).")

    def is_target(offer: dict) -> bool:
        return any(
            route.airline_match.lower() in leg.get("airline", "").lower()
            for leg in offer.get("flight", [])
        )

    def parse_price(offer: dict) -> float | None:
        raw = offer.get("price")
        if raw is None:
            return None
        if isinstance(raw, (int, float)):
            return float(raw)
        s = str(raw).strip()
        if s.startswith("$") and not s.startswith("R$"):
            log.warning(f"  Preço em USD: {s}")
        clean = s.replace("R$", "").replace("$", "").replace(".", "").replace(",", ".").strip()
        try:
            return float(clean)
        except ValueError:
            return None

    target_offers = [o for o in all_offers if is_target(o)]
    matching = [(o, parse_price(o)) for o in target_offers]
    matching = [(o, p) for o, p in matching if p is not None]

    if not matching:
        if target_offers:
            log.warning(f"  '{route.airline_match}' encontrada mas sem preço:")
            log.warning(json.dumps(target_offers[0], ensure_ascii=False)[:600])
        else:
            found = {leg.get("airline", "?") for o in all_offers for leg in o.get("flight", [])}
            log.warning(f"  '{route.airline_match}' não encontrada. Disponíveis: {found}")
        return None

    _, price = min(matching, key=lambda x: x[1])
    log.info(f"  Melhor preço: R$ {price:,.2f}")
    return price


def upsert(route: Route, price: float) -> bool:
    today = date.today().isoformat()
    half = round(price / 2, 2)
    payload = {
        "date":        today,
        "airline":     route.airline_display,
        "origin":      route.db_origin,
        "destination": route.db_destination,
        "trip_type":   "round_trip",
        "price_out":   half,
        "price_back":  round(price - half, 2),
    }

    try:
        resp = httpx.post(
            f"{SUPABASE_URL}/rest/v1/domestic_prices_auto",
            headers=SUPABASE_HEADERS,
            json=payload,
            params={"on_conflict": "date,airline,origin,destination,trip_type"},
            timeout=15,
        )
        if resp.status_code in (200, 201):
            log.info(f"  Salvo: R$ {price:,.2f}")
            return True
        log.error(f"  Supabase {resp.status_code}: {resp.text}")
        return False
    except Exception as e:
        log.error(f"  Erro ao salvar: {e}")
        return False


def main():
    log.info(f"=== Doméstico — {date.today().isoformat()} | saída {DATE_OUT} volta {DATE_BACK} ===")
    success, failed = 0, 0

    for route in ROUTES:
        price = fetch_best_price(route)
        if price is None:
            failed += 1
            continue
        if upsert(route, price):
            success += 1
        else:
            failed += 1

    log.info(f"=== Concluído: {success} salvos, {failed} falhas ===")
    if failed > 0 and success == 0:
        sys.exit(1)


if __name__ == "__main__":
    main()

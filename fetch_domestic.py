"""
fetch_domestic.py
Busca tarifas base (sem bagagem) de voos domésticos via SerpAPI e salva no Supabase.
Roda via GitHub Actions todo dia às 10:00 UTC (07:00 Brasília).

Datas configuradas via env vars:
  DOMESTIC_DATE_OUT  — dia de saída de FLN (ex: 2026-11-19)
  DOMESTIC_DATE_BACK — dia de volta para FLN (ex: 2026-11-28)

9 pesquisas por dia:
  outbound  FLN→GRU Gol
  outbound  FLN→GRU Latam
  outbound  FLN→GIG Gol
  return    GRU→FLN Gol
  return    GRU→FLN Latam
  return    GIG→FLN Gol
  round_trip GRU↔FLN Gol   (pesquisa como FLN→GRU ida+volta, salva origin=GRU)
  round_trip GRU↔FLN Latam
  round_trip GIG↔FLN Gol   (pesquisa como FLN→GIG ida+volta, salva origin=GIG)
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

DATE_OUT  = os.environ["DOMESTIC_DATE_OUT"]   # saída de FLN
DATE_BACK = os.environ["DOMESTIC_DATE_BACK"]  # volta para FLN

SUPABASE_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates,return=minimal",
}

SERPAPI_URL = "https://serpapi.com/search.json"


@dataclass
class Route:
    airline_display: str   # 'Gol' ou 'Latam' (como salvar no banco)
    airline_match: str     # substring para filtrar na resposta da API
    trip_type: str         # 'outbound' | 'return' | 'round_trip'
    # campos para a busca na API
    search_origin: str
    search_dest: str
    search_date: str
    search_return: str | None  # None = one-way
    # campos para salvar no banco (podem diferir de search_origin/dest)
    db_origin: str
    db_destination: str


ROUTES: list[Route] = [
    # ── Só ida: saída de FLN ──────────────────────────────────────────────────
    Route("Gol",   "GOL",   "outbound", "FLN", "GRU", DATE_OUT,  None,      "FLN", "GRU"),
    Route("Latam", "LATAM", "outbound", "FLN", "GRU", DATE_OUT,  None,      "FLN", "GRU"),
    Route("Gol",   "GOL",   "outbound", "FLN", "GIG", DATE_OUT,  None,      "FLN", "GIG"),

    # ── Só volta: chegada em FLN ──────────────────────────────────────────────
    Route("Gol",   "GOL",   "return",   "GRU", "FLN", DATE_BACK, None,      "GRU", "FLN"),
    Route("Latam", "LATAM", "return",   "GRU", "FLN", DATE_BACK, None,      "GRU", "FLN"),
    Route("Gol",   "GOL",   "return",   "GIG", "FLN", DATE_BACK, None,      "GIG", "FLN"),

    # ── Ida e volta: pesquisa saindo de FLN, salva com origin=hub ────────────
    # search: FLN→GRU (out=DATE_OUT, back=DATE_BACK) → salva origin=GRU
    Route("Gol",   "GOL",   "round_trip", "FLN", "GRU", DATE_OUT, DATE_BACK, "GRU", "FLN"),
    Route("Latam", "LATAM", "round_trip", "FLN", "GRU", DATE_OUT, DATE_BACK, "GRU", "FLN"),
    # search: FLN→GIG (out=DATE_OUT, back=DATE_BACK) → salva origin=GIG
    Route("Gol",   "GOL",   "round_trip", "FLN", "GIG", DATE_OUT, DATE_BACK, "GIG", "FLN"),
]


def fetch_best_price(route: Route) -> float | None:
    label = f"{route.airline_display} {route.search_origin}→{route.search_dest} [{route.trip_type}]"
    log.info(f"Buscando {label} ...")

    params: dict = {
        "engine":        "google_flights",
        "departure_id":  route.search_origin,
        "arrival_id":    route.search_dest,
        "outbound_date": route.search_date,
        "currency":      "BRL",
        "hl":            "pt",
        "gl":            "br",
        "api_key":       SERPAPI_KEY,
    }

    if route.search_return:
        params["type"] = "1"           # round trip
        params["return_date"] = route.search_return
    else:
        params["type"] = "2"           # one-way

    try:
        resp = httpx.get(SERPAPI_URL, params=params, timeout=30)
        resp.raise_for_status()
    except Exception as e:
        log.warning(f"  Erro na requisição: {e}")
        return None

    try:
        data = resp.json()
    except Exception:
        log.warning(f"  Resposta não é JSON: {resp.text[:500]}")
        return None

    if "error" in data:
        log.warning(f"  Erro da API: {data['error']}")
        return None

    all_offers = data.get("best_flights", []) + data.get("other_flights", [])

    if not all_offers:
        log.warning(f"  Nenhuma oferta. Resposta: {json.dumps(data, ensure_ascii=False)[:800]}")
        return None

    log.info(f"  {len(all_offers)} oferta(s) recebida(s).")

    def is_target(offer: dict) -> bool:
        return any(
            route.airline_match in leg.get("airline", "")
            for leg in offer.get("flights", [])
        )

    matching = [o for o in all_offers if is_target(o)]

    if not matching:
        found = {
            leg.get("airline", "?")
            for o in all_offers
            for leg in o.get("flights", [])
        }
        log.warning(f"  '{route.airline_match}' não encontrada. Disponíveis: {found}")
        return None

    best = min(matching, key=lambda o: o["price"])
    price = float(best["price"])
    log.info(f"  Melhor preço: R$ {price:,.2f}")
    return price


def upsert(route: Route, price: float) -> bool:
    today = date.today().isoformat()

    # Para one-way: coloca o valor no campo correto e null no outro.
    # Para round_trip: divide 50/50 (preço combinado da API não separa as pernas).
    if route.trip_type == "outbound":
        price_out, price_back = price, None
    elif route.trip_type == "return":
        price_out, price_back = None, price
    else:  # round_trip
        half = round(price / 2, 2)
        price_out  = half
        price_back = round(price - half, 2)

    payload = {
        "date":        today,
        "airline":     route.airline_display,
        "origin":      route.db_origin,
        "destination": route.db_destination,
        "trip_type":   route.trip_type,
        "price_out":   price_out,
        "price_back":  price_back,
    }

    try:
        resp = httpx.post(
            f"{SUPABASE_URL}/rest/v1/domestic_prices",
            headers=SUPABASE_HEADERS,
            json=payload,
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

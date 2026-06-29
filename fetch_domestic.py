"""
fetch_domestic.py
Busca tarifas domésticas via Skyscanner RapidAPI e salva no Supabase.
Roda via GitHub Actions seg–sáb às 10:00 UTC (07:00 Brasília).

Datas configuradas via GitHub Actions vars:
  DOMESTIC_DATE_OUT  — dia de saída de FLN (ex: 2026-11-18)
  DOMESTIC_DATE_BACK — dia de volta para FLN (ex: 2026-11-29)

4 buscas por dia — cada uma extrai Gol e/ou LATAM dos resultados:
  FLN→GRU  (outbound) → Gol + Latam
  FLN→GIG  (outbound) → Gol
  GRU→FLN  (return)   → Gol + Latam
  GIG→FLN  (return)   → Gol
"""

import os
import sys
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
RAPIDAPI_KEY = os.environ["RAPIDAPI_KEY"]

DATE_OUT  = os.environ["DOMESTIC_DATE_OUT"]   # saída de FLN
DATE_BACK = os.environ["DOMESTIC_DATE_BACK"]  # volta para FLN

SUPABASE_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates,return=minimal",
}

SKYSCANNER_URL = "https://skyscanner-flights4.p.rapidapi.com/api/v1/search"
SKYSCANNER_HEADERS = {
    "x-rapidapi-key":  RAPIDAPI_KEY,
    "x-rapidapi-host": "skyscanner-flights4.p.rapidapi.com",
}

AIRLINES = [
    ("Gol",   "GOL"),
    ("Latam", "LATAM"),
]


@dataclass
class Search:
    origin: str
    destination: str
    date: str
    trip_type: str   # 'outbound' ou 'return'


def build_searches() -> list[Search]:
    return [
        Search("FLN", "GRU", DATE_OUT,  "outbound"),
        Search("FLN", "GIG", DATE_OUT,  "outbound"),
        Search("GRU", "FLN", DATE_BACK, "return"),
        Search("GIG", "FLN", DATE_BACK, "return"),
    ]


def fetch_results(search: Search) -> list[dict]:
    log.info(f"Buscando {search.origin}→{search.destination} ({search.trip_type}) ...")
    params = {
        "origin":      search.origin,
        "destination": search.destination,
        "date":        search.date,
        "limit":       "20",
        "adults":      "1",
        "currency":    "BRL",
        "cabin":       "economy",
        "market":      "BR",
        "locale":      "pt-BR",
    }

    try:
        resp = httpx.get(SKYSCANNER_URL, headers=SKYSCANNER_HEADERS, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        log.warning(f"  Erro na requisição: {e}")
        return []

    if not data.get("success"):
        log.warning(f"  API retornou erro: {data}")
        return []

    results = data.get("results", [])
    log.info(f"  {len(results)} oferta(s) recebida(s).")
    return results


def best_price_for_airline(results: list[dict], airline_match: str) -> float | None:
    def is_direct(r: dict) -> bool:
        legs = r.get("legs", [])
        return bool(legs) and legs[0].get("stops", 1) == 0

    def is_target(r: dict) -> bool:
        return any(airline_match in c.upper() for c in r.get("carriers", []))

    matching = [r for r in results if is_direct(r) and is_target(r)]

    if not matching:
        all_carriers = {c for r in results for c in r.get("carriers", [])}
        direct_count = sum(1 for r in results if is_direct(r))
        log.warning(
            f"    '{airline_match}' não encontrada (direto). "
            f"Diretos: {direct_count}/{len(results)}. Carriers: {all_carriers}"
        )
        return None

    best = min(matching, key=lambda r: r.get("price_raw", float("inf")))
    price = best.get("price_raw")
    if price is None:
        log.warning(f"    Oferta sem price_raw: {best}")
        return None

    return float(price)


def upsert(
    airline: str,
    origin: str,
    destination: str,
    trip_type: str,
    price_out: float | None,
    price_back: float | None,
) -> bool:
    today = date.today().isoformat()
    payload = {
        "date":        today,
        "airline":     airline,
        "origin":      origin,
        "destination": destination,
        "trip_type":   trip_type,
        "price_out":   price_out,
        "price_back":  price_back,
    }
    total = (price_out or 0) + (price_back or 0)
    label = f"{airline} {origin}↔{destination} [{trip_type}] R$ {total:,.2f}"

    try:
        resp = httpx.post(
            f"{SUPABASE_URL}/rest/v1/domestic_prices_auto",
            headers=SUPABASE_HEADERS,
            json=payload,
            params={"on_conflict": "date,airline,origin,destination,trip_type"},
            timeout=15,
        )
        if resp.status_code in (200, 201):
            log.info(f"  Salvo: {label}")
            return True
        log.error(f"  Supabase {resp.status_code}: {resp.text}")
        return False
    except Exception as e:
        log.error(f"  Erro ao salvar: {e}")
        return False


def main():
    log.info(f"=== Doméstico — {date.today().isoformat()} | saída {DATE_OUT} volta {DATE_BACK} ===")

    # prices[(airline_display, origin, destination, trip_type)] = price
    prices: dict[tuple, float] = {}

    success, failed = 0, 0

    # ── 4 buscas one-way ────────────────────────────────────────────────────────
    for search in build_searches():
        results = fetch_results(search)
        if not results:
            # conta uma falha por airline esperada nessa rota
            expected = 2 if search.origin in ("FLN", "GRU") and search.destination in ("FLN", "GRU") else 1
            failed += expected
            continue

        for airline_display, airline_match in AIRLINES:
            # GIG só tem Gol
            if "GIG" in (search.origin, search.destination) and airline_display == "Latam":
                continue

            price = best_price_for_airline(results, airline_match)
            log.info(f"  {airline_display}: {'R$ {:,.2f}'.format(price) if price else 'não encontrado'}")

            if price is None:
                failed += 1
                continue

            key = (airline_display, search.origin, search.destination, search.trip_type)
            prices[key] = price

            # salva one-way (outbound ou return)
            if search.trip_type == "outbound":
                ok = upsert(airline_display, search.origin, search.destination, "outbound", price, None)
            else:
                # return: origin/destination no banco seguem a direção do voo de ida
                ok = upsert(airline_display, search.destination, search.origin, "return", None, price)

            if ok:
                success += 1
            else:
                failed += 1

    # ── round_trip derivado ──────────────────────────────────────────────────────
    round_trip_combos = [
        ("Gol",   "FLN", "GRU"),
        ("Latam", "FLN", "GRU"),
        ("Gol",   "FLN", "GIG"),
    ]

    for airline, out_orig, out_dest in round_trip_combos:
        price_out  = prices.get((airline, out_orig, out_dest, "outbound"))
        price_back = prices.get((airline, out_dest, out_orig, "return"))

        if price_out is None and price_back is None:
            log.warning(f"  round_trip {airline} {out_orig}↔{out_dest}: nenhum preço, pulando.")
            failed += 1
            continue

        ok = upsert(airline, out_orig, out_dest, "round_trip", price_out, price_back)
        if ok:
            success += 1
        else:
            failed += 1

    log.info(f"=== Concluído: {success} salvos, {failed} falhas ===")
    if failed > 0 and success == 0:
        sys.exit(1)


if __name__ == "__main__":
    main()

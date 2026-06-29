"""
fetch_domestic.py
Busca tarifas domésticas via Skyscanner RapidAPI e salva no Supabase.
Roda via GitHub Actions seg–sáb às 10:00 UTC (07:00 Brasília).

Datas configuradas via GitHub Actions vars:
  DOMESTIC_DATE_OUT  — dia de saída de FLN (ex: 2026-11-18)
  DOMESTIC_DATE_BACK — dia de volta para FLN (ex: 2026-11-29)

6 pesquisas one-way por dia + round_trip derivado:
  FLN→GRU  Gol   (outbound)
  FLN→GRU  Latam (outbound)
  FLN→GIG  Gol   (outbound)
  GRU→FLN  Gol   (return)
  GRU→FLN  Latam (return)
  GIG→FLN  Gol   (return)
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

SUPABASE_URL    = os.environ["SUPABASE_URL"]
SUPABASE_KEY    = os.environ["SUPABASE_KEY"]
RAPIDAPI_KEY    = os.environ["RAPIDAPI_KEY"]

DATE_OUT  = os.environ["DOMESTIC_DATE_OUT"]   # saída de FLN
DATE_BACK = os.environ["DOMESTIC_DATE_BACK"]  # volta para FLN

SUPABASE_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates,return=minimal",
}

SKYSCANNER_URL  = "https://skyscanner-flights4.p.rapidapi.com/api/v1/search"
SKYSCANNER_HEADERS = {
    "x-rapidapi-key":  RAPIDAPI_KEY,
    "x-rapidapi-host": "skyscanner-flights4.p.rapidapi.com",
}


@dataclass
class OneWayRoute:
    airline_display: str   # 'Gol' ou 'Latam'
    airline_match: str     # substring para filtrar carrier name
    origin: str
    destination: str
    date: str
    trip_type: str         # 'outbound' ou 'return'


def build_routes() -> list[OneWayRoute]:
    return [
        OneWayRoute("Gol",   "GOL",   "FLN", "GRU", DATE_OUT,  "outbound"),
        OneWayRoute("Latam", "LATAM", "FLN", "GRU", DATE_OUT,  "outbound"),
        OneWayRoute("Gol",   "GOL",   "FLN", "GIG", DATE_OUT,  "outbound"),
        OneWayRoute("Gol",   "GOL",   "GRU", "FLN", DATE_BACK, "return"),
        OneWayRoute("Latam", "LATAM", "GRU", "FLN", DATE_BACK, "return"),
        OneWayRoute("Gol",   "GOL",   "GIG", "FLN", DATE_BACK, "return"),
    ]


def fetch_best_price(route: OneWayRoute) -> float | None:
    label = f"{route.airline_display} {route.origin}→{route.destination} ({route.trip_type})"
    log.info(f"Buscando {label} ...")

    params = {
        "origin":      route.origin,
        "destination": route.destination,
        "date":        route.date,
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
    except Exception as e:
        log.warning(f"  Erro na requisição: {e}")
        return None

    try:
        data = resp.json()
    except Exception:
        log.warning(f"  Resposta não é JSON: {resp.text[:500]}")
        return None

    if not data.get("success"):
        log.warning(f"  API retornou erro: {data}")
        return None

    results = data.get("results", [])
    if not results:
        log.warning(f"  Nenhuma oferta recebida.")
        return None

    log.info(f"  {len(results)} oferta(s) recebida(s).")

    def is_direct(result: dict) -> bool:
        legs = result.get("legs", [])
        return bool(legs) and legs[0].get("stops", 1) == 0

    def is_target_airline(result: dict) -> bool:
        carriers = result.get("carriers", [])
        return any(route.airline_match in c.upper() for c in carriers)

    matching = [
        r for r in results
        if is_direct(r) and is_target_airline(r)
    ]

    if not matching:
        all_carriers = {c for r in results for c in r.get("carriers", [])}
        direct_count = sum(1 for r in results if is_direct(r))
        log.warning(
            f"  '{route.airline_match}' não encontrada (direto). "
            f"Diretos: {direct_count}/{len(results)}. "
            f"Carriers: {all_carriers}"
        )
        return None

    best = min(matching, key=lambda r: r.get("price_raw", float("inf")))
    price = best.get("price_raw")
    if price is None:
        log.warning(f"  Oferta sem price_raw: {best}")
        return None

    price = float(price)
    log.info(f"  Melhor preço direto: R$ {price:,.2f}")
    return price


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
    label = f"{airline} {origin}↔{destination} [{trip_type}]"

    try:
        resp = httpx.post(
            f"{SUPABASE_URL}/rest/v1/domestic_prices_auto",
            headers=SUPABASE_HEADERS,
            json=payload,
            params={"on_conflict": "date,airline,origin,destination,trip_type"},
            timeout=15,
        )
        if resp.status_code in (200, 201):
            total = (price_out or 0) + (price_back or 0)
            log.info(f"  Salvo {label}: R$ {total:,.2f}")
            return True
        log.error(f"  Supabase {resp.status_code}: {resp.text}")
        return False
    except Exception as e:
        log.error(f"  Erro ao salvar: {e}")
        return False


def main():
    log.info(f"=== Doméstico — {date.today().isoformat()} | saída {DATE_OUT} volta {DATE_BACK} ===")

    routes = build_routes()
    prices: dict[tuple[str, str, str], float] = {}  # (airline, origin→dest key, trip_type) → price

    success, failed = 0, 0

    # ── one-way searches ────────────────────────────────────────────────────────
    for route in routes:
        price = fetch_best_price(route)
        if price is None:
            failed += 1
            continue

        key = (route.airline_display, route.origin, route.destination, route.trip_type)
        prices[key] = price

        # For DB: outbound → origin=route.origin, dest=route.destination, price_out=price
        #         return   → origin=route.destination, dest=route.origin, price_back=price
        # (convention: origin/destination represent the outbound direction, GRU/FLN)
        if route.trip_type == "outbound":
            ok = upsert(route.airline_display, route.origin, route.destination, "outbound", price, None)
        else:  # return
            ok = upsert(route.airline_display, route.destination, route.origin, "return", None, price)

        if ok:
            success += 1
        else:
            failed += 1

    # ── round_trip derived from outbound + return ────────────────────────────────
    round_trip_combos = [
        ("Gol",   "FLN", "GRU"),
        ("Latam", "FLN", "GRU"),
        ("Gol",   "FLN", "GIG"),
    ]

    for airline, out_orig, out_dest in round_trip_combos:
        out_key  = (airline, out_orig, out_dest, "outbound")
        back_key = (airline, out_dest, out_orig, "return")

        price_out  = prices.get(out_key)
        price_back = prices.get(back_key)

        if price_out is None and price_back is None:
            log.warning(f"  round_trip {airline} {out_orig}↔{out_dest}: nenhum preço disponível, pulando.")
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

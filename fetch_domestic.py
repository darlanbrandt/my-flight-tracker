"""
fetch_domestic.py
Busca tarifas domésticas e salva no Supabase.
Roda via GitHub Actions seg–sáb às 10:00 UTC (07:00 Brasília).

Datas configuradas via GitHub Actions vars:
  DOMESTIC_DATE_OUT  — dia de saída de FLN (ex: 2026-11-18)
  DOMESTIC_DATE_BACK — dia de volta para FLN (ex: 2026-11-29)

7 buscas por dia:
  RapidAPI (one-way, 4 buscas):
    FLN→GRU  outbound → Gol + Latam
    FLN→GIG  outbound → Gol
    GRU→FLN  return   → Gol + Latam
    GIG→FLN  return   → Gol
  Talordata (round_trip, 3 buscas):
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
RAPIDAPI_KEY    = os.environ.get("RAPIDAPI_KEY", "")
TALORDATA_TOKEN = os.environ.get("TALORDATA_TOKEN", "")

DATE_OUT  = os.environ["DOMESTIC_DATE_OUT"]
DATE_BACK = os.environ["DOMESTIC_DATE_BACK"]

# Controle de quais partes rodam (default: ambas)
RUN_ONEWAY     = os.environ.get("RUN_ONEWAY",     "true").lower() == "true"
RUN_ROUNDTRIP  = os.environ.get("RUN_ROUNDTRIP",  "true").lower() == "true"

SUPABASE_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates,return=minimal",
}

SKYSCANNER_URL     = "https://skyscanner-flights4.p.rapidapi.com/api/v1/search"
SKYSCANNER_HEADERS = {
    "x-rapidapi-key":  RAPIDAPI_KEY,
    "x-rapidapi-host": "skyscanner-flights4.p.rapidapi.com",
}

TALORDATA_URL     = "https://serpapi.talordata.net/serp/v1/request"
TALORDATA_HEADERS = {
    "Authorization": f"Bearer {TALORDATA_TOKEN}",
    "Content-Type": "application/x-www-form-urlencoded",
}

# ── RapidAPI one-way ──────────────────────────────────────────────────────────

@dataclass
class OneWaySearch:
    origin: str
    destination: str
    date: str
    trip_type: str   # 'outbound' ou 'return'


def build_oneway_searches() -> list[OneWaySearch]:
    return [
        OneWaySearch("FLN", "GRU", DATE_OUT,  "outbound"),
        OneWaySearch("FLN", "GIG", DATE_OUT,  "outbound"),
        OneWaySearch("GRU", "FLN", DATE_BACK, "return"),
        OneWaySearch("GIG", "FLN", DATE_BACK, "return"),
    ]


ONEWAY_AIRLINES = [
    ("Gol",   "GOL"),
    ("Latam", "LATAM"),
]


def fetch_oneway_results(search: OneWaySearch) -> list[dict]:
    log.info(f"[RapidAPI] {search.origin}→{search.destination} ({search.trip_type}) ...")
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


def best_oneway_price(results: list[dict], airline_match: str) -> float | None:
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
            f"  '{airline_match}' não encontrada (direto). "
            f"Diretos: {direct_count}/{len(results)}. Carriers: {all_carriers}"
        )
        return None

    best = min(matching, key=lambda r: r.get("price_raw", float("inf")))
    price = best.get("price_raw")
    if price is None:
        log.warning(f"  Oferta sem price_raw: {best}")
        return None
    return float(price)


# ── Talordata round_trip ───────────────────────────────────────────────────────

@dataclass
class RoundTripRoute:
    airline_display: str
    airline_match: str
    search_origin: str
    search_dest: str


ROUNDTRIP_ROUTES: list[RoundTripRoute] = [
    RoundTripRoute("Gol",   "Gol",   "FLN", "GRU"),
    RoundTripRoute("Latam", "LATAM", "FLN", "GRU"),
    RoundTripRoute("Gol",   "Gol",   "FLN", "GIG"),
]


def fetch_roundtrip_price(route: RoundTripRoute) -> float | None:
    log.info(f"[Talordata] {route.airline_display} FLN↔{route.search_dest} (round_trip) ...")
    form: dict = {
        "engine":        "google_flights",
        "departure_id":  route.search_origin,
        "arrival_id":    route.search_dest,
        "outbound_date": DATE_OUT,
        "return_date":   DATE_BACK,
        "type":          "1",
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
        data = resp.json()
    except Exception as e:
        log.warning(f"  Erro na requisição: {e}")
        return None

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
        clean = str(raw).replace("R$", "").replace("$", "").replace(".", "").replace(",", ".").strip()
        try:
            return float(clean)
        except ValueError:
            return None

    target_offers = [o for o in all_offers if is_target(o)]
    matching = [(o, parse_price(o)) for o in target_offers]
    matching = [(o, p) for o, p in matching if p is not None]

    if not matching:
        if target_offers:
            log.warning(f"  '{route.airline_match}' encontrada mas sem preço.")
        else:
            found = {leg.get("airline", "?") for o in all_offers for leg in o.get("flight", [])}
            log.warning(f"  '{route.airline_match}' não encontrada. Disponíveis: {found}")
        return None

    _, price = min(matching, key=lambda x: x[1])
    log.info(f"  Melhor preço: R$ {price:,.2f}")
    return price


# ── Supabase upsert ───────────────────────────────────────────────────────────

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

    try:
        resp = httpx.post(
            f"{SUPABASE_URL}/rest/v1/domestic_prices_auto",
            headers=SUPABASE_HEADERS,
            json=payload,
            params={"on_conflict": "date,airline,origin,destination,trip_type"},
            timeout=15,
        )
        if resp.status_code in (200, 201):
            log.info(f"  Salvo {airline} {origin}↔{destination} [{trip_type}]: R$ {total:,.2f}")
            return True
        log.error(f"  Supabase {resp.status_code}: {resp.text}")
        return False
    except Exception as e:
        log.error(f"  Erro ao salvar: {e}")
        return False


# ── main ──────────────────────────────────────────────────────────────────────

def main():
    log.info(f"=== Doméstico — {date.today().isoformat()} | saída {DATE_OUT} volta {DATE_BACK} ===")

    success, failed = 0, 0

    # ── RapidAPI: outbound + return ───────────────────────────────────────────
    if RUN_ONEWAY:
        log.info("--- One-way (RapidAPI) ---")
        for search in build_oneway_searches():
            results = fetch_oneway_results(search)
            if not results:
                expected = 2 if "GIG" not in (search.origin, search.destination) else 1
                failed += expected
                continue

            for airline_display, airline_match in ONEWAY_AIRLINES:
                if "GIG" in (search.origin, search.destination) and airline_display == "Latam":
                    continue

                price = best_oneway_price(results, airline_match)
                log.info(f"  {airline_display}: {'R$ {:,.2f}'.format(price) if price else 'não encontrado'}")

                if price is None:
                    failed += 1
                    continue

                if search.trip_type == "outbound":
                    ok = upsert(airline_display, search.origin, search.destination, "outbound", price, None)
                else:
                    ok = upsert(airline_display, search.destination, search.origin, "return", None, price)

                if ok:
                    success += 1
                else:
                    failed += 1
    else:
        log.info("--- One-way (RapidAPI) ignorado ---")

    # ── Talordata: round_trip ─────────────────────────────────────────────────
    if RUN_ROUNDTRIP:
        log.info("--- Round-trip (Talordata) ---")
        for route in ROUNDTRIP_ROUTES:
            price = fetch_roundtrip_price(route)
            if price is None:
                failed += 1
                continue

            half = round(price / 2, 2)
            ok = upsert(route.airline_display, route.search_origin, route.search_dest, "round_trip", half, round(price - half, 2))
            if ok:
                success += 1
            else:
                failed += 1
    else:
        log.info("--- Round-trip (Talordata) ignorado ---")

    log.info(f"=== Concluído: {success} salvos, {failed} falhas ===")
    if failed > 0 and success == 0:
        sys.exit(1)


if __name__ == "__main__":
    main()

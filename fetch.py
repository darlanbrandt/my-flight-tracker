"""
fetch.py — automação única de preços (v2.0).

Lê as buscas ativas em tracked_searches (com as datas vindas de trips)
e salva os resultados na tabela prices com source='auto'.

Uso:
  python fetch.py --api talordata           # só buscas do Talordata
  python fetch.py --api serpapi,rapidapi    # múltiplas APIs
  python fetch.py                           # todas

Buscas com a mesma requisição (mesma rota/data/API) são feitas uma única
vez e reaproveitadas entre companhias.
"""

import os
import re
import sys
import json
import logging
import argparse
from datetime import date

import httpx

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

SUPABASE_URL    = os.environ["SUPABASE_URL"]
SUPABASE_KEY    = os.environ["SUPABASE_KEY"]
SERPAPI_KEY     = os.environ.get("SERPAPI_KEY", "")
TALORDATA_TOKEN = os.environ.get("TALORDATA_TOKEN", "")
RAPIDAPI_KEY    = os.environ.get("RAPIDAPI_KEY", "")

SUPABASE_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates,return=minimal",
}

SERPAPI_URL       = "https://serpapi.com/search.json"
TALORDATA_URL     = "https://serpapi.talordata.net/serp/v1/request"
TALORDATA_HEADERS = {
    "Authorization": f"Bearer {TALORDATA_TOKEN}",
    "Content-Type": "application/x-www-form-urlencoded",
}
SKYSCANNER_URL     = "https://skyscanner-flights4.p.rapidapi.com/api/v1/search"
SKYSCANNER_HEADERS = {
    "x-rapidapi-key":  RAPIDAPI_KEY,
    "x-rapidapi-host": "skyscanner-flights4.p.rapidapi.com",
}

# Cache de respostas por requisição — companhias na mesma rota reaproveitam
_cache: dict[tuple, list | None] = {}


# ── Config (Supabase) ─────────────────────────────────────────────────────────

def load_searches(apis: list[str] | None) -> list[dict]:
    params = {
        "select": "*,trip:trips(*)",
        "active": "is.true",
        "order":  "trip_id,id",
    }
    if apis:
        params["api"] = f"in.({','.join(apis)})"

    resp = httpx.get(
        f"{SUPABASE_URL}/rest/v1/tracked_searches",
        headers=SUPABASE_HEADERS, params=params, timeout=15,
    )
    resp.raise_for_status()
    return resp.json()


# ── Helpers de parsing ────────────────────────────────────────────────────────

def parse_price_str(raw) -> float | None:
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        return float(raw)
    clean = str(raw).replace("R$", "").replace("$", "").replace(".", "").replace(",", ".").strip()
    try:
        return float(clean)
    except ValueError:
        return None


def leg_hour(leg: dict) -> int | None:
    t = str(leg.get("departure_airport", {}).get("time", ""))
    m = re.search(r"(\d{1,2}):\d{2}", t)
    return int(m.group(1)) if m else None


def within_times(offer: dict, leg_key: str, times: str | None) -> bool:
    """Confere localmente o horário da ida (a API pode ignorar outbound_times)."""
    if not times:
        return True
    legs = offer.get(leg_key, [])
    if not legs:
        return True
    hour = leg_hour(legs[0])
    if hour is None:
        return True
    parts = times.split(",")
    start, end = int(parts[0]), int(parts[1])
    return start <= hour <= end


# ── Handlers por API ──────────────────────────────────────────────────────────

def google_offers(payload: dict) -> list[dict]:
    return (
        payload.get("best_flights", []) +
        payload.get("other_flights", []) +
        payload.get("other_departing_flights", [])
    )


def fetch_serpapi(s: dict, trip: dict) -> list[dict] | None:
    key = ("serpapi", s["origin"], s["destination"], trip["date_out"], trip["date_back"], s["max_stops"])
    if key in _cache:
        return _cache[key]

    log.info(f"  [SerpAPI] {s['origin']}↔{s['destination']} {trip['date_out']} → {trip['date_back']}")
    try:
        resp = httpx.get(SERPAPI_URL, params={
            "engine":        "google_flights",
            "departure_id":  s["origin"],
            "arrival_id":    s["destination"],
            "outbound_date": trip["date_out"],
            "return_date":   trip["date_back"],
            "type":          "1",
            "currency":      "BRL",
            "hl":            "en",
            "max_stops":     str(s["max_stops"]),
            "api_key":       SERPAPI_KEY,
        }, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        log.warning(f"    Erro na requisição: {e}")
        _cache[key] = None
        return None

    if "error" in data:
        log.warning(f"    Erro da API: {data['error']}")
        _cache[key] = None
        return None

    offers = google_offers(data)
    log.info(f"    {len(offers)} oferta(s).")
    _cache[key] = offers
    return offers


def fetch_talordata(s: dict, trip: dict) -> list[dict] | None:
    key = ("talordata", s["origin"], s["destination"], trip["date_out"], trip["date_back"],
           s["max_stops"], s.get("outbound_times"), s.get("return_times"))
    if key in _cache:
        return _cache[key]

    log.info(f"  [Talordata] {s['origin']}↔{s['destination']} {trip['date_out']} → {trip['date_back']}")
    form = {
        "engine":        "google_flights",
        "departure_id":  s["origin"],
        "arrival_id":    s["destination"],
        "outbound_date": trip["date_out"],
        "return_date":   trip["date_back"],
        "type":          "1",
        "currency":      "BRL",
        "hl":            "pt",
        "gl":            "br",
        "google_domain": "google.com.br",
        "max_stops":     str(s["max_stops"]),
        "json":          "1",
    }
    if s.get("outbound_times"):
        form["outbound_times"] = s["outbound_times"]
    if s.get("return_times"):
        form["return_times"] = s["return_times"]

    try:
        resp = httpx.post(TALORDATA_URL, headers=TALORDATA_HEADERS, data=form, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        log.warning(f"    Erro na requisição: {e}")
        _cache[key] = None
        return None

    payload = data.get("data", data)   # envelope {"code":0,"data":{...}}
    if "error" in payload:
        log.warning(f"    Erro da API: {payload['error']}")
        _cache[key] = None
        return None

    offers = google_offers(payload)
    if not offers:
        log.warning(f"    Nenhuma oferta. Resposta: {json.dumps(data, ensure_ascii=False)[:500]}")
    else:
        log.info(f"    {len(offers)} oferta(s).")
    _cache[key] = offers or None
    return _cache[key]


def fetch_rapidapi(s: dict, trip: dict) -> list[dict] | None:
    # one-way: return inverte a direção e usa a data de volta
    if s["trip_type"] == "return":
        origin, dest, day = s["destination"], s["origin"], trip["date_back"]
    else:
        origin, dest, day = s["origin"], s["destination"], trip["date_out"]

    key = ("rapidapi", origin, dest, day)
    if key in _cache:
        return _cache[key]

    log.info(f"  [RapidAPI] {origin}→{dest} {day}")
    try:
        resp = httpx.get(SKYSCANNER_URL, headers=SKYSCANNER_HEADERS, params={
            "origin":      origin,
            "destination": dest,
            "date":        day,
            "limit":       "20",
            "adults":      "1",
            "currency":    "BRL",
            "cabin":       "economy",
            "market":      "BR",
            "locale":      "pt-BR",
        }, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        log.warning(f"    Erro na requisição: {e}")
        _cache[key] = None
        return None

    if not data.get("success"):
        log.warning(f"    API retornou erro: {data}")
        _cache[key] = None
        return None

    results = data.get("results", [])
    log.info(f"    {len(results)} oferta(s).")
    _cache[key] = results
    return results


# ── Extração do melhor preço ──────────────────────────────────────────────────

def best_price_google(offers: list[dict], s: dict, leg_key: str) -> float | None:
    match = s["airline_match"].lower()

    def is_target(o: dict) -> bool:
        return any(match in leg.get("airline", "").lower() for leg in o.get(leg_key, []))

    target = [o for o in offers if is_target(o)]
    valid  = [o for o in target if within_times(o, leg_key, s.get("outbound_times"))]

    dropped = len(target) - len(valid)
    if dropped:
        log.info(f"    {dropped} oferta(s) descartada(s) por horário da ida.")

    prices = [p for p in (parse_price_str(o.get("price")) for o in valid) if p is not None]
    if not prices:
        if target:
            log.warning(f"    '{s['airline_match']}' encontrada mas sem oferta válida.")
        else:
            found = {leg.get("airline", "?") for o in offers for leg in o.get(leg_key, [])}
            log.warning(f"    '{s['airline_match']}' não encontrada. Disponíveis: {found}")
        return None
    return min(prices)


def best_price_rapidapi(results: list[dict], s: dict) -> float | None:
    match = s["airline_match"].upper()

    def ok(r: dict) -> bool:
        legs = r.get("legs", [])
        direct_ok  = bool(legs) and legs[0].get("stops", 99) <= s["max_stops"]
        airline_ok = any(match in c.upper() for c in r.get("carriers", []))
        return direct_ok and airline_ok

    prices = [r.get("price_raw") for r in results if ok(r)]
    prices = [float(p) for p in prices if p is not None]
    if not prices:
        found = {c for r in results for c in r.get("carriers", [])}
        log.warning(f"    '{s['airline_match']}' não encontrada (max_stops={s['max_stops']}). Carriers: {found}")
        return None
    return min(prices)


# ── Persistência ──────────────────────────────────────────────────────────────

def upsert(s: dict, price: float) -> bool:
    trip_type = s["trip_type"]
    if trip_type == "round_trip":
        half = round(price / 2, 2)
        price_out, price_back = half, round(price - half, 2)
    elif trip_type == "outbound":
        price_out, price_back = price, None
    else:
        price_out, price_back = None, price

    payload = {
        "trip_id":     s["trip_id"],
        "date":        date.today().isoformat(),
        "airline":     s["airline"],
        "origin":      s["origin"],
        "destination": s["destination"],
        "trip_type":   trip_type,
        "price_out":   price_out,
        "price_back":  price_back,
        "source":      "auto",
    }

    try:
        resp = httpx.post(
            f"{SUPABASE_URL}/rest/v1/prices",
            headers=SUPABASE_HEADERS,
            json=payload,
            params={"on_conflict": "trip_id,date,airline,origin,destination,trip_type,source"},
            timeout=15,
        )
        if resp.status_code in (200, 201):
            log.info(f"    Salvo {s['airline']} [{trip_type}]: R$ {price:,.2f}")
            return True
        log.error(f"    Supabase {resp.status_code}: {resp.text}")
        return False
    except Exception as e:
        log.error(f"    Erro ao salvar: {e}")
        return False


# ── main ──────────────────────────────────────────────────────────────────────

def run_search(s: dict) -> float | None:
    trip = s["trip"]
    if s["api"] == "serpapi":
        offers = fetch_serpapi(s, trip)
        return best_price_google(offers, s, "flights") if offers else None
    if s["api"] == "talordata":
        offers = fetch_talordata(s, trip)
        return best_price_google(offers, s, "flight") if offers else None
    if s["api"] == "rapidapi":
        results = fetch_rapidapi(s, trip)
        return best_price_rapidapi(results, s) if results else None
    log.warning(f"  API desconhecida: {s['api']}")
    return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", help="APIs a executar, separadas por vírgula (padrão: todas)")
    args = parser.parse_args()
    apis = [a.strip() for a in args.api.split(",")] if args.api else None

    log.info(f"=== fetch v2 — {date.today().isoformat()} | APIs: {apis or 'todas'} ===")

    try:
        searches = load_searches(apis)
    except Exception as e:
        log.error(f"Erro ao carregar tracked_searches: {e}")
        sys.exit(1)

    if not searches:
        log.warning("Nenhuma busca ativa encontrada.")
        return

    log.info(f"{len(searches)} busca(s) ativa(s).")
    success, failed = 0, 0

    for s in searches:
        trip = s["trip"]
        log.info(f"[{trip['name']} · {trip['period']}] {s['airline']} "
                 f"{s['origin']}↔{s['destination']} ({s['trip_type']}, {s['api']})")
        price = run_search(s)
        if price is None:
            failed += 1
            continue
        if upsert(s, price):
            success += 1
        else:
            failed += 1

    log.info(f"=== Concluído: {success} salvos, {failed} falhas ===")
    if failed > 0 and success == 0:
        sys.exit(1)


if __name__ == "__main__":
    main()

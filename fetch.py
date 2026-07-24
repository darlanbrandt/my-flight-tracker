"""
fetch.py — automação de preços via SerpAPI (v2.1).

Lê as buscas ativas em tracked_searches (com as datas vindas de trips)
e salva os resultados na tabela prices com source='auto'.

Uso:
  python fetch.py

Cada trip_type gera uma busca no Google Flights:
  outbound   → one-way (type=2), data de ida    da viagem
  return     → one-way (type=2), data de volta   da viagem (sentido invertido)
  round_trip → ida e volta (type=1), preço total do pacote

Janelas de horário por busca:
  outbound_times  filtra o horário de partida do voo pesquisado (ida da viagem,
                  ou o voo one-way de volta) — ex.: "0,12"
  return_times    filtra o horário de partida do trecho de volta no round_trip
                  — ex.: "18,23"

Buscas que resolvem para a mesma requisição (rota/data/tipo/janelas) são
feitas uma única vez e reaproveitadas entre companhias.
"""

import os
import re
import sys
import logging
from datetime import date

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

# Cache de respostas por requisição — companhias na mesma rota reaproveitam
_cache: dict[tuple, list | None] = {}


# ── Config (Supabase) ─────────────────────────────────────────────────────────

def load_searches() -> list[dict]:
    resp = httpx.get(
        f"{SUPABASE_URL}/rest/v1/tracked_searches",
        headers=SUPABASE_HEADERS,
        params={
            "select": "*,trip:trips(*)",
            "active": "is.true",
            "api":    "eq.serpapi",
            "order":  "trip_id,id",
        },
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()


# ── Helpers ───────────────────────────────────────────────────────────────────

def parse_price(raw) -> float | None:
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


def within_times(offer: dict, times: str | None) -> bool:
    """Confere localmente o horário de partida (a API pode ignorar o parâmetro)."""
    if not times:
        return True
    legs = offer.get("flights", [])
    if not legs:
        return True
    hour = leg_hour(legs[0])
    if hour is None:
        return True
    start, end = (int(x) for x in times.split(",")[:2])
    return start <= hour <= end


# ── SerpAPI ───────────────────────────────────────────────────────────────────

def fetch_serpapi(s: dict, trip: dict) -> list[dict] | None:
    trip_type = s["trip_type"]

    if trip_type == "round_trip":
        dep, arr, day, ret = s["origin"], s["destination"], trip["date_out"], trip["date_back"]
        flight_type = "1"
    elif trip_type == "return":
        # voo só de volta: parte do destino de volta à origem, na data de volta
        dep, arr, day, ret = s["destination"], s["origin"], trip["date_back"], None
        flight_type = "2"
    else:  # outbound
        dep, arr, day, ret = s["origin"], s["destination"], trip["date_out"], None
        flight_type = "2"

    key = ("serpapi", dep, arr, day, ret, s["max_stops"],
           s.get("outbound_times"), s.get("return_times"))
    if key in _cache:
        return _cache[key]

    log.info(f"  [SerpAPI] {dep}→{arr} {day}"
             + (f" ⇆ {ret}" if ret else "")
             + f" (type={flight_type}, max_stops={s['max_stops']})")

    params = {
        "engine":        "google_flights",
        "departure_id":  dep,
        "arrival_id":    arr,
        "outbound_date": day,
        "type":          flight_type,
        "currency":      "BRL",
        "hl":            "pt",
        "gl":            "br",
        "deep_search":   "true",
        "max_stops":     str(s["max_stops"]),
        "api_key":       SERPAPI_KEY,
    }
    if flight_type == "1":
        params["return_date"] = ret
        if s.get("return_times"):
            params["return_times"] = s["return_times"]
    if s.get("outbound_times"):
        params["outbound_times"] = s["outbound_times"]

    # round_trip (type=1, deep_search) é bem mais lento — timeout maior + retry
    attempts = 3 if flight_type == "1" else 2
    timeout  = 90 if flight_type == "1" else 45
    data = None
    for attempt in range(1, attempts + 1):
        try:
            resp = httpx.get(SERPAPI_URL, params=params, timeout=timeout)
            resp.raise_for_status()
            data = resp.json()
            break
        except Exception as e:
            log.warning(f"    Tentativa {attempt}/{attempts} falhou: {e}")
    if data is None:
        _cache[key] = None
        return None

    if "error" in data:
        log.warning(f"    Erro da API: {data['error']}")
        _cache[key] = None
        return None

    offers = data.get("best_flights", []) + data.get("other_flights", [])
    log.info(f"    {len(offers)} oferta(s).")
    _cache[key] = offers
    return offers


def best_price(offers: list[dict], s: dict) -> float | None:
    match = s["airline_match"].lower()
    nonstop_only = s["max_stops"] == 0

    def is_target(o: dict) -> bool:
        legs = o.get("flights", [])
        if nonstop_only and len(legs) != 1:      # voo direto = 1 segmento na ida
            return False
        return any(match in leg.get("airline", "").lower() for leg in legs)

    target = [o for o in offers if is_target(o)]
    valid  = [o for o in target if within_times(o, s.get("outbound_times"))]

    dropped = len(target) - len(valid)
    if dropped:
        log.info(f"    {dropped} oferta(s) fora da janela de horário.")

    prices = [p for p in (parse_price(o.get("price")) for o in valid) if p is not None]
    if not prices:
        if target:
            log.warning(f"    '{s['airline_match']}' encontrada mas sem oferta válida.")
        else:
            found = {leg.get("airline", "?") for o in offers for leg in o.get("flights", [])}
            log.warning(f"    '{s['airline_match']}' não encontrada. Disponíveis: {found}")
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
        "trip_id":      s["trip_id"],
        "date":         date.today().isoformat(),
        "airline":      s["airline"],
        "origin":       s["origin"],
        "destination":  s["destination"],
        "trip_type":    trip_type,
        "price_out":    price_out,
        "price_back":   price_back,
        "source":       "auto",
        "payment_type": "cash",
        "program":      "",
    }

    try:
        resp = httpx.post(
            f"{SUPABASE_URL}/rest/v1/prices",
            headers=SUPABASE_HEADERS,
            json=payload,
            params={"on_conflict": "trip_id,date,airline,origin,destination,trip_type,source,payment_type,program"},
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

def main():
    log.info(f"=== fetch — {date.today().isoformat()} ===")

    try:
        searches = load_searches()
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
                 f"{s['origin']}↔{s['destination']} ({s['trip_type']})")
        offers = fetch_serpapi(s, trip)
        price = best_price(offers, s) if offers else None
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

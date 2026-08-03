"""
fetch.py — acompanhamento automático dinâmico via SerpAPI (v3).

Não usa mais tracked_searches. A tarefa lê a ÚNICA viagem marcada com
auto_track=true (origem/destino/datas vêm da própria viagem) e faz três
buscas no Google Flights, salvando o melhor preço POR COMPANHIA:

  outbound   → one-way origem→destino na data de ida
  return     → one-way destino→origem na data de volta
  round_trip → ida e volta (preço total do pacote, dividido 50/50)

Se nenhuma viagem estiver marcada (ex: foi excluída), a tarefa não faz nada.
Roda diariamente; grava em prices com source='auto'.
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


def norm_airline(name: str) -> str:
    n = name.lower()
    for key, canon in [
        ("gol", "Gol"), ("latam", "Latam"), ("azul", "Azul"), ("american", "American"),
        ("delta", "Delta"), ("united", "United"), ("copa", "Copa"), ("avianca", "Avianca"),
        ("aeromexico", "Aeroméxico"), ("aeroméxico", "Aeroméxico"), ("sky", "Sky"),
        ("jetsmart", "JetSmart"), ("arajet", "Arajet"), ("iberia", "Iberia"),
        ("tap", "TAP"), ("air france", "Air France"), ("klm", "KLM"),
        ("egyptair", "EgyptAir"), ("air canada", "Air Canada"), ("lufthansa", "Lufthansa"),
    ]:
        if key in n:
            return canon
    return name


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


def load_auto_trip() -> dict | None:
    resp = httpx.get(
        f"{SUPABASE_URL}/rest/v1/trips",
        headers=SUPABASE_HEADERS,
        params={"select": "*", "auto_track": "is.true", "limit": "1"},
        timeout=15,
    )
    resp.raise_for_status()
    rows = resp.json()
    return rows[0] if rows else None


def serpapi_search(dep: str, arr: str, day: str, ret: str | None, max_stops: int,
                   out_times: str | None = None, ret_times: str | None = None) -> list[dict]:
    flight_type = "1" if ret else "2"
    label = f"{dep}→{arr} {day}" + (f" ⇆ {ret}" if ret else "")
    log.info(f"  [SerpAPI] {label} (type={flight_type}, max_stops={max_stops})")

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
        "max_stops":     str(max_stops),
        "api_key":       SERPAPI_KEY,
    }
    if ret:
        params["return_date"] = ret
    if out_times:
        params["outbound_times"] = out_times
    if ret and ret_times:
        params["return_times"] = ret_times

    attempts = 3 if flight_type == "1" else 2
    timeout  = 90 if flight_type == "1" else 45
    for attempt in range(1, attempts + 1):
        try:
            resp = httpx.get(SERPAPI_URL, params=params, timeout=timeout)
            resp.raise_for_status()
            data = resp.json()
            if "error" in data:
                log.warning(f"    Erro da API: {data['error']}")
                return []
            offers = data.get("best_flights", []) + data.get("other_flights", [])
            log.info(f"    {len(offers)} oferta(s).")
            return offers
        except Exception as e:
            log.warning(f"    Tentativa {attempt}/{attempts} falhou: {e}")
    return []


def best_by_airline(offers: list[dict], nonstop: bool, local_times: str | None = None) -> dict[str, float]:
    groups: dict[str, float] = {}
    for o in offers:
        legs = o.get("flights", [])
        if nonstop and len(legs) != 1:      # voo direto = 1 segmento
            continue
        if not within_times(o, local_times):
            continue
        price = parse_price(o.get("price"))
        if price is None:
            continue
        names = dict.fromkeys(norm_airline(l.get("airline", "")) for l in legs if l.get("airline"))
        label = " + ".join(names) if names else "?"
        if label not in groups or price < groups[label]:
            groups[label] = price
    return groups


def upsert(trip_id: int, airline: str, origin: str, destination: str,
           trip_type: str, price_out, price_back) -> bool:
    payload = {
        "trip_id":      trip_id,
        "date":         date.today().isoformat(),
        "airline":      airline,
        "origin":       origin,
        "destination":  destination,
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
            headers=SUPABASE_HEADERS, json=payload,
            params={"on_conflict": "trip_id,date,airline,origin,destination,trip_type,source,payment_type,program"},
            timeout=15,
        )
        if resp.status_code in (200, 201):
            return True
        log.error(f"    Supabase {resp.status_code}: {resp.text}")
        return False
    except Exception as e:
        log.error(f"    Erro ao salvar: {e}")
        return False


def main():
    log.info(f"=== fetch auto — {date.today().isoformat()} ===")

    try:
        trip = load_auto_trip()
    except Exception as e:
        log.error(f"Erro ao carregar viagem: {e}")
        sys.exit(1)

    if not trip:
        log.info("Nenhuma viagem com acompanhamento automático ativo. Nada a fazer.")
        return

    origin = (trip.get("track_origin") or "").upper()
    dest   = (trip.get("track_destination") or "").upper()
    if not origin or not dest:
        log.warning(f"Viagem '{trip['name']}' marcada mas sem origem/destino. Pulando.")
        return

    nonstop   = trip.get("track_nonstop", True)
    max_stops = 0 if nonstop else 2
    do, db    = trip["date_out"], trip["date_back"]
    tid       = trip["id"]
    out_win   = trip.get("track_outbound_times") or None   # ex: '6,12' (saída da ida)
    ret_win   = trip.get("track_return_times") or None     # ex: '12,18' (saída da volta)

    log.info(f"Viagem: {trip['name']} · {origin}⇄{dest} · {do} → {db} · "
             f"{'diretos' if nonstop else 'com escalas'}"
             + (f" · ida {out_win}h" if out_win else "")
             + (f" · volta {ret_win}h" if ret_win else ""))

    success = 0

    # ida (one-way) — filtra pela janela de saída da ida
    offers = serpapi_search(origin, dest, do, None, max_stops, out_times=out_win)
    for airline, price in best_by_airline(offers, nonstop, out_win).items():
        if upsert(tid, airline, origin, dest, "outbound", price, None):
            success += 1
            log.info(f"    Salvo {airline} [outbound]: R$ {price:,.2f}")

    # volta (one-way) — a "saída" desse voo é a janela da volta
    offers = serpapi_search(dest, origin, db, None, max_stops, out_times=ret_win)
    for airline, price in best_by_airline(offers, nonstop, ret_win).items():
        if upsert(tid, airline, origin, dest, "return", None, price):
            success += 1
            log.info(f"    Salvo {airline} [return]: R$ {price:,.2f}")

    # ida e volta (pacote) — janelas nos dois trechos; total dividido 50/50
    offers = serpapi_search(origin, dest, do, db, max_stops, out_times=out_win, ret_times=ret_win)
    for airline, price in best_by_airline(offers, nonstop, out_win).items():
        half = round(price / 2, 2)
        if upsert(tid, airline, origin, dest, "round_trip", half, round(price - half, 2)):
            success += 1
            log.info(f"    Salvo {airline} [round_trip]: R$ {price:,.2f}")

    log.info(f"=== Concluído: {success} registro(s) salvo(s) ===")


if __name__ == "__main__":
    main()

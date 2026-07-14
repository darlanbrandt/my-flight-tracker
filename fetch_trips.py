"""
fetch_trips.py
Viagens domésticas extras — FLN↔CGH via Talordata (round_trip),
salvas na tabela principal domestic_prices, separadas por trip_name.

Preferência de horário: ida pela manhã, volta à tarde/noite.
Além dos parâmetros outbound_times/return_times enviados à API,
ofertas cuja ida decola depois das 11:59 são descartadas localmente.

4 buscas por execução (2 viagens × Gol/Latam).
"""

import os
import re
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
class Trip:
    name: str        # trip_name no banco
    date_out: str
    date_back: str


TRIPS: list[Trip] = [
    Trip("sp_outubro",  "2026-10-10", "2026-10-11"),
    Trip("sp_novembro", "2026-10-31", "2026-11-02"),
]

ORIGIN = "FLN"
DEST   = "CGH"

OUTBOUND_TIMES = "4,11"    # ida: manhã (decolagem até 11:59)
RETURN_TIMES   = "12,23"   # volta: tarde/noite

AIRLINES = [
    ("Gol",   "Gol"),
    ("Latam", "LATAM"),
]


def departs_morning(offer: dict) -> bool:
    # Talordata pode ignorar outbound_times; confere a ida localmente
    legs = offer.get("flight", [])
    if not legs:
        return True
    t = str(legs[0].get("departure_airport", {}).get("time", ""))
    m = re.search(r"(\d{1,2}):\d{2}", t)
    return int(m.group(1)) <= 11 if m else True


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


def fetch_price(trip: Trip, airline_display: str, airline_match: str) -> float | None:
    log.info(f"[{trip.name}] {airline_display} {ORIGIN}↔{DEST} {trip.date_out} → {trip.date_back} ...")
    form: dict = {
        "engine":         "google_flights",
        "departure_id":   ORIGIN,
        "arrival_id":     DEST,
        "outbound_date":  trip.date_out,
        "return_date":    trip.date_back,
        "outbound_times": OUTBOUND_TIMES,
        "return_times":   RETURN_TIMES,
        "type":           "1",
        "currency":       "BRL",
        "hl":             "pt",
        "gl":             "br",
        "google_domain":  "google.com.br",
        "max_stops":      "0",
        "json":           "1",
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
            airline_match.lower() in leg.get("airline", "").lower()
            for leg in offer.get("flight", [])
        )

    target_offers = [o for o in all_offers if is_target(o)]
    morning_offers = [o for o in target_offers if departs_morning(o)]

    dropped = len(target_offers) - len(morning_offers)
    if dropped:
        log.info(f"  {dropped} oferta(s) descartada(s) por ida fora da manhã.")

    matching = [(o, parse_price(o)) for o in morning_offers]
    matching = [(o, p) for o, p in matching if p is not None]

    if not matching:
        if target_offers:
            log.warning(f"  '{airline_match}' encontrada mas sem oferta válida (manhã/preço).")
        else:
            found = {leg.get("airline", "?") for o in all_offers for leg in o.get("flight", [])}
            log.warning(f"  '{airline_match}' não encontrada. Disponíveis: {found}")
        return None

    _, price = min(matching, key=lambda x: x[1])
    log.info(f"  Melhor preço: R$ {price:,.2f}")
    return price


def upsert(trip: Trip, airline: str, price: float) -> bool:
    half = round(price / 2, 2)
    payload = {
        "date":        date.today().isoformat(),
        "trip_name":   trip.name,
        "airline":     airline,
        "origin":      ORIGIN,
        "destination": DEST,
        "trip_type":   "round_trip",
        "price_out":   half,
        "price_back":  round(price - half, 2),
    }

    try:
        resp = httpx.post(
            f"{SUPABASE_URL}/rest/v1/domestic_prices",
            headers=SUPABASE_HEADERS,
            json=payload,
            params={"on_conflict": "trip_name,date,airline,origin,destination,trip_type"},
            timeout=15,
        )
        if resp.status_code in (200, 201):
            log.info(f"  Salvo [{trip.name}] {airline}: R$ {price:,.2f}")
            return True
        log.error(f"  Supabase {resp.status_code}: {resp.text}")
        return False
    except Exception as e:
        log.error(f"  Erro ao salvar: {e}")
        return False


def main():
    log.info("=== Viagens extras FLN↔CGH ===")
    success, failed = 0, 0

    for trip in TRIPS:
        for airline_display, airline_match in AIRLINES:
            price = fetch_price(trip, airline_display, airline_match)
            if price is None:
                failed += 1
                continue
            if upsert(trip, airline_display, price):
                success += 1
            else:
                failed += 1

    log.info(f"=== Concluído: {success} salvos, {failed} falhas ===")
    if failed > 0 and success == 0:
        sys.exit(1)


if __name__ == "__main__":
    main()

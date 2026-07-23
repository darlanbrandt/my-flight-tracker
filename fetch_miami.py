"""
fetch_miami.py — monitoramento FLN ⇄ MIA via RapidAPI (Skyscanner).

O endpoint só faz busca one-way, então buscamos cada perna separadamente,
em datas flexíveis. Salvamos TODAS as companhias (uma linha por cia), cada
uma com seu melhor itinerário (preferindo ≤1 escala, com fallback).

Registros/dia na tabela prices (trip 9), source='auto':
  outbound   → melhor FLN→MIA por companhia (entre as datas de ida)
  return     → melhor MIA→FLN por companhia (entre as datas de volta)
  round_trip → ida + volta por companhia (quando a cia tem as duas pernas)

As observações trazem roteamento, escalas, horários, duração e data.
Roda seg–sáb às 06h Brasília. 4 requisições/dia.
"""

import os
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
RAPIDAPI_KEY = os.environ["RAPIDAPI_KEY"]

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

# ── Configuração da viagem ────────────────────────────────────────────────────
TRIP_ID      = 9
ORIGIN       = "FLN"
DEST         = "MIA"
DEPART_DATES = ["2027-01-24", "2027-01-25"]
RETURN_DATES = ["2027-02-12", "2027-02-13"]
MAX_STOPS    = 1


def norm_airline(name: str) -> str:
    n = name.lower()
    for key, canon in [
        ("gol", "Gol"), ("latam", "Latam"), ("azul", "Azul"), ("american", "American"),
        ("delta", "Delta"), ("united", "United"), ("copa", "Copa"), ("avianca", "Avianca"),
        ("aeromexico", "Aeroméxico"), ("aeroméxico", "Aeroméxico"), ("sky", "Sky"),
        ("jetsmart", "JetSmart"), ("arajet", "Arajet"), ("iberia", "Iberia"),
        ("tap", "TAP"), ("air france", "Air France"), ("klm", "KLM"),
    ]:
        if key in n:
            return canon
    return name


def carriers_label(r: dict) -> str:
    names = dict.fromkeys(norm_airline(c) for c in r.get("carriers", []) if c)
    return " + ".join(names) if names else "?"


def hm(iso: str) -> str:
    return iso[11:16] if len(iso) >= 16 else ""


def dur_str(mins) -> str:
    try:
        mins = int(mins)
    except (TypeError, ValueError):
        return ""
    return f"{mins // 60}h{mins % 60:02d}"


def brdate(iso: str) -> str:
    y, m, d = iso.split("-")
    return f"{d}/{m}"


def search_oneway(origin: str, dest: str, day: str) -> list[dict]:
    log.info(f"  [RapidAPI] {origin}→{dest} {day}")
    try:
        resp = httpx.get(SKYSCANNER_URL, headers=SKYSCANNER_HEADERS, params={
            "origin": origin, "destination": dest, "date": day,
            "limit": "30", "adults": "1", "currency": "BRL",
            "cabin": "economy", "market": "BR", "locale": "pt-BR",
        }, timeout=40)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        log.warning(f"    Erro na requisição: {e}")
        return []
    if not data.get("success"):
        log.warning(f"    API retornou erro: {str(data)[:300]}")
        return []
    return data.get("results", [])


def summarize(day: str, r: dict) -> dict | None:
    if r.get("price_raw") is None or not r.get("legs"):
        return None
    leg = r["legs"][0]
    segs = leg.get("segments", [])
    routing = "→".join([segs[0]["from"]] + [s["to"] for s in segs]) if segs else f"{ORIGIN}?{DEST}"
    return {
        "airline": carriers_label(r),
        "price":   float(r["price_raw"]),
        "stops":   leg.get("stops", 99),
        "routing": routing,
        "day":     day,
        "dep":     hm(str(leg.get("dep", ""))),
        "arr":     hm(str(leg.get("arr", ""))),
        "dur":     dur_str(leg.get("dur_min")),
    }


def note_of(s: dict) -> str:
    parts = [brdate(s["day"]), s["routing"], f"{s['stops']} escala(s)"]
    if s["dep"] and s["arr"]:
        parts.append(f"{s['dep']}→{s['arr']}")
    if s["dur"]:
        parts.append(s["dur"])
    return " · ".join(parts)


def best_by_airline(origin: str, dest: str, days: list[str]) -> dict[str, dict]:
    """Melhor itinerário por companhia (prefere ≤1 escala, senão o mais barato da cia)."""
    groups: dict[str, list[dict]] = {}
    for day in days:
        for r in search_oneway(origin, dest, day):
            s = summarize(day, r)
            if s:
                groups.setdefault(s["airline"], []).append(s)

    best: dict[str, dict] = {}
    for airline, items in groups.items():
        preferred = [x for x in items if x["stops"] <= MAX_STOPS] or items
        best[airline] = min(preferred, key=lambda x: x["price"])
    log.info(f"    {len(best)} companhia(s): " + ", ".join(f"{a} R${s['price']:.0f}" for a, s in best.items()))
    return best


def upsert(trip_type: str, airline: str, price_out, price_back, notes: str) -> bool:
    payload = {
        "trip_id":      TRIP_ID,
        "date":         date.today().isoformat(),
        "airline":      airline,
        "origin":       ORIGIN,
        "destination":  DEST,
        "trip_type":    trip_type,
        "price_out":    price_out,
        "price_back":   price_back,
        "source":       "auto",
        "payment_type": "cash",
        "program":      "",
        "notes":        notes,
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
            return True
        log.error(f"    Supabase {resp.status_code}: {resp.text}")
        return False
    except Exception as e:
        log.error(f"    Erro ao salvar: {e}")
        return False


def main():
    log.info(f"=== Miami FLN⇄MIA — {date.today().isoformat()} ===")

    log.info("Ida (FLN→MIA):")
    outs = best_by_airline(ORIGIN, DEST, DEPART_DATES)
    log.info("Volta (MIA→FLN):")
    backs = best_by_airline(DEST, ORIGIN, RETURN_DATES)

    if not outs and not backs:
        log.error("Nenhum resultado.")
        sys.exit(1)

    success = 0

    for airline, s in outs.items():
        if upsert("outbound", airline, s["price"], None, note_of(s)):
            success += 1

    for airline, s in backs.items():
        if upsert("return", airline, None, s["price"], note_of(s)):
            success += 1

    # ida-e-volta por companhia (cias presentes nas duas pernas)
    for airline in outs.keys() & backs.keys():
        o, b = outs[airline], backs[airline]
        note = f"ida {brdate(o['day'])} {o['routing']} {o['dep']}→{o['arr']} · volta {brdate(b['day'])} {b['routing']} {b['dep']}→{b['arr']}"
        if upsert("round_trip", airline, o["price"], b["price"], note):
            success += 1

    log.info(f"=== Concluído: {success} registro(s) salvo(s) ===")
    if success == 0:
        sys.exit(1)


if __name__ == "__main__":
    main()

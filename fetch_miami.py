"""
fetch_miami.py — monitoramento FLN ⇄ MIA via RapidAPI (Skyscanner).

O endpoint só faz busca one-way, então buscamos cada perna separadamente,
em datas flexíveis, filtrando itinerários com no máx. 1 escala (com fallback
para a mais barata caso não haja opção de 1 escala), e combinamos a melhor
ida com a melhor volta para o total ida-e-volta.

Salva 3 registros/dia na tabela prices (trip 9), source='auto':
  outbound   → melhor FLN→MIA entre as datas de ida
  return     → melhor MIA→FLN entre as datas de volta
  round_trip → melhor ida + melhor volta

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
        ("jetsmart", "JetSmart"), ("arajet", "Arajet"),
    ]:
        if key in n:
            return canon
    return name


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


def best_leg(origin: str, dest: str, days: list[str]) -> dict | None:
    """Melhor itinerário (≤1 escala, senão o mais barato) entre as datas dadas."""
    all_results: list[tuple[str, dict]] = []
    for day in days:
        for r in search_oneway(origin, dest, day):
            legs = r.get("legs", [])
            if legs and r.get("price_raw") is not None:
                all_results.append((day, r))

    if not all_results:
        return None

    def stops_of(r): return (r.get("legs") or [{}])[0].get("stops", 99)

    preferred = [(d, r) for d, r in all_results if stops_of(r) <= MAX_STOPS]
    pool = preferred or all_results   # fallback: aceita mais escalas se não houver ≤1
    day, r = min(pool, key=lambda x: x[1]["price_raw"])

    leg = r["legs"][0]
    segs = leg.get("segments", [])
    routing = "→".join([segs[0]["from"]] + [s["to"] for s in segs]) if segs else f"{origin}→{dest}"
    carriers = " + ".join(dict.fromkeys(norm_airline(c) for c in r.get("carriers", []))) or "?"

    return {
        "price": float(r["price_raw"]),
        "airline": carriers,
        "stops": stops_of(r),
        "routing": routing,
        "day": day,
    }


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
            total = (price_out or 0) + (price_back or 0)
            log.info(f"    Salvo [{trip_type}] {airline}: R$ {total:,.2f}")
            return True
        log.error(f"    Supabase {resp.status_code}: {resp.text}")
        return False
    except Exception as e:
        log.error(f"    Erro ao salvar: {e}")
        return False


def brdate(iso: str) -> str:
    y, m, d = iso.split("-")
    return f"{d}/{m}"


def main():
    log.info(f"=== Miami FLN⇄MIA — {date.today().isoformat()} ===")

    log.info("Ida (FLN→MIA):")
    out = best_leg(ORIGIN, DEST, DEPART_DATES)
    log.info("Volta (MIA→FLN):")
    back = best_leg(DEST, ORIGIN, RETURN_DATES)

    if not out and not back:
        log.error("Nenhuma perna encontrada.")
        sys.exit(1)

    success = 0

    if out:
        note = f"{out['routing']} · {out['stops']} escala(s) · {brdate(out['day'])}"
        if upsert("outbound", out["airline"], out["price"], None, note):
            success += 1

    if back:
        note = f"{back['routing']} · {back['stops']} escala(s) · {brdate(back['day'])}"
        if upsert("return", back["airline"], None, back["price"], note):
            success += 1

    if out and back:
        air = out["airline"] if out["airline"] == back["airline"] else f"{out['airline']} / {back['airline']}"
        note = (f"ida {out['routing']} {brdate(out['day'])} · "
                f"volta {back['routing']} {brdate(back['day'])}")
        if upsert("round_trip", air, out["price"], back["price"], note):
            success += 1

    log.info(f"=== Concluído: {success} registro(s) salvo(s) ===")
    if success == 0:
        sys.exit(1)


if __name__ == "__main__":
    main()

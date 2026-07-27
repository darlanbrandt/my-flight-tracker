"""
fetch_miami.py — monitoramento FLN ⇄ MIA via RapidAPI
(skyscanner-flights-travel-api, busca nativa de ida-e-volta).

Cada itinerário já traz os dois trechos (ida + volta) e o preço TOTAL do
pacote. Buscamos as combinações de datas flexíveis, filtramos itinerários
com ≤1 escala em cada trecho (fallback p/ o mais barato) e salvamos:

  round_trip por companhia  → melhor pacote de cada cia (ou combinação
                              self-transfer que a API retornar)
  round_trip "Melhor tarifa"→ o pacote mais barato do dia (linha estável)

Como a API só dá o preço total do pacote, o valor fica em price_out
(price_back nulo) e a observação traz o detalhe de cada trecho.

Roda seg–sáb às 06h Brasília. 4 requisições/dia (uma por combinação de datas).
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

API_HOST = "skyscanner-flights-travel-api.p.rapidapi.com"
API_URL  = f"https://{API_HOST}/flights/searchFlights"
API_HEADERS = {
    "x-rapidapi-key":  RAPIDAPI_KEY,
    "x-rapidapi-host": API_HOST,
}

# ── Configuração da viagem ────────────────────────────────────────────────────
TRIP_ID     = 9
ORIGIN_IATA = "FLN"
DEST_IATA   = "MIA"
ORIGIN_SKY, ORIGIN_ENTITY = "FLN", "95673806"    # aeroporto de Florianópolis
DEST_SKY,   DEST_ENTITY   = "MIA", "95673821"    # aeroporto Internacional de Miami

DEPART_DATES = ["2027-01-24", "2027-01-25"]
RETURN_DATES = ["2027-02-12", "2027-02-13"]
MAX_STOPS    = 1

# Dry-run: chama a API mas NÃO grava no Supabase (MIAMI_DRY_RUN=1)
DRY_RUN = os.environ.get("MIAMI_DRY_RUN", "").lower() in ("1", "true", "yes")


def norm_airline(name: str) -> str:
    n = name.lower()
    for key, canon in [
        ("gol", "Gol"), ("latam", "Latam"), ("azul", "Azul"), ("american", "American"),
        ("delta", "Delta"), ("united", "United"), ("copa", "Copa"), ("avianca", "Avianca"),
        ("aeromexico", "Aeroméxico"), ("aeroméxico", "Aeroméxico"), ("sky", "Sky"),
        ("jetsmart", "JetSmart"), ("arajet", "Arajet"), ("iberia", "Iberia"),
        ("tap", "TAP"), ("air france", "Air France"), ("klm", "KLM"),
        ("egyptair", "EgyptAir"), ("air canada", "Air Canada"),
    ]:
        if key in n:
            return canon
    return name


def leg_carriers(leg: dict) -> str:
    names = dict.fromkeys(norm_airline(c.get("name", "")) for c in leg.get("carriers", []) if c.get("name"))
    return " + ".join(names) if names else "?"


def hm(iso: str) -> str:
    return iso[11:16] if len(iso) >= 16 else ""


def dmy(iso: str) -> str:
    return f"{iso[8:10]}/{iso[5:7]}" if len(iso) >= 10 else ""


def search(depart: str, ret: str) -> list[dict]:
    log.info(f"  [API] FLN→MIA {depart} ⇆ {ret}")
    params = {
        "originSkyId": ORIGIN_SKY, "originEntityId": ORIGIN_ENTITY,
        "destinationSkyId": DEST_SKY, "destinationEntityId": DEST_ENTITY,
        "date": depart, "returnDate": ret,
        "adults": "1", "childrens": "0", "infants": "0",
        "cabinClass": "economy",
        "countryCode": "BR", "market": "BR", "currency": "BRL",
    }
    for attempt in range(1, 3):
        try:
            resp = httpx.get(API_URL, headers=API_HEADERS, params=params, timeout=60)
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            log.warning(f"    Tentativa {attempt} falhou: {e}")
            continue
        its = data.get("itineraries") or []
        log.info(f"    status={data.get('status')} · {len(its)} itinerário(s)")
        if its:
            return its
    return []


def summarize(it: dict) -> dict | None:
    legs = it.get("legs", [])
    price = (it.get("price") or {}).get("amount")
    if len(legs) < 2 or price is None:
        return None
    out, back = legs[0], legs[1]
    out_air, back_air = leg_carriers(out), leg_carriers(back)
    # rótulo da companhia: mesma nas duas pernas → uma; diferentes → "A + B"
    airline = out_air if out_air == back_air else f"{out_air} / {back_air}"
    return {
        "airline": airline,
        "price":   float(price),
        "out":     out,
        "back":    back,
        "max_stops": max(out.get("stopCount", 9), back.get("stopCount", 9)),
    }


def note_of(s: dict) -> str:
    o, b = s["out"], s["back"]
    return (
        f"ida {dmy(o.get('departure',''))} {o.get('origin')}→{o.get('destination')} "
        f"{o.get('stopCount')} esc {hm(o.get('departure',''))}→{hm(o.get('arrival',''))} · "
        f"volta {dmy(b.get('departure',''))} {b.get('origin')}→{b.get('destination')} "
        f"{b.get('stopCount')} esc {hm(b.get('departure',''))}→{hm(b.get('arrival',''))} · pacote ida-e-volta"
    )


def upsert(airline: str, price: float, notes: str) -> bool:
    if DRY_RUN:
        log.info(f"    [DRY-RUN] {airline}: R$ {price:,.2f} — {notes}")
        return True
    payload = {
        "trip_id":      TRIP_ID,
        "date":         date.today().isoformat(),
        "airline":      airline,
        "origin":       ORIGIN_IATA,
        "destination":  DEST_IATA,
        "trip_type":    "round_trip",
        "price_out":    price,     # total do pacote (API não separa por perna)
        "price_back":   None,
        "source":       "auto",
        "payment_type": "cash",
        "program":      "",
        "notes":        notes,
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
    log.info(f"=== Miami FLN⇄MIA — {date.today().isoformat()}" + (" [DRY-RUN]" if DRY_RUN else "") + " ===")

    # coleta todos os itinerários das combinações de datas
    all_summ: list[dict] = []
    for depart in DEPART_DATES:
        for ret in RETURN_DATES:
            for it in search(depart, ret):
                s = summarize(it)
                if s:
                    all_summ.append(s)

    if not all_summ:
        log.error("Nenhum itinerário encontrado.")
        sys.exit(1)

    # ordena preferindo ≤1 escala e, dentro disso, o mais barato
    def rank(s: dict) -> tuple:
        return (0 if s["max_stops"] <= MAX_STOPS else 1, s["price"])

    # melhor por companhia
    best: dict[str, dict] = {}
    for s in all_summ:
        cur = best.get(s["airline"])
        if cur is None or rank(s) < rank(cur):
            best[s["airline"]] = s

    log.info(f"{len(best)} companhia(s): " + ", ".join(f"{a} R${s['price']:.0f}" for a, s in best.items()))

    success = 0
    for airline, s in best.items():
        if upsert(airline, s["price"], note_of(s)):
            success += 1

    # linha estável com o pacote mais barato do dia (prefere ≤1 escala)
    cheapest = min(all_summ, key=rank)
    if upsert("Melhor tarifa", cheapest["price"], note_of(cheapest)):
        success += 1

    log.info(f"=== Concluído: {success} registro(s) salvo(s) ===")
    if success == 0:
        sys.exit(1)


if __name__ == "__main__":
    main()

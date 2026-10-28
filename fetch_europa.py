"""
fetch_europa.py — acompanhamento da viagem Europa Mai/2027 (trip 12) via SerpAPI.

Busca o preço em REAL do pacote ida-e-volta (round_trip) de GRU para vários
destinos europeus, somente VOOS DIRETOS, salvando o melhor preço POR COMPANHIA
em cada destino (a LATAM aparece onde voa direto; as demais entram de backup).
Serve para acompanhar a tarifa em dinheiro, que costuma cair junto com os pontos.

Rotas (ida → volta):
  GRU→BCN  23/05/2027 → 08/06/2027
  GRU→MAD  23/05/2027 → 08/06/2027
  GRU→LIS  23/05/2027 → 08/06/2027
  GRU→BRU  24/05/2027 → 08/06/2027   (segunda-feira)
  FLN→LIS  24/05/2027 → 09/06/2027   (TAP direto, seg/qua/sáb)

5 requisições/dia (uma por rota). Roda diariamente de manhã.
Dry-run (não grava): EUROPA_DRY_RUN=1.
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

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")   # opcional no dry-run
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")
SERPAPI_KEY  = os.environ["SERPAPI_KEY"]

DRY_RUN = os.environ.get("EUROPA_DRY_RUN", "").lower() in ("1", "true", "yes")

SUPABASE_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates,return=minimal",
}

SERPAPI_URL = "https://serpapi.com/search.json"

# ── Configuração da viagem ────────────────────────────────────────────────────
TRIP_ID = 12


@dataclass
class Route:
    origin: str
    destination: str
    date_out: str
    date_back: str


ROUTES: list[Route] = [
    Route("GRU", "BCN", "2027-05-23", "2027-06-08"),
    Route("GRU", "MAD", "2027-05-23", "2027-06-08"),
    Route("GRU", "LIS", "2027-05-23", "2027-06-08"),
    Route("GRU", "BRU", "2027-05-24", "2027-06-08"),
    Route("FLN", "LIS", "2027-05-24", "2027-06-09"),   # TAP direto (seg/qua/sáb)
]


def norm_airline(name: str) -> str:
    n = name.lower()
    for key, canon in [
        ("latam", "Latam"), ("tap", "TAP"), ("iberia", "Iberia"), ("gol", "Gol"),
        ("azul", "Azul"), ("air france", "Air France"), ("klm", "KLM"),
        ("lufthansa", "Lufthansa"), ("british", "British Airways"), ("swiss", "Swiss"),
        ("ita", "ITA Airways"), ("air europa", "Air Europa"), ("american", "American"),
        ("united", "United"), ("delta", "Delta"), ("brussels", "Brussels Airlines"),
    ]:
        if key in n:
            return canon
    return name


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


def search_round_trip(route: Route) -> list[dict]:
    log.info(f"  [SerpAPI] {route.origin}→{route.destination} {route.date_out} ⇆ {route.date_back} (direto)")
    params = {
        "engine":        "google_flights",
        "departure_id":  route.origin,
        "arrival_id":    route.destination,
        "outbound_date": route.date_out,
        "return_date":   route.date_back,
        "type":          "1",            # ida e volta
        "currency":      "BRL",
        "hl":            "pt",
        "gl":            "br",
        "deep_search":   "true",
        "max_stops":     "0",            # somente voos diretos
        "api_key":       SERPAPI_KEY,
    }
    for attempt in range(1, 4):
        try:
            resp = httpx.get(SERPAPI_URL, params=params, timeout=90)
            resp.raise_for_status()
            data = resp.json()
            if "error" in data:
                log.info(f"    Sem resultado: {data['error']}")
                return []
            offers = data.get("best_flights", []) + data.get("other_flights", [])
            log.info(f"    {len(offers)} oferta(s) direta(s).")
            return offers
        except Exception as e:
            log.warning(f"    Tentativa {attempt}/3 falhou: {e}")
    return []


def best_by_airline(offers: list[dict]) -> dict[str, float]:
    # voo direto = 1 segmento na ida; agrupa pelo nome da companhia
    groups: dict[str, float] = {}
    for o in offers:
        legs = o.get("flights", [])
        if len(legs) != 1:
            continue
        price = parse_price(o.get("price"))
        if price is None:
            continue
        names = dict.fromkeys(norm_airline(l.get("airline", "")) for l in legs if l.get("airline"))
        label = " + ".join(names) if names else "?"
        if label not in groups or price < groups[label]:
            groups[label] = price
    return groups


def upsert(origin: str, destination: str, airline: str, price: float) -> bool:
    half = round(price / 2, 2)
    if DRY_RUN:
        log.info(f"    [DRY-RUN] {origin}→{destination} {airline}: R$ {price:,.2f}")
        return True
    payload = {
        "trip_id":      TRIP_ID,
        "date":         date.today().isoformat(),
        "airline":      airline,
        "origin":       origin,
        "destination":  destination,
        "trip_type":    "round_trip",
        "price_out":    half,
        "price_back":   round(price - half, 2),
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
    log.info(f"=== Europa Mai/2027 — {date.today().isoformat()}" + (" [DRY-RUN]" if DRY_RUN else "") + " ===")
    success = 0

    for route in ROUTES:
        best = best_by_airline(search_round_trip(route))
        if not best:
            log.info(f"  {route.origin}→{route.destination}: nenhum voo direto encontrado.")
            continue
        log.info(f"  {route.origin}→{route.destination}: " + ", ".join(f"{a} R${p:.0f}" for a, p in sorted(best.items(), key=lambda x: x[1])))
        for airline, price in best.items():
            if upsert(route.origin, route.destination, airline, price):
                success += 1

    log.info(f"=== Concluído: {success} registro(s) salvo(s) ===")


if __name__ == "__main__":
    main()

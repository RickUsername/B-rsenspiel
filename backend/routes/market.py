"""
API-Routen für Marktdaten: Kurse, Suche, Charts.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
from services.market_data import get_price, search_assets, get_history

router = APIRouter(prefix="/market", tags=["Marktdaten"])


@router.get("/price/{ticker}")
def get_asset_price(ticker: str, db: Session = Depends(get_db)):
    """
    Gibt den aktuellen Kurs eines Assets zurück.
    Verwendet den Cache, ruft bei Bedarf neue Daten ab.
    """
    result = get_price(ticker.upper(), db)
    if not result:
        raise HTTPException(status_code=404, detail=f"Kein Kurs für {ticker} gefunden")
    return result


@router.get("/search")
def search(q: str = Query(..., min_length=1, description="Suchbegriff (Ticker oder Name)")):
    """
    Sucht nach Assets via yfinance.
    Gibt bis zu 10 Treffer zurück.
    """
    results = search_assets(q)
    return results


@router.get("/history/{ticker}")
def get_chart_data(
    ticker: str,
    period: str = Query("1mo", description="Zeitraum: 1d, 5d, 1mo, 6mo, 1y, 5y"),
    interval: str = Query("1d", description="Intervall: 1m, 5m, 15m, 1h, 1d, 1wk"),
):
    """
    Gibt historische Kursdaten für Charts zurück.
    """
    # Validierung
    valid_periods = ["1d", "5d", "1mo", "6mo", "1y", "5y"]
    valid_intervals = ["1m", "5m", "15m", "1h", "1d", "1wk"]

    if period not in valid_periods:
        raise HTTPException(status_code=400, detail=f"Ungültiger Zeitraum. Erlaubt: {valid_periods}")
    if interval not in valid_intervals:
        raise HTTPException(status_code=400, detail=f"Ungültiges Intervall. Erlaubt: {valid_intervals}")

    data = get_history(ticker.upper(), period, interval)
    return data

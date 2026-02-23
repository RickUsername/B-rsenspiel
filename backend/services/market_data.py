"""
Marktdaten-Service: Abruf und Caching von Kursdaten via yfinance.
Unterstützt Aktien, ETFs, Krypto und Indizes.
"""

from datetime import datetime, timezone, timedelta
from typing import Optional
import yfinance as yf
from sqlalchemy.orm import Session

from models import PriceCache, AssetType

CACHE_MAX_AGE_SECONDS = 120  # Kurs gilt als veraltet nach 2 Minuten


def detect_asset_type(ticker: str) -> str:
    """Erkennt den Asset-Typ anhand des Ticker-Formats."""
    ticker_upper = ticker.upper()
    if ticker_upper.startswith("^"):
        return AssetType.INDEX
    if ticker_upper.endswith("-USD") or ticker_upper.endswith("-EUR"):
        return AssetType.CRYPTO
    # Einfache Heuristik: bekannte ETF-Suffixe
    etf_hints = [".AS", ".DE", ".L", ".PA"]
    for hint in etf_hints:
        if hint in ticker_upper:
            # Könnte ETF oder Aktie sein – yfinance prüfen
            try:
                info = yf.Ticker(ticker).info
                quote_type = info.get("quoteType", "").upper()
                if quote_type == "ETF":
                    return AssetType.ETF
            except Exception:
                pass
            break
    return AssetType.STOCK


def get_price(ticker: str, db: Session) -> Optional[dict]:
    """
    Gibt den gecachten Kurs zurück. Wenn nicht im Cache, wird er abgerufen.
    Gibt ein Dict mit price, currency, name, asset_type zurück.
    """
    cached = db.query(PriceCache).filter(PriceCache.ticker == ticker).first()
    if cached:
        # Cache-Alter prüfen – bei veralteten Daten sofort neu abrufen
        if cached.last_updated:
            age = datetime.now(timezone.utc) - cached.last_updated.replace(tzinfo=timezone.utc)
            if age.total_seconds() > CACHE_MAX_AGE_SECONDS:
                return fetch_and_cache_price(ticker, db)
        return {
            "ticker": cached.ticker,
            "price": cached.price,
            "previous_close": cached.previous_close,
            "currency": cached.currency,
            "name": cached.name,
            "asset_type": cached.asset_type,
            "last_updated": cached.last_updated.isoformat() if cached.last_updated else None,
        }

    # Nicht im Cache: jetzt abrufen und cachen
    return fetch_and_cache_price(ticker, db)


def fetch_and_cache_price(ticker: str, db: Session) -> Optional[dict]:
    """Ruft den aktuellen Kurs via yfinance ab und speichert ihn im Cache."""
    try:
        yf_ticker = yf.Ticker(ticker)
        info = yf_ticker.info

        price = info.get("currentPrice") or info.get("regularMarketPrice") or info.get("previousClose")
        if price is None:
            # Fallback: letzten Kurs aus History holen
            hist = yf_ticker.history(period="1d")
            if not hist.empty:
                price = float(hist["Close"].iloc[-1])
            else:
                return None

        currency = info.get("currency", "USD")
        name = info.get("shortName") or info.get("longName") or ticker
        previous_close = info.get("previousClose") or info.get("regularMarketPreviousClose")

        # Asset-Typ bestimmen
        quote_type = info.get("quoteType", "").upper()
        if quote_type == "CRYPTOCURRENCY":
            asset_type = AssetType.CRYPTO
        elif quote_type == "ETF":
            asset_type = AssetType.ETF
        elif quote_type == "INDEX":
            asset_type = AssetType.INDEX
        else:
            asset_type = AssetType.STOCK

        # Cache aktualisieren oder erstellen
        cached = db.query(PriceCache).filter(PriceCache.ticker == ticker).first()
        if cached:
            cached.price = price
            cached.previous_close = previous_close
            cached.currency = currency
            cached.name = name
            cached.asset_type = asset_type
            cached.last_updated = datetime.now(timezone.utc)
        else:
            cached = PriceCache(
                ticker=ticker,
                price=price,
                previous_close=previous_close,
                currency=currency,
                name=name,
                asset_type=asset_type,
                last_updated=datetime.now(timezone.utc),
            )
            db.add(cached)

        db.commit()

        return {
            "ticker": ticker,
            "price": price,
            "previous_close": previous_close,
            "currency": currency,
            "name": name,
            "asset_type": asset_type,
            "last_updated": datetime.now(timezone.utc).isoformat(),
        }
    except Exception:
        # Fallback auf gecachten Wert
        cached = db.query(PriceCache).filter(PriceCache.ticker == ticker).first()
        if cached:
            return {
                "ticker": cached.ticker,
                "price": cached.price,
                "previous_close": cached.previous_close,
                "currency": cached.currency,
                "name": cached.name,
                "asset_type": cached.asset_type,
                "last_updated": cached.last_updated.isoformat() if cached.last_updated else None,
            }
        return None


def search_assets(query: str) -> list[dict]:
    """
    Sucht nach Assets via yfinance.
    Gibt eine Liste von Treffern mit Ticker, Name, Typ zurück.
    """
    try:
        results = []
        # yfinance Search
        search = yf.Search(query)
        quotes = search.quotes if hasattr(search, 'quotes') else []

        for quote in quotes[:10]:
            ticker = quote.get("symbol", "")
            name = quote.get("shortname") or quote.get("longname") or ticker
            quote_type = quote.get("quoteType", "EQUITY").upper()
            exchange = quote.get("exchange", "")

            if quote_type == "CRYPTOCURRENCY":
                asset_type = AssetType.CRYPTO
            elif quote_type == "ETF":
                asset_type = AssetType.ETF
            elif quote_type == "INDEX":
                asset_type = AssetType.INDEX
            else:
                asset_type = AssetType.STOCK

            results.append({
                "ticker": ticker,
                "name": name,
                "asset_type": asset_type,
                "exchange": exchange,
            })

        return results
    except Exception:
        return []


def get_history(ticker: str, period: str = "1mo", interval: str = "1d") -> list[dict]:
    """
    Holt historische Kursdaten für Charts.
    period: 1d, 5d, 1mo, 6mo, 1y, 5y
    interval: 1m, 5m, 15m, 1h, 1d, 1wk
    """
    try:
        yf_ticker = yf.Ticker(ticker)
        hist = yf_ticker.history(period=period, interval=interval)

        if hist.empty:
            return []

        data = []
        for idx, row in hist.iterrows():
            data.append({
                "date": idx.isoformat(),
                "open": round(float(row["Open"]), 2),
                "high": round(float(row["High"]), 2),
                "low": round(float(row["Low"]), 2),
                "close": round(float(row["Close"]), 2),
                "volume": int(row["Volume"]),
            })

        return data
    except Exception:
        return []


def refresh_all_cached_prices(db: Session):
    """Aktualisiert alle Preise im Cache. Wird vom Scheduler aufgerufen."""
    cached_tickers = db.query(PriceCache.ticker).all()
    for (ticker,) in cached_tickers:
        try:
            fetch_and_cache_price(ticker, db)
        except Exception:
            continue

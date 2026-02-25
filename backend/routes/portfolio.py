"""
API-Routen für Konto und Portfolio: Balance, Einzahlungen, Positionen.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session

from sqlalchemy import func as sa_func

from database import get_db
from models import User, Account, Transaction, Position, PriceCache, Watchlist, PortfolioSnapshot, Trade, Order
from auth import get_current_user

router = APIRouter(prefix="/account", tags=["Konto & Portfolio"])


class DepositRequest(BaseModel):
    """Request-Body für eine Einzahlung."""
    amount: float
    sender: str = "Eigene Überweisung"


class WatchlistRequest(BaseModel):
    """Request-Body für Watchlist-Einträge."""
    ticker: str


class BalanceResponse(BaseModel):
    """Kontostand-Antwort."""
    balance: float
    account_id: int
    portfolio_value: float
    total_value: float
    total_deposits: float
    reserved_by_orders: float


@router.get("/balance", response_model=BalanceResponse)
def get_balance(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Gibt den aktuellen Kontostand, Portfoliowert und Gesamtwert zurück."""
    account = db.query(Account).filter(Account.user_id == user.id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Kein Konto gefunden")

    # Portfolio-Wert berechnen
    positions = db.query(Position).filter(Position.account_id == account.id).all()
    portfolio_value = 0.0
    for pos in positions:
        cached = db.query(PriceCache).filter(PriceCache.ticker == pos.ticker).first()
        if cached:
            current_value = cached.price * pos.quantity
            if pos.leverage > 1:
                pnl = (cached.price - pos.entry_price) * pos.quantity * pos.leverage
                current_value = pos.margin_used + pnl - pos.accrued_financing
            portfolio_value += max(current_value, 0)
        else:
            portfolio_value += pos.margin_used

    # Summe aller Einzahlungen berechnen
    total_deposits = db.query(sa_func.coalesce(sa_func.sum(Transaction.amount), 0.0)).filter(
        Transaction.account_id == account.id,
        Transaction.type == "deposit",
    ).scalar()

    # Summe aller offenen Kauf-Orders (reserviertes Geld)
    reserved_by_orders = float(db.query(
        sa_func.coalesce(sa_func.sum(Order.amount_eur), 0.0)
    ).filter(
        Order.account_id == account.id,
        Order.order_type == "limit_buy",
        Order.status == "pending",
    ).scalar())

    return BalanceResponse(
        balance=round(account.balance, 2),
        account_id=account.id,
        portfolio_value=round(portfolio_value, 2),
        total_value=round(account.balance + portfolio_value, 2),
        total_deposits=round(float(total_deposits), 2),
        reserved_by_orders=round(reserved_by_orders, 2),
    )


@router.post("/deposit")
def deposit(
    request: DepositRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Zahlt einen Betrag auf das Konto ein.
    Erstellt einen Kontoauszug-Eintrag als 'Überweisung eingegangen'.
    """
    if request.amount <= 0:
        raise HTTPException(status_code=400, detail="Betrag muss positiv sein")

    account = db.query(Account).filter(Account.user_id == user.id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Kein Konto gefunden")

    account.balance += request.amount

    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)

    transaction = Transaction(
        account_id=account.id,
        amount=request.amount,
        type="deposit",
        description=f"Überweisung eingegangen von {request.sender} am {now.strftime('%d.%m.%Y %H:%M')}",
    )
    db.add(transaction)
    db.commit()

    return {
        "message": f"{request.amount:.2f}€ eingezahlt",
        "new_balance": round(account.balance, 2),
    }


@router.get("/transactions")
def get_transactions(
    type: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Gibt alle Kontobewegungen zurück. Optional filterbar nach Typ.
    Typen: deposit, trade_buy, trade_sell, fee, financing, margin_call
    """
    account = db.query(Account).filter(Account.user_id == user.id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Kein Konto gefunden")

    query = db.query(Transaction).filter(Transaction.account_id == account.id)
    if type:
        query = query.filter(Transaction.type == type)

    transactions = query.order_by(Transaction.created_at.desc()).all()

    # Lade alle Trades des Accounts für Timestamp-Matching
    trades = db.query(Trade).filter(Trade.account_id == account.id).all()

    def find_trade_details(transaction):
        """Verknüpft eine Transaktion mit dem zugehörigen Trade per Timestamp-Matching."""
        if transaction.type not in ("trade_buy", "trade_sell", "margin_call"):
            return None
        if not transaction.created_at:
            return None

        direction_map = {"trade_buy": "buy", "trade_sell": "sell", "margin_call": "sell"}
        expected_direction = direction_map[transaction.type]

        for trade in trades:
            if not trade.created_at:
                continue
            time_diff = abs((trade.created_at - transaction.created_at).total_seconds())
            if time_diff <= 2 and trade.direction == expected_direction:
                return {
                    "trade_id": trade.id,
                    "ticker": trade.ticker,
                    "name": trade.name,
                    "direction": trade.direction,
                    "quantity": trade.quantity,
                    "price": trade.price,
                    "leverage": trade.leverage,
                    "fee": trade.fee,
                    "realized_pnl": trade.realized_pnl,
                }
        return None

    return [
        {
            "id": t.id,
            "amount": t.amount,
            "type": t.type,
            "description": t.description,
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "trade_details": find_trade_details(t),
        }
        for t in transactions
    ]


@router.get("/positions")
def get_positions(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Gibt alle offenen Positionen mit aktuellem P&L zurück."""
    account = db.query(Account).filter(Account.user_id == user.id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Kein Konto gefunden")

    positions = db.query(Position).filter(Position.account_id == account.id).all()
    result = []

    for pos in positions:
        cached = db.query(PriceCache).filter(PriceCache.ticker == pos.ticker).first()
        current_price = cached.price if cached else pos.entry_price
        currency = cached.currency if cached else "USD"

        # P&L berechnen
        price_diff = current_price - pos.entry_price
        unrealized_pnl = price_diff * pos.quantity * pos.leverage
        unrealized_pnl_after_financing = unrealized_pnl - pos.accrued_financing

        # Prozentuale Veränderung bezogen auf Margin
        pnl_percent = (unrealized_pnl_after_financing / pos.margin_used * 100) if pos.margin_used > 0 else 0

        # Tagesperformance
        previous_close = cached.previous_close if cached and cached.previous_close else None
        if previous_close and previous_close > 0:
            day_price_diff = current_price - previous_close
            day_change_eur = round(day_price_diff * pos.quantity * pos.leverage, 2)
            day_change_percent = round(day_change_eur / pos.margin_used * 100, 2) if pos.margin_used > 0 else 0
        else:
            day_change_eur = None
            day_change_percent = None

        result.append({
            "id": pos.id,
            "ticker": pos.ticker,
            "name": pos.name,
            "asset_type": pos.asset_type,
            "quantity": pos.quantity,
            "entry_price": pos.entry_price,
            "current_price": current_price,
            "currency": currency,
            "leverage": pos.leverage,
            "margin_used": pos.margin_used,
            "unrealized_pnl": round(unrealized_pnl_after_financing, 2),
            "pnl_percent": round(pnl_percent, 2),
            "accrued_financing": round(pos.accrued_financing, 2),
            "financing_rate": pos.financing_rate,
            "stop_loss_price": pos.stop_loss_price,
            "created_at": pos.created_at.isoformat() if pos.created_at else None,
            "day_change_eur": day_change_eur,
            "day_change_percent": day_change_percent,
        })

    return result


@router.get("/trades")
def get_trades(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Gibt alle abgeschlossenen Trades zurück."""
    account = db.query(Account).filter(Account.user_id == user.id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Kein Konto gefunden")

    from models import Trade
    trades = db.query(Trade).filter(
        Trade.account_id == account.id
    ).order_by(Trade.created_at.desc()).all()

    return [
        {
            "id": t.id,
            "ticker": t.ticker,
            "name": t.name,
            "direction": t.direction,
            "quantity": t.quantity,
            "price": t.price,
            "leverage": t.leverage,
            "fee": t.fee,
            "realized_pnl": t.realized_pnl,
            "created_at": t.created_at.isoformat() if t.created_at else None,
        }
        for t in trades
    ]


@router.get("/portfolio-history")
def get_portfolio_history(
    range: str = "1W",
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Gibt die Portfoliowert-History zurück.
    range: 1H (1 Stunde), 1T (1 Tag), 1W (1 Woche), 1M (1 Monat), 1J (1 Jahr), MAX (alles)
    Snapshots werden minütlich aufgezeichnet. Ältere Daten: 1 pro Stunde.
    """
    from datetime import datetime, timezone, timedelta

    account = db.query(Account).filter(Account.user_id == user.id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Kein Konto gefunden")

    now = datetime.now(timezone.utc)

    range_to_delta = {
        "1H":  timedelta(hours=1),
        "1T":  timedelta(hours=24),
        "1W":  timedelta(days=7),
        "1M":  timedelta(days=30),
        "1J":  timedelta(days=365),
        "MAX": None,
    }
    delta = range_to_delta.get(range, timedelta(days=7))

    query = db.query(PortfolioSnapshot).filter(
        PortfolioSnapshot.account_id == account.id,
    )
    if delta is not None:
        query = query.filter(PortfolioSnapshot.created_at >= now - delta)

    snapshots = query.order_by(PortfolioSnapshot.created_at.asc()).all()

    # Alle Deposit-Transaktionen laden um kumulierte Einzahlungen pro Zeitpunkt zu berechnen
    deposits = (
        db.query(Transaction)
        .filter(Transaction.account_id == account.id, Transaction.type == "deposit")
        .order_by(Transaction.created_at.asc())
        .all()
    )

    def cumulative_deposits_at(dt):
        """Summiert alle Einzahlungen bis zum gegebenen Zeitpunkt."""
        total = 0.0
        for dep in deposits:
            dep_time = dep.created_at
            if dep_time and dep_time <= dt:
                total += dep.amount
        return round(total, 2)

    result = []
    for s in snapshots:
        td = cumulative_deposits_at(s.created_at)
        result.append({
            "date": s.created_at.isoformat(),
            "total_value": s.total_value,
            "balance": s.balance,
            "portfolio_value": s.portfolio_value,
            "total_deposits": td,
        })

    # Wenn noch keine Snapshots: aktuellen Wert als Startpunkt zurückgeben
    if not result:
        positions = db.query(Position).filter(Position.account_id == account.id).all()
        portfolio_value = 0.0
        for pos in positions:
            cached = db.query(PriceCache).filter(PriceCache.ticker == pos.ticker).first()
            if cached:
                if pos.leverage > 1:
                    pnl = (cached.price - pos.entry_price) * pos.quantity * pos.leverage
                    val = pos.margin_used + pnl - pos.accrued_financing
                else:
                    val = cached.price * pos.quantity
                portfolio_value += max(val, 0)
            else:
                portfolio_value += pos.margin_used

        total_dep = cumulative_deposits_at(now)
        result = [{
            "date": now.isoformat(),
            "total_value": round(account.balance + portfolio_value, 2),
            "balance": round(account.balance, 2),
            "portfolio_value": round(portfolio_value, 2),
            "total_deposits": total_dep,
        }]

    return result


# --- Watchlist ---

@router.post("/watchlist")
def add_to_watchlist(
    request: WatchlistRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Fügt ein Asset zur Watchlist hinzu."""
    account = db.query(Account).filter(Account.user_id == user.id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Kein Konto gefunden")

    # Prüfe ob schon in Watchlist
    existing = db.query(Watchlist).filter(
        Watchlist.account_id == account.id,
        Watchlist.ticker == request.ticker,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Asset bereits in Watchlist")

    entry = Watchlist(account_id=account.id, ticker=request.ticker)
    db.add(entry)
    db.commit()

    return {"message": f"{request.ticker} zur Watchlist hinzugefügt"}


@router.delete("/watchlist/{ticker}")
def remove_from_watchlist(
    ticker: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Entfernt ein Asset aus der Watchlist."""
    account = db.query(Account).filter(Account.user_id == user.id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Kein Konto gefunden")

    entry = db.query(Watchlist).filter(
        Watchlist.account_id == account.id,
        Watchlist.ticker == ticker,
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Asset nicht in Watchlist")

    db.delete(entry)
    db.commit()

    return {"message": f"{ticker} aus Watchlist entfernt"}


@router.get("/watchlist")
def get_watchlist(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Gibt die Watchlist mit aktuellen Kursen zurück."""
    account = db.query(Account).filter(Account.user_id == user.id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Kein Konto gefunden")

    entries = db.query(Watchlist).filter(Watchlist.account_id == account.id).all()
    result = []

    for entry in entries:
        cached = db.query(PriceCache).filter(PriceCache.ticker == entry.ticker).first()
        if cached:
            change = 0.0
            change_percent = 0.0
            if cached.previous_close and cached.previous_close > 0:
                change = cached.price - cached.previous_close
                change_percent = (change / cached.previous_close) * 100

            result.append({
                "ticker": entry.ticker,
                "name": cached.name,
                "price": cached.price,
                "currency": cached.currency,
                "change": round(change, 2),
                "change_percent": round(change_percent, 2),
            })
        else:
            result.append({
                "ticker": entry.ticker,
                "name": entry.ticker,
                "price": None,
                "currency": "USD",
                "change": 0,
                "change_percent": 0,
            })

    return result

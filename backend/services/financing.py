"""
Financing-Service: Berechnung und Abbuchung von Overnight-Financing-Kosten.
Prüft Margin Calls und liquidiert Positionen bei Bedarf.
"""

from datetime import datetime, timezone
from sqlalchemy.orm import Session

from models import Position, Transaction, Trade, Account, PriceCache, AssetType

# Financing-Raten pro Tag je Asset-Klasse
FINANCING_RATES = {
    AssetType.STOCK: {"long": 0.00015, "short": 0.00012},     # ~5.5% / ~4.4% p.a.
    AssetType.ETF: {"long": 0.00015, "short": 0.00012},
    AssetType.CRYPTO: {"long": 0.00025, "short": 0.00025},    # ~9% p.a.
    AssetType.INDEX: {"long": 0.00013, "short": 0.00013},     # ~4.7% p.a.
}


def get_financing_rate(asset_type: str) -> float:
    """Gibt die tägliche Financing-Rate für den Asset-Typ zurück (Long)."""
    rates = FINANCING_RATES.get(asset_type, FINANCING_RATES[AssetType.STOCK])
    return rates["long"]


def calculate_daily_financing(position: Position) -> float:
    """
    Berechnet die täglichen Financing-Kosten für eine Position.
    financing_cost = position_value * financing_rate
    quantity enthält den Hebel bereits (quantity = margin * leverage / price).
    """
    if position.leverage <= 1:
        return 0.0

    position_value = position.entry_price * position.quantity
    daily_cost = position_value * position.financing_rate
    return round(daily_cost, 4)


def process_overnight_financing(db: Session):
    """
    Wird täglich um 23:59 vom Scheduler aufgerufen.
    Berechnet Financing-Kosten für alle offenen gehebelten Positionen.
    """
    # Alle Positionen mit Hebel > 1
    positions = db.query(Position).filter(Position.leverage > 1).all()

    for position in positions:
        cost = calculate_daily_financing(position)
        if cost <= 0:
            continue

        # Kosten vom Konto abziehen
        account = db.query(Account).filter(Account.id == position.account_id).first()
        if not account:
            continue

        account.balance -= cost
        position.accrued_financing += cost

        # Transaction-Eintrag erstellen
        now = datetime.now(timezone.utc)
        transaction = Transaction(
            account_id=account.id,
            amount=-cost,
            type="financing",
            description=f"Finanzierungskosten {position.ticker} {now.strftime('%d.%m.%Y')}",
        )
        db.add(transaction)

    db.commit()


def check_margin_call(position: Position, current_price: float, db: Session) -> bool:
    """
    Prüft ob eine Position liquidiert werden muss.
    Liquidation wenn unrealisierter Verlust > 90% der eingesetzten Margin.
    Gibt True zurück wenn liquidiert wurde.
    """
    if position.leverage <= 1:
        return False

    # Unrealisierter P&L berechnen (quantity enthält Hebel bereits)
    price_diff = current_price - position.entry_price
    unrealized_pnl = price_diff * position.quantity
    unrealized_pnl -= position.accrued_financing

    # Prüfe ob Verlust > 90% der Margin
    max_loss = position.margin_used * 0.9
    if unrealized_pnl < -max_loss:
        # Liquidation durchführen
        liquidate_position(position, current_price, db)
        return True

    return False


def liquidate_position(position: Position, current_price: float, db: Session):
    """Liquidiert eine Position (Margin Call)."""
    account = db.query(Account).filter(Account.id == position.account_id).first()
    if not account:
        return

    # P&L berechnen (quantity enthält Hebel bereits)
    price_diff = current_price - position.entry_price
    realized_pnl = price_diff * position.quantity
    realized_pnl -= position.accrued_financing
    realized_pnl -= 1.0  # Gebühr

    # Margin + P&L zurückbuchen
    payout = position.margin_used + realized_pnl
    if payout < 0:
        payout = 0  # Maximalverlust = Margin
    account.balance += payout

    # Trade-Eintrag erstellen
    trade = Trade(
        account_id=account.id,
        ticker=position.ticker,
        name=position.name,
        direction="sell",
        quantity=position.quantity,
        price=current_price,
        leverage=position.leverage,
        fee=1.0,
        realized_pnl=realized_pnl,
    )
    db.add(trade)

    # Transaction-Eintrag: payout = tatsächlicher Rückfluss aufs Konto
    transaction = Transaction(
        account_id=account.id,
        amount=payout,
        type="margin_call",
        description=(
            f"Margin Call – Position {position.ticker} liquidiert"
            f" | Auszahlung: {payout:.2f}€ (P&L: {realized_pnl:+.2f}€)"
        ),
    )
    db.add(transaction)

    # Position löschen
    db.delete(position)
    db.commit()


def check_all_margin_calls(db: Session):
    """Prüft alle offenen gehebelten Positionen auf Margin Calls."""
    positions = db.query(Position).filter(Position.leverage > 1).all()

    for position in positions:
        cached = db.query(PriceCache).filter(PriceCache.ticker == position.ticker).first()
        if not cached:
            continue
        check_margin_call(position, cached.price, db)

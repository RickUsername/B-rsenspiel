"""
Portfolio-Snapshot-Service: Speichert stündlich den Gesamtportfoliowert.
"""

from sqlalchemy.orm import Session

from models import Account, Position, PriceCache, PortfolioSnapshot


def take_portfolio_snapshots(db: Session):
    """Erstellt für alle Konten einen aktuellen Portfoliowert-Snapshot."""
    accounts = db.query(Account).all()

    for account in accounts:
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

        snapshot = PortfolioSnapshot(
            account_id=account.id,
            total_value=round(account.balance + portfolio_value, 2),
            balance=round(account.balance, 2),
            portfolio_value=round(portfolio_value, 2),
        )
        db.add(snapshot)

    db.commit()

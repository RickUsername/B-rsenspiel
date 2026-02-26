"""
Portfolio-Snapshot-Service: Speichert minütlich den Gesamtportfoliowert.
Bereinigt alte Snapshots: Minuten-Daten nur 24h, danach 1 pro Stunde behalten.
"""

from datetime import datetime, timezone, timedelta
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
                    pnl = (cached.price - pos.entry_price) * pos.quantity
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


def cleanup_old_snapshots(db: Session):
    """
    Bereinigt alte Portfolio-Snapshots um Datenbankgröße zu kontrollieren.

    Strategie:
    - Letzte 24 Stunden: alle Minuten-Snapshots behalten
    - Älter als 24 Stunden: nur 1 Snapshot pro Stunde behalten
    - Ältere Duplikate werden gelöscht
    """
    now = datetime.now(timezone.utc)
    cutoff_24h = now - timedelta(hours=24)

    accounts = db.query(Account).all()
    total_deleted = 0

    for account in accounts:
        old_snapshots = (
            db.query(PortfolioSnapshot)
            .filter(
                PortfolioSnapshot.account_id == account.id,
                PortfolioSnapshot.created_at < cutoff_24h,
            )
            .order_by(PortfolioSnapshot.created_at.asc())
            .all()
        )

        if not old_snapshots:
            continue

        # Pro Stunde den ersten Snapshot behalten, den Rest löschen
        seen_hours: set = set()
        to_delete: list[int] = []

        for snapshot in old_snapshots:
            dt = snapshot.created_at
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            hour_key = (dt.year, dt.month, dt.day, dt.hour)

            if hour_key in seen_hours:
                to_delete.append(snapshot.id)
            else:
                seen_hours.add(hour_key)

        if to_delete:
            db.query(PortfolioSnapshot).filter(
                PortfolioSnapshot.id.in_(to_delete)
            ).delete(synchronize_session=False)
            total_deleted += len(to_delete)

    if total_deleted > 0:
        db.commit()

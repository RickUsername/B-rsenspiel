"""
Catch-up Service: Verarbeitet verpasste Events während Server-Downtime.

Beim Server-Start wird geprüft ob eine Offline-Phase vorlag.
Falls ja, werden rückwirkend ausgeführt:
  - Overnight-Financing für verpasste Tage
  - Limit/Stop-Orders anhand historischer OHLCV-Daten
  - Margin Calls für gehebelte Positionen
"""

from datetime import datetime, timezone, timedelta, date
from sqlalchemy.orm import Session

from models import Order, Position, PriceCache, SystemState, Account, Transaction


def _get_state(db: Session, key: str) -> str | None:
    state = db.query(SystemState).filter(SystemState.key == key).first()
    return state.value if state else None


def _set_state(db: Session, key: str, value: str):
    state = db.query(SystemState).filter(SystemState.key == key).first()
    if state:
        state.value = value
    else:
        db.add(SystemState(key=key, value=value))
    db.commit()


def update_last_run(db: Session):
    """Aktualisiert den letzten Server-Lauf-Zeitpunkt. Wird nach jedem Preis-Update aufgerufen."""
    _set_state(db, "last_price_check", datetime.now(timezone.utc).isoformat())


def run_catchup_if_needed(db: Session):
    """
    Prüft ob Server-Downtime war und verarbeitet verpasste Events.
    Wird einmalig beim Server-Start aufgerufen.
    """
    last_run_str = _get_state(db, "last_price_check")
    now = datetime.now(timezone.utc)

    if last_run_str is None:
        # Erster Start: Zustand initialisieren
        update_last_run(db)
        _set_state(db, "last_financing_date", now.date().isoformat())
        return

    last_run = datetime.fromisoformat(last_run_str)
    if last_run.tzinfo is None:
        last_run = last_run.replace(tzinfo=timezone.utc)

    gap_seconds = (now - last_run).total_seconds()

    # Nur bei echter Downtime (>5 Minuten) Catch-up durchführen
    if gap_seconds < 300:
        update_last_run(db)
        return

    hours_offline = gap_seconds / 3600
    print(f"[Catch-up] Server war {hours_offline:.1f} Stunden offline. Starte Catch-up...")

    _catchup_overnight_financing(db, now)
    _catchup_orders_and_margin_calls(db, last_run, now, gap_seconds)

    update_last_run(db)
    print("[Catch-up] Abgeschlossen.")


def _catchup_overnight_financing(db: Session, now: datetime):
    """
    Berechnet verpasste Overnight-Financing-Kosten.
    Beispiel: Server war 3 Tage offline → 2 verpasste Finanzierungstage werden nachgeholt.
    (Der heutige Tag wird vom regulären Scheduler um 23:59 abgerechnet.)
    """
    from services.financing import calculate_daily_financing

    last_date_str = _get_state(db, "last_financing_date")
    if last_date_str is None:
        _set_state(db, "last_financing_date", now.date().isoformat())
        return

    last_date = date.fromisoformat(last_date_str)
    today = now.date()

    # Verpasste Tage = Tage zwischen letzter Abrechnung und heute (exklusiv heute)
    missed_days = max(0, (today - last_date).days - 1)
    if missed_days <= 0:
        _set_state(db, "last_financing_date", today.isoformat())
        return

    print(f"[Catch-up] {missed_days} verpasste Financing-Tage werden nachgeholt...")

    positions = db.query(Position).filter(Position.leverage > 1).all()
    for position in positions:
        account = db.query(Account).filter(Account.id == position.account_id).first()
        if not account:
            continue

        daily_cost = calculate_daily_financing(position)
        if daily_cost <= 0:
            continue

        total_cost = daily_cost * missed_days
        account.balance -= total_cost
        position.accrued_financing += total_cost

        transaction = Transaction(
            account_id=account.id,
            amount=-total_cost,
            type="financing",
            description=(
                f"Finanzierungskosten {position.ticker} "
                f"({missed_days} Tage Nachholung nach Server-Neustart)"
            ),
        )
        db.add(transaction)

    db.commit()
    _set_state(db, "last_financing_date", today.isoformat())


def _catchup_orders_and_margin_calls(
    db: Session, last_run: datetime, now: datetime, gap_seconds: float
):
    """
    Verarbeitet Orders und Margin Calls anhand historischer OHLCV-Daten.

    Nutzt yfinance:
    - < 7 Tage offline → 1-Minuten-Intervall (höchste Genauigkeit)
    - < 60 Tage offline → 1-Stunden-Intervall
    - > 60 Tage offline → 1-Tages-Intervall
    """
    import yfinance as yf

    if gap_seconds < 7 * 86400:
        interval = "1m"
    elif gap_seconds < 60 * 86400:
        interval = "1h"
    else:
        interval = "1d"

    pending_orders = db.query(Order).filter(Order.status == "pending").all()
    leveraged_positions = db.query(Position).filter(Position.leverage > 1).all()

    tickers_to_fetch: set[str] = set()
    for order in pending_orders:
        tickers_to_fetch.add(order.ticker)
    for pos in leveraged_positions:
        tickers_to_fetch.add(pos.ticker)

    if not tickers_to_fetch:
        return

    print(f"[Catch-up] Lade historische Daten für {len(tickers_to_fetch)} Ticker ({interval})...")

    price_history: dict = {}
    for ticker in tickers_to_fetch:
        try:
            hist = yf.Ticker(ticker).history(
                start=last_run,
                end=now,
                interval=interval,
                auto_adjust=True,
            )
            if not hist.empty:
                price_history[ticker] = hist
        except Exception as e:
            print(f"[Catch-up] Keine Daten für {ticker}: {e}")

    # Zuerst Margin Calls prüfen (können Positionen löschen, bevor Orders verarbeitet werden)
    _process_missed_margin_calls(db, leveraged_positions, price_history)

    # Dann Orders verarbeiten
    _process_missed_orders(db, pending_orders, price_history)


def _process_missed_margin_calls(db: Session, positions: list, price_history: dict):
    """Prüft ob Positionen während der Downtime liquidiert werden mussten."""
    from services.financing import liquidate_position

    for position in positions:
        if position.stop_loss_price is None or position.stop_loss_price <= 0:
            continue

        hist = price_history.get(position.ticker)
        if hist is None or hist.empty:
            continue

        for _ts, row in hist.iterrows():
            if row["Low"] <= position.stop_loss_price:
                print(
                    f"[Catch-up] Margin Call: {position.ticker} "
                    f"Stop-Loss @ {position.stop_loss_price:.4f}"
                )
                # Position zum Stop-Loss-Preis liquidieren
                # PriceCache kurz auf historischen Preis setzen damit Trade korrekt eingetragen wird
                cached = (
                    db.query(PriceCache)
                    .filter(PriceCache.ticker == position.ticker)
                    .first()
                )
                original_price = cached.price if cached else None
                if cached:
                    cached.price = position.stop_loss_price
                    db.flush()

                liquidate_position(position, position.stop_loss_price, db)

                if cached and original_price is not None:
                    # Cache-Objekt neu laden (nach liquidate_position commit)
                    db.refresh(cached)
                    cached.price = original_price
                    db.commit()
                break


def _process_missed_orders(db: Session, orders: list, price_history: dict):
    """Führt Orders aus die während der Downtime hätten ausgelöst werden müssen."""
    from services.trading_engine import buy_asset, sell_position

    for order in orders:
        hist = price_history.get(order.ticker)
        if hist is None or hist.empty:
            continue

        triggered_price = None
        triggered_at = None
        for ts, row in hist.iterrows():
            low = row["Low"]
            high = row["High"]

            if order.order_type == "limit_buy" and low <= order.limit_price:
                triggered_price = order.limit_price
                triggered_at = ts
                break
            elif order.order_type == "limit_sell" and high >= order.limit_price:
                triggered_price = order.limit_price
                triggered_at = ts
                break
            elif order.order_type == "stop_loss" and low <= order.limit_price:
                triggered_price = order.limit_price
                triggered_at = ts
                break

        if triggered_price is None:
            continue

        # Prüfe ob zugehörige Position noch existiert (bei Verkauf-Orders)
        if order.order_type in ("limit_sell", "stop_loss") and order.position_id:
            pos = db.query(Position).filter(Position.id == order.position_id).first()
            if not pos:
                order.status = "cancelled"
                db.commit()
                continue

        # PriceCache temporär auf historischen Auslösepreis setzen
        cached = (
            db.query(PriceCache).filter(PriceCache.ticker == order.ticker).first()
        )
        original_price = cached.price if cached else None

        try:
            if cached:
                cached.price = triggered_price
                db.flush()

            if order.order_type == "limit_buy":
                buy_asset(
                    db=db,
                    account_id=order.account_id,
                    ticker=order.ticker,
                    amount_eur=order.amount_eur,
                    leverage=order.leverage,
                )
            else:
                sell_position(
                    db=db,
                    account_id=order.account_id,
                    position_id=order.position_id,
                    sell_quantity=order.sell_quantity,
                )

            order.status = "executed"
            # Echten historischen Auslösezeitpunkt verwenden
            if triggered_at is not None:
                exec_time = triggered_at.to_pydatetime() if hasattr(triggered_at, 'to_pydatetime') else triggered_at
                if exec_time.tzinfo is None:
                    exec_time = exec_time.replace(tzinfo=timezone.utc)
                order.executed_at = exec_time
            else:
                order.executed_at = datetime.now(timezone.utc)
            print(
                f"[Catch-up] Order ausgeführt: {order.order_type} "
                f"{order.ticker} @ {triggered_price:.4f} (Zeitpunkt: {order.executed_at})"
            )
            db.commit()

        except Exception as e:
            print(f"[Catch-up] Order Fehler {order.ticker}: {e}")
            db.rollback()

        finally:
            # Originalpreis wiederherstellen
            if original_price is not None:
                cached = (
                    db.query(PriceCache)
                    .filter(PriceCache.ticker == order.ticker)
                    .first()
                )
                if cached:
                    cached.price = original_price
                    db.commit()

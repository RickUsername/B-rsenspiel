"""
APScheduler-Konfiguration: Automatische Kurs-Updates und Financing-Berechnung.
"""

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger

from database import SessionLocal
from services.market_data import refresh_all_cached_prices
from services.financing import process_overnight_financing, check_all_margin_calls
from services.orders import process_pending_orders
from services.portfolio_snapshots import take_portfolio_snapshots, cleanup_old_snapshots
from services.catchup import update_last_run

scheduler = BackgroundScheduler()


def update_prices_job():
    """Job: Aktualisiert alle gecachten Preise alle 60 Sekunden."""
    db = SessionLocal()
    try:
        refresh_all_cached_prices(db)
        check_all_margin_calls(db)
        process_pending_orders(db)
        update_last_run(db)  # Zeitpunkt merken für Downtime-Erkennung
    finally:
        db.close()


def overnight_financing_job():
    """Job: Berechnet Financing-Kosten täglich um 23:59."""
    db = SessionLocal()
    try:
        process_overnight_financing(db)
        # Letztes Financing-Datum aktualisieren
        from datetime import datetime, timezone
        from services.catchup import _set_state
        _set_state(db, "last_financing_date", datetime.now(timezone.utc).date().isoformat())
    finally:
        db.close()


def portfolio_snapshot_job():
    """Job: Speichert minütlich den Portfoliowert für den Dashboard-Chart."""
    db = SessionLocal()
    try:
        take_portfolio_snapshots(db)
    finally:
        db.close()


def cleanup_snapshots_job():
    """Job: Bereinigt alte Portfolio-Snapshots stündlich."""
    db = SessionLocal()
    try:
        cleanup_old_snapshots(db)
    finally:
        db.close()


def start_scheduler():
    """Startet den Scheduler mit allen Jobs."""
    # Preis-Updates alle 60 Sekunden (inkl. Margin-Checks und Order-Verarbeitung)
    scheduler.add_job(
        update_prices_job,
        trigger=IntervalTrigger(seconds=60),
        id="update_prices",
        name="Kurs-Updates alle 60 Sekunden",
        replace_existing=True,
    )

    # Overnight-Financing täglich um 23:59
    scheduler.add_job(
        overnight_financing_job,
        trigger=CronTrigger(hour=23, minute=59),
        id="overnight_financing",
        name="Tägliche Finanzierungskosten",
        replace_existing=True,
    )

    # Portfolio-Snapshots jede Minute (für Dashboard-Chart)
    scheduler.add_job(
        portfolio_snapshot_job,
        trigger=IntervalTrigger(minutes=1),
        id="portfolio_snapshots",
        name="Minütliche Portfolio-Snapshots",
        replace_existing=True,
    )

    # Snapshot-Bereinigung stündlich (Minuten-Daten älter als 24h → 1 pro Stunde behalten)
    scheduler.add_job(
        cleanup_snapshots_job,
        trigger=IntervalTrigger(hours=1),
        id="cleanup_snapshots",
        name="Stündliche Snapshot-Bereinigung",
        replace_existing=True,
    )

    scheduler.start()


def stop_scheduler():
    """Stoppt den Scheduler."""
    if scheduler.running:
        scheduler.shutdown(wait=False)

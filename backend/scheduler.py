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
from services.portfolio_snapshots import take_portfolio_snapshots

scheduler = BackgroundScheduler()


def update_prices_job():
    """Job: Aktualisiert alle gecachten Preise alle 60 Sekunden."""
    db = SessionLocal()
    try:
        refresh_all_cached_prices(db)
        check_all_margin_calls(db)
        process_pending_orders(db)
    finally:
        db.close()


def overnight_financing_job():
    """Job: Berechnet Financing-Kosten täglich um 23:59."""
    db = SessionLocal()
    try:
        process_overnight_financing(db)
    finally:
        db.close()


def portfolio_snapshot_job():
    """Job: Speichert stündlich den Portfoliowert für den Dashboard-Chart."""
    db = SessionLocal()
    try:
        take_portfolio_snapshots(db)
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

    # Portfolio-Snapshots stündlich
    scheduler.add_job(
        portfolio_snapshot_job,
        trigger=IntervalTrigger(hours=1),
        id="portfolio_snapshots",
        name="Stündliche Portfolio-Snapshots",
        replace_existing=True,
    )

    scheduler.start()


def stop_scheduler():
    """Stoppt den Scheduler."""
    if scheduler.running:
        scheduler.shutdown(wait=False)

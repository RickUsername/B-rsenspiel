"""
Order-Service: Verarbeitung von Limit- und Stop-Orders.
Wird vom Scheduler nach jedem Preis-Update aufgerufen.
"""

import logging
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from models import Order, PriceCache, Position

logger = logging.getLogger(__name__)


def process_pending_orders(db: Session):
    """
    Prüft alle offenen Orders ob sie ausgelöst werden sollen.
    - limit_buy:  Kauf wenn aktueller Preis <= limit_price
    - limit_sell: Verkauf wenn aktueller Preis >= limit_price
    - stop_loss:  Verkauf wenn aktueller Preis <= limit_price
    """
    from services.trading_engine import buy_asset, sell_position

    orders = db.query(Order).filter(Order.status == "pending").all()

    for order in orders:
        cached = db.query(PriceCache).filter(PriceCache.ticker == order.ticker).first()
        if not cached:
            continue

        current_price = cached.price
        triggered = False

        if order.order_type == "limit_buy":
            triggered = current_price <= order.limit_price
        elif order.order_type == "limit_sell":
            triggered = current_price >= order.limit_price
        elif order.order_type == "stop_loss":
            triggered = current_price <= order.limit_price

        if not triggered:
            continue

        # Prüfe ob zugehörige Position noch existiert (bei Verkauf-Orders)
        if order.order_type in ("limit_sell", "stop_loss") and order.position_id:
            pos = db.query(Position).filter(Position.id == order.position_id).first()
            if not pos:
                order.status = "cancelled"
                continue

        try:
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
            order.executed_at = datetime.now(timezone.utc)
            db.commit()
        except Exception as e:
            logger.error(f"Order #{order.id} ({order.order_type} {order.ticker}) fehlgeschlagen: {e}")
            db.rollback()

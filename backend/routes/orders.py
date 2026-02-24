"""
API-Routen für Limit- und Stop-Orders mit Liquiditätsprüfung.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session

from database import get_db
from models import User, Account, Order, Position, PriceCache
from auth import get_current_user

router = APIRouter(prefix="/orders", tags=["Orders"])


class CreateOrderRequest(BaseModel):
    """Request-Body für eine neue Order."""
    ticker: str
    order_type: str          # limit_buy, limit_sell, stop_loss
    limit_price: float       # Auslösepreis

    # Für limit_buy
    amount_eur: Optional[float] = None
    leverage: int = 1

    # Für limit_sell / stop_loss
    position_id: Optional[int] = None
    sell_quantity: Optional[float] = None  # None = alles


@router.post("")
def create_order(
    request: CreateOrderRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Erstellt eine neue Limit- oder Stop-Order."""
    account = db.query(Account).filter(Account.user_id == user.id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Kein Konto gefunden")

    if request.order_type not in ("limit_buy", "limit_sell", "stop_loss"):
        raise HTTPException(status_code=400, detail="Ungültiger Order-Typ")

    if request.limit_price <= 0:
        raise HTTPException(status_code=400, detail="Auslösepreis muss positiv sein")

    # Preis-Cache prüfen (Asset muss bekannt sein)
    cached = db.query(PriceCache).filter(PriceCache.ticker == request.ticker.upper()).first()
    name = cached.name if cached else request.ticker.upper()

    if request.order_type == "limit_buy":
        if not request.amount_eur or request.amount_eur <= 0:
            raise HTTPException(status_code=400, detail="Betrag für Kauf-Order erforderlich")

        # Summe aller offenen Kauf-Orders berechnen
        from sqlalchemy import func as sa_func
        reserved = db.query(
            sa_func.coalesce(sa_func.sum(Order.amount_eur), 0.0)
        ).filter(
            Order.account_id == account.id,
            Order.order_type == "limit_buy",
            Order.status == "pending",
        ).scalar()

        available = account.balance - float(reserved)
        total_needed = request.amount_eur + 1.0  # +1€ Gebühr
        if total_needed > available:
            raise HTTPException(
                status_code=400,
                detail=f"Nicht genug Liquidität. Verfügbar: {available:.2f}€ (abzgl. offener Orders), benötigt: {total_needed:.2f}€",
            )

    elif request.order_type in ("limit_sell", "stop_loss"):
        if not request.position_id:
            raise HTTPException(status_code=400, detail="Position-ID für Verkauf-Order erforderlich")
        position = db.query(Position).filter(
            Position.id == request.position_id,
            Position.account_id == account.id,
        ).first()
        if not position:
            raise HTTPException(status_code=404, detail="Position nicht gefunden")
        if request.sell_quantity and request.sell_quantity > position.quantity:
            raise HTTPException(
                status_code=400,
                detail=f"Verkaufsmenge überschreitet Positionsgröße ({position.quantity:.4f})"
            )

    order = Order(
        account_id=account.id,
        ticker=request.ticker.upper(),
        name=name,
        order_type=request.order_type,
        limit_price=request.limit_price,
        amount_eur=request.amount_eur,
        leverage=request.leverage,
        position_id=request.position_id,
        sell_quantity=request.sell_quantity,
    )
    db.add(order)
    db.commit()
    db.refresh(order)

    return {
        "id": order.id,
        "ticker": order.ticker,
        "order_type": order.order_type,
        "limit_price": order.limit_price,
        "status": order.status,
        "created_at": order.created_at.isoformat() if order.created_at else None,
    }


@router.get("")
def get_orders(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Gibt alle Orders des Users zurück (offen + abgeschlossen)."""
    account = db.query(Account).filter(Account.user_id == user.id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Kein Konto gefunden")

    orders = (
        db.query(Order)
        .filter(Order.account_id == account.id)
        .order_by(Order.created_at.desc())
        .all()
    )

    return [
        {
            "id": o.id,
            "ticker": o.ticker,
            "name": o.name,
            "order_type": o.order_type,
            "status": o.status,
            "limit_price": o.limit_price,
            "amount_eur": o.amount_eur,
            "leverage": o.leverage,
            "position_id": o.position_id,
            "sell_quantity": o.sell_quantity,
            "created_at": o.created_at.isoformat() if o.created_at else None,
            "executed_at": o.executed_at.isoformat() if o.executed_at else None,
        }
        for o in orders
    ]


@router.delete("/{order_id}")
def cancel_order(
    order_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Storniert eine offene Order."""
    account = db.query(Account).filter(Account.user_id == user.id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Kein Konto gefunden")

    order = db.query(Order).filter(
        Order.id == order_id,
        Order.account_id == account.id,
    ).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order nicht gefunden")

    if order.status != "pending":
        raise HTTPException(status_code=400, detail=f"Order kann nicht storniert werden (Status: {order.status})")

    order.status = "cancelled"
    db.commit()

    return {"message": f"Order #{order_id} storniert"}

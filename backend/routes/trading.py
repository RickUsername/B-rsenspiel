"""
API-Routen für Trading: Kauf und Verkauf von Assets.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import User, Account
from auth import get_current_user
from services.trading_engine import buy_asset, sell_position, get_available_leverage

router = APIRouter(prefix="/trading", tags=["Trading"])


class BuyRequest(BaseModel):
    """Request-Body für einen Kauf."""
    ticker: str
    amount: float  # Betrag in € (bei Hebel = Margin-Einsatz)
    leverage: int = 1


class SellRequest(BaseModel):
    """Request-Body für einen Verkauf."""
    position_id: int


@router.post("/buy")
def buy(
    request: BuyRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Kauft ein Asset mit optionalem Hebel.
    Der Betrag ist der Margin-Einsatz (bei Hebel) oder der Investitionsbetrag (ohne Hebel).
    Gebühr: 1€ pro Trade.
    """
    if request.amount <= 0:
        raise HTTPException(status_code=400, detail="Betrag muss positiv sein")

    account = db.query(Account).filter(Account.user_id == user.id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Kein Konto gefunden")

    try:
        result = buy_asset(
            db=db,
            account_id=account.id,
            ticker=request.ticker.upper(),
            amount_eur=request.amount,
            leverage=request.leverage,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/sell")
def sell(
    request: SellRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Verkauft eine offene Position.
    Berechnet P&L, zieht Financing-Kosten und Gebühr ab.
    """
    account = db.query(Account).filter(Account.user_id == user.id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Kein Konto gefunden")

    try:
        result = sell_position(db=db, account_id=account.id, position_id=request.position_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/leverage/{asset_type}")
def get_leverage_options(asset_type: str):
    """Gibt die verfügbaren Hebel für einen Asset-Typ zurück."""
    options = get_available_leverage(asset_type)
    return {"asset_type": asset_type, "leverage_options": options}

"""
Börsenspiel – FastAPI Hauptanwendung.
Initialisiert die Datenbank, startet den Scheduler und konfiguriert CORS.
Beinhaltet WebSocket-Endpoint für Live-Portfolio-Updates.
"""

import json
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from database import init_db, get_db, SessionLocal
from scheduler import start_scheduler, stop_scheduler
from models import Account, Position, PriceCache
from routes import users, portfolio, trading, market, orders


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup und Shutdown Events."""
    # Startup
    init_db()
    start_scheduler()
    print("Börsenspiel Backend gestartet!")
    yield
    # Shutdown
    stop_scheduler()
    print("Börsenspiel Backend gestoppt.")


app = FastAPI(
    title="Börsenspiel API",
    description="Virtuelles Börsenspiel mit realistischer Marktabbildung",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS für Frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Router einbinden
app.include_router(users.router)
app.include_router(portfolio.router)
app.include_router(trading.router)
app.include_router(market.router)
app.include_router(orders.router)


@app.get("/", tags=["Status"])
def root():
    """Health-Check Endpoint."""
    return {"status": "ok", "app": "Börsenspiel", "version": "1.0.0"}


@app.websocket("/ws/{account_id}")
async def websocket_endpoint(websocket: WebSocket, account_id: int):
    """
    WebSocket für Live-Portfolio-Updates.
    Sendet alle 60 Sekunden aktualisierte Portfolio-Daten.
    """
    await websocket.accept()

    try:
        import asyncio
        while True:
            db = SessionLocal()
            try:
                account = db.query(Account).filter(Account.id == account_id).first()
                if not account:
                    await websocket.send_json({"error": "Konto nicht gefunden"})
                    break

                # Positionen mit aktuellem P&L
                positions = db.query(Position).filter(Position.account_id == account_id).all()
                portfolio_data = []
                portfolio_value = 0.0

                for pos in positions:
                    cached = db.query(PriceCache).filter(PriceCache.ticker == pos.ticker).first()
                    current_price = cached.price if cached else pos.entry_price

                    price_diff = current_price - pos.entry_price
                    unrealized_pnl = price_diff * pos.quantity * pos.leverage
                    unrealized_pnl -= pos.accrued_financing

                    position_current_value = pos.margin_used + unrealized_pnl
                    portfolio_value += max(position_current_value, 0)

                    pnl_percent = (unrealized_pnl / pos.margin_used * 100) if pos.margin_used > 0 else 0

                    portfolio_data.append({
                        "id": pos.id,
                        "ticker": pos.ticker,
                        "name": pos.name,
                        "quantity": pos.quantity,
                        "entry_price": pos.entry_price,
                        "current_price": current_price,
                        "leverage": pos.leverage,
                        "unrealized_pnl": round(unrealized_pnl, 2),
                        "pnl_percent": round(pnl_percent, 2),
                        "accrued_financing": round(pos.accrued_financing, 2),
                        "margin_used": pos.margin_used,
                    })

                await websocket.send_json({
                    "type": "portfolio_update",
                    "balance": round(account.balance, 2),
                    "portfolio_value": round(portfolio_value, 2),
                    "total_value": round(account.balance + portfolio_value, 2),
                    "positions": portfolio_data,
                })
            finally:
                db.close()

            await asyncio.sleep(10)  # Updates alle 10 Sekunden

    except WebSocketDisconnect:
        pass
    except Exception:
        pass

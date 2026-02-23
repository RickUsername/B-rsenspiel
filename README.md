# Börsenspiel

Virtuelles Börsenspiel mit realistischer Marktabbildung. Trade Republic-inspiriertes Design.

## Features

- Echtzeitkurse via yfinance (Aktien, ETFs, Krypto, Indizes)
- Leveraged Trading (Hebel bis 20x)
- Overnight-Financing-Kosten
- Automatische Margin Calls
- Live Portfolio-Updates via WebSocket
- Kontoauszug mit Transaktionshistorie

## Tech-Stack

**Backend:** Python 3.11+, FastAPI, SQLite, SQLAlchemy, yfinance, APScheduler
**Frontend:** React (Vite), Tailwind CSS, Recharts, Axios

## Installation

### Backend

```bash
cd backend
pip install -r requirements.txt
```

### Frontend

```bash
cd frontend
npm install
```

## Starten

### Option 1: Start-Script

```bash
chmod +x start.sh
./start.sh
```

### Option 2: Manuell

Backend (Port 8000):
```bash
cd backend
uvicorn main:app --reload --port 8000
```

Frontend (Port 5173):
```bash
cd frontend
npm run dev
```

## Konfiguration

Kopiere `.env.example` nach `.env` und passe die Werte an:

```
SECRET_KEY=dein-geheimer-jwt-schluessel
DATABASE_URL=sqlite:///./boersenspiel.db
```

## API-Dokumentation

Swagger UI: http://localhost:8000/docs

## Projektstruktur

```
/backend
  main.py              # FastAPI App + WebSocket
  database.py          # SQLAlchemy Konfiguration
  models.py            # Datenbank-Modelle
  auth.py              # JWT-Authentifizierung
  scheduler.py         # APScheduler Jobs
  /routes
    users.py           # Auth-Endpoints
    portfolio.py       # Konto & Positionen
    trading.py         # Kauf/Verkauf
    market.py          # Kursdaten & Suche
  /services
    market_data.py     # yfinance Integration
    trading_engine.py  # Trading-Logik
    financing.py       # Financing & Margin Calls

/frontend
  /src
    /components        # Navbar, PriceTag, Modals, LivePnL
    /pages             # Dashboard, Portfolio, Market, AssetDetail, Transactions, Login
    /hooks             # API-Client, WebSocket-Hook
    /context           # AuthContext
    App.jsx            # Routing
```

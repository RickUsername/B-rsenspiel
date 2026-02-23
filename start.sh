#!/bin/bash
# Börsenspiel – Start Backend und Frontend gleichzeitig

echo "🚀 Starte Börsenspiel..."

# Backend starten
echo "📡 Starte Backend auf Port 8000..."
cd backend
# Virtual Environment nutzen
if [ ! -f "../.venv/bin/uvicorn" ]; then
  python3 -m venv ../.venv
  ../.venv/bin/pip install -r requirements.txt --quiet
fi
../.venv/bin/uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!
cd ..

# Frontend starten
echo "🖥️  Starte Frontend auf Port 5173..."
cd frontend
npm install --silent 2>/dev/null
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "✅ Börsenspiel läuft!"
echo "   Backend:  http://localhost:8000"
echo "   Frontend: http://localhost:5173"
echo "   API Docs: http://localhost:8000/docs"
echo ""
echo "Drücke Ctrl+C zum Beenden."

# Auf Ctrl+C warten und beide Prozesse beenden
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait

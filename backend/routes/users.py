"""
API-Routen für Authentifizierung: Registrierung und Login.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import User, Account
from auth import hash_password, verify_password, create_access_token

router = APIRouter(prefix="/auth", tags=["Authentifizierung"])


class RegisterRequest(BaseModel):
    """Request-Body für die Registrierung."""
    username: str
    password: str


class LoginRequest(BaseModel):
    """Request-Body für den Login."""
    username: str
    password: str


class TokenResponse(BaseModel):
    """Response mit JWT-Token."""
    access_token: str
    token_type: str = "bearer"
    username: str
    account_id: int


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(request: RegisterRequest, db: Session = Depends(get_db)):
    """
    Registriert einen neuen Benutzer.
    Erstellt automatisch ein Konto und gibt einen JWT-Token zurück.
    """
    if len(request.username) < 3:
        raise HTTPException(status_code=400, detail="Username muss mindestens 3 Zeichen lang sein")
    if len(request.password) < 6:
        raise HTTPException(status_code=400, detail="Passwort muss mindestens 6 Zeichen lang sein")

    # Prüfe ob Username schon existiert
    existing = db.query(User).filter(User.username == request.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username bereits vergeben")

    # User erstellen
    user = User(
        username=request.username,
        password_hash=hash_password(request.password),
    )
    db.add(user)
    db.flush()

    # Konto erstellen
    account = Account(user_id=user.id, balance=0.0)
    db.add(account)
    db.commit()
    db.refresh(user)
    db.refresh(account)

    # Token generieren
    token = create_access_token({"sub": str(user.id)})

    return TokenResponse(
        access_token=token,
        username=user.username,
        account_id=account.id,
    )


@router.post("/login", response_model=TokenResponse)
def login(request: LoginRequest, db: Session = Depends(get_db)):
    """
    Meldet einen Benutzer an und gibt einen JWT-Token zurück.
    """
    user = db.query(User).filter(User.username == request.username).first()
    if not user or not verify_password(request.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Ungültiger Username oder Passwort")

    account = db.query(Account).filter(Account.user_id == user.id).first()
    if not account:
        raise HTTPException(status_code=500, detail="Kein Konto gefunden")

    token = create_access_token({"sub": str(user.id)})

    return TokenResponse(
        access_token=token,
        username=user.username,
        account_id=account.id,
    )

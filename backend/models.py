"""
SQLAlchemy-Modelle für die Börsenspiel-Datenbank.
Definiert alle Tabellen: users, accounts, transactions, positions, trades, price_cache, watchlist.
"""

from sqlalchemy import (
    Column, Integer, String, Float, DateTime, ForeignKey, Enum as SAEnum
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
import enum


class TransactionType(str, enum.Enum):
    """Typ einer Kontobewegung."""
    DEPOSIT = "deposit"
    WITHDRAWAL = "withdrawal"
    TRADE_BUY = "trade_buy"
    TRADE_SELL = "trade_sell"
    FEE = "fee"
    FINANCING = "financing"
    MARGIN_CALL = "margin_call"


class AssetType(str, enum.Enum):
    """Unterstützte Asset-Klassen."""
    STOCK = "stock"
    ETF = "etf"
    CRYPTO = "crypto"
    INDEX = "index"


class User(Base):
    """Benutzer-Tabelle."""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    accounts = relationship("Account", back_populates="user")


class Account(Base):
    """Konto-Tabelle: Jeder User hat ein Konto mit Balance."""
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    balance = Column(Float, default=0.0)
    created_at = Column(DateTime, server_default=func.now())

    user = relationship("User", back_populates="accounts")
    transactions = relationship("Transaction", back_populates="account")
    positions = relationship("Position", back_populates="account")
    trades = relationship("Trade", back_populates="account")
    watchlist = relationship("Watchlist", back_populates="account")


class Transaction(Base):
    """Kontobewegungen: Einzahlungen, Trades, Gebühren, Financing."""
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    amount = Column(Float, nullable=False)
    type = Column(String, nullable=False)
    description = Column(String, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    account = relationship("Account", back_populates="transactions")


class Position(Base):
    """Offene Positionen im Portfolio."""
    __tablename__ = "positions"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    ticker = Column(String, nullable=False)
    name = Column(String, nullable=False)
    asset_type = Column(String, nullable=False)
    quantity = Column(Float, nullable=False)
    entry_price = Column(Float, nullable=False)
    leverage = Column(Float, default=1.0)
    financing_rate = Column(Float, default=0.0)  # Täglicher Zinssatz
    margin_used = Column(Float, nullable=False)
    stop_loss_price = Column(Float, nullable=True)
    accrued_financing = Column(Float, default=0.0)  # Aufgelaufene Financing-Kosten
    created_at = Column(DateTime, server_default=func.now())

    account = relationship("Account", back_populates="positions")


class Trade(Base):
    """Abgeschlossene Trades (History)."""
    __tablename__ = "trades"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    ticker = Column(String, nullable=False)
    name = Column(String, default="")
    direction = Column(String, nullable=False)  # buy/sell
    quantity = Column(Float, nullable=False)
    price = Column(Float, nullable=False)
    leverage = Column(Float, default=1.0)
    fee = Column(Float, default=1.0)
    realized_pnl = Column(Float, default=0.0)
    created_at = Column(DateTime, server_default=func.now())

    account = relationship("Account", back_populates="trades")


class PriceCache(Base):
    """Cache für aktuelle Kursdaten."""
    __tablename__ = "price_cache"

    ticker = Column(String, primary_key=True)
    price = Column(Float, nullable=False)
    previous_close = Column(Float, nullable=True)
    currency = Column(String, default="USD")
    name = Column(String, default="")
    asset_type = Column(String, default="stock")
    last_updated = Column(DateTime, server_default=func.now(), onupdate=func.now())


class Watchlist(Base):
    """Watchlist: Assets die der User beobachtet."""
    __tablename__ = "watchlist"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    ticker = Column(String, nullable=False)
    added_at = Column(DateTime, server_default=func.now())

    account = relationship("Account", back_populates="watchlist")

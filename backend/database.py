"""
Datenbank-Konfiguration und Session-Management.
Verwendet SQLAlchemy mit SQLite als Backend.
"""

import logging
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./boersenspiel.db")

# Render setzt postgres://, SQLAlchemy braucht postgresql://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# Log masked URL for debugging
masked = DATABASE_URL[:DATABASE_URL.find("://") + 3] + "***" + DATABASE_URL[DATABASE_URL.rfind("@"):] if "@" in DATABASE_URL else DATABASE_URL
logger.warning(f"DATABASE_URL: {masked}")
print(f"DATABASE_URL: {masked}")

# SQLite braucht check_same_thread=False, PostgreSQL nicht
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    echo=False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """FastAPI Dependency: Gibt eine DB-Session zurück und schließt sie nach dem Request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Erstellt alle Tabellen beim ersten Start."""
    from models import Base as ModelsBase  # noqa: F811
    ModelsBase.metadata.create_all(bind=engine)

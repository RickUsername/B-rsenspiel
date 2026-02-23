"""
Datenbank-Konfiguration und Session-Management.
Verwendet SQLAlchemy mit SQLite als Backend.
"""

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./boersenspiel.db")

# SQLite braucht check_same_thread=False für FastAPI
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
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

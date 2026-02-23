"""
Trading Engine: Kauf und Verkauf von Assets mit Hebel-Unterstützung.
"""

from sqlalchemy.orm import Session

from models import Account, Position, Trade, Transaction, PriceCache, AssetType
from services.financing import get_financing_rate

# Verfügbare Hebel je Asset-Klasse
AVAILABLE_LEVERAGE = {
    AssetType.STOCK: [1, 2, 5],
    AssetType.ETF: [1, 2, 5],
    AssetType.CRYPTO: [1, 2, 3, 5, 10],
    AssetType.INDEX: [1, 2, 5, 10, 20],
}

FEE = 1.0  # 1€ Gebühr pro Trade


def get_available_leverage(asset_type: str) -> list[int]:
    """Gibt die verfügbaren Hebel für den Asset-Typ zurück."""
    return AVAILABLE_LEVERAGE.get(asset_type, [1, 2, 5])


def calculate_stop_loss(entry_price: float, leverage: float, margin: float, quantity: float) -> float:
    """
    Berechnet den Stop-Loss-Preis (Liquidation bei 90% Margin-Verlust).
    stop_loss = entry_price - (0.9 * margin) / (quantity * leverage)
    """
    if leverage <= 1:
        return 0.0
    max_loss_per_unit = (0.9 * margin) / (quantity * leverage)
    return round(entry_price - max_loss_per_unit, 4)


def buy_asset(
    db: Session,
    account_id: int,
    ticker: str,
    amount_eur: float,
    leverage: int = 1,
) -> dict:
    """
    Kauft ein Asset.
    1. Prüft Balance (bei Hebel nur Margin nötig)
    2. Zieht Margin + Gebühr vom Konto ab
    3. Erstellt Position
    """
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise ValueError("Konto nicht gefunden")

    # Kurs aus Cache holen
    cached = db.query(PriceCache).filter(PriceCache.ticker == ticker).first()
    if not cached:
        raise ValueError(f"Kein Kurs für {ticker} verfügbar. Bitte zuerst den Kurs abrufen.")

    price = cached.price
    asset_type = cached.asset_type
    name = cached.name

    # Hebel validieren
    allowed = get_available_leverage(asset_type)
    if leverage not in allowed:
        raise ValueError(f"Hebel {leverage}x nicht verfügbar für {asset_type}. Erlaubt: {allowed}")

    # Margin berechnen
    if leverage > 1:
        margin = amount_eur  # Eingesetzter Betrag = Margin
        position_value = amount_eur * leverage
    else:
        margin = amount_eur
        position_value = amount_eur

    quantity = position_value / price
    total_cost = margin + FEE

    # Balance prüfen
    if account.balance < total_cost:
        raise ValueError(
            f"Nicht genug Guthaben. Benötigt: {total_cost:.2f}€, "
            f"Verfügbar: {account.balance:.2f}€"
        )

    # Financing-Rate
    financing_rate = get_financing_rate(asset_type) if leverage > 1 else 0.0

    # Stop-Loss berechnen
    stop_loss = calculate_stop_loss(price, leverage, margin, quantity) if leverage > 1 else None

    # Balance abziehen
    account.balance -= total_cost

    # Position erstellen
    position = Position(
        account_id=account_id,
        ticker=ticker,
        name=name,
        asset_type=asset_type,
        quantity=quantity,
        entry_price=price,
        leverage=float(leverage),
        financing_rate=financing_rate,
        margin_used=margin,
        stop_loss_price=stop_loss,
    )
    db.add(position)

    # Trade-Eintrag
    trade = Trade(
        account_id=account_id,
        ticker=ticker,
        name=name,
        direction="buy",
        quantity=quantity,
        price=price,
        leverage=float(leverage),
        fee=FEE,
        realized_pnl=0.0,
    )
    db.add(trade)

    # Transaction-Einträge
    transaction = Transaction(
        account_id=account_id,
        amount=-total_cost,
        type="trade_buy",
        description=f"Kauf {quantity:.4f}x {name} ({ticker}) @ {price:.2f} {cached.currency} | Hebel {leverage}x",
    )
    db.add(transaction)

    db.commit()
    db.refresh(position)

    return {
        "position_id": position.id,
        "ticker": ticker,
        "name": name,
        "quantity": quantity,
        "entry_price": price,
        "leverage": leverage,
        "margin_used": margin,
        "position_value": position_value,
        "stop_loss_price": stop_loss,
        "fee": FEE,
        "financing_rate_daily": financing_rate,
    }


def sell_position(
    db: Session,
    account_id: int,
    position_id: int,
    sell_quantity: float = None,
) -> dict:
    """
    Verkauft eine offene Position (ganz oder teilweise).
    sell_quantity: Anzahl Stücke die verkauft werden sollen. None = alles.
    """
    position = db.query(Position).filter(
        Position.id == position_id,
        Position.account_id == account_id,
    ).first()
    if not position:
        raise ValueError("Position nicht gefunden")

    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise ValueError("Konto nicht gefunden")

    # Aktuellen Preis holen
    cached = db.query(PriceCache).filter(PriceCache.ticker == position.ticker).first()
    if not cached:
        raise ValueError(f"Kein aktueller Kurs für {position.ticker}")

    current_price = cached.price

    # Teilverkauf oder Vollverkauf
    is_partial = sell_quantity is not None and sell_quantity < position.quantity
    if sell_quantity is not None and sell_quantity <= 0:
        raise ValueError("Verkaufsmenge muss positiv sein")
    if sell_quantity is not None and sell_quantity > position.quantity:
        raise ValueError(f"Verkaufsmenge ({sell_quantity:.4f}) überschreitet Positionsgröße ({position.quantity:.4f})")

    qty_sold = sell_quantity if is_partial else position.quantity
    fraction = qty_sold / position.quantity

    # P&L für verkaufte Menge berechnen
    price_diff = current_price - position.entry_price
    gross_pnl = price_diff * qty_sold * position.leverage
    financing_portion = position.accrued_financing * fraction
    net_pnl = gross_pnl - financing_portion - FEE

    margin_portion = position.margin_used * fraction
    payout = margin_portion + net_pnl
    if payout < 0:
        payout = 0

    account.balance += payout

    # Trade-Eintrag
    trade = Trade(
        account_id=account_id,
        ticker=position.ticker,
        name=position.name,
        direction="sell",
        quantity=qty_sold,
        price=current_price,
        leverage=position.leverage,
        fee=FEE,
        realized_pnl=net_pnl,
    )
    db.add(trade)

    # Transaction-Eintrag
    transaction = Transaction(
        account_id=account_id,
        amount=net_pnl,
        type="trade_sell",
        description=f"Verkauf {qty_sold:.4f}x {position.name} ({position.ticker}) @ {current_price:.2f} | P&L: {net_pnl:+.2f}€",
    )
    db.add(transaction)

    if is_partial:
        # Position anteilig reduzieren
        position.quantity -= qty_sold
        position.margin_used -= margin_portion
        position.accrued_financing -= financing_portion
        # Stop-Loss neu berechnen
        if position.leverage > 1:
            position.stop_loss_price = calculate_stop_loss(
                position.entry_price, position.leverage, position.margin_used, position.quantity
            )
    else:
        # Gesamte Position löschen
        db.delete(position)

    db.commit()

    return {
        "ticker": position.ticker,
        "name": position.name,
        "quantity_sold": qty_sold,
        "entry_price": position.entry_price,
        "exit_price": current_price,
        "leverage": position.leverage,
        "gross_pnl": round(gross_pnl, 2),
        "financing_costs": round(financing_portion, 2),
        "fee": FEE,
        "net_pnl": round(net_pnl, 2),
        "payout": round(payout, 2),
        "partial": is_partial,
    }

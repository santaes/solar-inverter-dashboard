"""Persistent register metadata and manual dashboard-value overrides."""
from __future__ import annotations

import csv
import io
import json
import math
import os
import threading
from typing import Any

from .config import MANUAL_REGISTER_VALUES_PATH, REGISTER_MAP_MAX_BYTES, REGISTER_MAP_PATH

_REGISTER_CONFIG: dict[int, tuple[str, float, str, bool, str]] = {}
_KNOWN_REGISTERS: list[int] = []

REGISTER_MAP_COLUMNS = ("register", "name", "unit", "scale", "display")
register_map_lock = threading.RLock()
register_map_overrides: dict[int, dict[str, Any]] = {}
register_map_error = ""
manual_register_values_lock = threading.RLock()
manual_register_values: dict[int, dict[str, Any]] = {}


def _safe_register_map_text(value: str, field: str, maximum: int) -> str:
    """Validate user-visible CSV metadata before it reaches HTML rendering."""
    cleaned = value.strip()
    if len(cleaned) > maximum:
        raise ValueError(f"{field} is longer than {maximum} characters")
    if any(character in cleaned for character in '<>"'):
        raise ValueError(f'{field} cannot contain <, >, or "')
    if any(ord(character) < 32 and character not in "\t" for character in cleaned):
        raise ValueError(f"{field} contains a control character")
    return cleaned


def parse_register_map_csv(payload: bytes) -> dict[int, dict[str, Any]]:
    """Parse a metadata-only register override CSV without changing Modbus state."""
    if len(payload) > REGISTER_MAP_MAX_BYTES:
        raise ValueError("CSV file is larger than 1 MiB")
    try:
        text = payload.decode("utf-8-sig")
    except UnicodeDecodeError as error:
        raise ValueError("CSV file must use UTF-8 encoding") from error

    reader = csv.DictReader(io.StringIO(text))
    if reader.fieldnames is None:
        raise ValueError("CSV header is missing")
    headers = {str(header).strip().lower(): str(header) for header in reader.fieldnames}

    def column(*aliases: str) -> str | None:
        return next((headers[alias] for alias in aliases if alias in headers), None)

    register_column = column("register", "r", "address", "mbpoll_register")
    name_column = column("name", "label")
    unit_column = column("unit", "units")
    scale_column = column("scale", "multiplier")
    display_column = column("display", "display_value", "value")
    if register_column is None:
        raise ValueError("CSV must contain a register column")
    if not any((name_column, unit_column, scale_column, display_column)):
        raise ValueError("CSV must contain at least one of: name, unit, scale, display")

    parsed: dict[int, dict[str, Any]] = {}
    for row_number, row in enumerate(reader, start=2):
        register_text = str(row.get(register_column, "") or "").strip()
        if not register_text and not any(str(value or "").strip() for value in row.values()):
            continue
        if register_text.upper().startswith("R"):
            register_text = register_text[1:].strip()
        try:
            register = int(register_text)
        except ValueError as error:
            raise ValueError(f"row {row_number}: invalid register {register_text!r}") from error
        if not 1 <= register <= 65536:
            raise ValueError(f"row {row_number}: register must be between 1 and 65536")
        if register in parsed:
            raise ValueError(f"row {row_number}: duplicate register R{register}")

        override: dict[str, Any] = {}
        if name_column is not None:
            name = _safe_register_map_text(str(row.get(name_column, "") or ""), "name", 200)
            if name:
                override["name"] = name
        if unit_column is not None:
            unit = _safe_register_map_text(
                str(row.get(unit_column, "") or ""), "unit", 30
            )
            if unit:
                override["unit"] = unit
        if scale_column is not None:
            scale_text = str(row.get(scale_column, "") or "").strip()
            if scale_text:
                try:
                    scale = float(scale_text)
                except ValueError as error:
                    raise ValueError(f"row {row_number}: invalid scale {scale_text!r}") from error
                if not math.isfinite(scale) or scale <= 0 or scale > 1_000_000:
                    raise ValueError(f"row {row_number}: scale must be greater than 0 and at most 1000000")
                override["scale"] = scale
        if display_column is not None:
            display = _safe_register_map_text(
                str(row.get(display_column, "") or ""), "display", 100
            )
            if display:
                override["display"] = display
        if not override:
            raise ValueError(f"row {row_number}: no metadata override was provided")
        parsed[register] = override
    return parsed


def _canonical_register_map_csv(overrides: dict[int, dict[str, Any]]) -> str:
    output = io.StringIO(newline="")
    writer = csv.DictWriter(output, fieldnames=REGISTER_MAP_COLUMNS, lineterminator="\n")
    writer.writeheader()
    for register, override in sorted(overrides.items()):
        writer.writerow({
            "register": register,
            "name": override.get("name", ""),
            "unit": override.get("unit", ""),
            "scale": override.get("scale", ""),
            "display": override.get("display", ""),
        })
    return output.getvalue()


def replace_register_map(payload: bytes) -> dict[str, Any]:
    """Persist and activate a complete metadata-only register override map."""
    global register_map_error, register_map_overrides
    overrides = parse_register_map_csv(payload)
    csv_text = _canonical_register_map_csv(overrides)
    temporary_path = REGISTER_MAP_PATH.with_suffix(REGISTER_MAP_PATH.suffix + ".tmp")
    with register_map_lock:
        try:
            REGISTER_MAP_PATH.parent.mkdir(parents=True, exist_ok=True)
            temporary_path.write_text(csv_text, encoding="utf-8", newline="")
            os.replace(temporary_path, REGISTER_MAP_PATH)
        except OSError as error:
            register_map_error = str(error)
            raise
        register_map_overrides = overrides
        register_map_error = ""
    return {"ok": True, "count": len(overrides), "filename": REGISTER_MAP_PATH.name}


def load_register_map() -> None:
    """Load persisted metadata overrides without preventing dashboard startup."""
    global register_map_error, register_map_overrides
    if not REGISTER_MAP_PATH.exists():
        return
    try:
        overrides = parse_register_map_csv(REGISTER_MAP_PATH.read_bytes())
    except (OSError, ValueError, csv.Error) as error:
        register_map_error = str(error)
        return
    with register_map_lock:
        register_map_overrides = overrides
        register_map_error = ""


def register_override(register: int) -> dict[str, Any]:
    with register_map_lock:
        return dict(register_map_overrides.get(register, {}))


def register_metadata(register: int) -> tuple[str, float, str, bool, str]:
    """Return built-in metadata merged with the current CSV override."""
    name, scale, unit, signed, group = _REGISTER_CONFIG.get(
        register, (f"Регістр {register}", 1.0, "", False, "Сире")
    )
    override = register_override(register)
    return (
        str(override.get("name", name)),
        float(override.get("scale", scale)),
        str(override.get("unit", unit)),
        signed,
        group,
    )


def register_map_status() -> dict[str, Any]:
    with register_map_lock:
        return {
            "count": len(register_map_overrides),
            "filename": REGISTER_MAP_PATH.name if REGISTER_MAP_PATH.exists() else "",
            "error": register_map_error,
        }


def manual_register_value(register: int) -> float | None:
    """Return the persisted dashboard value, when it replaces live Modbus data."""
    with manual_register_values_lock:
        value = manual_register_values.get(register, {}).get("value")
        return float(value) if value is not None else None


def manual_register_edit(register: int) -> dict[str, Any]:
    """Return saved presentation and value overrides for one register."""
    with manual_register_values_lock:
        return dict(manual_register_values.get(register, {}))


def set_manual_register_value(register: int, value: Any | None) -> dict[str, Any]:
    """Persist one display-unit register value without writing to Modbus."""
    return set_manual_register_edit(register, {"value": value} if value is not None else {}, clear_value=value is None)


def set_manual_register_edit(
    register: int, changes: dict[str, Any], *, clear_value: bool = False
) -> dict[str, Any]:
    """Persist editable dashboard fields without ever writing to Modbus."""
    if register not in _KNOWN_REGISTERS:
        raise ValueError(f"unknown register R{register}")
    allowed_fields = {"group": 100, "name": 200, "description": 500, "unit": 30}
    cleaned: dict[str, Any] = {}
    for field, maximum in allowed_fields.items():
        if field not in changes:
            continue
        value = str(changes[field] or "").strip()
        if len(value) > maximum:
            raise ValueError(f"{field} is longer than {maximum} characters")
        if any(ord(character) < 32 and character not in "\t" for character in value):
            raise ValueError(f"{field} contains a control character")
        cleaned[field] = value
    if "value" in changes and changes["value"] is not None:
        try:
            numeric_value = float(changes["value"])
        except (TypeError, ValueError) as error:
            raise ValueError("value must be a number") from error
        if not math.isfinite(numeric_value) or abs(numeric_value) > 1_000_000_000:
            raise ValueError("value must be a finite number no greater than 1000000000")
        cleaned["value"] = numeric_value

    with manual_register_values_lock:
        updated = dict(manual_register_values)
        entry = dict(updated.get(register, {}))
        entry.update(cleaned)
        if clear_value:
            entry.pop("value", None)
        if entry:
            updated[register] = entry
        else:
            updated.pop(register, None)
        temporary_path = MANUAL_REGISTER_VALUES_PATH.with_suffix(
            MANUAL_REGISTER_VALUES_PATH.suffix + ".tmp"
        )
        try:
            MANUAL_REGISTER_VALUES_PATH.parent.mkdir(parents=True, exist_ok=True)
            temporary_path.write_text(
                json.dumps({str(key): item for key, item in updated.items()}, indent=2),
                encoding="utf-8",
            )
            os.replace(temporary_path, MANUAL_REGISTER_VALUES_PATH)
        except OSError:
            if temporary_path.exists():
                temporary_path.unlink()
            raise
        manual_register_values.clear()
        manual_register_values.update(updated)
    return {"ok": True, "register": register, "edit": manual_register_edit(register)}


def load_manual_register_values() -> None:
    """Load saved dashboard overrides without preventing service startup."""
    if not MANUAL_REGISTER_VALUES_PATH.exists():
        return
    try:
        payload = json.loads(MANUAL_REGISTER_VALUES_PATH.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("manual value file must contain an object")
        parsed: dict[int, dict[str, Any]] = {}
        for register_text, value in payload.items():
            register = int(register_text)
            if register not in _KNOWN_REGISTERS:
                continue
            # Older files stored a bare numeric value; keep them compatible.
            entry = {"value": value} if not isinstance(value, dict) else value
            value_override = entry.get("value")
            cleaned: dict[str, Any] = {}
            if value_override is not None:
                numeric_value = float(value_override)
                if not math.isfinite(numeric_value) or abs(numeric_value) > 1_000_000_000:
                    raise ValueError(f"invalid value for R{register}")
                cleaned["value"] = numeric_value
            for field, maximum in {"group": 100, "name": 200, "description": 500, "unit": 30}.items():
                if field in entry:
                    text = str(entry[field] or "").strip()
                    if len(text) > maximum:
                        raise ValueError(f"invalid {field} for R{register}")
                    cleaned[field] = text
            if cleaned:
                parsed[register] = cleaned
    except (OSError, ValueError, TypeError, json.JSONDecodeError) as error:
        print(f"[Manual register values] Could not load saved values: {error}")
        return
    with manual_register_values_lock:
        manual_register_values.clear()
        manual_register_values.update(parsed)



def configure_register_catalog(
    register_config: dict[int, tuple[str, float, str, bool, str]],
    known_registers: list[int],
) -> None:
    """Bind the immutable register catalog and load persisted user overrides."""
    global _REGISTER_CONFIG, _KNOWN_REGISTERS
    _REGISTER_CONFIG = register_config
    _KNOWN_REGISTERS = known_registers
    load_register_map()
    load_manual_register_values()

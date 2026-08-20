"""Serialization of synchronized inverter state for the dashboard API."""
from __future__ import annotations

from datetime import datetime
import secrets
from typing import Any

from ..services import inverter_service
from ..services.inverter_service import *
from .api_localization import (
    SUPPORTED_API_LANGUAGES,
    localize_api_status,
    localize_api_text,
    register_description,
    register_description_reference,
)
from .state_consistency import effective_battery_soc
from .dashboard_template import ASSET_VERSION

DASHBOARD_INSTANCE_ID = f"{ASSET_VERSION}-{secrets.token_hex(8)}"

def web_state(language: str = "uk") -> dict[str, Any]:
    """Return a JSON-safe snapshot for the browser."""
    language = language if language in SUPPORTED_API_LANGUAGES else "uk"
    with state_lock:
        snapshot = dict(state)
        values = dict(state["values"])
    def effective_value(register: int) -> float | None:
        manual_value = manual_register_value(register)
        if manual_value is not None:
            return manual_value
        if register not in values:
            return None
        return normalize(register, values[register])[3]

    def battery_direction() -> int:
        """Return the physical battery direction: charge +1, discharge -1."""
        flow_state = effective_value(69)
        if flow_state is not None:
            flow_bits = int(flow_state)
            if flow_bits & (1 << 8):  # battery → inverter
                return -1
            if flow_bits & (1 << 5):  # rectifier → battery
                return 1
        terminal_state = effective_value(68)
        if terminal_state is not None:
            battery_state = (int(terminal_state) >> 8) & 0x07
            if battery_state == 2:
                return -1
            if battery_state == 3:
                return 1
        return 0

    def battery_current_with_flow_direction(value: float | None) -> float | None:
        """Apply the physical flow sign when a device reports current as magnitude."""
        direction = battery_direction()
        return direction * abs(value) if value is not None and direction else value

    battery_current_value = battery_current_with_flow_direction(effective_value(130))
    def battery_power_with_current_direction(value: float | None) -> float | None:
        """Use positive charge and negative discharge consistently for R134."""
        if value is None or battery_current_value is None or abs(battery_current_value) < 0.3:
            return value
        return abs(value) if battery_current_value > 0 else -abs(value)
    meters = []
    for register, fallbacks, label, minimum, maximum, unit in METER_DEFINITIONS:
        value = None
        source = ""
        for candidate in [register, *fallbacks]:
            value = effective_value(candidate)
            if value is not None:
                source = f"R{candidate}" + (" (manual)" if manual_register_value(candidate) is not None else "")
                break
        metadata_override = register_override(register)
        label = str(metadata_override.get("name", label))
        unit = str(metadata_override.get("unit", unit))
        if register == 130:
            value = battery_current_with_flow_direction(value)
        elif register == 134:
            value = battery_power_with_current_direction(value)
        elif register == 133:
            value = effective_battery_soc(value, None)
        available = value is not None
        if value is None:
            value = 0.0
            source = "Немає даних mbpoll"
        meters.append({
            "register": register,
            "label": localize_api_text(label, language),
            "label_source": label,
            "minimum": minimum,
            "maximum": maximum,
            "unit": unit,
            "value": value,
            "source": localize_api_text(source, language),
            "source_source": source,
            "available": available,
        })
    registers = []
    all_registers = KNOWN_REGISTERS
    for register in all_registers:
        raw = values.get(register)
        name, scale, unit, signed, group = register_metadata(register)
        edit = manual_register_edit(register)
        name = str(edit.get("name", name))
        unit = str(edit.get("unit", unit))
        group = str(edit.get("group", group))
        manual_value = manual_register_value(register)
        normalized_value = manual_value
        if manual_value is not None:
            display = f"{manual_value:g}"
        elif raw is None:
            display = "—"
        else:
            name, display, unit, normalized_value, group = normalize(register, raw)
            counter_value = combined_32bit_counter_value(register, values)
            if counter_value is not None:
                normalized_value = counter_value
                display = f"{counter_value:.2f}" if scale == 0.01 else f"{counter_value:g}"
            elif register == 130:
                normalized_value = battery_current_with_flow_direction(normalized_value)
                if normalized_value is not None:
                    display = f"{normalized_value:g}"
            elif register == 134:
                normalized_value = battery_power_with_current_direction(normalized_value)
                if normalized_value is not None:
                    display = str(int(normalized_value))
        registers.append({
            "register": register,
            "group": localize_api_text(group, language),
            "group_source": group,
            "name": localize_api_text(name, language),
            "name_source": name,
            "description": str(edit.get("description", register_description(register, name, unit, scale, signed, language))),
            "description_source": str(edit.get("description", register_description(register, name, unit, scale, signed, "uk"))),
            "description_reference": register_description_reference(register),
            "display": localize_api_text(display, language),
            "display_source": display,
            "value": normalized_value,
            "unit": unit,
            "scale": scale,
            "signed": signed,
            "read_only": True, "maintenance": register in MAINTENANCE_REGISTERS, "word_format": "h_l" if REGISTER_WORD_FORMAT.get(register) else "word",
            "raw": raw,
            "available": manual_value is not None or raw is not None,
            "supported": register in AVAILABLE_FAST_POLL_REGISTERS,
            "manual": manual_value is not None,
            "edited": bool(edit),
        })

    # ``METER_DEFINITIONS`` contains the curated dashboard cards.  Keep those
    # stable (including their purpose-built gauge limits), then expose every
    # other reading that was actually returned by the inverter as a meter too.
    # This lets API consumers discover the complete live telemetry set without
    # having to maintain a second, hard-coded register list.
    curated_meter_registers = {register for register, *_ in METER_DEFINITIONS}
    for reading in registers:
        register = int(reading["register"])
        if register in curated_meter_registers or not reading["available"]:
            continue
        value = reading["value"]
        if value is None:
            continue
        meters.append({
            "register": register,
            "label": reading["name"],
            "label_source": reading["name_source"],
            # Unknown registers deliberately have no invented gauge range.
            # The web client derives a safe range from the live value instead.
            "minimum": None,
            "maximum": None,
            "unit": reading["unit"],
            "value": value,
            "source": f"R{register}" + (" (manual)" if reading["manual"] else ""),
            "source_source": f"R{register}" + (" (manual)" if reading["manual"] else ""),
            "available": True,
        })
    return {"language": language,
        "dashboard_version": ASSET_VERSION,
        "dashboard_instance": DASHBOARD_INSTANCE_ID,
        "online": bool(snapshot["online"]),
        "updated_at": snapshot["updated_at"],
        "cycle_seconds": snapshot["cycle_seconds"],
        "read_seconds": snapshot["read_seconds"],
        "cycle_id": snapshot["cycle_id"],
        "poll_rate_index": snapshot["poll_rate_index"],
        "read_mode": snapshot["read_mode"],
        "fast_selected_registers": list(snapshot["fast_selected_registers"]),
        "default_fast_selected_registers": list(DEFAULT_FAST_SELECTED_REGISTERS),
        "minimum_fast_poll_register_count": MIN_FAST_POLL_REGISTER_COUNT,
        "requests": snapshot["requests"],
        "successful": snapshot["successful"],
        "failed": snapshot["ошибок"],
        "error": localize_api_text(snapshot["error"], language),
        "error_source": snapshot["error"],
        "identifier": snapshot["identifier"],
        "paused": bool(snapshot["paused"]),
        "site_visits": inverter_service.site_visit_total,
        "site_visits_date": datetime.now(MADRID_TIME_ZONE).strftime("%d.%m.%Y"),
        "solar_energy": localize_api_status(solar_energy_summary(), language),
        "register_log": localize_api_status(register_log_status(), language),
        "register_map": localize_api_status(register_map_status(), language),
        "meters": meters,
        "registers": registers,
    }

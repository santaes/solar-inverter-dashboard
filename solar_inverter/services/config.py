"""Environment configuration and constants for the inverter service."""
from __future__ import annotations

import os
from datetime import datetime
from pathlib import Path

try:
    from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
except ImportError:
    ZoneInfo = None
    ZoneInfoNotFoundError = Exception


def _environment_int(name: str, default: int, *, minimum: int, maximum: int) -> int:
    """Read a bounded integer setting without making startup fragile."""
    try:
        value = int(os.environ.get(name, str(default)))
    except ValueError:
        return default
    return value if minimum <= value <= maximum else default


def _environment_float(name: str, default: float, *, minimum: float) -> float:
    try:
        value = float(os.environ.get(name, str(default)))
    except ValueError:
        return default
    return value if value >= minimum else default


def non_negative_int_environment(name: str, default: int) -> int:
    """Read a non-negative integer setting, falling back on invalid input."""
    try:
        value = int(os.environ.get(name, str(default)))
    except ValueError:
        return default
    return value if value >= 0 else default


def _configured_time_zone():
    """Return the configured IANA zone, or the host zone when unavailable."""
    if ZoneInfo is not None:
        try:
            return ZoneInfo(os.environ.get("INVERTER_TIME_ZONE", "Europe/Madrid"))
        except ZoneInfoNotFoundError:
            pass
    return datetime.now().astimezone().tzinfo


# Connection details must be deployment settings: `/dev/ttyUSB0` only exists on
# the Orange Pi, while a Windows USB adapter is usually exposed as `COMx`.
DEVICE = os.environ.get("INVERTER_SERIAL_DEVICE", "/dev/ttyUSB0")
SLAVE_ID = _environment_int("INVERTER_SLAVE_ID", 1, minimum=1, maximum=247)
BAUD_RATE = _environment_int("INVERTER_BAUD_RATE", 9600, minimum=300, maximum=4_000_000)
TCP_IP = os.environ.get("INVERTER_TCP_HOST", "")
TCP_PORT = _environment_int("INVERTER_TCP_PORT", 502, minimum=1, maximum=65535)
_connection_mode_setting = os.environ.get("INVERTER_CONNECTION_MODE", "rtu").lower()
CONNECTION_MODE = _connection_mode_setting if _connection_mode_setting in {"rtu", "tcp"} else "rtu"
COMMAND_TIMEOUT_SECONDS = _environment_float(
    "INVERTER_COMMAND_TIMEOUT_SECONDS", 3.0, minimum=0.1
)

# Python 3.7 lacks zoneinfo and minimal development systems may lack the IANA
# zone database. In either case, use the host's configured local timezone.
MADRID_TIME_ZONE = _configured_time_zone()

PROJECT_ROOT = Path(__file__).resolve().parents[2]
FAVICON_PATH = PROJECT_ROOT / "favicon.png"

_stats_path_setting = os.environ.get("INVERTER_STATS_DB")
_new_stats_path = PROJECT_ROOT / "solar_invertor_web_stats.sqlite3"
_legacy_stats_path = PROJECT_ROOT / "inverter_stats.sqlite3"
STATS_DB_PATH = (
    Path(_stats_path_setting)
    if _stats_path_setting
    else _legacy_stats_path
    if _legacy_stats_path.exists() and not _new_stats_path.exists()
    else _new_stats_path
)

_register_map_path_setting = os.environ.get("INVERTER_REGISTER_MAP")
REGISTER_MAP_PATH = (
    Path(_register_map_path_setting)
    if _register_map_path_setting
    else STATS_DB_PATH.with_name("register_map_overrides.csv")
)
REGISTER_MAP_MAX_BYTES = 1024 * 1024

_manual_register_values_path_setting = os.environ.get("INVERTER_MANUAL_REGISTER_VALUES")
MANUAL_REGISTER_VALUES_PATH = (
    Path(_manual_register_values_path_setting)
    if _manual_register_values_path_setting
    else STATS_DB_PATH.with_name("manual_register_values.json")
)

REGISTER_LOG_DIRECTORY = PROJECT_ROOT / "register_logs"
REGISTER_LOG_MIN_FREE_BYTES = non_negative_int_environment(
    "INVERTER_LOG_MIN_FREE_BYTES", 2 * 1024**3
)
REGISTER_LOG_CLEANUP_TARGET_BYTES = max(
    REGISTER_LOG_MIN_FREE_BYTES,
    non_negative_int_environment(
        "INVERTER_LOG_CLEANUP_TARGET_BYTES",
        REGISTER_LOG_MIN_FREE_BYTES + 512 * 1024**2,
    ),
)

COUNTED_VISITOR_COOKIE = "inverter_counted"

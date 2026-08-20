from __future__ import annotations

import csv
import io
import json
import math
import os
import re
import shutil
import sqlite3
import subprocess
import sys
import threading
import time
from contextlib import closing
from datetime import datetime, timedelta
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, TextIO

from .register_profile_12ku import (
    MAINTENANCE_REGISTERS,
    REGISTER_BY_NUMBER,
    REGISTER_PROFILE,
    REGISTER_NUMBERS,
)
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
def _configured_time_zone():
    """Return the configured IANA zone, or the host zone when unavailable."""
    if ZoneInfo is not None:
        try:
            return ZoneInfo(os.environ.get("INVERTER_TIME_ZONE", "Europe/Madrid"))
        except ZoneInfoNotFoundError:
            pass
    return datetime.now().astimezone().tzinfo


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
stats_lock = threading.Lock()
stats_error = ""
site_visit_total = 0
solar_energy_error = ""
solar_energy_last_sample_at: datetime | None = None
solar_energy_last_power_w: float | None = None
solar_energy_last_flush_monotonic = 0.0
solar_energy_pending_wh: dict[str, float] = {}
COUNTED_VISITOR_COOKIE = "inverter_counted"
REGISTER_LOG_DIRECTORY = PROJECT_ROOT / "register_logs"


def non_negative_int_environment(name: str, default: int) -> int:
    """Read a non-negative integer setting, falling back on invalid input."""
    try:
        value = int(os.environ.get(name, str(default)))
    except ValueError:
        return default
    return value if value >= 0 else default


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

register_log_lock = threading.RLock()
register_log_storage_stop_event = threading.Event()
register_log_file: TextIO | None = None
register_log_writer: Any = None
register_log_path: Path | None = None
register_log_started_at = ""
register_log_changes = 0
register_log_error = ""
register_log_previous_values: dict[int, int] = {}
register_log_free_bytes: int | None = None
register_log_pruned_files = 0
register_log_storage_checked_at = 0.0
register_log_previous_poll_settings: tuple[int, str, bool] | None = None
register_log_language = "uk"
register_log_text_translations: dict[str, str] = {}

REGISTER_LOG_CSV_LABELS = {
    "uk": {
        "headers": [
            "час_мадрид", "цикл", "подія", "регістр", "група", "назва",
            "попереднє_raw", "raw", "змінені_біти", "значення", "одиниця",
            "кнопка_lcd", "сторінка_lcd", "сценарій_демо", "нотатка",
        ],
        "events": {"INITIAL": "ПОЧАТКОВИЙ", "CHANGE": "ЗМІНА", "NOTE": "НОТАТКА", "LCD_KEY": "КНОПКА_LCD"},
        "register": "Регістр",
    },
    "ru": {
        "headers": [
            "время_мадрид", "цикл", "событие", "регистр", "группа", "название",
            "предыдущее_raw", "raw", "изменённые_биты", "значение", "единица",
            "кнопка_lcd", "страница_lcd", "сценарий_демо", "заметка",
        ],
        "events": {"INITIAL": "ИСХОДНОЕ", "CHANGE": "ИЗМЕНЕНИЕ", "NOTE": "ЗАМЕТКА", "LCD_KEY": "КНОПКА_LCD"},
        "register": "Регистр",
    },
    "en": {
        "headers": [
            "timestamp_madrid", "cycle", "event", "register", "group", "name",
            "previous_raw", "raw", "changed_bits", "display", "unit",
            "lcd_key", "lcd_page", "demo_scenario", "note",
        ],
        "events": {"INITIAL": "INITIAL", "CHANGE": "CHANGE", "NOTE": "NOTE", "LCD_KEY": "LCD_KEY"},
        "register": "Register",
    },
}

POLL_RATES = [0.5, 1.0, 2.0, 5.0, 10.0]

KNOWN_REGISTERS = [
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    17, 18, 27, 28, 58,
    65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80,
    81, 82, 83, 84,
    85, 86, 87, 88,
    89, 90, 91, 92, 93, 94,
    95,
    129, 130, 131, 132, 133, 134, 135, 136,
    137, 138, 139, 140, 141, 142, 143, 144, 145, 146,
    147, 148, 149, 150, 151, 152, 153, 154, 155, 156,
    157, 158, 159, 160, 161, 162, 163, 164, 165, 166,
    167, 168, 169, 170, 171, 172, 173, 174, 175, 176,
    177, 178, 179, 180, 181, 182, 183, 184, 185, 186,
    187, 188, 189, 190,
    321, 322, 323, 324, 325, 337, 339,
    341, 342, 343, 344, 345, 346, 349, 350,
    375, 376, 377, 378, 379, 383, 384, 385, 386,
    401, 402, 403, 404, 405, 406, 407, 408,
    409, 410, 411, 412, 413, 414, 415, 416, 417, 418, 419,
    433, 434, 435, 436, 437,
    448, 449, 450, 451, 452, 453, 454, 455,
    529, 530, 537, 538, 539, 541, 542, 545,
    801, 802, 817, 818, 819, 820, 821, 822, 823,
    16641, 16642, 16643, 16644, 16645, 16646, 16647, 16648,
    16649, 16650, 16651, 16652, 16653, 16654, 16655, 16656,
]

# Live operating values are read every cycle.  This TTN 12KU rejects broad
# reads through sparse legacy address ranges (notably R1-R120, R129-R190, and
# R321-R350) with Modbus server-failure responses.  These verified contiguous
# banks contain the dashboard's active measurements and can be read reliably.
FAST_BLOCKS = [
    (401, 19),
    (433, 5),
    (448, 8),
    (529, 2),
    (537, 9),
    (801, 2),
    (817, 6),
    (16641, 16),
]

# Static device identity is read once at startup, outside recurring fast polls.
IDENTITY_BLOCKS = ((1, 10), (57, 9))
IDENTITY_REGISTERS = frozenset(
    register
    for start, count in IDENTITY_BLOCKS
    for register in range(start, start + count)
)

def fast_selected_blocks(selected_registers: list[int]) -> list[tuple[int, int]]:
    """Group card-selected registers into efficient extra Fast-poll reads."""
    always_read = {
        register
        for start, count in FAST_BLOCKS
        for register in range(start, start + count)
    }
    registers = sorted({
        register for register in selected_registers
        if register in AVAILABLE_FAST_POLL_REGISTERS and register not in always_read
    })
    blocks: list[tuple[int, int]] = []
    for register in registers:
        if not blocks or register != blocks[-1][0] + blocks[-1][1] or blocks[-1][1] >= 125:
            blocks.append((register, 1))
        else:
            start, count = blocks[-1]
            blocks[-1] = (start, count + 1)
    return blocks

# Public R-numbers are one-based references. The inverter's Modbus PDU addresses
# are zero-based, so R89 is protocol address 0x0058.  This is the TTN 12KU
# single / U3.0 profile, not a cross-model V1.31 profile.
# name, scale, unit, signed, group
REGISTER_CONFIG: dict[int, tuple[str, float, str, bool, str]] = {
    **{
        register: (
            f"Ідентифікатор пристрою, слово {register}",
            1.0,
            "",
            False,
            "Ідентифікація",
        )
        for register in range(1, 11)
    },
    17: ("Версія протоколу, старше слово", 1.0, "", False, "Система"),
    18: ("Версія протоколу, молодше слово", 1.0, "", False, "Система"),
    27: ("Версія ПЗ плати керування, старше слово", 1.0, "", False, "Система"),
    28: ("Версія ПЗ плати керування, молодше слово", 1.0, "", False, "Система"),
    58: ("Ідентифікатор протоколу B", 1.0, "", False, "Система"),
    65: ("Версія ПЗ", 1.0, "", False, "Система"),
    66: ("Стан з’єднання BMS", 1.0, "", False, "BMS"),
    67: ("Стан інвертора", 1.0, "", False, "Система"),
    68: ("Стан енергетичних клем", 1.0, "", False, "Система"),
    69: ("Стан потоку енергії", 1.0, "", False, "Система"),
    70: ("Стан паралельної роботи", 1.0, "", False, "Система"),
    71: ("Код несправності 1", 1.0, "", False, "Помилки"),
    72: ("Код несправності 2", 1.0, "", False, "Помилки"),
    73: ("Код попередження 1", 1.0, "", False, "Помилки"),
    74: ("Код попередження 2", 1.0, "", False, "Помилки"),
    75: ("Колір переднього RGB, старше слово", 1.0, "", False, "RGB"),
    76: ("Колір переднього RGB, молодше слово", 1.0, "", False, "RGB"),
    77: ("Режим переднього RGB", 1.0, "", False, "RGB"),
    78: ("Колір фонового RGB, старше слово", 1.0, "", False, "RGB"),
    79: ("Колір фонового RGB, молодше слово", 1.0, "", False, "RGB"),
    80: ("Режим фонового RGB", 1.0, "", False, "RGB"),

    81: ("Напруга мережі, фаза A", 0.1, "V", False, "AC"),
    82: ("Струм мережі, фаза A", 0.01, "A", False, "AC"),
    83: ("Частота мережі, фаза A", 0.01, "Hz", False, "AC"),
    84: ("Потужність мережі, фаза A", 1.0, "W", True, "Потужність"),
    85: ("Напруга генератора, фаза A", 0.1, "V", False, "Генератор"),
    86: ("Струм генератора, фаза A", 0.01, "A", False, "Генератор"),
    87: ("Частота генератора, фаза A", 0.01, "Hz", False, "Генератор"),
    88: ("Потужність генератора, фаза A", 1.0, "W", False, "Генератор"),
    89: ("Вихідна напруга навантаження, фаза A", 0.1, "V", False, "AC"),
    90: ("Вихідний струм AC", 0.01, "A", False, "AC"),
    91: ("Вихідна частота AC", 0.01, "Hz", False, "AC"),
    92: ("Активна потужність навантаження", 1.0, "W", False, "Потужність"),
    93: ("Повна потужність навантаження", 1.0, "VA", False, "Потужність"),
    94: ("Завантаження інвертора", 0.1, "%", False, "AC"),
    95: ("Навантаження мережі, фаза A", 1.0, "W", True, "Потужність"),

    129: ("Напруга акумулятора", 0.1, "V", False, "Батарея"),
    130: ("Струм акумулятора", 0.1, "A", True, "Батарея"),
    131: ("Напруга від’ємної клеми батареї", 0.1, "V", True, "Батарея"),
    132: ("Струм від’ємної клеми батареї", 0.1, "A", True, "Батарея"),
    133: ("SOC акумулятора", 0.1, "%", False, "Батарея"),
    134: ("Потужність акумулятора", 1.0, "W", False, "Потужність"),
    135: ("Резерв", 1.0, "", False, "Батарея"),
    136: ("Резерв", 1.0, "", False, "Батарея"),

    137: ("Напруга акумулятора від BMS", 0.1, "V", False, "BMS"),
    138: ("Струм акумулятора від BMS", 0.1, "A", True, "BMS"),
    139: ("SOC від BMS", 1.0, "%", False, "BMS"),
    140: ("Температура акумулятора BMS", 0.1, "°C", True, "Температура"),
    141: ("Точка постійної напруги BMS", 0.1, "V", False, "BMS"),
    142: ("Номінальна ємність BMS", 0.01, "Ah", False, "BMS"),
    143: ("Поточна ємність BMS", 0.01, "Ah", False, "BMS"),
    144: ("Стан зв’язку BMS", 1.0, "", False, "BMS"),
    145: ("Стан мережі літієвої батареї", 1.0, "", False, "BMS"),
    146: ("Код несправності BMS", 1.0, "", False, "BMS"),
    147: ("Код попередження BMS", 1.0, "", False, "BMS"),
    148: ("SOH від BMS", 1.0, "%", False, "BMS"),
    149: ("Потужність акумулятора, зворотний напрямок", 1.0, "W", False, "Потужність"),
    150: ("Активна потужність мережі, зворотний напрямок", 1.0, "W", False, "Потужність"),
    151: ("Напруга PV1", 0.1, "V", False, "PV"),
    152: ("Струм PV1", 0.01, "A", False, "PV"),
    153: ("Потужність PV1", 1.0, "W", False, "PV"),
    154: ("Напруга PV2", 0.1, "V", False, "PV"),
    155: ("Струм PV2", 0.01, "A", False, "PV"),
    156: ("Потужність PV2", 1.0, "W", False, "PV"),
    157: ("Енергія PV за сьогодні", 0.01, "kWh", False, "PV"),
    158: ("Загальна енергія PV", 0.01, "kWh", False, "PV"),
    159: ("Струм заряджання від PV1", 0.1, "A", False, "PV"),
    160: ("Струм заряджання від PV2", 0.1, "A", False, "PV"),
    161: ("Загальна потужність PV", 1.0, "W", False, "PV"),
    162: ("Енергія PV за місяць", 0.01, "kWh", False, "PV"),
    163: ("Енергія PV за рік", 0.01, "kWh", False, "PV"),
    164: ("Енергія заряджання за день", 0.01, "kWh", False, "Енергія"),
    165: ("Енергія заряджання за місяць", 0.01, "kWh", False, "Енергія"),
    166: ("Енергія заряджання за рік", 0.01, "kWh", False, "Енергія"),
    167: ("Загальна енергія заряджання", 0.01, "kWh", False, "Енергія"),
    168: ("Енергія розряджання за день", 0.01, "kWh", False, "Енергія"),
    169: ("Енергія розряджання за місяць", 0.01, "kWh", False, "Енергія"),
    170: ("Енергія розряджання за рік", 0.01, "kWh", False, "Енергія"),
    171: ("Загальна енергія розряджання", 0.01, "kWh", False, "Енергія"),
    172: ("Енергія інвертування за день", 0.01, "kWh", False, "Енергія"),
    173: ("Енергія інвертування за місяць", 0.01, "kWh", False, "Енергія"),
    174: ("Енергія інвертування за рік", 0.01, "kWh", False, "Енергія"),
    175: ("Загальна енергія інвертування", 0.01, "kWh", False, "Енергія"),
    176: ("Енергія навантаження за день", 0.01, "kWh", False, "Енергія"),
    177: ("Енергія навантаження за місяць", 0.01, "kWh", False, "Енергія"),
    178: ("Енергія навантаження за рік", 0.01, "kWh", False, "Енергія"),
    179: ("Загальна енергія навантаження", 0.01, "kWh", False, "Енергія"),
    180: ("Енергія віддачі в мережу за день", 0.01, "kWh", False, "Енергія"),
    181: ("Енергія віддачі в мережу за місяць", 0.01, "kWh", False, "Енергія"),
    182: ("Енергія віддачі в мережу за рік", 0.01, "kWh", False, "Енергія"),
    183: ("Загальна енергія віддачі в мережу", 0.01, "kWh", False, "Енергія"),
    184: ("Енергія споживання з мережі за день", 0.01, "kWh", False, "Енергія"),
    185: ("Енергія споживання з мережі за місяць", 0.01, "kWh", False, "Енергія"),
    186: ("Енергія споживання з мережі за рік", 0.01, "kWh", False, "Енергія"),
    187: ("Загальна енергія споживання з мережі", 0.01, "kWh", False, "Енергія"),
    188: ("Потужність навантаження на виході, фаза A", 1.0, "W", False, "Потужність"),
    189: ("Потужність навантаження на виході, фаза B", 1.0, "W", False, "Потужність"),
    190: ("Потужність навантаження на виході, фаза C", 1.0, "W", False, "Потужність"),

    321: ("Режим виходу", 1.0, "", False, "Режими"),
    322: ("Паралельний режим", 1.0, "", False, "Режими"),
    323: ("Пріоритет виходу", 1.0, "", False, "Режими"),
    324: ("Пріоритет заряджання", 1.0, "", False, "Режими"),
    325: ("Стан автомата інвертора", 1.0, "", False, "Режими"),
    337: ("Тип батареї", 1.0, "", False, "Батарея"),
    339: ("SOC батареї", 1.0, "%", True, "Батарея"),
    341: ("Напруга позитивної DC-шини", 0.1, "V", True, "Батарея"),
    342: ("Напруга позитивної клеми батареї", 0.1, "V", True, "Батарея"),
    343: ("Струм розряджання батареї", 0.1, "A", True, "Батарея"),
    344: ("Струм заряджання батареї", 0.1, "A", True, "Батарея"),
    345: ("Поріг сигналізації перенапруги", 0.1, "V", True, "Батарея"),
    346: ("Поріг сигналізації низької напруги", 0.1, "V", True, "Батарея"),
    349: ("Напруга відсікання другого виходу", 0.1, "V", True, "Батарея"),
    350: ("Час відсікання другого виходу", 1.0, "h", False, "Батарея"),

    375: ("Стан заряджання", 1.0, "", False, "Заряджання"),
    376: ("Напруга заряджання CV", 0.1, "V", True, "Заряджання"),
    377: ("Напруга підтримувального заряджання", 0.1, "V", True, "Заряджання"),
    378: ("Струм заряджання CV", 0.1, "A", True, "Заряджання"),
    379: ("Струм підтримувального заряджання", 0.1, "A", True, "Заряджання"),
    383: ("Напруга вирівнювального заряджання", 0.1, "V", True, "Заряджання"),
    384: ("Час вирівнювального заряджання", 1.0, "h", False, "Заряджання"),
    385: ("Затримка вирівнювального заряджання", 1.0, "min", False, "Заряджання"),
    386: ("Інтервал вирівнювального заряджання", 1.0, "h", False, "Заряджання"),

    401: ("Протокол зв’язку BMS (резерв)", 1.0, "", False, "BMS"),
    402: ("ID пакета BMS", 1.0, "", False, "BMS"),
    403: ("Стан зв’язку BMS", 1.0, "", False, "BMS"),
    404: ("Напруга батареї", 0.1, "V", True, "BMS"),
    405: ("Струм батареї", 0.1, "A", True, "BMS"),
    406: ("Температура батареї", 0.1, "°C", True, "Температура"),
    407: ("SOC батареї", 1.0, "%", True, "BMS"),
    408: ("SOH батареї", 1.0, "%", True, "BMS"),
    409: ("Поточна ємність батареї", 0.01, "Ah", False, "BMS"),
    410: ("Повна зарядна ємність батареї", 0.01, "Ah", False, "BMS"),
    411: ("Точка постійної напруги BMS", 0.1, "V", True, "BMS"),
    412: ("Максимальний струм заряджання BMS", 0.1, "A", True, "BMS"),
    413: ("Максимальний струм розряджання BMS", 0.1, "A", True, "BMS"),
    414: ("Поріг попередження низького SOC", 0.01, "%", True, "BMS"),
    415: ("Поріг вимкнення за низьким SOC", 0.01, "%", True, "BMS"),
    416: ("Поріг переходу на мережу за низьким SOC", 0.01, "%", True, "BMS"),
    417: ("Поріг повернення на батарею за високим SOC", 0.01, "%", True, "BMS"),
    418: ("Сигналізація BMS", 1.0, "", False, "BMS"),
    419: ("Помилка BMS", 1.0, "", False, "BMS"),

    433: ("Напруга мережі, детальний канал", 0.1, "V", True, "AC"),
    434: ("Струм мережі, детальний канал", 0.01, "A", True, "AC"),
    435: ("Частота мережі, детальний канал", 0.01, "Hz", True, "AC"),
    436: ("Потужність мережі, детальний канал", 1.0, "W", True, "Потужність"),
    437: ("Резерв", 1.0, "", False, "AC"),
    448: ("Споживання мережі за день, старше слово", 1.0, "", False, "Енергія"),
    449: ("Споживання мережі за день, молодше слово", 1.0, "", False, "Енергія"),
    450: ("Споживання з мережі за місяць", 1.0, "", False, "Енергія"),
    451: ("Споживання з мережі за місяць", 1.0, "", False, "Енергія"),
    452: ("Споживання мережі за рік, старше слово", 1.0, "", False, "Енергія"),
    453: ("Споживання мережі за рік, молодше слово", 1.0, "", False, "Енергія"),
    454: ("Загальне споживання мережі, старше слово", 1.0, "", False, "Енергія"),
    455: ("Загальне споживання мережі, молодше слово", 1.0, "", False, "Енергія"),
    529: ("Пріоритет виходу (фактичний)", 1.0, "", False, "Режими"),
    530: ("Режим входу AC (фактичний)", 1.0, "", False, "Режими"),
    537: ("Вихідна напруга інвертора", 0.1, "V", True, "AC"),
    538: ("Вихідна частота інвертора", 0.01, "Hz", True, "AC"),
    539: ("Вихідний струм інвертора", 0.01, "A", True, "AC"),
    541: ("Вихідна активна потужність інвертора", 1.0, "W", True, "Потужність"),
    542: ("Вихідна повна потужність інвертора", 1.0, "VA", True, "Потужність"),
    545: ("Завантаження виходу інвертора", 0.1, "%", True, "AC"),
    801: ("Швидкість вентилятора", 1.0, "%", False, "Температура"),
    802: ("Стан вентилятора", 1.0, "", False, "Температура"),
    817: ("Температура PV1", 0.1, "°C", False, "Температура"),
    818: ("Температура інвертора", 0.1, "°C", False, "Температура"),
    819: ("Температура зарядного модуля", 0.1, "°C", False, "Температура"),
    820: ("Температура зарядного модуля 2", 0.1, "°C", False, "Температура"),
    821: ("Температура довкілля", 0.1, "°C", False, "Температура"),
    822: ("Температура розрядного модуля", 0.1, "°C", False, "Температура"),
    823: ("Температура PV2", 0.1, "°C", False, "Температура"),

    # Writable setup block 0x4100+. Public R labels remain one-based.
    16641: ("Налаштована вихідна напруга", 1.0, "", False, "Налаштування"),
    16642: ("Налаштована вихідна частота", 1.0, "", False, "Налаштування"),
    16643: ("Пріоритет вихідного джерела", 1.0, "", False, "Налаштування"),
    16644: ("Режим входу AC", 1.0, "", False, "Налаштування"),
    16645: ("Пріоритет джерела заряджання", 1.0, "", False, "Налаштування"),
    16646: ("Струм заряджання від AC", 1.0, "A", False, "Налаштування"),
    16647: ("Максимальний струм заряджання", 1.0, "", False, "Налаштування"),
    16648: ("Тип батареї", 1.0, "", False, "Налаштування"),
    16649: ("Поріг низької напруги батареї", 0.1, "V", False, "Налаштування"),
    16650: ("Поріг вимкнення батареї", 0.1, "V", False, "Налаштування"),
    16651: ("Напруга основного заряджання", 0.1, "V", False, "Налаштування"),
    16652: ("Напруга підтримувального заряджання", 0.1, "V", False, "Налаштування"),
    16653: ("Поріг переходу батарея → AC", 0.1, "V", False, "Налаштування"),
    16654: ("Поріг повернення AC → батарея", 0.1, "V", False, "Налаштування"),
    16655: ("Нижній поріг напруги мережі", 1.0, "V", False, "Налаштування"),
    16656: ("Верхній поріг напруги мережі", 1.0, "V", False, "Налаштування"),

}

# The embedded workbook is the catalog authority.  Existing Ukrainian labels
# above are retained where available; the remaining maintenance rows use the
# workbook wording until a dedicated localized label is supplied.  Values stay
# read-only: access metadata is intentionally not used to create write calls.
REGISTER_ACCESS: dict[int, str] = {
    register: access
    for register, _group, _name, access, _type, _scale, _unit, _has_hl
    in REGISTER_PROFILE
}
REGISTER_WORD_FORMAT: dict[int, bool] = {
    register: has_hl
    for register, _group, _name, _access, _type, _scale, _unit, has_hl
    in REGISTER_PROFILE
}
# The workbook represents cumulative counters as adjacent unsigned H/L words.
# Restrict this to the counters (a low word with x10 scaling following a
# same-unit unsigned high word); other H/L-labelled values are version or RGB
# components and have their own display semantics.
def _is_32bit_counter_low_word(
    low_register: int, data_type: str, scale: float, unit: str, has_hl: bool
) -> bool:
    """Return whether a register is the low word of a cumulative counter."""
    high_row = REGISTER_BY_NUMBER.get(low_register - 1)
    return (
        has_hl
        and data_type == "uint16_t"
        and scale == 10.0
        and high_row is not None
        and high_row[4] == "uint16_t"
        and high_row[5] == 1.0
        and high_row[6] == unit
    )


COUNTER_32BIT_LOW_WORD_REGISTERS: dict[int, int] = {
    low_register: low_register - 1
    for low_register, _group, _name, _access, data_type, scale, unit, has_hl
    in REGISTER_PROFILE
    if _is_32bit_counter_low_word(low_register, data_type, scale, unit, has_hl)
}

# A counter is exposed as one human-readable measurement even though the
# inverter transports it in two 16-bit words.  Both physical rows retain the
# same label in Register Map; the low row carries the combined value.
COUNTER_32BIT_DISPLAY_NAMES: dict[int, str] = {
    441: "Віддано в мережу за день", 443: "Віддано в мережу за місяць",
    445: "Віддано в мережу за рік", 447: "Віддано в мережу всього",
    449: "Споживання з мережі за день", 451: "Споживання з мережі за місяць",
    453: "Споживання з мережі за рік", 455: "Споживання з мережі всього",
    547: "Енергія AC-виходу за день", 549: "Енергія AC-виходу за місяць",
    551: "Енергія AC-виходу за рік", 553: "Енергія AC-виходу всього",
    617: "Вироблено PV за день", 619: "Вироблено PV за місяць",
    621: "Вироблено PV за рік", 623: "Вироблено PV всього",
    631: "Вироблено PV1 за день", 633: "Вироблено PV1 за місяць",
    635: "Вироблено PV1 за рік", 637: "Вироблено PV1 всього",
    647: "Вироблено PV2 за день", 649: "Вироблено PV2 за місяць",
    651: "Вироблено PV2 за рік", 653: "Вироблено PV2 всього",
    688: "Енергія навантаження AC за день", 690: "Енергія навантаження AC за місяць",
    692: "Енергія навантаження AC всього", 694: "Вихідна енергія AC за день",
    696: "Вихідна енергія AC за місяць", 698: "Вихідна енергія AC всього",
}
for register, group, name, _access, data_type, scale, unit, _has_hl in REGISTER_PROFILE:
    profile_scale = 0.01 if scale == 10.0 and unit == "Wh" else scale
    profile_unit = "kWh" if scale == 10.0 and unit == "Wh" else unit
    if profile_unit in {"bitfield", "enum", "raw"}:
        profile_unit = ""
    existing = REGISTER_CONFIG.get(register)
    label = existing[0] if existing else (name or f"Регістр {register}")
    label_group = existing[4] if existing else group
    REGISTER_CONFIG[register] = (
        label, profile_scale, profile_unit or (existing[2] if existing else ""),
        existing[3] if existing else data_type.lower().startswith("int"), label_group
    )
for low_register, high_register in COUNTER_32BIT_LOW_WORD_REGISTERS.items():
    display_name = COUNTER_32BIT_DISPLAY_NAMES[low_register]
    for register in (high_register, low_register):
        _name, scale, unit, signed, group = REGISTER_CONFIG[register]
        REGISTER_CONFIG[register] = (display_name, scale, unit, signed, group)

# Show every physical register from the 12KU workbook.  Fast mode continues to
# use only the operational blocks above; Compatible mode deliberately reads the
# full catalog on demand.
KNOWN_REGISTERS = list(REGISTER_NUMBERS)

# Addresses that responded in the 2026-08-18 live inverter capture
# (386 of the 696 documented 12KU registers).  Use this proven set on every
# normal poll by default; users can still adjust it in Register Map.
OBSERVED_AVAILABLE_REGISTERS = tuple(int(register) for register in """
1 2 3 4 5 6 7 8 9 10 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37
57 58 59 60 61 62 63 64 65 66 67 68 69 70 71 72 73 74 75 76 77 78 79 80 81 82 83 84 85 86 87 88 89 90 91 92 93 94 95
129 130 131 132 133 134 137 138 139 140 141 142 143 144 145 146 147 148 149 150 151 152 153 154 155 156 157 158 159 160 161
321 323 324 325 337 339 341 342 343 344 345 346 349 350 357 358 359 360 361 362 365 366 367 375 376 377 378 379 380 381 382 383 384 385 386 387 388
401 402 403 404 405 406 407 408 409 410 411 412 413 414 415 416 417 418 419
433 434 435 436 437 440 441 442 443 444 445 446 447 448 449 450 451 452 453 454 455
529 530 537 538 539 540 541 542 543 544 545 546 547 548 549 550 551 552 553
609 610 611 612 613 614 615 616 617 618 619 620 621 622 623 625 626 627 628 629 630 631 632 633 634 635 636 637
641 642 643 644 645 646 647 648 649 650 651 652 653 673 674 677 683 684 685 686 687 688 689 690 691 692 693 694 695 696 697 698
801 802 817 818 819 820 821 822 823 849 850 865 866 867 868 869 870
4097 4098 4099 4107 4108 4109 4143
4609 4610 4611 4612 4613 4614 4617 4618 4619 4620 4621 4622 4623 4624
8193 8194 8195 8196
16385 16529 16531 16533 16534 16535 16536 16537 16538 16540 16541 16542 16543 16544 16545 16546 16547
16641 16642 16643 16644 16645 16646 16647 16648 16649 16650 16651 16652 16653 16654 16655 16656 16659 16660 16661 16662 16663 16664 16665 16666 16667 16668 16669 16670 16671 16672 16673 16674 16675 16676 16678 16680 16681 16682 16683 16684 16685 16686 16687 16688 16689 16690 16691 16692 16693 16694 16695 16696 16697 16698 16699 16700 16701 16702 16703 16704 16716 16717 16763 16764 16765 16766 16767 16768 16779 16780
""".split())
# One-based ``Reg`` values from the TTN 12KU U3.0 fast mbpoll list. Keep this
# explicit: the source document has gaps between valid registers and filling
# those gaps can make the inverter reject an otherwise valid FC03 request.
TTN_FAST_MBPOLL_REGISTERS = tuple(int(register) for register in """
65 66 67 68 69 71 72 73 74
81 82 83 84 85 86 87 88 89 90 91 92 93 94 95
129 130 133 134 137 138 139 140 141 142 143
151 152 153 154 155 156 157 158 159 160 161 162
401 402 403 404 405 406 407 408 409 410 411 412 413
801 802 817 818 819 820 821 822 823
16641 16642 16643 16644 16645 16646 16647 16648
16649 16650 16651 16652 16653 16654 16655 16656
16659 16660 16661 16662 16663 16664 16665 16666 16667 16668 16669
16671 16672 16673 16674 16675 16676 16678
16680 16681 16682 16683 16687 16688 16689 16692 16694 16696
""".split())
AVAILABLE_FAST_POLL_REGISTERS = frozenset(
    (*OBSERVED_AVAILABLE_REGISTERS, *TTN_FAST_MBPOLL_REGISTERS)
)

# Fast mode defaults to the authoritative list while still allowing users to
# reduce the selection to any size in Register Map.
MIN_FAST_POLL_REGISTER_COUNT = 0
DEFAULT_FAST_SELECTED_REGISTERS = TTN_FAST_MBPOLL_REGISTERS
DEFAULT_FAST_POLL_REGISTER_COUNT = len(DEFAULT_FAST_SELECTED_REGISTERS)

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
    name, scale, unit, signed, group = REGISTER_CONFIG.get(
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
    if register not in KNOWN_REGISTERS:
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
            if register not in KNOWN_REGISTERS:
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


load_register_map()
load_manual_register_values()

METER_DEFINITIONS = [
    (81, [433], "Напруга мережі", 0.0, 300.0, "V"),
    (82, [434], "Струм мережі", 0.0, 100.0, "A"),
    (84, [150, 436], "Потужність мережі", 0.0, 15000.0, "W"),
    (83, [435], "Частота мережі", 45.0, 55.0, "Hz"),
    # R537 is the measured output voltage for the 12KU U3.0.  R89 is a
    # simplified/nominal reading and is used only while R537 is unavailable.
    (537, [89], "Вихідна напруга AC", 0.0, 300.0, "V"),
    (92, [], "Активна потужність навантаження", 0.0, 12000.0, "W"),
    (93, [], "Повна потужність навантаження", 0.0, 15000.0, "VA"),
    (90, [], "Вихідний струм AC", 0.0, 100.0, "A"),
    # R545 is the measured output load for the 12KU U3.0. R94 is the
    # simplified fast-block value and remains available as a fallback.
    (545, [94], "Завантаження інвертора", 0.0, 100.0, "%"),
    (151, [], "Напруга PV1", 0.0, 500.0, "V"),
    (152, [], "Струм PV1", 0.0, 50.0, "A"),
    (153, [], "Потужність PV1", 0.0, 12000.0, "W"),
    (154, [], "Напруга PV2", 0.0, 500.0, "V"),
    (155, [], "Струм PV2", 0.0, 50.0, "A"),
    (156, [], "Потужність PV2", 0.0, 12000.0, "W"),
    (16655, [], "Нижній поріг вхідної напруги мережі", 0.0, 300.0, "V"),
    (129, [137, 404, 342], "Напруга акумулятора", 40.0, 65.0, "V"),
    (130, [405], "Струм акумулятора", -150.0, 150.0, "A"),
    (133, [139, 407, 339], "Рівень заряду акумулятора", 0.0, 100.0, "%"),
    (134, [], "Потужність акумулятора", -15000.0, 15000.0, "W"),
    (818, [], "Температура інвертора", -20.0, 150.0, "°C"),
    (140, [406], "Температура акумулятора BMS", -20.0, 100.0, "°C"),
    (408, [], "SOH батареї", 0.0, 100.0, "%"),
    (141, [411, 376, 377], "Максимальна напруга заряду", 40.0, 65.0, "V"),
    (343, [], "Струм BMS, канал 1", -150.0, 150.0, "A"),
    (344, [], "Струм BMS, канал 2", -150.0, 150.0, "A"),
    (345, [], "Верхня межа напруги", 40.0, 65.0, "V"),
    (346, [], "Нижня межа напруги", 40.0, 65.0, "V"),
    (349, [], "Поріг низької напруги", 40.0, 65.0, "V"),
    (412, [378, 379], "Максимальний струм заряджання", 0.0, 150.0, "A"),
    (413, [], "Дозволений тривалий струм розряджання батареї", 0.0, 250.0, "A"),
    (409, [], "Поточна ємність батареї", 0.0, 1000.0, "Ah"),
    (410, [], "Повна ємність батареї", 0.0, 1000.0, "Ah"),
    (415, [], "Поріг вимкнення за низьким SOC", 0.0, 100.0, "%"),
]


# Fault and alarm meanings from the supplied inverter manual.
FAULT_CODES = {
    1: "Помилка підвищення напруги шини",
    2: "Перенапруга шини",
    3: "Знижена напруга шини",
    4: "Надструм батареї",
    5: "Перегрів системи",
    6: "Перенапруга батареї",
    7: "Помилка плавного запуску шини",
    8: "Коротке замикання шини",
    9: "Помилка плавного запуску інвертора",
    11: "Знижена напруга інвертора",
    12: "Коротке замикання інвертора",
    13: "Від’ємна потужність інвертора",
    14: "Перевантаження",
    17: "Оновлення програми",
    18: "Зворотна полярність PV",
    26: "Помилка BMS",
    29: "Ненормальне навантаження інвертора",
}

ALARM_CODES = {
    50: "Батарею відключено",
    51: "Знижена напруга батареї",
    52: "Низька напруга батареї",
    53: "Коротке замикання під час заряджання батареї",
    56: "Втрачено зв’язок із BMS",
    58: "Помилка вентилятора",
    59: "Помилка EEPROM",
    60: "Перевантаження",
    62: "Недостатньо енергії PV",
    68: "Відключення через низький SOC",
    69: "Попередження про низький SOC",
    72: "Батарея не може запуститися",
    77: "Нестабільна мережа",
    78: "Втрачено зв’язок із лічильником",
}

OPERATING_STATUS = {
    0: "Очікування або невідомий стан",
    1: "Ймовірно робота від мережі або байпас",
    2: "Ймовірно робота інвертора від батареї або PV",
    3: "Ймовірно заряджання або активна робота",
    4: "Ймовірно помилка або аварійний стан",
}

VALUE_PATTERN = re.compile(r"\[(\d+)\]:\s*(-?\d+)")

state_lock = threading.Lock()
poll_wake_event = threading.Event()
state: dict[str, Any] = {
    "online": False,
    "updated_at": "ніколи",
    "cycle_seconds": 0.0,
    "read_seconds": 0.0,
    "cycle_id": 0,
    "poll_rate_index": 2,
    "read_mode": "fast",
    "scan_active": False,
    "requests": 0,
    "successful": 0,
    "ошибок": 0,
    "error": "",
    "identifier": "",
    "fast_selected_registers": list(DEFAULT_FAST_SELECTED_REGISTERS),
    "values": {},
    "paused": False,
    "stop": False,
}


def signed16(raw: int) -> int:
    return raw - 65536 if raw >= 32768 else raw


def combined_32bit_counter_value(register: int, values: dict[int, int]) -> float | None:
    """Decode a workbook-defined 32-bit unsigned counter from its H/L words."""
    high_register = COUNTER_32BIT_LOW_WORD_REGISTERS.get(register)
    if high_register is None:
        return None
    high = values.get(high_register)
    low = values.get(register)
    if high is None or low is None or high >= 65534 or low >= 65534:
        return None
    _name, scale, _unit, _signed, _group = register_metadata(register)
    return round(((high << 16) | low) * scale, 6)


def normalize(register: int, raw: int) -> tuple[str, str, str, float | None, str]:
    name, scale, unit, use_signed, group = register_metadata(register)

    # Check for special values before applying scale
    if raw == 65535:  # 0xFFFF - No data
        display = "—"
        return name, display, unit, None, group
    if raw == 65534:  # 0xFFFE - Not supported
        display = "Не підтримується"
        return name, display, unit, None, group

    base = signed16(raw) if use_signed else raw
    # Preserve the signed value reported by the inverter. Presentation code
    # translates its R130 direction into charging/discharging labels.
    value = base * scale

    if scale == 1.0:
        display = str(int(value))
    elif scale == 0.1:
        display = f"{value:.1f}"
    elif scale == 0.01:
        display = f"{value:.2f}"
    else:
        display = f"{value:.3f}".rstrip("0").rstrip(".")
    display = str(register_override(register).get("display", display))

    return name, display, unit, value, group


def decode_identifier(values: dict[int, int]) -> str:
    """Build an identity label only from values reported by the inverter."""
    data = bytearray()

    for register in range(1, 11):
        if register not in values:
            continue
        value = values[register] & 0xFFFF
        data.append((value >> 8) & 0xFF)
        data.append(value & 0xFF)

    raw_identifier = bytes(data).rstrip(b"\x00")
    try:
        serial = raw_identifier.decode("ascii")
    except UnicodeDecodeError:
        serial = ""
    if not all(0x20 <= ord(character) <= 0x7E for character in serial):
        serial = ""
    serial = serial.strip()

    def valid_word(register: int) -> int | None:
        value = values.get(register)
        return value if value is not None and 0 <= value < 65534 else None

    identity_parts: list[str] = []
    model_id = valid_word(58)
    device_type_high = valid_word(61)
    device_type_low = valid_word(62)
    if model_id is not None:
        identity_parts.append(f"Model ID {model_id}")
    if device_type_high is not None and device_type_low is not None:
        identity_parts.append(f"Device type {(device_type_high << 16) | device_type_low}")
    if serial:
        identity_parts.append(f"SN {serial}")
    return " · ".join(identity_parts)


def run_mbpoll(start: int, count: int) -> tuple[dict[int, int], str | None]:
    global CONNECTION_MODE
    
    if CONNECTION_MODE == "tcp":
        print(f"[Modbus TCP] Reading registers {start}-{start+count-1} from {TCP_IP}:{TCP_PORT} (slave {SLAVE_ID})")
        try:
            from pymodbus.client import ModbusTcpClient
            from pymodbus.exceptions import ModbusException
        except ImportError:
            print("[Modbus TCP] ERROR: pymodbus not installed")
            return {}, "pymodbus не встановлено"
        
        try:
            client = ModbusTcpClient(TCP_IP, port=TCP_PORT, timeout=COMMAND_TIMEOUT_SECONDS)
            if not client.connect():
                print(f"[Modbus TCP] ERROR: Connection failed to {TCP_IP}:{TCP_PORT}")
                return {}, "TCP з'єднання не вдалося"
            
            result = client.read_holding_registers(start - 1, count, slave=SLAVE_ID)
            client.close()
            
            if result.isError():
                print(f"[Modbus TCP] ERROR: {result}")
                return {}, f"Modbus помилка: {result}"
            
            values = {start + i: int(result.registers[i]) for i in range(len(result.registers))}
            print(f"[Modbus TCP] SUCCESS: Read {len(values)} registers")
            return values, None
            
        except ModbusException as e:
            print(f"[Modbus TCP] ERROR: {e}")
            return {}, f"Modbus помилка: {e}"
        except Exception as error:
            print(f"[Modbus TCP] ERROR: {error}")
            return {}, str(error)
    
    # RTU mode (original mbpoll implementation)
    print(f"[Modbus RTU] Reading registers {start}-{start+count-1} from {DEVICE} (baud {BAUD_RATE}, slave {SLAVE_ID})")
    command = [
        "mbpoll",
        "-m", "rtu",
        "-b", str(BAUD_RATE),
        "-P", "none",
        "-t", "4",
        "-a", str(SLAVE_ID),
        "-r", str(start),
        "-c", str(count),
        "-1",
        "-q",
        DEVICE,
    ]

    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=COMMAND_TIMEOUT_SECONDS,
            check=False,
        )
    except subprocess.TimeoutExpired:
        print(f"[Modbus RTU] ERROR: Timeout after {COMMAND_TIMEOUT_SECONDS}s")
        return {}, "перевищено час очікування"
    except FileNotFoundError:
        print("[Modbus RTU] ERROR: mbpoll command not found")
        return {}, "mbpoll не знайдено"
    except Exception as error:
        print(f"[Modbus RTU] ERROR: {error}")
        return {}, str(error)

    output = f"{result.stdout}\n{result.stderr}"
    values = {
        int(match.group(1)): int(match.group(2))
        for match in VALUE_PATTERN.finditer(output)
    }

    if values:
        print(f"[Modbus RTU] SUCCESS: Read {len(values)} registers")
        return values, None
    else:
        print(f"[Modbus RTU] ERROR: No values read. Output: {output[:200]}")
        return {}, output.strip() or "помилка читання"


def read_initial_identity() -> tuple[dict[int, int], int, int, str | None]:
    """Read the inverter identity once before normal polling begins."""
    values: dict[int, int] = {}
    failed = 0
    requests = 0
    last_error = None
    for start, count in IDENTITY_BLOCKS:
        block_values, error = run_mbpoll(start, count)
        requests += 1
        if block_values:
            values.update(block_values)
        else:
            failed += count
            last_error = error
    return values, failed, requests, last_error


def read_fast() -> tuple[dict[int, int], int, int, str | None]:
    values: dict[int, int] = {}
    failed = 0
    requests = 0
    last_error = None

    with state_lock:
        selected_blocks = fast_selected_blocks(state["fast_selected_registers"])
    for start, count in [*FAST_BLOCKS, *selected_blocks]:
        block_values, error = run_mbpoll(start, count)
        requests += 1

        if block_values:
            values.update(block_values)
            continue

        last_error = error
        failed += sum(
            1 for register in KNOWN_REGISTERS
            if start <= register < start + count
        )

    return values, failed, requests, last_error


def read_compatible() -> tuple[dict[int, int], int, int, str | None]:
    values: dict[int, int] = {}
    failed = 0
    requests = 0
    last_error = None

    for register in KNOWN_REGISTERS:
        # A scan can be stopped from the Register Map between Modbus requests.
        with state_lock:
            if state.get("scan_active") is False and state["read_mode"] != "compatible":
                break
        one, error = run_mbpoll(register, 1)
        requests += 1

        if one:
            values.update(one)
        else:
            failed += 1
            last_error = error

    return values, failed, requests, last_error



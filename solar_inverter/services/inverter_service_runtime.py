from __future__ import annotations

from . import inverter_service_core as _core
from .inverter_service_core import *
from .chart_history import get_chart_history, initialise_chart_history, record_chart_history
from .server_logging import get_server_logs

UPDATER_RECEIPT_PATH = PROJECT_ROOT / "updater_history.json"
UPDATER_ARCHIVE_DIR = PROJECT_ROOT / "updater_archives"

def ensure_updater_history_schema(connection: sqlite3.Connection) -> None:
    """Add updater-history columns introduced after the original table."""
    columns = {row[1] for row in connection.execute("PRAGMA table_info(updater_versions)")}
    additions = {
        "commit_message": "TEXT", "commit_date": "TEXT",
        "source": "TEXT NOT NULL DEFAULT 'local'", "bundle_path": "TEXT",
        "build_output": "TEXT", "created_at": "TEXT",
    }
    for name, declaration in additions.items():
        if name not in columns:
            connection.execute(f"ALTER TABLE updater_versions ADD COLUMN {name} {declaration}")
    connection.execute("UPDATE updater_versions SET created_at = datetime('now') WHERE created_at IS NULL")
    connection.commit()

def set_connection_mode(mode: str) -> dict[str, Any]:
    """Set the connection mode (rtu or tcp) and return status."""
    global CONNECTION_MODE
    if mode not in ("rtu", "tcp"):
        return {"error": "Invalid mode, must be 'rtu' or 'tcp'"}
    print(f"[Connection Mode] Changing from {_core.CONNECTION_MODE} to {mode}")
    CONNECTION_MODE = mode
    _core.CONNECTION_MODE = mode
    print(f"[Connection Mode] Now using {mode.upper()}")
    return {"mode": mode, "success": True}

def get_connection_mode() -> dict[str, Any]:
    """Get the current connection mode."""
    print(f"[Connection Mode] Current mode: {_core.CONNECTION_MODE}")
    return {"mode": _core.CONNECTION_MODE}


def maintain_register_log_storage(force: bool = False) -> bool:
    """Delete oldest completed logs when disk space falls below the reserve."""
    global register_log_free_bytes, register_log_pruned_files
    global register_log_storage_checked_at, register_log_error

    with register_log_lock:
        monotonic_now = time.monotonic()
        if not force and monotonic_now - register_log_storage_checked_at < 60:
            return (
                register_log_free_bytes is None
                or register_log_free_bytes >= REGISTER_LOG_MIN_FREE_BYTES
            )

        register_log_storage_checked_at = monotonic_now
        try:
            REGISTER_LOG_DIRECTORY.mkdir(parents=True, exist_ok=True)
            root = REGISTER_LOG_DIRECTORY.resolve()
            register_log_free_bytes = shutil.disk_usage(root).free
            if register_log_free_bytes >= REGISTER_LOG_MIN_FREE_BYTES:
                return True

            active_path = (
                register_log_path.resolve()
                if register_log_file is not None and register_log_path is not None
                else None
            )
            candidates: list[tuple[float, Path]] = []
            for candidate in REGISTER_LOG_DIRECTORY.glob("register_changes_*.csv"):
                try:
                    resolved = candidate.resolve(strict=True)
                    modified_at = resolved.stat().st_mtime
                except OSError:
                    continue
                if (
                    resolved.parent != root
                    or resolved == active_path
                    or not resolved.name.startswith("register_changes_")
                    or resolved.suffix.lower() != ".csv"
                ):
                    continue
                candidates.append((modified_at, resolved))

            candidates.sort(key=lambda item: item[0])
            for _, candidate in candidates:
                if register_log_free_bytes >= REGISTER_LOG_CLEANUP_TARGET_BYTES:
                    break
                candidate.unlink()
                register_log_pruned_files += 1
                register_log_free_bytes = shutil.disk_usage(root).free

            if register_log_free_bytes < REGISTER_LOG_MIN_FREE_BYTES:
                minimum_gib = REGISTER_LOG_MIN_FREE_BYTES / 1024**3
                register_log_error = (
                    "Register logging stopped: less than "
                    f"{minimum_gib:g} GiB free and no completed register logs "
                    "remain to remove"
                )
                return False
            register_log_error = ""
            return True
        except OSError as error:
            register_log_error = f"Register-log storage cleanup failed: {error}"
            return False


def register_log_storage_worker() -> None:
    """Check log storage every minute, even when recording is inactive."""
    while not register_log_storage_stop_event.wait(60):
        maintain_register_log_storage(force=True)


def register_log_status() -> dict[str, Any]:
    """Return the current register change-log state for the web dashboard."""
    with register_log_lock:
        path = register_log_path
        if path is None and REGISTER_LOG_DIRECTORY.exists():
            path = max(
                REGISTER_LOG_DIRECTORY.glob("register_changes_*.csv"),
                key=lambda candidate: candidate.stat().st_mtime,
                default=None,
            )
        size = path.stat().st_size if path is not None and path.exists() else 0
        return {
            "active": register_log_file is not None,
            "filename": path.name if path is not None else "",
            "started_at": register_log_started_at,
            "changes": register_log_changes,
            "size_bytes": size,
            "available": path is not None and path.exists(),
            "error": register_log_error,
            "free_bytes": register_log_free_bytes,
            "minimum_free_bytes": REGISTER_LOG_MIN_FREE_BYTES,
            "pruned_files": register_log_pruned_files,
            "physical_button_capture": register_log_file is not None,
            "capture_interval_seconds": POLL_RATES[0],
            "language": register_log_language,
        }


def describe_changed_bits(previous_raw: int | None, raw: int) -> str:
    """Describe changed bits in a 16-bit register value for signal discovery."""
    if previous_raw is None:
        return ""
    previous_word = int(previous_raw) & 0xFFFF
    current_word = int(raw) & 0xFFFF
    changed_mask = previous_word ^ current_word
    return "|".join(
        f"b{bit}:{(previous_word >> bit) & 1}->{(current_word >> bit) & 1}"
        for bit in range(16)
        if changed_mask & (1 << bit)
    )


def configure_register_log_language(
    language: str, translations: Any = None
) -> None:
    """Select and validate browser-provided translations for one CSV session."""
    global register_log_language, register_log_text_translations
    if language not in REGISTER_LOG_CSV_LABELS:
        raise ValueError("language must be uk, ru, or en")
    clean_translations: dict[str, str] = {}
    if isinstance(translations, dict):
        for source, translated in list(translations.items())[:500]:
            if not isinstance(source, str) or not isinstance(translated, str):
                continue
            clean_source = " ".join(source.split())[:250]
            clean_translated = " ".join(translated.split())[:250]
            if clean_source and clean_translated:
                clean_translations[clean_source] = clean_translated
    register_log_language = language
    register_log_text_translations = clean_translations


def localize_register_log_text(text: str) -> str:
    """Translate register metadata using the language selected when logging began."""
    translated = register_log_text_translations.get(text)
    if translated is None and text.startswith("Регістр "):
        translated = f"{REGISTER_LOG_CSV_LABELS[register_log_language]['register']} {text[8:]}"
    return safe_register_log_cell(translated if translated is not None else text)


def safe_register_log_cell(value: str) -> str:
    """Prevent user or translated text from becoming a spreadsheet formula."""
    # Prevent spreadsheet applications from treating labels as formulas.
    numeric = re.fullmatch(r"[+-]?\d+(?:\.\d+)?", value) is not None
    return f"'{value}" if not numeric and value.startswith(("=", "+", "-", "@")) else value


def register_log_event(event: str) -> str:
    """Return a localized CSV event name."""
    events = REGISTER_LOG_CSV_LABELS[register_log_language]["events"]
    return str(events.get(event, event))


def start_register_log(
    language: str = "uk", translations: Any = None
) -> dict[str, Any]:
    """Start a new CSV file containing initial and changed register values."""
    global register_log_file, register_log_writer, register_log_path
    global register_log_started_at, register_log_changes, register_log_error
    global register_log_previous_values
    global register_log_previous_poll_settings

    with register_log_lock:
        if register_log_file is not None:
            return register_log_status_unlocked()
        log_file: TextIO | None = None
        try:
            configure_register_log_language(language, translations)
            REGISTER_LOG_DIRECTORY.mkdir(parents=True, exist_ok=True)
            if not maintain_register_log_storage(force=True):
                return register_log_status_unlocked()
            now = datetime.now(MADRID_TIME_ZONE)
            path = REGISTER_LOG_DIRECTORY / (
                f"register_changes_{register_log_language}_"
                f"{now.strftime('%Y%m%d_%H%M%S_%f')}.csv"
            )
            log_file = path.open("x", encoding="utf-8-sig", newline="", buffering=1)
            writer = csv.writer(log_file)
            writer.writerow(REGISTER_LOG_CSV_LABELS[register_log_language]["headers"])
            register_log_file = log_file
            register_log_writer = writer
            register_log_path = path
            register_log_started_at = now.isoformat(timespec="seconds")
            register_log_changes = 0
            register_log_error = ""
            with state_lock:
                register_log_previous_poll_settings = (
                    int(state["poll_rate_index"]),
                    str(state["read_mode"]),
                    bool(state["paused"]),
                )
                baseline_values = dict(state["values"])
                baseline_cycle_id = int(state["cycle_id"])
                state["poll_rate_index"] = 0
                state["read_mode"] = "fast"
                state["paused"] = False

            baseline_timestamp = now.isoformat(timespec="milliseconds")
            for register, raw in sorted(baseline_values.items()):
                name, display, unit, _, group = normalize(register, raw)
                writer.writerow([
                    baseline_timestamp,
                    baseline_cycle_id,
                    register_log_event("INITIAL"),
                    register,
                    localize_register_log_text(group),
                    localize_register_log_text(name),
                    "",
                    raw,
                    "",
                    localize_register_log_text(display),
                    unit,
                    "",
                    "",
                    "",
                    "",
                ])
                register_log_changes += 1
            log_file.flush()
            register_log_previous_values = baseline_values
            poll_wake_event.set()
        except OSError as error:
            register_log_error = str(error)
            if log_file is not None:
                try:
                    log_file.close()
                except OSError:
                    pass
            register_log_file = None
            register_log_writer = None
            restore_register_log_poll_settings()
        return register_log_status_unlocked()


def restore_register_log_poll_settings() -> None:
    """Restore polling settings that were active before capture started."""
    global register_log_previous_poll_settings
    if register_log_previous_poll_settings is None:
        return
    poll_rate_index, read_mode, paused = register_log_previous_poll_settings
    with state_lock:
        state["poll_rate_index"] = poll_rate_index
        state["read_mode"] = read_mode
        state["paused"] = paused
    register_log_previous_poll_settings = None
    poll_wake_event.set()


def stop_register_log() -> dict[str, Any]:
    """Flush and close the active register change log."""
    global register_log_file, register_log_writer, register_log_error
    with register_log_lock:
        try:
            if register_log_file is not None:
                register_log_file.flush()
                register_log_file.close()
        except OSError as error:
            register_log_error = str(error)
        finally:
            register_log_file = None
            register_log_writer = None
            restore_register_log_poll_settings()
        return register_log_status_unlocked()


def register_log_status_unlocked() -> dict[str, Any]:
    """Return log state while the caller holds ``register_log_lock``."""
    path = register_log_path
    size = path.stat().st_size if path is not None and path.exists() else 0
    return {
        "active": register_log_file is not None,
        "filename": path.name if path is not None else "",
        "started_at": register_log_started_at,
        "changes": register_log_changes,
        "size_bytes": size,
        "available": path is not None and path.exists(),
        "error": register_log_error,
        "free_bytes": register_log_free_bytes,
        "minimum_free_bytes": REGISTER_LOG_MIN_FREE_BYTES,
        "pruned_files": register_log_pruned_files,
        "physical_button_capture": register_log_file is not None,
        "capture_interval_seconds": POLL_RATES[0],
        "language": register_log_language,
    }


def record_register_changes(values: dict[int, int], cycle_id: int) -> None:
    """Append the initial snapshot or values changed since the prior poll."""
    global register_log_file, register_log_writer
    global register_log_changes, register_log_error, register_log_previous_values
    with register_log_lock:
        if register_log_file is None or register_log_writer is None:
            return
        if not maintain_register_log_storage():
            try:
                register_log_file.flush()
                register_log_file.close()
            except OSError:
                pass
            register_log_file = None
            register_log_writer = None
            restore_register_log_poll_settings()
            return
        initial_snapshot = not register_log_previous_values
        timestamp = datetime.now(MADRID_TIME_ZONE).isoformat(timespec="milliseconds")
        try:
            for register, raw in sorted(values.items()):
                previous_raw = register_log_previous_values.get(register)
                if not initial_snapshot and previous_raw == raw:
                    continue
                name, display, unit, _, group = normalize(register, raw)
                register_log_writer.writerow([
                    timestamp,
                    cycle_id,
                    register_log_event("INITIAL" if initial_snapshot else "CHANGE"),
                    register,
                    localize_register_log_text(group),
                    localize_register_log_text(name),
                    "" if previous_raw is None else previous_raw,
                    raw,
                    describe_changed_bits(previous_raw, raw),
                    localize_register_log_text(display),
                    unit,
                    "",
                    "",
                    "",
                    "",
                ])
                register_log_changes += 1
            register_log_file.flush()
            register_log_previous_values = dict(values)
            register_log_error = ""
        except OSError as error:
            register_log_error = str(error)


def record_register_log_note(note: str, cycle_id: int) -> dict[str, Any]:
    """Add a user-supplied experiment marker to the active CSV log."""
    global register_log_changes, register_log_error
    clean_note = " ".join(note.strip().split())
    if not clean_note:
        raise ValueError("нотатка не може бути порожньою")
    if len(clean_note) > 500:
        raise ValueError("нотатка не може перевищувати 500 символів")
    with register_log_lock:
        if register_log_file is None or register_log_writer is None:
            raise ValueError("спочатку запустіть запис журналу")
        try:
            register_log_writer.writerow([
                datetime.now(MADRID_TIME_ZONE).isoformat(timespec="milliseconds"),
                cycle_id,
                register_log_event("NOTE"),
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                safe_register_log_cell(clean_note),
            ])
            register_log_file.flush()
            register_log_changes += 1
            register_log_error = ""
        except OSError as error:
            register_log_error = str(error)
        return register_log_status_unlocked()


def record_demo_lcd_key(
    key: str, page: str, demo_case: str, cycle_id: int
) -> dict[str, Any]:
    """Record a virtual LCD key press made while the browser demo is running."""
    global register_log_changes, register_log_error
    clean_key = key.strip().lower()
    if clean_key not in {"escape", "up", "down", "enter"}:
        raise ValueError("invalid LCD key")
    clean_page = page.strip().upper()
    if clean_page != "LCD" and re.fullmatch(r"P(?:[1-9]|10)", clean_page) is None:
        raise ValueError("invalid LCD page")
    clean_demo_case = demo_case.strip()
    if re.fullmatch(r"[A-Za-z0-9_-]{1,80}", clean_demo_case) is None:
        raise ValueError("invalid demo scenario")

    with register_log_lock:
        if register_log_file is None or register_log_writer is None:
            raise ValueError("спочатку запустіть запис журналу")
        try:
            register_log_writer.writerow([
                datetime.now(MADRID_TIME_ZONE).isoformat(timespec="milliseconds"),
                cycle_id,
                register_log_event("LCD_KEY"),
                "", "", "", "", "", "", "", "",
                "ESC" if clean_key == "escape" else clean_key.upper(),
                clean_page,
                clean_demo_case,
                "",
            ])
            register_log_file.flush()
            register_log_changes += 1
            register_log_error = ""
        except OSError as error:
            register_log_error = str(error)
        return register_log_status_unlocked()


def flush_solar_energy_locked() -> bool:
    """Persist pending PV watt-hours while ``stats_lock`` is held."""
    global solar_energy_error
    pending = {
        day: watt_hours
        for day, watt_hours in solar_energy_pending_wh.items()
        if watt_hours > 0
    }
    if not pending:
        return True
    try:
        with closing(sqlite3.connect(STATS_DB_PATH)) as connection:
            connection.executemany(
                """
                INSERT INTO solar_energy_daily (day, watt_hours, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(day) DO UPDATE SET
                    watt_hours = watt_hours + excluded.watt_hours,
                    updated_at = excluded.updated_at
                """,
                [
                    (day, watt_hours, datetime.now(MADRID_TIME_ZONE).isoformat(timespec="seconds"))
                    for day, watt_hours in pending.items()
                ],
            )
            connection.commit()
        for day, watt_hours in pending.items():
            remaining = solar_energy_pending_wh.get(day, 0.0) - watt_hours
            if remaining > 1e-9:
                solar_energy_pending_wh[day] = remaining
            else:
                solar_energy_pending_wh.pop(day, None)
        solar_energy_error = ""
        return True
    except (OSError, sqlite3.Error) as error:
        solar_energy_error = str(error)
        return False


def flush_solar_energy() -> None:
    """Persist accumulated solar energy before a clean shutdown."""
    with stats_lock:
        flush_solar_energy_locked()


def record_solar_energy(fresh_values: dict[int, int]) -> None:
    """Integrate confirmed PV1 + PV2 power into daily energy storage."""
    global solar_energy_last_sample_at, solar_energy_last_power_w
    global solar_energy_last_flush_monotonic, solar_energy_error

    powers: list[float] = []
    for register in (153, 156):
        if register not in fresh_values:
            continue
        value = normalize(register, fresh_values[register])[3]
        if value is not None:
            powers.append(max(0.0, value))
    if not powers:
        return

    now = datetime.now(MADRID_TIME_ZONE)
    power_w = sum(powers)
    with stats_lock:
        if solar_energy_last_sample_at is not None and solar_energy_last_power_w is not None:
            elapsed_seconds = (now - solar_energy_last_sample_at).total_seconds()
            if 0 < elapsed_seconds <= 30:
                watt_hours = (solar_energy_last_power_w + power_w) / 2 * elapsed_seconds / 3600
                day = now.date().isoformat()
                solar_energy_pending_wh[day] = solar_energy_pending_wh.get(day, 0.0) + watt_hours
        solar_energy_last_sample_at = now
        solar_energy_last_power_w = power_w
        if time.monotonic() - solar_energy_last_flush_monotonic >= 60:
            if flush_solar_energy_locked():
                solar_energy_last_flush_monotonic = time.monotonic()


def solar_energy_summary() -> dict[str, Any]:
    """Return current and all-time SQLite-backed production in kWh."""
    global solar_energy_error
    now = datetime.now(MADRID_TIME_ZONE)
    today = now.date()
    week_start = today - timedelta(days=today.weekday())
    month_start = today.replace(day=1)
    year_start = today.replace(month=1, day=1)
    daily: dict[str, float] = {}
    with state_lock:
        live_values = dict(state.get("values", {}))
    direct_today = normalize(157, live_values[157])[3] if 157 in live_values else None
    direct_total = normalize(158, live_values[158])[3] if 158 in live_values else None

    try:
        with stats_lock:
            with closing(sqlite3.connect(STATS_DB_PATH)) as connection:
                rows = connection.execute(
                    """
                    SELECT day, watt_hours
                    FROM solar_energy_daily
                    """,
                ).fetchall()
            daily = {str(day): float(watt_hours) for day, watt_hours in rows}
            for day, watt_hours in solar_energy_pending_wh.items():
                daily[day] = daily.get(day, 0.0) + watt_hours
        solar_energy_error = ""
    except (OSError, sqlite3.Error) as error:
        solar_energy_error = str(error)

    def total_since(start: Any) -> float:
        return sum(
            watt_hours
            for day, watt_hours in daily.items()
            if start.isoformat() <= day <= today.isoformat()
        ) / 1000

    return {
        "today_kwh": direct_today if direct_today is not None else total_since(today),
        "week_kwh": total_since(week_start),
        "month_kwh": total_since(month_start),
        "year_kwh": total_since(year_start),
        "total_kwh": direct_total if direct_total is not None else sum(daily.values()) / 1000,
        "source_register": "R157 / R158; R153 + R156",
        "storage": "sqlite",
        "estimated": False,
        "error": solar_energy_error,
    }


def poll_worker() -> None:
    cached: dict[int, int] = {}
    previous_cycle_started: float | None = None
    print("[Poll Worker] Starting poll worker")

    identity_values, identity_failed, identity_requests, identity_error = read_initial_identity()
    if identity_values:
        cached.update(identity_values)
        detected_identifier = decode_identifier(identity_values)
        with state_lock:
            state["identifier"] = detected_identifier
        print(
            f"[Poll Worker] Initial identity read - Identifier: "
            f"{detected_identifier or 'not reported'}, Failed: {identity_failed}, "
            f"Requests: {identity_requests}"
        )
    else:
        print(f"[Poll Worker] Initial identity read failed: {identity_error or 'no data'}")

    while True:
        with state_lock:
            if state["stop"]:
                print("[Poll Worker] Stopping poll worker")
                return
            paused = state["paused"]
            mode = state["read_mode"]
            poll_rate = POLL_RATES[state["poll_rate_index"]]

        if paused:
            print("[Poll Worker] Polling paused, waiting...")
            poll_wake_event.wait()
            poll_wake_event.clear()
            print("[Poll Worker] Polling resumed")
            continue

        started = time.monotonic()
        cycle_interval = (
            started - previous_cycle_started
            if previous_cycle_started is not None
            else 0.0
        )
        previous_cycle_started = started
        
        print(f"[Poll Worker] Cycle started - Mode: {mode}, Interval: {cycle_interval:.2f}s, Connection: {CONNECTION_MODE.upper()}")

        if mode in {"compatible", "scan"}:
            fresh, failed, requests, error = read_compatible()
        else:
            fresh, failed, requests, error = read_fast()

        print(f"[Poll Worker] Read complete - Success: {len(fresh)}, Failed: {failed}, Requests: {requests}, Error: {error or 'None'}")

        if fresh:
            cached.update(fresh)
            print(f"[Poll Worker] Cached {len(fresh)} new register values")

        identifier = decode_identifier(cached)

        read_duration = round(time.monotonic() - started, 2)
        cycle_duration = round(cycle_interval or read_duration, 2)

        with state_lock:
            state["online"] = bool(fresh)
            state["updated_at"] = datetime.now(MADRID_TIME_ZONE).strftime(
                "%Y-%m-%d %H:%M:%S"
            )
            state["cycle_seconds"] = cycle_duration
            state["read_seconds"] = read_duration
            state["cycle_id"] += 1
            state["requests"] = requests
            state["successful"] = len(fresh)
            state["ошибок"] = failed
            state["error"] = "" if fresh else (error or "помилка читання")
            state["identifier"] = identifier
            state["values"] = dict(cached)
            state["connection_mode"] = CONNECTION_MODE
            # A full scan is intentionally one-shot: it populates the cached
            # register snapshot, then restores low-latency live monitoring.
            if mode == "scan":
                state["read_mode"] = "fast"
                state["scan_active"] = False
            log_cycle_id = int(state["cycle_id"])
            log_values = dict(cached)

            if state["stop"]:
                return

            poll_rate = POLL_RATES[state["poll_rate_index"]]

        print(f"[Poll Worker] State updated - Cycle ID: {log_cycle_id}, Online: {bool(fresh)}, Identifier: {state['identifier']}")
        record_register_changes(log_values, log_cycle_id)
        if fresh:
            record_solar_energy(fresh)
            record_chart_history(fresh)
            print(f"[Poll Worker] Solar energy recorded")
        cycle_work_duration = time.monotonic() - started
        sleep_time = max(0.0, poll_rate - cycle_work_duration)
        print(f"[Poll Worker] Cycle complete - Duration: {cycle_work_duration:.2f}s, Sleeping: {sleep_time:.2f}s")
        poll_wake_event.wait(sleep_time)
        poll_wake_event.clear()


def meter_value(
    values: dict[int, int], register: int, fallbacks: list[int]
) -> tuple[float | None, str]:
    """Return the first available normalized value for a dashboard meter."""
    for candidate in [register, *fallbacks]:
        if candidate not in values:
            continue

        _, display, _, value, _ = normalize(candidate, values[candidate])
        if value is not None:
            return value, f"R{candidate} {display}"

    return None, "Н/Д"


def initialise_statistics() -> None:
    """Create and load the privacy-friendly persistent page-view counter."""
    global site_visit_total, stats_error
    try:
        STATS_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(STATS_DB_PATH)) as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS site_counters (
                    name TEXT PRIMARY KEY,
                    value INTEGER NOT NULL
                )
                """
            )
            connection.execute(
                """
                INSERT OR IGNORE INTO site_counters (name, value)
                VALUES ('page_views', 0)
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS solar_energy_daily (
                    day TEXT PRIMARY KEY,
                    watt_hours REAL NOT NULL DEFAULT 0,
                    updated_at TEXT NOT NULL
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS updater_versions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    commit_hash TEXT NOT NULL,
                    commit_message TEXT,
                    commit_date TEXT,
                    source TEXT NOT NULL,
                    bundle_path TEXT,
                    build_output TEXT,
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                )
                """
            )
            ensure_updater_history_schema(connection)
            site_visit_total = int(
                connection.execute(
                    "SELECT value FROM site_counters WHERE name = 'page_views'"
                ).fetchone()[0]
            )
            connection.commit()
        initialise_chart_history()
        stats_error = ""
    except (OSError, sqlite3.Error) as error:
        stats_error = str(error)


def increment_site_visits() -> None:
    """Count one dashboard HTML page load without storing visitor information."""
    global site_visit_total, stats_error
    try:
        with stats_lock, closing(sqlite3.connect(STATS_DB_PATH)) as connection:
            connection.execute(
                """
                UPDATE site_counters
                SET value = value + 1
                WHERE name = 'page_views'
                """
            )
            site_visit_total = int(
                connection.execute(
                    "SELECT value FROM site_counters WHERE name = 'page_views'"
                ).fetchone()[0]
            )
            connection.commit()
        stats_error = ""
    except sqlite3.Error as error:
        stats_error = str(error)


def record_updater_version(commit_hash: str, commit_message: str, commit_date: str, source: str, bundle_path: str, build_output: str = "") -> bool:
    """Record an updater version in the database."""
    global stats_error
    try:
        with stats_lock, closing(sqlite3.connect(STATS_DB_PATH)) as connection:
            connection.execute(
                """
                INSERT INTO updater_versions (commit_hash, commit_message, commit_date, source, bundle_path, build_output)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (commit_hash, commit_message, commit_date, source, bundle_path, build_output)
            )
            connection.commit()
        stats_error = ""
        return True
    except (OSError, sqlite3.Error) as error:
        stats_error = str(error)
        return False


def get_updater_history() -> list:
    """Get installer receipts, merging SQLite and the durable local receipt."""
    global stats_error
    history = []
    try:
        with stats_lock, closing(sqlite3.connect(STATS_DB_PATH)) as connection:
            rows = connection.execute(
                """
                SELECT id, commit_hash, build_output, created_at, bundle_path
                FROM updater_versions
                WHERE source = 'installer'
                ORDER BY created_at DESC
                """
            ).fetchall()
        for row in rows:
            commit_hash = row[1]
            if commit_hash.startswith("updater-"):
                commit_hash = commit_hash[len("updater-"):]
            version_parts = commit_hash.split("-", 1)
            history.append({
                "id": row[0],
                "version": version_parts[0],
                "dashboard_version": version_parts[1] if len(version_parts) > 1 else "",
                "checksum": row[2],
                "installed_at": row[3],
                "archive_file": Path(row[4]).name if row[4] else "",
            })
        stats_error = ""
    except (OSError, sqlite3.Error) as error:
        stats_error = str(error)
    try:
        receipt = json.loads(UPDATER_RECEIPT_PATH.read_text(encoding="utf-8"))
        installations = receipt.get("installations", []) if isinstance(receipt, dict) else []
        history.extend(
            {
                "id": f"receipt-{index}",
                "version": str(item.get("version", "4")),
                "dashboard_version": str(item.get("dashboard_version", "")),
                "checksum": str(item.get("checksum", "")),
                "installed_at": str(item.get("installed_at", "")),
                "archive_file": Path(str(item.get("bundle", ""))).name,
            }
            for index, item in enumerate(installations)
            if isinstance(item, dict) and item.get("installed_at")
        )
    except (OSError, ValueError):
        pass
    unique = {}
    for item in sorted(history, key=lambda entry: entry["installed_at"], reverse=True):
        unique.setdefault((item["version"], item["checksum"]), item)
    entries = list(unique.values())
    for index, item in enumerate(reversed(entries), start=4):
        item["version"] = str(index)
    for item in entries:
        archive_file = item.get("archive_file", "")
        item["download_available"] = bool(
            archive_file
            and archive_file == Path(archive_file).name
            and (UPDATER_ARCHIVE_DIR / archive_file).is_file()
        )
    return entries


def get_updater_archive(archive_file: str) -> Path | None:
    """Resolve only an archive currently advertised by updater history."""
    if not archive_file or archive_file != Path(archive_file).name:
        return None
    if not any(
        item.get("archive_file") == archive_file and item.get("download_available")
        for item in get_updater_history()
    ):
        return None
    archive_path = UPDATER_ARCHIVE_DIR / archive_file
    return archive_path if archive_path.is_file() else None


def visitor_was_counted(cookie_header: str) -> bool:
    """Check the anonymous first-visit cookie without identifying the visitor."""
    try:
        cookie = SimpleCookie()
        cookie.load(cookie_header)
        return cookie.get(COUNTED_VISITOR_COOKIE, "").value == "1"
    except (AttributeError, ValueError):
        return False

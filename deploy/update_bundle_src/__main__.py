#!/usr/bin/env python3
"""Install or update the Solar Inverter Dashboard from one zipapp file."""

from __future__ import annotations

import argparse
import compileall
import hashlib
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import zipfile
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from pathlib import PurePosixPath


APPLICATION_ROOT = Path("/opt/solar-inverter-dashboard")
STATS_DATABASE_PATH = Path("/var/lib/solar-inverter-dashboard/stats.sqlite3")
LEGACY_APPLICATION_ROOT = Path("/opt/solar_assistant")
LEGACY_STATS_DATABASE_PATH = LEGACY_APPLICATION_ROOT / "solar_invertor_web_stats.sqlite3"
UPDATER_RECEIPT_PATH = APPLICATION_ROOT / "updater_history.json"
UPDATER_ARCHIVE_DIR = APPLICATION_ROOT / "updater_archives"
UPSTREAM_VERSION_PAYLOAD = ".solar-dashboard-upstream.json"
PAYLOAD_MANIFEST = ".solar-dashboard-payload.json"
SERVICE_NAME = "solar-inverter-dashboard.service"
SERVICE_TARGET = Path("/etc/systemd/system") / SERVICE_NAME
SERVICE_USER = "solar-dashboard"
SERVICE_GROUP = "solar-dashboard"
UPDATER_VERSION = "5"
DEFAULT_GIT_REMOTE = "origin"
DEFAULT_GIT_BRANCH = "main"

REQUIRED_RUNTIME_FILES = (
    UPSTREAM_VERSION_PAYLOAD,
    "solar_invertor_web.py",
    "favicon.png",
    "generator-mask.png",
    "1258380.png",
    "inverter.svg",
    "home.svg",
    "solar_inverter/__init__.py",
    "solar_inverter/components/__init__.py",
    "solar_inverter/components/api_localization.py",
    "solar_inverter/components/github_updates.py",
    "solar_inverter/components/state_payload.py",
    "solar_inverter/components/web_dashboard.py",
    "solar_inverter/components/dashboard_template.py",
    "solar_inverter/components/state_consistency.py",
    "solar_inverter/web/index.html",
    "solar_inverter/web/styles/dashboard.css",
    "solar_inverter/web/styles/charts.css",
    "solar_inverter/web/styles/dashboard-responsive.css",
    "solar_inverter/web/assets/lcd-icons/ac-input.svg",
    "solar_inverter/web/assets/lcd-icons/ac-output.svg",
    "solar_inverter/web/assets/lcd-icons/battery.svg",
    "solar_inverter/web/assets/lcd-icons/charger.svg",
    "solar_inverter/web/assets/lcd-icons/energy.svg",
    "solar_inverter/web/assets/lcd-icons/load.svg",
    "solar_inverter/web/assets/lcd-icons/solar.svg",
    "solar_inverter/web/vendor/uPlot.iife.min.js",
    "solar_inverter/web/vendor/uPlot.min.css",
    "solar_inverter/web/vendor/LICENSE-uPlot.txt",
    "solar_inverter/web/data/data-translations.json",
    "solar_inverter/web/scripts/translations.js",
    "solar_inverter/web/scripts/interpretations.js",
    "solar_inverter/web/scripts/renderers.js",
    "solar_inverter/web/scripts/browser-storage.js",
    "solar_inverter/web/scripts/chart-demo-capture.js",
    "solar_inverter/web/scripts/charts.js",
    "solar_inverter/web/scripts/chart-demo-history.js",
    "solar_inverter/web/scripts/chart-rendering.js",
    "solar_inverter/web/scripts/gauges.js",
    "solar_inverter/web/scripts/energy-flow-cards.js",
    "solar_inverter/web/scripts/energy-flow.js",
    "solar_inverter/web/scripts/lcd.js",
    "solar_inverter/web/scripts/app.js",
    "solar_inverter/web/scripts/app-events.js",
    "solar_inverter/services/__init__.py",
    "solar_inverter/services/inverter_service.py",
    "solar_inverter/services/config.py",
    "solar_inverter/services/inverter_service_core.py",
    "solar_inverter/services/register_overrides.py",
    "solar_inverter/services/server_logging.py",
    "solar_inverter/services/register_profile_12ku.py",
    "solar_inverter/services/chart_history.py",
    "solar_inverter/services/inverter_service_runtime.py",
)
SERVICE_PAYLOAD = "deploy/solar-inverter-dashboard.service"


def remove_file_if_present(path: Path) -> None:
    """Remove a temporary file when it remains after an interrupted install."""
    if path.exists():
        path.unlink()


def remove_prefix(value: str, prefix: str) -> str:
    """Return *value* without *prefix* (compatible with Python 3.7)."""
    return value[len(prefix):] if value.startswith(prefix) else value


def ensure_updater_history_schema(connection: sqlite3.Connection) -> None:
    """Upgrade an existing updater history table without deleting its rows."""
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


def run(
    command: list[str], *, check: bool = True, capture_output: bool = False
) -> subprocess.CompletedProcess[str]:
    """Run a command and echo it for an auditable update log."""
    print("+", " ".join(command), flush=True)
    return subprocess.run(command, check=check, text=True, capture_output=capture_output)


def run_as_service_user(command: list[str], *, capture_output: bool = False) -> subprocess.CompletedProcess[str]:
    """Run a repository command as the non-privileged dashboard account."""
    full_command = ["runuser", "-u", SERVICE_USER, "--", *command]
    print("+", " ".join(full_command), flush=True)
    return subprocess.run(
        full_command,
        check=True,
        text=True,
        capture_output=capture_output,
    )


def git_output(arguments: list[str]) -> str:
    """Return output from Git in the installed repository as the service user."""
    result = run_as_service_user(
        ["git", "-C", str(APPLICATION_ROOT), *arguments], capture_output=True
    )
    return result.stdout.strip()


def require_git_repository() -> None:
    """Ensure the updater can safely compare this installation with GitHub."""
    if shutil.which("git") is None:
        raise RuntimeError("git is required; install it with: apt-get install -y git")
    if not (APPLICATION_ROOT / ".git").exists():
        raise RuntimeError(
            f"{APPLICATION_ROOT} is not a Git checkout; use the bundled updater instead"
        )


def github_branch() -> str:
    """Use the origin default branch, falling back to the project's main branch."""
    try:
        remote_head = git_output(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"])
    except subprocess.CalledProcessError:
        return DEFAULT_GIT_BRANCH
    remote_prefix = f"{DEFAULT_GIT_REMOTE}/"
    return remove_prefix(remote_head, remote_prefix) or DEFAULT_GIT_BRANCH


def git_commit_details(revision: str) -> tuple[str, str, str]:
    """Return a revision's full hash, subject and ISO-8601 commit time."""
    values = git_output(["log", "-1", "--format=%H%x1f%s%x1f%cI", revision]).split("\x1f")
    if len(values) != 3:
        raise RuntimeError(f"Could not read commit information for {revision}")
    return values[0], values[1], values[2]


def github_status() -> tuple[str, str, int, int]:
    """Fetch origin and print the local/remote dashboard versions and commits."""
    require_git_repository()
    run_as_service_user(["git", "-C", str(APPLICATION_ROOT), "fetch", "--prune", DEFAULT_GIT_REMOTE])
    branch = github_branch()
    remote_revision = f"{DEFAULT_GIT_REMOTE}/{branch}"
    local_hash, local_subject, local_date = git_commit_details("HEAD")
    remote_hash, remote_subject, remote_date = git_commit_details(remote_revision)
    counts = git_output(["rev-list", "--left-right", "--count", f"HEAD...{remote_revision}"])
    try:
        ahead, behind = (int(value) for value in counts.split())
    except ValueError as error:
        raise RuntimeError(f"Could not compare HEAD with {remote_revision}") from error

    print(f"Local dashboard version: {dashboard_asset_version(APPLICATION_ROOT)}", flush=True)
    print(f"Local commit: {local_hash} ({local_date}) - {local_subject}", flush=True)
    print(f"GitHub {branch}: {remote_hash} ({remote_date}) - {remote_subject}", flush=True)
    if ahead == 0 and behind == 0:
        print("GitHub status: up to date.", flush=True)
    elif ahead == 0:
        print(f"GitHub status: {behind} commit(s) available to install.", flush=True)
    elif behind == 0:
        print(f"GitHub status: local checkout is {ahead} commit(s) ahead of GitHub.", flush=True)
    else:
        print(f"GitHub status: diverged ({ahead} ahead, {behind} behind); update refused.", flush=True)
    return branch, remote_hash, ahead, behind


def archive_path() -> Path:
    """Return the running zipapp path."""
    return Path(sys.argv[0]).resolve()


def extract_payload(destination: Path) -> tuple[str, ...]:
    """Verify and extract every declared dashboard project payload file."""
    with zipfile.ZipFile(archive_path()) as archive:
        names = set(archive.namelist())
        manifest_name = f"payload/{PAYLOAD_MANIFEST}"
        if manifest_name not in names:
            raise RuntimeError("Update archive is missing its payload manifest")
        try:
            manifest = json.loads(archive.read(manifest_name))
            expected_hashes = manifest["files"]
        except (KeyError, TypeError, ValueError) as error:
            raise RuntimeError("Update archive has an invalid payload manifest") from error
        if not isinstance(expected_hashes, dict) or not expected_hashes:
            raise RuntimeError("Update archive manifest does not describe a project payload")
        payload_files = tuple(sorted(expected_hashes))
        required_missing = sorted(set((*REQUIRED_RUNTIME_FILES, SERVICE_PAYLOAD)) - set(payload_files))
        if required_missing:
            raise RuntimeError(f"Update archive is missing required runtime files: {', '.join(required_missing)}")
        expected_archive_names = {f"payload/{name}" for name in payload_files}
        actual_archive_names = {
            name for name in names if name.startswith("payload/") and not name.endswith("/")
        } - {manifest_name}
        if actual_archive_names != expected_archive_names:
            raise RuntimeError("Update archive manifest does not describe every packaged project file")
        for relative_name in payload_files:
            path = PurePosixPath(relative_name)
            if path.is_absolute() or ".." in path.parts or str(path) in {"", "."}:
                raise RuntimeError(f"Update archive has an unsafe project path: {relative_name}")
            actual_hash = hashlib.sha256(
                archive.read(f"payload/{relative_name}")
            ).hexdigest()
            if expected_hashes[relative_name] != actual_hash:
                raise RuntimeError(f"Update archive checksum mismatch: {relative_name}")
        for relative_name in payload_files:
            source = f"payload/{relative_name}"
            target = destination / relative_name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(archive.read(source))
    return payload_files


def validate_payload(payload_root: Path) -> None:
    """Compile the complete Python payload before touching the installation."""
    print("Validating bundled Python files...", flush=True)
    valid = compileall.compile_dir(
        str(payload_root / "solar_inverter"),
        quiet=1,
        force=True,
    )
    valid = compileall.compile_file(
        str(payload_root / "solar_invertor_web.py"),
        quiet=1,
        force=True,
    ) and valid
    if not valid:
        raise RuntimeError("The bundled Python source did not compile")


def dashboard_asset_version(payload_root: Path) -> str:
    """Calculate the version that dashboard_template.py will serve."""
    project_root = payload_root
    web_root = project_root / "solar_inverter" / "web"
    versioned_files = [path for path in web_root.rglob("*") if path.is_file()]
    versioned_files.extend(
        project_root / name
        for name in ("favicon.png", "generator-mask.png", "1258380.png", "inverter.svg", "home.svg")
        if (project_root / name).is_file()
    )
    digest = hashlib.sha256()
    for asset_path in sorted(versioned_files, key=lambda path: str(path)):
        digest.update(str(asset_path.relative_to(project_root)).encode("utf-8"))
        digest.update(asset_path.read_bytes())
    return digest.hexdigest()[:12]


def require_root() -> None:
    if not hasattr(os, "geteuid") or os.geteuid() != 0:
        raise PermissionError("Run the update with: sudo python3 solar-dashboard-update.pyz")


def ensure_runtime() -> None:
    """Install external runtime packages when they are absent."""
    if shutil.which("systemctl") is None:
        raise RuntimeError("systemd is required but systemctl was not found")
    packages: list[str] = []
    if shutil.which("git") is None:
        packages.append("git")
    if shutil.which("mbpoll") is None:
        packages.append("mbpoll")
    if not Path("/usr/share/zoneinfo/Europe/Madrid").is_file():
        packages.append("tzdata")
    if packages:
        if shutil.which("apt-get") is None:
            raise RuntimeError(
                f"Missing packages ({', '.join(packages)}) and apt-get is unavailable"
            )
        run(["apt-get", "update"])
        run(["apt-get", "install", "-y", *packages])


def ensure_service_account() -> tuple[int, int]:
    """Create the dashboard account and verify serial-port access on every update."""
    import pwd

    try:
        account = pwd.getpwnam(SERVICE_USER)
    except KeyError:
        run([
            "useradd",
            "--system",
            "--user-group",
            "--home-dir",
            str(APPLICATION_ROOT),
            "--shell",
            "/usr/sbin/nologin",
            SERVICE_USER,
        ])
        account = pwd.getpwnam(SERVICE_USER)
    run(["usermod", "-aG", "dialout", SERVICE_USER])
    groups = run(
        ["id", "-nG", SERVICE_USER], check=True, capture_output=True
    ).stdout.split()
    if "dialout" not in groups:
        raise RuntimeError(
            f"{SERVICE_USER} is not a member of dialout after usermod; "
            "cannot safely access the Modbus USB adapter"
        )
    print(f"Verified {SERVICE_USER} belongs to dialout", flush=True)
    return account.pw_uid, account.pw_gid


def log_modbus_prerequisites() -> None:
    """Log the Modbus USB adapter readiness without blocking non-device builds."""
    mbpoll_path = shutil.which("mbpoll")
    if mbpoll_path is None:
        raise RuntimeError("mbpoll is unavailable after runtime setup")
    print(f"Modbus updater check: mbpoll={mbpoll_path}", flush=True)
    run([mbpoll_path, "-V"], check=False)
    if not Path("/dev/ttyUSB0").exists():
        print(
            "WARNING: Modbus updater check: /dev/ttyUSB0 is missing; "
            "no physical RTU adapter is available to this host.",
            flush=True,
        )
        return
    for access in ("-r", "-w"):
        result = run(
            ["runuser", "-u", SERVICE_USER, "--", "test", access, "/dev/ttyUSB0"],
            check=False,
        )
        if result.returncode:
            print(
                f"WARNING: Modbus updater check: {SERVICE_USER} cannot "
                f"{access[1:]} /dev/ttyUSB0",
                flush=True,
            )
            return
    print(f"Modbus updater check: {SERVICE_USER} can read and write /dev/ttyUSB0", flush=True)


def atomic_install(source: Path, target: Path, mode: int, uid: int, gid: int) -> None:
    """Replace one file atomically without removing unrelated runtime data."""
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_name(f".{target.name}.update-{os.getpid()}")
    try:
        shutil.copyfile(source, temporary)
        os.chmod(temporary, mode)
        os.chown(temporary, uid, gid)
        os.replace(temporary, target)
    finally:
        remove_file_if_present(temporary)


def install_payload(payload_root: Path, payload_files: tuple[str, ...], uid: int, gid: int) -> None:
    """Install the complete project payload while preserving runtime data."""
    APPLICATION_ROOT.mkdir(parents=True, exist_ok=True)
    os.chown(APPLICATION_ROOT, uid, gid)
    for relative_name in payload_files:
        atomic_install(
            payload_root / relative_name,
            APPLICATION_ROOT / relative_name,
            0o644,
            uid,
            gid,
        )
    atomic_install(payload_root / SERVICE_PAYLOAD, SERVICE_TARGET, 0o644, 0, 0)


def verify_installed_payload(payload_root: Path, payload_files: tuple[str, ...]) -> None:
    """Refuse success when any installed project file differs from the archive."""
    mismatches = [
        relative_name
        for relative_name in payload_files
        if not (APPLICATION_ROOT / relative_name).is_file()
        or hashlib.sha256((payload_root / relative_name).read_bytes()).digest()
        != hashlib.sha256((APPLICATION_ROOT / relative_name).read_bytes()).digest()
    ]
    if mismatches:
        raise RuntimeError(f"Installed payload verification failed: {', '.join(mismatches)}")
    if not SERVICE_TARGET.is_file() or hashlib.sha256((payload_root / SERVICE_PAYLOAD).read_bytes()).digest() != hashlib.sha256(SERVICE_TARGET.read_bytes()).digest():
        raise RuntimeError("Installed systemd service file differs from the archive")
    print(f"Verified {len(payload_files)} installed project files.", flush=True)


def next_updater_version() -> int:
    """Return the next sequential local release number, starting at Updater 4."""
    checksums: set[str] = set()
    versions: list[int] = []
    try:
        receipt = json.loads(UPDATER_RECEIPT_PATH.read_text(encoding="utf-8"))
        for item in receipt.get("installations", []):
            if not isinstance(item, dict):
                continue
            if item.get("checksum"):
                checksums.add(str(item["checksum"]))
            try:
                versions.append(int(item.get("version", UPDATER_VERSION)))
            except (TypeError, ValueError):
                pass
    except (OSError, ValueError):
        pass
    try:
        with closing(sqlite3.connect(STATS_DATABASE_PATH)) as connection:
            table_exists = connection.execute(
                "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'updater_versions'"
            ).fetchone()
            if table_exists:
                ensure_updater_history_schema(connection)
            rows = connection.execute(
                "SELECT commit_hash, build_output FROM updater_versions WHERE source = 'installer'"
            ).fetchall() if table_exists else []
        for commit_hash, checksum in rows:
            if checksum:
                checksums.add(str(checksum))
            try:
                versions.append(int(remove_prefix(str(commit_hash), "updater-").split("-", 1)[0]))
            except ValueError:
                pass
    except sqlite3.Error:
        pass
    base_version = int(UPDATER_VERSION)
    return max([base_version + len(checksums), *(version + 1 for version in versions)] or [base_version])


def record_installed_version(uid: int, gid: int, dashboard_version: str) -> None:
    """Record this local updater installation without requiring Git metadata."""
    checksum = hashlib.sha256(archive_path().read_bytes()).hexdigest().upper()
    installed_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    release_version = next_updater_version()
    archive_name = f"solar-dashboard-updater-{release_version}-{dashboard_version}.pyz"
    UPDATER_ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    os.chown(UPDATER_ARCHIVE_DIR, uid, gid)
    atomic_install(archive_path(), UPDATER_ARCHIVE_DIR / archive_name, 0o640, uid, gid)
    receipt = {"version": str(release_version), "dashboard_version": dashboard_version,
               "checksum": f"SHA-256 {checksum}",
               "installed_at": installed_at, "bundle": archive_name}
    installations: list[dict] = []
    try:
        existing = json.loads(UPDATER_RECEIPT_PATH.read_text(encoding="utf-8"))
        installations = existing.get("installations", []) if isinstance(existing, dict) else []
    except (OSError, ValueError):
        pass
    installations = [item for item in installations if isinstance(item, dict)][-49:]
    installations.append(receipt)
    temporary_receipt = UPDATER_RECEIPT_PATH.with_name(
        f".{UPDATER_RECEIPT_PATH.name}.update-{os.getpid()}"
    )
    try:
        temporary_receipt.write_text(
            json.dumps({"schema": 1, "installations": installations}, indent=2) + "\n",
            encoding="utf-8",
        )
        os.chmod(temporary_receipt, 0o640)
        os.chown(temporary_receipt, uid, gid)
        os.replace(temporary_receipt, UPDATER_RECEIPT_PATH)
    finally:
        remove_file_if_present(temporary_receipt)

    try:
        STATS_DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(STATS_DATABASE_PATH)) as connection:
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
            if LEGACY_STATS_DATABASE_PATH.is_file():
                with closing(sqlite3.connect(LEGACY_STATS_DATABASE_PATH)) as legacy:
                    table_exists = legacy.execute(
                        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'updater_versions'"
                    ).fetchone()
                    if table_exists:
                        ensure_updater_history_schema(legacy)
                    legacy_rows = legacy.execute(
                        """
                        SELECT commit_hash, commit_message, commit_date, source,
                               bundle_path, build_output, created_at
                        FROM updater_versions
                        WHERE source = 'installer'
                        """
                    ).fetchall() if table_exists else []
                for row in legacy_rows:
                    connection.execute(
                        """
                        INSERT INTO updater_versions
                            (commit_hash, commit_message, commit_date, source,
                             bundle_path, build_output, created_at)
                        SELECT ?, ?, ?, ?, ?, ?, ?
                        WHERE NOT EXISTS (
                            SELECT 1 FROM updater_versions
                            WHERE commit_hash = ? AND source = ?
                              AND COALESCE(build_output, '') = COALESCE(?, '')
                              AND created_at = ?
                        )
                        """,
                        (*row, row[0], row[3], row[5], row[6]),
                    )
            connection.execute(
                """
                INSERT INTO updater_versions
                    (commit_hash, commit_message, commit_date, source,
                     bundle_path, build_output, created_at)
                VALUES (?, ?, ?, 'installer', ?, ?, ?)
                """,
                (f"updater-{release_version}-{dashboard_version}",
                 f"Updater {release_version} · Dashboard {dashboard_version}",
                 installed_at, archive_name, f"SHA-256 {checksum}", installed_at),
            )
            connection.commit()
        os.chown(STATS_DATABASE_PATH.parent, uid, gid)
        os.chown(STATS_DATABASE_PATH, uid, gid)
    except (OSError, sqlite3.Error) as error:
        print(f"Warning: SQLite updater history unavailable: {error}", flush=True)
    print(f"Recorded Updater {release_version}: {archive_name}", flush=True)


def active_service_environment() -> dict[str, str]:
    """Read the environment systemd actually applied to the running service."""
    values = run(
        ["systemctl", "show", SERVICE_NAME, "--property=Environment", "--value"],
        capture_output=True,
    ).stdout.strip().split()
    return dict(value.split("=", 1) for value in values if "=" in value)


def wait_for_health(expected_version: str) -> None:
    """Wait for the restarted API and require the bundled dashboard version."""
    settings = active_service_environment()
    port = settings.get("INVERTER_WEB_PORT", "8080")
    health_url = f"http://127.0.0.1:{port}/api/state"
    version_url = f"http://127.0.0.1:{port}/api/version"
    last_error = "no response"
    for _ in range(15):
        try:
            with urllib.request.urlopen(version_url, timeout=2) as response:
                data = json.loads(response.read().decode("utf-8"))
                running_version = str(data.get("dashboard_version", ""))
                if response.status == 200 and running_version == expected_version:
                    print(
                        f"Dashboard API is healthy: {health_url} "
                        f"(version {running_version})",
                        flush=True,
                    )
                    return
                last_error = (
                    f"running dashboard version {running_version or 'missing'}; "
                    f"expected {expected_version}"
                )
        except (urllib.error.URLError, TimeoutError, ConnectionError, ValueError) as error:
            last_error = str(error)
        time.sleep(1)
    run(["systemctl", "--no-pager", "--full", "status", SERVICE_NAME], check=False)
    run(["journalctl", "-u", SERVICE_NAME, "-n", "50", "--no-pager"], check=False)
    raise RuntimeError(f"Dashboard health check failed: {last_error}")


def review_active_connections() -> None:
    """Report the actual service and Tailscale configuration without changing it."""
    settings = active_service_environment()
    connection_mode = settings.get("INVERTER_CONNECTION_MODE", "rtu")
    print("Active inverter connection configuration:", flush=True)
    if connection_mode == "tcp":
        print(
            "  mode=tcp "
            f"host={settings.get('INVERTER_TCP_HOST', '<not configured>')} "
            f"port={settings.get('INVERTER_TCP_PORT', '502')}",
            flush=True,
        )
    else:
        print(
            "  mode=rtu "
            f"device={settings.get('INVERTER_SERIAL_DEVICE', '/dev/ttyUSB0')} "
            f"baud={settings.get('INVERTER_BAUD_RATE', '9600')} "
            f"slave={settings.get('INVERTER_SLAVE_ID', '1')}",
            flush=True,
        )
    print(
        "  web="
        f"{settings.get('INVERTER_WEB_HOST', '0.0.0.0')}:"
        f"{settings.get('INVERTER_WEB_PORT', '8080')} "
        f"timezone={settings.get('INVERTER_TIME_ZONE', settings.get('TZ', '<host default>'))}",
        flush=True,
    )

    tailscale_path = shutil.which("tailscale")
    if tailscale_path is None:
        print("Tailscale review: not installed; no Tailscale configuration was changed.", flush=True)
        return
    status = run([tailscale_path, "status", "--json"], check=False, capture_output=True)
    if status.returncode:
        print("Tailscale review: unavailable or not authenticated; no Tailscale configuration was changed.", flush=True)
        return
    try:
        self_status = json.loads(status.stdout).get("Self", {})
    except (TypeError, ValueError):
        print("Tailscale review: status could not be parsed; no Tailscale configuration was changed.", flush=True)
        return
    owner = self_status.get("UserProfile", {}).get("LoginName") or self_status.get("UserID", "unknown")
    machine_name = self_status.get("HostName", "unknown")
    dns_name = self_status.get("DNSName", "unknown")
    print(
        f"Tailscale review: machine={machine_name} dns={dns_name} owner={owner}",
        flush=True,
    )
    run([tailscale_path, "serve", "status"], check=False)
    run([tailscale_path, "funnel", "status"], check=False)


def install() -> None:
    require_root()
    ensure_runtime()
    uid, gid = ensure_service_account()
    log_modbus_prerequisites()
    with tempfile.TemporaryDirectory(prefix="solar-dashboard-update-") as temporary:
        payload_root = Path(temporary)
        payload_files = extract_payload(payload_root)
        validate_payload(payload_root)
        expected_version = dashboard_asset_version(payload_root)
        print(f"Bundled dashboard version: {expected_version}", flush=True)
        run(["systemctl", "stop", SERVICE_NAME], check=False)
        install_payload(payload_root, payload_files, uid, gid)
        verify_installed_payload(payload_root, payload_files)
        record_installed_version(uid, gid, expected_version)
    run(["systemctl", "daemon-reload"])
    run(["systemctl", "enable", SERVICE_NAME])
    run(["systemctl", "restart", SERVICE_NAME])
    wait_for_health(expected_version)
    review_active_connections()
    print("Solar Inverter Dashboard update completed successfully.", flush=True)


def check_bundle() -> None:
    with tempfile.TemporaryDirectory(prefix="solar-dashboard-check-") as temporary:
        payload_root = Path(temporary)
        payload_files = extract_payload(payload_root)
        validate_payload(payload_root)
        version = dashboard_asset_version(payload_root)
    print(
        f"Bundle is valid and checksum-verifies all {len(payload_files)} project files "
        f"(dashboard version {version})."
    )


def update_from_github() -> None:
    """Fast-forward the installed checkout to GitHub and restart only on success."""
    require_root()
    ensure_runtime()
    ensure_service_account()
    log_modbus_prerequisites()
    branch, remote_hash, ahead, behind = github_status()
    if ahead:
        raise RuntimeError(
            "The local checkout has commits not on GitHub; refusing to overwrite it. "
            "Resolve the divergence, then run --github-update again."
        )
    if not behind:
        print("No GitHub update to install.", flush=True)
        return

    run_as_service_user([
        "git", "-C", str(APPLICATION_ROOT), "pull", "--ff-only", DEFAULT_GIT_REMOTE, branch
    ])
    installed_hash, _, _ = git_commit_details("HEAD")
    if installed_hash != remote_hash:
        raise RuntimeError(
            f"GitHub update verification failed: expected {remote_hash}, found {installed_hash}"
        )
    run_as_service_user([
        "python3", "-m", "py_compile", str(APPLICATION_ROOT / "solar_invertor_web.py")
    ])
    atomic_install(
        APPLICATION_ROOT / SERVICE_PAYLOAD,
        SERVICE_TARGET,
        0o644,
        0,
        0,
    )
    expected_version = dashboard_asset_version(APPLICATION_ROOT)
    run(["systemctl", "daemon-reload"])
    run(["systemctl", "restart", SERVICE_NAME])
    wait_for_health(expected_version)
    review_active_connections()
    print(
        f"Installed GitHub commit {installed_hash} (dashboard version {expected_version}).",
        flush=True,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group()
    action.add_argument(
        "--check",
        action="store_true",
        help="validate the archive without installing or changing the system",
    )
    action.add_argument(
        "--github-status",
        action="store_true",
        help="fetch GitHub and show local/remote commits and dashboard versions",
    )
    action.add_argument(
        "--github-update",
        action="store_true",
        help="fast-forward the installed Git checkout from GitHub and restart the dashboard",
    )
    arguments = parser.parse_args()
    try:
        if arguments.check:
            check_bundle()
        elif arguments.github_status:
            github_status()
        elif arguments.github_update:
            update_from_github()
        else:
            install()
        return 0
    except (OSError, RuntimeError, PermissionError, subprocess.SubprocessError) as error:
        print(f"ERROR: {error}", file=sys.stderr, flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

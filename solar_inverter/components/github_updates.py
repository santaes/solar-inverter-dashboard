"""Git availability and remote update-status helpers."""
from __future__ import annotations

import json
import subprocess
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from ..services.config import PROJECT_ROOT
from .dashboard_template import ASSET_VERSION

GIT_PATH = r"C:\Program Files\Git\bin\git.exe"
def check_git_available() -> tuple[bool, str]:
    """Check if git is available. Returns (is_available, path_or_error)."""
    import shutil
    if Path(GIT_PATH).exists():
        return True, GIT_PATH
    # Try to find git in PATH
    git_path = shutil.which("git")
    if git_path:
        return True, git_path
    return False, "Git not found"
def install_git() -> tuple[bool, str]:
    """Attempt to install git using winget on Windows. Returns (success, message)."""
    try:
        result = subprocess.run(
            ["winget", "install", "--id", "Git.Git", "-e", "--silent"],
            capture_output=True,
            text=True,
            timeout=300
        )
        if result.returncode == 0:
            return True, "Git installed successfully"
        else:
            return False, f"Installation failed: {result.stderr}"
    except FileNotFoundError:
        return False, "winget not found. Please install Git manually from https://git-scm.com/download/win"
    except subprocess.TimeoutExpired:
        return False, "Installation timed out"
    except Exception as e:
        return False, f"Installation error: {str(e)}"


def github_update_status() -> dict[str, Any]:
    """Compare a bundled source commit with GitHub without requiring .git locally."""
    try:
        metadata = json.loads(
            (PROJECT_ROOT / ".solar-dashboard-upstream.json").read_text(encoding="utf-8")
        )
        repository = str(metadata["repository"])
        branch = str(metadata.get("branch") or "main")
        local_hash = str(metadata["commit"])
        if len(local_hash) != 40 or any(character not in "0123456789abcdef" for character in local_hash.lower()):
            raise ValueError("The bundled source commit is unavailable")

        def github_api(path: str) -> dict[str, Any]:
            request = urllib.request.Request(
                f"https://api.github.com/repos/{repository}/{path}",
                headers={"Accept": "application/vnd.github+json", "User-Agent": "solar-inverter-dashboard"},
            )
            with urllib.request.urlopen(request, timeout=12) as response:
                return json.loads(response.read().decode("utf-8"))

        latest = github_api(f"commits/{branch}")
        remote_hash = str(latest["sha"])
        remote_commit = latest["commit"]
        ahead = 0
        behind = 0
        if local_hash != remote_hash:
            comparison = github_api(f"compare/{local_hash}...{branch}")
            ahead = int(comparison.get("behind_by", 0))
            behind = int(comparison.get("ahead_by", 0))
        return {
            "available": True,
            "dashboard_version": ASSET_VERSION,
            "branch": branch,
            "local": {
                "hash": local_hash, "subject": str(metadata.get("message") or "Bundled update"),
                "date": str(metadata.get("committed_at") or ""),
            },
            "remote": {
                "hash": remote_hash, "subject": str(remote_commit.get("message", "")).split("\n", 1)[0],
                "date": str(remote_commit.get("author", {}).get("date", "")),
            },
            "ahead": ahead,
            "behind": behind,
        }
    except (KeyError, OSError, ValueError, urllib.error.URLError, urllib.error.HTTPError) as error:
        return {"available": False, "error": str(error)}


"""Bounded stdout capture exposed through the dashboard diagnostics API."""
from __future__ import annotations

import io
import sys
import threading
from typing import Any

log_buffer = io.StringIO()
log_buffer_lock = threading.Lock()


class LogCapture:
    """Mirror stdout while retaining a bounded in-memory diagnostic tail."""

    def __init__(self, original_stdout: Any) -> None:
        self.original_stdout = original_stdout

    def write(self, text: str) -> None:
        self.original_stdout.write(text)
        self.original_stdout.flush()
        with log_buffer_lock:
            log_buffer.write(text)
            if log_buffer.tell() > 100_000:
                log_buffer.seek(0)
                content = log_buffer.read()
                log_buffer.seek(0)
                log_buffer.truncate()
                log_buffer.write(content[-100_000:])

    def flush(self) -> None:
        self.original_stdout.flush()


if not isinstance(sys.stdout, LogCapture):
    sys.stdout = LogCapture(sys.stdout)


def get_server_logs() -> dict[str, Any]:
    """Return at most the latest 500 captured log lines."""
    with log_buffer_lock:
        log_buffer.seek(0)
        lines = log_buffer.read().split("\n")[-500:]
        return {"logs": "\n".join(lines), "lines": len(lines)}

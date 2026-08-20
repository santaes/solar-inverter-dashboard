from __future__ import annotations

import hashlib
from pathlib import Path


WEB_ROOT = Path(__file__).resolve().parents[1] / "web"
_STYLE_MARKER = "/*__DASHBOARD_CSS__*/"
_VERSION_MARKER = "__ASSET_VERSION__"
_HTML_TEMPLATE = (WEB_ROOT / "index.html").read_text(encoding="utf-8")
_STYLE_FILES = ("dashboard.css", "charts.css", "dashboard-responsive.css")
_DASHBOARD_CSS = "\n".join(
    (WEB_ROOT / "styles" / name).read_text(encoding="utf-8")
    for name in _STYLE_FILES
)
_PROJECT_ROOT = WEB_ROOT.parents[1]
_VERSIONED_FILES = [path for path in WEB_ROOT.rglob("*") if path.is_file()]
_VERSIONED_FILES.extend(
    _PROJECT_ROOT / name
    for name in ("favicon.png", "generator-mask.png", "1258380.png", "inverter.svg", "home.svg")
    if (_PROJECT_ROOT / name).is_file()
)
_asset_digest = hashlib.sha256()
for _asset_path in sorted(_VERSIONED_FILES, key=lambda path: str(path)):
    _asset_digest.update(str(_asset_path.relative_to(_PROJECT_ROOT)).encode("utf-8"))
    _asset_digest.update(_asset_path.read_bytes())
ASSET_VERSION = _asset_digest.hexdigest()[:12]
WEB_DASHBOARD = (
    _HTML_TEMPLATE
    .replace(_STYLE_MARKER, _DASHBOARD_CSS, 1)
    .replace(_VERSION_MARKER, ASSET_VERSION)
)

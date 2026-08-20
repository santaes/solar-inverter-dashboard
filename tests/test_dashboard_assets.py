from __future__ import annotations

import ast
import json
import re
import runpy
import shutil
import subprocess
import textwrap
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WEB_ROOT = ROOT / "solar_inverter" / "web"
SCRIPT_NAMES = (
    "translations.js",
    "interpretations.js",
    "renderers.js",
    "chart-demo-capture.js",
    "charts.js",
    "chart-demo-history.js",
    "chart-rendering.js",
    "gauges.js",
    "energy-flow-cards.js",
    "energy-flow.js",
    "lcd.js",
    "browser-storage.js",
    "app.js",
    "register-map.js",
    "app-events.js",
)


def dashboard_css() -> str:
    return "\n".join(
        (WEB_ROOT / "styles" / name).read_text(encoding="utf-8")
        for name in ("dashboard.css", "charts.css", "dashboard-responsive.css")
    )


def script_source(*names: str) -> str:
    return "\n".join(
        (WEB_ROOT / "scripts" / name).read_text(encoding="utf-8")
        for name in names
    )


def inverter_service_source() -> str:
    services = ROOT / "solar_inverter" / "services"
    return "\n".join(
        (services / name).read_text(encoding="utf-8")
        for name in (
            "config.py", "register_overrides.py", "inverter_service_core.py",
            "server_logging.py", "inverter_service_runtime.py",
        )
    )


def web_dashboard_source() -> str:
    components = ROOT / "solar_inverter" / "components"
    return "\n".join(
        (components / name).read_text(encoding="utf-8")
        for name in ("state_payload.py", "github_updates.py", "web_dashboard.py")
    )


def energy_flow_source() -> str:
    return script_source("energy-flow-cards.js", "energy-flow.js")


def dashboard_chart_source() -> str:
    return script_source(
        "chart-demo-capture.js", "charts.js", "chart-demo-history.js",
        "chart-rendering.js",
    )


class DashboardAssetTests(unittest.TestCase):
    def test_api_localization_repairs_legacy_utf8_and_chart_history_is_packaged(self) -> None:
        from solar_inverter.components.api_localization import repair_legacy_text

        self.assertEqual(
            repair_legacy_text("\u00d0\u00a0\u00d0\u00b5\u00d0\u00b3\u00d1\u0096\u00d1\u0081\u00d1\u0082\u00d1\u0080"),
            "\u0420\u0435\u0433\u0456\u0441\u0442\u0440",
        )
        self.assertEqual(repair_legacy_text("\u00e2\u20ac\u201d"), "\u2014")
        builder = runpy.run_path(str(ROOT / "deploy" / "build_update_bundle.py"))
        self.assertIn(
            "solar_inverter/services/chart_history.py",
            builder["project_payload_files"](),
        )
        installer = ROOT / "deploy" / "update_bundle_src" / "__main__.py"
        self.assertIn(
            "solar_inverter/services/chart_history.py",
            installer.read_text(encoding="utf-8"),
        )

    def test_poll_worker_reads_before_using_fresh_and_updater_logs_modbus_access(self) -> None:
        runtime = (ROOT / "solar_inverter" / "services" / "inverter_service_runtime.py").read_text(encoding="utf-8")
        poll_worker = runtime[runtime.index("def poll_worker() -> None:"):runtime.index("\ndef meter_value(")]
        first_read = min(
            poll_worker.index("fresh, failed, requests, error = read_compatible()"),
            poll_worker.index("fresh, failed, requests, error = read_fast()"),
        )
        identifier_check = poll_worker.index("identifier = decode_identifier(cached)")
        self.assertGreater(identifier_check, first_read)

        updater = (ROOT / "deploy" / "update_bundle_src" / "__main__.py").read_text(encoding="utf-8")
        self.assertIn("def log_modbus_prerequisites() -> None:", updater)
        self.assertIn('run(["usermod", "-aG", "dialout", SERVICE_USER])', updater)
        self.assertIn('"/dev/ttyUSB0"', updater)
        self.assertGreaterEqual(updater.count("log_modbus_prerequisites()"), 3)
        self.assertIn("no physical RTU adapter is available to this host", updater)

    def test_connection_mode_updates_the_core_modbus_reader(self) -> None:
        from solar_inverter.services import inverter_service_core as core
        from solar_inverter.services import inverter_service_runtime as runtime

        original_mode = core.CONNECTION_MODE
        try:
            target_mode = "tcp" if original_mode == "rtu" else "rtu"
            self.assertTrue(runtime.set_connection_mode(target_mode)["success"])
            self.assertEqual(core.CONNECTION_MODE, target_mode)
            self.assertEqual(runtime.get_connection_mode()["mode"], target_mode)
        finally:
            runtime.set_connection_mode(original_mode)

    def test_light_theme_is_dimmed_and_keeps_readable_contrast(self) -> None:
        css = dashboard_css()
        self.assertIn("--bg: #eef2f4", css)
        self.assertIn("--panel: rgba(248, 250, 251, .96)", css)
        self.assertIn(':root[data-theme="light"] .energy-inverter', css)
        self.assertIn(':root[data-theme="light"] .progress', css)

        def luminance(colour: str) -> float:
            channels = [int(colour[index:index + 2], 16) / 255 for index in (1, 3, 5)]
            linear = [value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4 for value in channels]
            return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2]

        def contrast(first: str, second: str) -> float:
            high, low = sorted((luminance(first), luminance(second)), reverse=True)
            return (high + .05) / (low + .05)

        self.assertGreaterEqual(contrast("#243742", "#eef2f4"), 7)
        self.assertGreaterEqual(contrast("#61737d", "#f8fafb"), 4.5)
        for category_colour in (
            "#8b5e20", "#2e7482", "#70608f",
            "#397665", "#3e708d", "#985a2e",
        ):
            self.assertGreaterEqual(contrast(category_colour, "#eef2f4"), 4.5)
        self.assertGreaterEqual(contrast("#77868e", "#f2f5f7"), 3)
        self.assertGreaterEqual(contrast("#77868e", "#ffffff"), 3)
        self.assertGreaterEqual(contrast("#245f7a", "#eef2f4"), 3)
        self.assertGreaterEqual(contrast("#71849b", "#0a1625"), 3)
        self.assertGreaterEqual(contrast("#71849b", "#15263b"), 3)
        self.assertGreaterEqual(contrast("#7dd3fc", "#07111f"), 3)
        for category_colour in (
            "#fbbf24", "#22d3ee", "#a78bfa", "#34d399",
            "#60a5fa", "#fb923c", "#fb7185",
        ):
            self.assertGreaterEqual(contrast(category_colour, "#15263b"), 3)

    def test_interaction_work_is_deferred_until_after_next_paint(self) -> None:
        css = dashboard_css()
        charts = dashboard_chart_source()
        app = script_source("app.js", "app-events.js")
        self.assertNotIn("backdrop-filter: blur(18px)", css)
        self.assertIn("scrollbar-gutter: stable", css)
        self.assertIn("position: fixed; z-index: 1000", css)
        self.assertIn("gaugeSelectionRenderPending", charts)
        self.assertIn("requestAnimationFrame(() => window.setTimeout", charts)
        self.assertIn("requestAnimationFrame(() => window.setTimeout(drawAllCharts, 0))", app)
        self.assertIn("window.requestIdleCallback(renderPendingRegisters, {timeout: 750})", app)
        self.assertIn("const REGISTER_RENDER_LIMIT = 80", app)
        self.assertIn("const visible = shown.slice(0, registerRenderLimit)", app)
        self.assertIn("content-visibility: auto", css)
        self.assertNotIn("canvas.clientWidth", charts)
        self.assertNotIn("canvas.clientHeight", charts)
        self.assertNotIn("canvas.getBoundingClientRect()", charts)
        self.assertIn("new ResizeObserver", charts)
        self.assertIn("new IntersectionObserver", charts)
        self.assertIn("[...visibleChartCanvases].forEach(host =>", charts)
        self.assertIn("new uPlot(chartOptions", charts)
        self.assertIn("const chartInteractionStates = new WeakMap()", charts)
        self.assertIn("state.userZoomed = true", charts)
        self.assertIn("plot.setData(data, !state?.userZoomed)", charts)
        self.assertIn("Apply each poll as one in-place uPlot update", charts)
        self.assertNotIn("CHART_UPDATE_ANIMATION_MS", charts)
        self.assertNotIn("requestAnimationFrame(animate)", charts)
        self.assertNotIn("prefers-reduced-motion: reduce", charts)
        self.assertIn("destroyDetachedCharts()", charts)
        self.assertIn("outline: 3px solid var(--focus-ring)", css)
        self.assertIn("--ui-border: #71849b", css)
        self.assertIn("--ui-border: #77868e", css)
        self.assertIn("scheduleRegisterRender(demoRegisterRows)", charts)
        self.assertIn("function demoFallbackValue(register, elapsedSeconds)", charts)
        self.assertIn("available: true", charts)
        self.assertIn("scheduleRegisterRender(displayedRegisters)", app)
        self.assertIn("TTN-INV external Modbus map V1.31", charts)
        self.assertIn("[16641, 2], [16642, 0]", charts)
        self.assertIn("[16646, 60], [16647, 10], [16648, 0]", charts)
        self.assertIn("[16653, 46], [16654, 52], [16655, 154], [16656, 264]", charts)
        self.assertNotIn("register.register === 157", charts)
        service_source = (
            ROOT / "solar_inverter" / "services" / "inverter_service_core.py"
        ).read_text(encoding="utf-8")
        chart_history = (
            ROOT / "solar_inverter" / "services" / "chart_history.py"
        ).read_text(encoding="utf-8")
        self.assertIn("CHART_HISTORY_RAW_RETENTION_SECONDS = 48 * 60 * 60", chart_history)
        self.assertIn("CHART_HISTORY_AGGREGATE_RETENTION_SECONDS = 90 * 24 * 60 * 60", chart_history)
        self.assertIn("CREATE TABLE IF NOT EXISTS chart_history_daily", chart_history)
        service_module = ast.parse(service_source)
        known_registers: set[int] = set()
        for node in service_module.body:
            if isinstance(node, ast.Assign) and any(
                isinstance(target, ast.Name) and target.id == "KNOWN_REGISTERS"
                for target in node.targets
            ):
                known_registers = set(ast.literal_eval(node.value))
                break
        values_start = charts.index("values: new Map([")
        values_end = charts.index("])\n      };", values_start)
        demo_registers = {
            int(register)
            for register in re.findall(r"\[(\d+),", charts[values_start:values_end])
        }
        self.assertEqual(known_registers - demo_registers, set())
        self.assertIn("content-visibility: auto; contain-intrinsic-size: auto 300px", css)
        self.assertIn("const requestIntervals = [500, 1000, 2000, 5000, 10000]", app)
        self.assertIn("const hiddenRefreshInterval = 30000", app)
        self.assertIn("readSeconds: data.read_seconds.toFixed(2)", app)
        self.assertIn("const configuredSeconds = (requestIntervals[data.poll_rate_index] ?? 2000) / 1000", app)
        self.assertIn("renderCycleStatus(lastData)", app)
        self.assertIn("const CHARTS_PER_PAGE = 12", charts)
        self.assertIn("selected.slice(pageStart, pageStart + CHARTS_PER_PAGE)", charts)
        self.assertIn("function scheduleChartsViewRender()", charts)
        self.assertIn("scheduleChartsViewRender();", app)
        self.assertIn("data-chart-page", charts)
        html = (WEB_ROOT / "index.html").read_text(encoding="utf-8")
        self.assertIn('role="tabpanel" aria-labelledby="dashboard-tab"', html)
        self.assertIn('aria-controls="charts-view"', html)
        self.assertIn('data-i18n="lcdUpKey"', html)
        self.assertIn('id="register-load-more"', html)
        self.assertIn("button.tabIndex = active ? 0 : -1", app)
        self.assertIn("['ArrowLeft', 'ArrowRight', 'Home', 'End']", app)
        gauges = (WEB_ROOT / "scripts" / "gauges.js").read_text(encoding="utf-8")
        self.assertIn("const DASHBOARD_GAUGES_PER_PAGE = 12", gauges)
        self.assertIn("gauges.slice(pageStart, pageStart + DASHBOARD_GAUGES_PER_PAGE)", gauges)
        self.assertIn("data-dashboard-page", gauges)
        self.assertIn('id="dashboard-pagination-host"', html)
        self.assertIn("paginationHost.innerHTML = dashboardGaugePaginationMarkup(pageCount)", gauges)
        self.assertIn("+ dashboardGaugePaginationMarkup(pageCount)", gauges)
        self.assertIn("renderGauges(gauges.slice(pageStart, pageStart + DASHBOARD_GAUGES_PER_PAGE), pageCount)", gauges)
        self.assertIn("dashboardGaugeToolbar.addEventListener('click', handleDashboardPaginationClick)", app)
        self.assertIn("var(--flow-solar-colour)", gauges)
        self.assertIn("var(--flow-grid-colour)", gauges)
        self.assertIn("const colour = chartColour(item, index)", charts)
        self.assertIn("styles.getPropertyValue(property).trim()", charts)
        self.assertIn("--flow-generator-colour: #fb923c", css)
        self.assertIn("--flow-generator-colour: #985a2e", css)

    def test_flow_connectors_stay_behind_every_card(self) -> None:
        css = dashboard_css()
        responsive_css = (WEB_ROOT / "styles" / "dashboard-responsive.css").read_text(encoding="utf-8")
        html = (WEB_ROOT / "index.html").read_text(encoding="utf-8")
        self.assertIn("display: grid; isolation: isolate", css)
        self.assertIn("position: relative; z-index: 1; align-self: stretch", css)
        self.assertIn("position: absolute; inset: -8px; display: block", css)
        self.assertIn("width: calc(100% + 16px); height: calc(100% + 16px)", css)
        self.assertIn(".flow-connector.active { z-index: 1", css)
        self.assertIn("position: relative; z-index: 2; display: flex", css)
        self.assertNotIn(".flow-connector.active { z-index: 4", css)
        self.assertIn(
            'class="flow-line flow-line-mobile" x1="0" y1="100" x2="100" y2="0"',
            html,
        )
        self.assertIn(
            'class="flow-line flow-line-mobile" x1="0" y1="0" x2="100" y2="100"',
            html,
        )
        self.assertIn(".flow-generator .flow-line-mobile { stroke-linecap: round }", css)
        self.assertIn(".flow-connector.active .flow-line { animation-name: energy-track !important }", responsive_css)

    def test_gauges_and_graphs_use_energy_flow_component_colours(self) -> None:
        gauges_path = WEB_ROOT / "scripts" / "gauges.js"
        probe = textwrap.dedent(
            """
            const fs = require('fs');
            const source = fs.readFileSync(process.argv[1], 'utf8');
            eval(source + `
              const expected = new Map([
                [81, 'var(--flow-grid-colour)'],
                [85, 'var(--flow-generator-colour)'],
                [92, 'var(--flow-home-colour)'],
                [94, 'var(--flow-inverter-colour)'],
                [129, 'var(--flow-battery-colour)'],
                [151, 'var(--flow-solar-colour)'],
                [164, 'var(--flow-battery-colour)'],
                [172, 'var(--flow-inverter-colour)'],
                [176, 'var(--flow-home-colour)'],
                [184, 'var(--flow-grid-colour)'],
                [448, 'var(--flow-grid-colour)'],
                [541, 'var(--flow-home-colour)'],
                [818, 'var(--flow-inverter-colour)'],
                [823, 'var(--flow-solar-colour)'],
                [16651, 'var(--flow-battery-colour)'],
                [16655, 'var(--flow-grid-colour)']
              ]);
              const matches = [...expected].every(([register, colour]) => {
                const item = {register, key: 'register-' + register};
                return registerEnergyFlowColour(register) === colour
                  && dashboardGaugeColour(item) === colour
                  && chartColour(item) === colour;
              });
              console.log(JSON.stringify({
                matches,
                customSolar: diagramGaugeColour({register: 20000, label: 'Solar custom input'}),
                customUnknown: diagramGaugeColour({register: 20001, label: 'Custom counter'})
              }));
            `);
            """
        )
        result = subprocess.run(
            [shutil.which("node") or "node", "-e", probe, str(gauges_path)],
            check=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
        self.assertEqual(
            json.loads(result.stdout),
            {
                "matches": True,
                "customSolar": "var(--flow-solar-colour)",
                "customUnknown": None,
            },
        )

    def test_disabled_buttons_use_localized_unavailable_hints(self) -> None:
        css = dashboard_css()
        html = (WEB_ROOT / "index.html").read_text(encoding="utf-8")
        app = script_source("app.js", "app-events.js")
        self.assertIn("button:disabled { cursor: not-allowed", css)
        self.assertIn('content: "⊘"', css)
        self.assertIn('data-disabled-reason="startLoggingFirst"', html)
        self.assertIn("function refreshDisabledButtonHints", app)
        self.assertIn("attributeFilter: ['disabled']", app)

    def test_template_loads_extracted_assets_in_dependency_order(self) -> None:
        from solar_inverter.components.dashboard_template import WEB_DASHBOARD

        self.assertEqual(WEB_DASHBOARD.count("/*__INITIAL_STATE__*/null"), 1)
        self.assertNotIn("/*__DASHBOARD_CSS__*/", WEB_DASHBOARD)
        self.assertNotIn("__ASSET_VERSION__", WEB_DASHBOARD)
        self.assertRegex(WEB_DASHBOARD, r"energy-flow\.js\?v=[0-9a-f]{12}")
        self.assertIn("<style>", WEB_DASHBOARD)
        self.assertIn(".energy-flow-diagram", WEB_DASHBOARD)
        positions = [
            WEB_DASHBOARD.index(f'/static/scripts/{name}') for name in SCRIPT_NAMES
        ]
        self.assertEqual(positions, sorted(positions))
        self.assertEqual(WEB_DASHBOARD.count("<script defer src="), len(SCRIPT_NAMES) + 1)
        self.assertIn("/static/vendor/uPlot.iife.min.js", WEB_DASHBOARD)
        self.assertNotIn("const UI_TRANSLATIONS", WEB_DASHBOARD)
        self.assertNotIn("function renderEnergyFlow", WEB_DASHBOARD)

    def test_static_assets_use_compression_and_long_lived_caching(self) -> None:
        server = (ROOT / "solar_inverter" / "components" / "web_dashboard.py").read_text(encoding="utf-8")
        css = dashboard_css()
        self.assertIn('gzip.compress(body, compresslevel=5, mtime=0)', server)
        self.assertIn('cache_control="public, max-age=31536000, immutable"', server)
        self.assertIn('cache_control="no-store, no-cache, must-revalidate"', server)
        self.assertIn("/assets/generator-mask.png?v=__ASSET_VERSION__", css)
        self.assertLess((ROOT / "generator-mask.png").stat().st_size, 20_000)

    def test_timeline_charts_use_local_uplot_and_interactive_modal(self) -> None:
        html = (WEB_ROOT / "index.html").read_text(encoding="utf-8")
        charts = dashboard_chart_source() + script_source("app.js")
        css = dashboard_css()
        self.assertIn('/static/vendor/uPlot.iife.min.js', html)
        self.assertNotIn('rel="stylesheet" href="/static/vendor/uPlot.min.css', html)
        self.assertIn("function ensureChartStylesheet()", charts)
        self.assertIn("document.head.append(link)", charts)
        self.assertIn("ensureChartStylesheet().then", charts)
        self.assertIn('id="chart-modal"', html)
        self.assertIn('width: 80vw', css)
        self.assertIn('height: 80vh', css)
        self.assertIn("function isTimelineValue(item)", charts)
        self.assertIn("const GRID_CONSUMPTION_REGISTERS = new Set([449, 451, 453, 455])", charts)
        self.assertIn("GRID_CONSUMPTION_REGISTERS.has(register)", charts)
        self.assertIn("[449, 'day'], [451, 'month'], [453, 'year'], [455, 'lifetime']", charts)
        self.assertIn("function chartPeriodForItem(item", charts)
        self.assertNotIn("chart-period-select", html)
        self.assertNotIn("refreshChartsWithPeriod", charts)
        self.assertIn("async function hydrateChartHistory()", charts)
        self.assertIn("/api/historical?period=${encodeURIComponent(period)}", charts)
        self.assertIn("selectedChartPeriodLabel", charts)
        self.assertIn("trimChartHistory(history, now, item)", charts)
        self.assertIn("chartPeriodValue", charts)
        self.assertNotIn("selectedSummary: 'Выбрано значений: {count} · последние 2 минуты'", charts)
        self.assertIn("/^(?:k?wh)$/i.test(unit)", charts)
        self.assertNotIn("if (value === null && !timelineCapable) return", charts)
        self.assertIn("function synchronizeTimelineCharts()", charts)
        self.assertIn("if (!chartSelections.size) timelineKeys.forEach(key => chartSelections.add(key));", charts)
        self.assertIn("const timelineKeys = new Set(timelineDefinitions().map(item => item.key))", charts)
        self.assertIn("const selected = timelineDefinitions().map(item => item.key)", charts)
        self.assertIn("const chartValue = value === null", charts)
        self.assertIn("cursor: {drag: {x: false, y: false, setScale: false}", charts)
        self.assertIn("addEventListener('wheel'", charts)
        self.assertIn("addEventListener('pointerdown', pointerDown)", charts)
        self.assertIn("addEventListener('pointermove', pointerMove", charts)
        self.assertIn("const shift = -deltaPixels * (pan.maximum - pan.minimum) / width", charts)
        self.assertIn("const pointers = new Map()", charts)
        self.assertIn("initialRange * pinch.distance / distance", charts)
        self.assertIn("event.pointerType === 'touch' && !isModal", charts)
        self.assertIn("resetChartZoom(plot)", charts)
        self.assertIn(".chart-modal-host .u-over { touch-action: none }", css)
        self.assertIn("height: min(84dvh, calc(100dvh - 12px))", css)
        self.assertIn("function constrainedTimeScale", charts)
        self.assertIn("ticks.map(timestamp => chartAxisTime(plot, timestamp))", charts)
        self.assertIn("space: host.clientWidth < 480 ? 90 : 70", charts)
        self.assertIn("month: '2-digit', hour: '2-digit', minute: '2-digit'", charts)
        self.assertIn("if (unique.at(-1)?.time === point.time)", charts)
        self.assertIn("function continuousDemoChartValue(item, history)", charts)
        self.assertIn("previous + scale * .01", charts)
        self.assertIn("chart-point-tooltip", charts)

    def test_all_energy_charts_are_automatic_and_dashboard_gauges_remain_optional(self) -> None:
        charts = (WEB_ROOT / "scripts" / "charts.js").read_text(encoding="utf-8")
        events = (WEB_ROOT / "scripts" / "app-events.js").read_text(encoding="utf-8")
        html = (WEB_ROOT / "index.html").read_text(encoding="utf-8")

        self.assertIn("function synchronizeTimelineCharts()", charts)
        self.assertIn("prefer the long-standing meter key so saved selections keep working", charts)
        self.assertIn("if (registers.has(item.register)) return false", charts)
        self.assertIn("const selected = timelineDefinitions().map(item => item.key)", charts)
        self.assertNotIn("renderChartValueList", charts)
        self.assertNotIn("#chart-value-list", events)
        self.assertNotIn("chart-selector", html)
        self.assertNotIn("chart-select-all", html)

    def test_energy_flow_uses_physical_live_grid_and_generator_registers(self) -> None:
        flow = energy_flow_source()
        html = (WEB_ROOT / "index.html").read_text(encoding="utf-8")
        self.assertIn("firstRegister([81, 433])", flow)
        self.assertIn("firstRegister([85])", flow)
        self.assertIn("firstRegister([86])", flow)
        self.assertIn("firstRegister([88])", flow)
        self.assertIn("firstRegister([69])", flow)
        self.assertIn("firstRegister([67, 325])", flow)
        self.assertIn("firstRegister([68])", flow)
        self.assertIn("decodeEnergyTerminalState(terminalStateSource)", flow)
        self.assertNotIn("firstRegister([70, 322])", flow)
        self.assertIn("firstRegister([84, 436])", flow)
        self.assertIn("const measuredGridConnected = gridVoltagePresent", flow)
        self.assertIn("terminalState.grid !== 0 || measuredGridConnected", flow)
        self.assertIn("let lastRealFlowState = null", flow)
        self.assertIn("if (!chartDemoRunning && !data.online)", flow)
        self.assertIn("const solarFlowState = !pvConnected", flow)
        self.assertIn("const generatorFlowState = !generatorConnected", flow)
        self.assertIn("terminalState?.battery === 4 ? 'full'", flow)
        self.assertIn("window.showFlowChangeAlert?.(notices.join(' · '))", flow)
        self.assertIn("The home is always the consuming endpoint", flow)
        self.assertIn("const homeFlowActive = liveMeasurementsFresh", flow)
        self.assertIn("const homeConnected = true", flow)
        self.assertIn("direction: t('consuming')", flow)
        self.assertIn("firstRegister([161, 153, 156])", flow)
        self.assertIn("firstAvailableValue([449, 184])", flow)
        self.assertIn("firstAvailableValue([451, 185])", flow)
        self.assertIn("firstAvailableValue([453, 186])", flow)
        self.assertIn("firstRegister([404, 137, 129, 342])", flow)
        self.assertIn("firstRegister([405, 130])", flow)
        self.assertIn("firstRegister([407, 139, 133, 339])", flow)
        self.assertIn("Keep the sign supplied by the live power value", flow)
        self.assertIn("The signed live reading is authoritative", flow)
        self.assertIn("batteryPower <= -1", flow)
        self.assertIn("batteryCurrent <= -.05", flow)
        self.assertIn("? measuredBatteryDirection < 0", flow)
        self.assertIn("grid as a one-way source", flow)
        self.assertNotIn("gridExporting", flow)
        self.assertIn("Grid is a one-way source; animation always travels toward the inverter", flow)
        self.assertIn("formatFlowCardRegister(register, cardKey === 'grid')", flow)
        self.assertIn("const batteryCharging = batteryActive && (measuredBatteryDirection", flow)
        self.assertIn("const gridRouteActive = Boolean(energyFlowState?.gridToRectifier", flow)
        self.assertIn("const generatorRouteActive = Boolean(energyFlowState?.generatorToRectifier", flow)
        self.assertIn("const liveMeasurementsFresh = chartDemoRunning || Boolean(data.online)", flow)
        self.assertIn("const demoStatus = chartDemoRunning ? t(demoFlowCase || 'demoMode') : ''", flow)
        self.assertIn("grid: raw & 0x03", flow)
        self.assertIn("generator: (raw >> 2) & 0x03", flow)
        self.assertIn("pv1: (raw >> 4) & 0x03", flow)
        self.assertIn("output: (raw >> 6) & 0x03", flow)
        self.assertIn("battery: (raw >> 8) & 0x07", flow)
        self.assertIn("charging: (raw >> 11) & 0x07", flow)
        self.assertIn("pv2: (raw >> 14) & 0x03", flow)
        self.assertIn("rectifierToGrid: Boolean(raw & 1 << 7)", flow)
        self.assertIn("batteryToInverter: Boolean(raw & 1 << 8)", flow)
        self.assertIn("inverterToMainOutput: Boolean(raw & 1 << 9)", flow)
        self.assertIn("const flowSuppressedByState = [0, 1, 2, 7, 8, 9, 10].includes(inverterState)", flow)
        self.assertIn(": [0, 1, 2, 8, 9, 10].includes(inverterState)", flow)
        self.assertIn("return modes[raw] || {label: '?', descriptionText: registerInterpretation(source)}", flow)
        self.assertIn("const description = mode.descriptionText || (mode.description ? t(mode.description) : '')", flow)
        self.assertIn("const outputCanSupply = liveMeasurementsFresh", flow)
        self.assertNotIn("label: `#${raw}`", flow)
        self.assertIn("`${routeSources.join(' + ')} → ${routeDestinations.join(' + ')}`", flow)
        self.assertIn("parallelTopologyCode(parallelState)", flow)
        self.assertIn("const pvSourceAvailable = liveMeasurementsFresh", flow)
        self.assertIn("const generatorSourceAvailable = liveMeasurementsFresh", flow)
        self.assertIn("classList.toggle('disconnected', !pvSourceAvailable)", flow)
        self.assertIn("classList.toggle('disconnected', !generatorSourceAvailable)", flow)
        self.assertIn("liveMeasurementsFresh && measuredGridConnected", flow)
        self.assertIn("liveMeasurementsFresh && measuredBatteryConnected", flow)
        self.assertIn("function compactFlowCardState(registerNumber, raw)", flow)
        self.assertIn("case 325: return enumCode(['POWER', 'INIT', 'STANDBY', 'GRID', 'PV', 'BAT', 'GEN'", flow)
        self.assertIn("? compactFlowCardState(number, raw)", flow)
        self.assertNotIn("`${name}: ${interpretation}`", flow)
        self.assertIn("row.title = fullText +", flow)
        self.assertIn(".flow-connector.disconnected { visibility: hidden; opacity: 0 }", dashboard_css())
        for connector in ("pv", "generator", "grid", "battery"):
            self.assertIn(f'class="flow-connector flow-{connector} disconnected"', html)

    def test_register_table_explains_raw_words_and_decoded_states(self) -> None:
        app = (WEB_ROOT / "scripts" / "app.js").read_text(encoding="utf-8")
        interpretations = (WEB_ROOT / "scripts" / "interpretations.js").read_text(encoding="utf-8")
        translations = (WEB_ROOT / "scripts" / "translations.js").read_text(encoding="utf-8")
        self.assertIn('class="register-raw-value">${registerRawExplanation(displayRegister)}', app)
        self.assertIn("function registerRawExplanation(register)", interpretations)
        self.assertIn("const hexadecimal = `0x${raw.toString(16).toUpperCase().padStart(4, '0')}`", interpretations)
        self.assertIn("const signedNote = register.signed", interpretations)
        self.assertIn("function rawEncodingExplanation(register, raw)", interpretations)
        self.assertIn("16-bit unsigned word; direct value", interpretations)
        self.assertIn("const interpretation = registerInterpretation(register)", interpretations)
        self.assertIn("raw: 'Сырое слово и расшифровка'", translations)

    def test_each_energy_flow_card_has_a_limited_register_picker(self) -> None:
        html = (WEB_ROOT / "index.html").read_text(encoding="utf-8")
        flow = energy_flow_source()
        events = (WEB_ROOT / "scripts" / "app-events.js").read_text(encoding="utf-8")
        for card in ("solar", "inverter", "generator", "home", "grid", "battery"):
            self.assertIn(f'data-flow-card-settings="{card}"', html)
        self.assertIn('id="flow-card-picker"', html)
        self.assertIn("const FLOW_CARD_MAX_VALUES = 3", flow)
        self.assertIn("const FLOW_CARD_SELECTION_KEY_PREFIX = 'inverter-flow-card-values-v2:'", flow)
        self.assertIn("function normalizeFlowCardSelection(cardKey, selection)", flow)
        self.assertIn("const FLOW_CARD_CONFIG = Object.freeze", flow)
        self.assertRegex(
            flow,
            r"battery: \{label: 'battery'.*registers: \[66, .*401, 402, 403, 404, 405, 406, 407, 408, 409, 410, 411, 412, 413, .*16671, 16672\]",
        )
        self.assertIn("function renderFlowCardPickerList()", flow)
        self.assertIn("const selectedOrder = new Map(selected.map((register, index) => [register, index]))", flow)
        self.assertIn(".sort((left, right) => {", flow)
        self.assertIn("function openFlowCardPicker(cardKey)", flow)
        self.assertIn("function setFlowCardRegister(register, selected)", flow)
        self.assertIn("function syncFlowCardSelectionsForFastPoll(selection = null)", flow)
        self.assertIn("fast_selected_registers: registers", flow)
        self.assertIn("let pendingFastPollSelection = null", flow)
        self.assertIn("if (pendingFastPollSelection !== null)", flow)
        self.assertIn("return [...pendingFastPollSelection]", flow)
        self.assertIn("if (hasReportedSelection) return reported", flow)
        self.assertIn("pendingFastPollSelection = selected", flow)
        self.assertIn("syncFlowCardSelectionsForFastPoll(selected)", flow)
        self.assertNotIn("lastData.fast_selected_registers = selected", flow)
        self.assertIn("openFlowCardPicker(button.dataset.flowCardSettings)", events)

    def test_poll_timing_reports_real_cycles_and_accounts_for_postprocessing(self) -> None:
        service = inverter_service_source()
        server = web_dashboard_source()
        html = (WEB_ROOT / "index.html").read_text(encoding="utf-8")
        self.assertIn('"read_seconds": 0.0', service)
        self.assertIn("POLL_RATES = [0.5, 1.0, 2.0, 5.0, 10.0]", service)
        self.assertIn('"poll_rate_index": 2', service)
        self.assertIn('<option value="2" data-i18n="interval2">', html)
        self.assertIn('<option value="3" data-i18n="interval5">', html)
        self.assertIn('<option value="4" data-i18n="interval10">', html)
        self.assertIn("cycle_duration = round(cycle_interval or read_duration, 2)", service)
        self.assertIn("cycle_work_duration = time.monotonic() - started", service)
        self.assertIn("poll_rate - cycle_work_duration", service)
        self.assertIn('"read_seconds": snapshot["read_seconds"]', server)
        self.assertIn('mode not in {"fast", "compatible", "scan"}', server)
        self.assertIn('mode in {"compatible", "scan"}', service)
        self.assertIn('if mode == "scan":', service)
        self.assertIn('state["read_mode"] = "fast"', service)
        self.assertIn('<option value="scan" data-i18n="scanAllAvailable">', html)

    def test_static_route_map_contains_every_referenced_asset(self) -> None:
        from solar_inverter.components.web_dashboard import DASHBOARD_STATIC_PATHS

        expected = {
            f"/static/{path.relative_to(WEB_ROOT).as_posix()}"
            for path in WEB_ROOT.rglob("*")
            if path.is_file() and path.name != "index.html"
        }
        self.assertEqual(set(DASHBOARD_STATIC_PATHS), expected)
        self.assertTrue(all(path.is_file() for path in DASHBOARD_STATIC_PATHS.values()))

    def test_translation_catalog_has_all_supported_languages(self) -> None:
        source = (WEB_ROOT / "scripts" / "translations.js").read_text(encoding="utf-8")
        self.assertIn("const UI_TRANSLATIONS", source)
        self.assertIn("const DATA_TRANSLATIONS", source)
        for language in ("uk", "ru", "en"):
            self.assertIn(f"      {language}: {{", source)
        self.assertIn("function localizeDataText", source)
        self.assertIn("function localizeApiField", source)
        for key in ("lcdDisplayAria", "lcdAcInputShort", "lcdPvEnergyShort", "lcdDayShort"):
            self.assertEqual(source.count(f"{key}:"), 3)
        for obsolete in (
            "ÐšÐ¾Ð´ ÐºÐ¾Ð½Ñ„Ñ–Ð³ÑƒÑ€Ð°Ñ†Ñ–Ñ— 66",
            "ÐšÐ¾Ð´ ÐºÐ¾Ð½Ñ„Ñ–Ð³ÑƒÑ€Ð°Ñ†Ñ–Ñ— 67",
            "Ð¡Ð¸ÑÑ‚ÐµÐ¼Ð½Ðµ Ð·Ð½Ð°Ñ‡ÐµÐ½Ð½Ñ 68",
            "Ð£Ð¿Ð°ÐºÐ¾Ð²Ð°Ð½Ðµ Ð·Ð½Ð°ÐºÐ¾Ð²Ðµ Ð·Ð½Ð°Ñ‡ÐµÐ½Ð½Ñ 69",
        ):
            self.assertNotIn(obsolete, source)

    def test_toolbar_icon_accessibility_labels_are_translated(self) -> None:
        index = (WEB_ROOT / "index.html").read_text(encoding="utf-8")
        source = (WEB_ROOT / "scripts" / "translations.js").read_text(encoding="utf-8")
        for control, translation_key in (
            ("settings-button", "settingsAria"),
            ("logs-button", "logsAria"),
            ("modbus-debug-button", "modbusDebugAria"),
        ):
            self.assertRegex(
                index,
                rf'<button id="{control}"[^>]*data-i18n-aria="{translation_key}"',
            )
        for obsolete in (
            "Код конфігурації 66",
            "Код конфігурації 67",
            "Системне значення 68",
            "Упаковане знакове значення 69",
        ):
            self.assertNotIn(obsolete, source)

    def test_api_state_localizes_metadata_and_preserves_source_text(self) -> None:
        import threading
        import urllib.request
        from http.server import ThreadingHTTPServer

        from solar_inverter.components.web_dashboard import (
            DashboardHandler,
            localize_api_text,
            resolve_api_language,
            web_state,
        )
        from solar_inverter.services.inverter_service import state, state_lock

        self.assertEqual(resolve_api_language("ru", "en-US,en;q=.9"), "ru")
        self.assertEqual(resolve_api_language("", "fr, en;q=.8, ru;q=.9"), "ru")
        self.assertEqual(resolve_api_language("de", "fr"), "uk")
        self.assertEqual(localize_api_text("Немає даних mbpoll", "ru"), "Нет данных mbpoll")
        self.assertEqual(localize_api_text("Немає даних mbpoll", "en"), "No mbpoll data")

        snapshot = web_state("ru")
        self.assertEqual(snapshot["language"], "ru")
        self.assertRegex(snapshot["dashboard_version"], r"^[0-9a-f]{12}$")
        self.assertEqual(snapshot["dashboard_instance"], web_state("en")["dashboard_instance"])
        grid_voltage = next(item for item in snapshot["registers"] if item["register"] == 81)
        self.assertEqual(grid_voltage["name"], "Напряжение сети, фаза A")
        self.assertEqual(grid_voltage["name_source"], "Напруга мережі, фаза A")
        self.assertEqual(grid_voltage["group"], "AC")
        self.assertEqual(grid_voltage["description_reference"], "U3.0")
        self.assertIsNone(grid_voltage["value"])
        self.assertIn("сырое значение × 0.1 V", grid_voltage["description"])
        bms_state = next(item for item in snapshot["registers"] if item["register"] == 66)
        self.assertIn("0 — поиск", bms_state["description"])
        self.assertIn("1 — CAN", bms_state["description"])
        serial_word = next(item for item in snapshot["registers"] if item["register"] == 1)
        self.assertIn("ASCII-символы 1–2", serial_word["description"])
        self.assertEqual(serial_word["display"], "—")
        protocol_major = next(item for item in snapshot["registers"] if item["register"] == 17)
        self.assertEqual(protocol_major["display"], "—")
        self.assertIn("R18", protocol_major["description"])
        self.assertEqual(protocol_major["description_reference"], "V1.31")
        fault_mask = next(item for item in snapshot["registers"] if item["register"] == 71)
        self.assertIn("b0", fault_mask["description"])
        self.assertIn("b15", fault_mask["description"])
        self.assertTrue(all(item["description"] for item in snapshot["registers"]))
        self.assertTrue(all(item["description_reference"] in {"V1.31", "U3.0"} for item in snapshot["registers"]))
        self.assertEqual(snapshot["minimum_fast_poll_register_count"], 0)
        self.assertEqual(len(snapshot["default_fast_selected_registers"]), 113)
        self.assertGreaterEqual(sum(item["supported"] for item in snapshot["registers"]), 386)

        register_map = (WEB_ROOT / "scripts" / "register-map.js").read_text(encoding="utf-8")
        self.assertIn("register.supported || selected.has", register_map)
        self.assertNotIn("selection.length <= minimum", register_map)
        self.assertNotIn("mapMessage('fastPollMinimum'", register_map)

        # The curated meter list is supplemented with every live register so
        # external API consumers do not lose readings outside the dashboard's
        # original gauge set.
        with state_lock:
            original_values = dict(state["values"])
            state["values"][449] = 840
        try:
            live_snapshot = web_state("en")
            discovered_meter = next(item for item in live_snapshot["meters"] if item["register"] == 449)
            self.assertTrue(discovered_meter["available"])
            self.assertIsNone(discovered_meter["minimum"])
            self.assertIsNone(discovered_meter["maximum"])
        finally:
            with state_lock:
                state["values"] = original_values
        self.assertIn("error_source", snapshot)
        self.assertIn("error_source", snapshot["register_log"])

        app = (WEB_ROOT / "scripts" / "app.js").read_text(encoding="utf-8")
        self.assertEqual(app.count("/api/state?lang=${encodeURIComponent(currentLanguage)}"), 2)
        self.assertIn("data.dashboard_instance !== dashboardInstance", app)
        self.assertIn("function reloadDashboardForVersion(data)", app)
        self.assertIn("fetch(`/api/version?_=${Date.now()}`", app)
        self.assertIn("nextUrl.searchParams.set('_dashboard', data.dashboard_instance || data.dashboard_version)", app)
        self.assertIn("window.location.replace(nextUrl.toString())", app)
        self.assertIn("let dashboardVersion = window.__INITIAL_STATE__?.dashboard_version || ''", app)
        self.assertIn("const versionChanged = Boolean(", app)
        self.assertIn("!instanceChanged && !versionChanged", app)
        self.assertIn("!lastData?.paused", app)
        self.assertIn("document.hidden ? 30000 : 5000", app)
        self.assertIn("pageIsActive = false", app)
        self.assertIn("item.description || ''", app)
        self.assertIn('class="register-meaning"', app)
        self.assertIn('data-i18n="meaning"', (WEB_ROOT / "index.html").read_text(encoding="utf-8"))

        server = ThreadingHTTPServer(("127.0.0.1", 0), DashboardHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            url = f"http://127.0.0.1:{server.server_port}/api/state?lang=en"
            with urllib.request.urlopen(url, timeout=5) as response:
                served = json.load(response)
                self.assertEqual(response.headers["Content-Language"], "en")
                self.assertEqual(served["language"], "en")
                served_r81 = next(
                    item for item in served["registers"] if item["register"] == 81
                )
                self.assertEqual(served_r81["name"], "Grid voltage, phase A")
            settings_url = f"http://127.0.0.1:{server.server_port}/api/settings"
            reduced_selection = urllib.request.Request(
                settings_url,
                data=json.dumps({
                    "fast_selected_registers": [90],
                }).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(reduced_selection, timeout=5) as response:
                self.assertTrue(json.load(response)["ok"])
            restore_selection = urllib.request.Request(
                settings_url,
                data=json.dumps({
                    "fast_selected_registers": snapshot["default_fast_selected_registers"],
                }).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(restore_selection, timeout=5) as response:
                self.assertTrue(json.load(response)["ok"])
            version_url = f"http://127.0.0.1:{server.server_port}/api/version"
            with urllib.request.urlopen(version_url, timeout=5) as response:
                version = json.load(response)
                self.assertEqual(version["dashboard_instance"], snapshot["dashboard_instance"])
                self.assertEqual(response.headers["Cache-Control"], "no-store")
            history_url = f"http://127.0.0.1:{server.server_port}/api/updater-history"
            with urllib.request.urlopen(history_url, timeout=5) as response:
                history = json.load(response)
                self.assertIsInstance(history["history"], list)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)

    def test_device_identifier_comes_only_from_initial_modbus_identity_read(self) -> None:
        from solar_inverter.services.inverter_service_core import IDENTITY_BLOCKS, IDENTITY_REGISTERS, decode_identifier

        self.assertEqual(IDENTITY_BLOCKS, ((1, 10), (57, 9)))
        self.assertEqual(len(IDENTITY_REGISTERS), 19)
        self.assertEqual(decode_identifier({}), "")
        self.assertEqual(decode_identifier({1: 0xFFFF}), "")
        self.assertEqual(
            decode_identifier({1: 0x5454, 2: 0x4E2D}),
            "SN TTN-",
        )
        self.assertEqual(
            decode_identifier({58: 64, 61: 0, 62: 72, 1: 0x4A32, 2: 0x3531}),
            "Model ID 64 · Device type 72 · SN J251",
        )
        runtime = (ROOT / "solar_inverter" / "services" / "inverter_service_runtime.py").read_text(encoding="utf-8")
        self.assertIn("read_initial_identity()", runtime)
        self.assertIn("Initial identity read", runtime)
        self.assertNotIn("DEVICE_MODEL_NAME", runtime)

    def test_updater_records_local_installations_without_github_ui(self) -> None:
        html = (WEB_ROOT / "index.html").read_text(encoding="utf-8")
        events = (WEB_ROOT / "scripts" / "app-events.js").read_text(encoding="utf-8")
        installer = (ROOT / "deploy" / "update_bundle_src" / "__main__.py").read_text(encoding="utf-8")
        runtime = (ROOT / "solar_inverter" / "services" / "inverter_service_runtime.py").read_text(encoding="utf-8")
        server_source = (ROOT / "solar_inverter" / "components" / "web_dashboard.py").read_text(encoding="utf-8")
        self.assertIn('id="updater-history-button"', html)
        self.assertIn('id="updater-history-picker"', html)
        self.assertNotIn("github.com", html.lower())
        self.assertIn("fetch('/api/updater-history'", events)
        self.assertIn('UPDATER_VERSION = "5"', installer)
        self.assertIn("'installer'", installer)
        self.assertIn('STATS_DATABASE_PATH = Path("/var/lib/solar-inverter-dashboard/stats.sqlite3")', installer)
        self.assertIn('LEGACY_STATS_DATABASE_PATH = LEGACY_APPLICATION_ROOT / "solar_invertor_web_stats.sqlite3"', installer)
        self.assertIn('UPDATER_RECEIPT_PATH = APPLICATION_ROOT / "updater_history.json"', installer)
        self.assertIn('UPDATER_ARCHIVE_DIR = APPLICATION_ROOT / "updater_archives"', installer)
        self.assertIn("def next_updater_version() -> int:", installer)
        self.assertIn("base_version + len(checksums)", installer)
        self.assertIn("legacy_rows", installer)
        self.assertIn("WHERE NOT EXISTS", installer)
        self.assertIn('UPDATER_RECEIPT_PATH = PROJECT_ROOT / "updater_history.json"', runtime)
        self.assertIn('version_url = f"http://127.0.0.1:{port}/api/version"', installer)
        self.assertIn("def dashboard_asset_version(payload_root: Path) -> str:", installer)
        self.assertIn("def verify_installed_payload(payload_root: Path, payload_files: tuple[str, ...]) -> None:", installer)
        self.assertIn("def wait_for_health(expected_version: str) -> None:", installer)
        self.assertIn("running_version == expected_version", installer)
        self.assertIn("wait_for_health(expected_version)", installer)
        self.assertIn('request_path == "/api/updater-history/download"', server_source)
        self.assertIn('"Content-Disposition"', server_source)
        self.assertIn("encodeURIComponent(item.archive_file)", events)
        self.assertIn("receipt.get(\"installations\", [])", runtime)
        self.assertIn("WHERE source = 'installer'", runtime)

    def test_installer_migrates_history_to_the_service_database(self) -> None:
        import sqlite3
        import tempfile
        import os
        from contextlib import closing
        from types import SimpleNamespace

        installer = runpy.run_path(str(ROOT / "deploy" / "update_bundle_src" / "__main__.py"))
        record = installer["record_installed_version"]
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            legacy_path = root / "opt" / "solar_invertor_web_stats.sqlite3"
            service_path = root / "var" / "stats.sqlite3"
            receipt_path = root / "opt" / "updater_history.json"
            archive_dir = root / "opt" / "updater_archives"
            bundle_path = root / "solar-dashboard-update.pyz"
            legacy_path.parent.mkdir(parents=True)
            bundle_path.write_bytes(b"updater-four-test")
            service_path.parent.mkdir(parents=True)
            with closing(sqlite3.connect(service_path)) as connection:
                connection.execute(
                    """
                    CREATE TABLE updater_versions (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        commit_hash TEXT NOT NULL,
                        source TEXT NOT NULL,
                        created_at TEXT NOT NULL
                    )
                    """
                )
                connection.execute(
                    """
                    INSERT INTO updater_versions (commit_hash, source, created_at)
                    VALUES ('old-local-build', 'local', '2026-08-08 11:00:00')
                    """
                )
                connection.commit()
            with closing(sqlite3.connect(legacy_path)) as connection:
                connection.execute(
                    """
                    CREATE TABLE updater_versions (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        commit_hash TEXT NOT NULL, commit_message TEXT,
                        commit_date TEXT, source TEXT NOT NULL,
                        bundle_path TEXT, build_output TEXT,
                        created_at TEXT NOT NULL
                    )
                    """
                )
                connection.execute(
                    """
                    INSERT INTO updater_versions
                        (commit_hash, commit_message, commit_date, source,
                         bundle_path, build_output, created_at)
                    VALUES ('updater-4', 'Updater 4', '2026-08-08 12:00:00',
                            'installer', 'old.pyz', 'SHA-256 OLD', '2026-08-08 12:00:00')
                    """
                )
                connection.commit()
            record.__globals__.update({
                "STATS_DATABASE_PATH": service_path,
                "LEGACY_STATS_DATABASE_PATH": legacy_path,
                "UPDATER_RECEIPT_PATH": receipt_path,
                "UPDATER_ARCHIVE_DIR": archive_dir,
                "archive_path": lambda: bundle_path,
                "os": SimpleNamespace(
                    getpid=os.getpid, chmod=os.chmod, chown=lambda *_: None,
                    replace=os.replace,
                ),
            })
            record(1000, 1000, "abc123def456")
            with closing(sqlite3.connect(service_path)) as connection:
                columns = {
                    row[1] for row in connection.execute("PRAGMA table_info(updater_versions)")
                }
                rows = connection.execute(
                    "SELECT commit_hash, source, build_output FROM updater_versions ORDER BY id"
                ).fetchall()
            receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
            archive_exists = (archive_dir / "solar-dashboard-updater-5-abc123def456.pyz").is_file()
        self.assertIn("build_output", columns)
        self.assertEqual(len(rows), 3)
        self.assertEqual(rows[0], ("old-local-build", "local", None))
        self.assertEqual(rows[1], ("updater-4", "installer", "SHA-256 OLD"))
        self.assertEqual(rows[2][0:2], ("updater-5-abc123def456", "installer"))
        self.assertRegex(rows[2][2], r"^SHA-256 [0-9A-F]{64}$")
        self.assertEqual(receipt["schema"], 1)
        self.assertEqual(receipt["installations"][0]["version"], "5")
        self.assertEqual(receipt["installations"][0]["dashboard_version"], "abc123def456")
        self.assertEqual(receipt["installations"][0]["checksum"], rows[2][2])
        self.assertTrue(archive_exists)

    def test_updater_history_uses_receipt_when_sqlite_history_is_missing(self) -> None:
        import tempfile
        from solar_inverter.services.inverter_service_runtime import get_updater_history

        globals_ = get_updater_history.__globals__
        original_database = globals_["STATS_DB_PATH"]
        original_receipt = globals_["UPDATER_RECEIPT_PATH"]
        try:
            with tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                receipt_path = root / "updater_history.json"
                receipt_path.write_text(json.dumps({
                    "schema": 1,
                    "installations": [{
                        "version": "4", "checksum": "SHA-256 RECEIPT",
                        "installed_at": "2026-08-08 14:00:00",
                    }],
                }), encoding="utf-8")
                globals_["STATS_DB_PATH"] = root / "empty.sqlite3"
                globals_["UPDATER_RECEIPT_PATH"] = receipt_path
                history = get_updater_history()
        finally:
            globals_["STATS_DB_PATH"] = original_database
            globals_["UPDATER_RECEIPT_PATH"] = original_receipt
        self.assertEqual(history, [{
            "id": "receipt-0", "version": "4",
            "dashboard_version": "",
            "checksum": "SHA-256 RECEIPT", "installed_at": "2026-08-08 14:00:00",
            "archive_file": "", "download_available": False,
        }])

    def test_updater_history_numbers_releases_and_exposes_archived_bundle(self) -> None:
        import tempfile
        from solar_inverter.services.inverter_service_runtime import get_updater_archive, get_updater_history

        globals_ = get_updater_history.__globals__
        originals = {name: globals_[name] for name in (
            "STATS_DB_PATH", "UPDATER_RECEIPT_PATH", "UPDATER_ARCHIVE_DIR",
        )}
        try:
            with tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                archive_dir = root / "updater_archives"
                archive_dir.mkdir()
                archive_name = "solar-dashboard-updater-6-newbuild.pyz"
                (archive_dir / archive_name).write_bytes(b"latest updater")
                receipt_path = root / "updater_history.json"
                receipt_path.write_text(json.dumps({"installations": [
                    {"version": "4", "checksum": "SHA-256 A", "installed_at": "2026-08-08 14:00:00"},
                    {"version": "4", "checksum": "SHA-256 B", "installed_at": "2026-08-08 15:00:00"},
                    {"version": "6", "dashboard_version": "newbuild", "checksum": "SHA-256 C",
                     "installed_at": "2026-08-08 16:00:00", "bundle": archive_name},
                ]}), encoding="utf-8")
                globals_.update({
                    "STATS_DB_PATH": root / "empty.sqlite3",
                    "UPDATER_RECEIPT_PATH": receipt_path,
                    "UPDATER_ARCHIVE_DIR": archive_dir,
                })
                history = get_updater_history()
                downloadable = get_updater_archive(archive_name)
                traversal = get_updater_archive("../" + archive_name)
        finally:
            globals_.update(originals)
        self.assertEqual([item["version"] for item in history], ["6", "5", "4"])
        self.assertTrue(history[0]["download_available"])
        self.assertEqual(history[0]["archive_file"], archive_name)
        self.assertFalse(history[1]["download_available"])
        self.assertEqual(downloadable, archive_dir / archive_name)
        self.assertIsNone(traversal)

    def test_register_metadata_matches_ttn_v131_units_and_scaling(self) -> None:
        from solar_inverter.services.inverter_service_core import (
            COUNTER_32BIT_LOW_WORD_REGISTERS,
            REGISTER_CONFIG,
            combined_32bit_counter_value,
            normalize,
        )

        expected = {
            84: (1.0, "W", True),
            88: (1.0, "W", False),
            92: (1.0, "W", False),
            93: (1.0, "VA", False),
            94: (0.1, "%", False),
            130: (0.1, "A", True),
            133: (0.1, "%", False),
            148: (1.0, "%", False),
            149: (1.0, "W", False),
            150: (1.0, "W", False),
            404: (0.1, "V", True),
            413: (0.1, "A", True),
            414: (0.01, "%", True),
            436: (1.0, "W", True),
            437: (1.0, "", False),
            801: (1.0, "%", False),
        }
        for register, metadata in expected.items():
            with self.subTest(register=register):
                self.assertEqual(REGISTER_CONFIG[register][1:4], metadata)
        self.assertEqual(normalize(81, 2300)[3], 230.0)
        self.assertEqual(normalize(82, 1235)[3], 12.35)
        self.assertEqual(normalize(95, 65536 - 123)[3], -123.0)
        self.assertEqual(normalize(130, 65536 - 180)[3], -18.0)
        self.assertEqual(len(COUNTER_32BIT_LOW_WORD_REGISTERS), 30)
        self.assertEqual(combined_32bit_counter_value(453, {452: 1, 453: 18420}), 839.56)

    def test_ttn_12ku_u30_embedded_workbook_profile(self) -> None:
        from solar_inverter.services.inverter_service_core import (
            AVAILABLE_FAST_POLL_REGISTERS,
            DEFAULT_FAST_SELECTED_REGISTERS,
            FAST_BLOCKS,
            IDENTITY_REGISTERS,
            KNOWN_REGISTERS,
            DEFAULT_FAST_POLL_REGISTER_COUNT,
            MIN_FAST_POLL_REGISTER_COUNT,
            OBSERVED_AVAILABLE_REGISTERS,
            COUNTER_32BIT_LOW_WORD_REGISTERS,
            REGISTER_CONFIG,
            TTN_FAST_MBPOLL_REGISTERS,
            fast_selected_blocks,
        )
        from solar_inverter.services.register_profile_12ku import REGISTER_BY_NUMBER, REGISTER_PROFILE

        self.assertEqual(len(REGISTER_PROFILE), 696)
        self.assertEqual(KNOWN_REGISTERS, [row[0] for row in REGISTER_PROFILE])
        self.assertEqual(len(OBSERVED_AVAILABLE_REGISTERS), 386)
        self.assertTrue(set(OBSERVED_AVAILABLE_REGISTERS).issubset(KNOWN_REGISTERS))
        self.assertEqual(OBSERVED_AVAILABLE_REGISTERS[:3], (1, 2, 3))
        self.assertEqual(OBSERVED_AVAILABLE_REGISTERS[-3:], (16768, 16779, 16780))
        self.assertEqual(MIN_FAST_POLL_REGISTER_COUNT, 0)
        self.assertEqual(len(DEFAULT_FAST_SELECTED_REGISTERS), DEFAULT_FAST_POLL_REGISTER_COUNT)
        self.assertEqual(DEFAULT_FAST_POLL_REGISTER_COUNT, 113)
        self.assertEqual(DEFAULT_FAST_SELECTED_REGISTERS, TTN_FAST_MBPOLL_REGISTERS)
        self.assertEqual(DEFAULT_FAST_SELECTED_REGISTERS[:5], (65, 66, 67, 68, 69))
        self.assertEqual(DEFAULT_FAST_SELECTED_REGISTERS[-5:], (16688, 16689, 16692, 16694, 16696))
        self.assertTrue(set(DEFAULT_FAST_SELECTED_REGISTERS).issubset(AVAILABLE_FAST_POLL_REGISTERS))
        self.assertEqual(set(DEFAULT_FAST_SELECTED_REGISTERS) & IDENTITY_REGISTERS, {65})
        self.assertEqual(
            AVAILABLE_FAST_POLL_REGISTERS,
            frozenset((*OBSERVED_AVAILABLE_REGISTERS, *TTN_FAST_MBPOLL_REGISTERS)),
        )
        self.assertEqual(set(TTN_FAST_MBPOLL_REGISTERS) - set(OBSERVED_AVAILABLE_REGISTERS), {162})
        selected_blocks = fast_selected_blocks(list(DEFAULT_FAST_SELECTED_REGISTERS))
        self.assertEqual(fast_selected_blocks([11, 90]), [(90, 1)])
        fixed_registers = {
            register
            for start, count in FAST_BLOCKS
            for register in range(start, start + count)
        }
        selected_registers = {
            register
            for start, count in selected_blocks
            for register in range(start, start + count)
        }
        self.assertGreaterEqual(len(fixed_registers | selected_registers), 120)
        self.assertTrue(fixed_registers.issubset(AVAILABLE_FAST_POLL_REGISTERS))
        self.assertEqual(len(COUNTER_32BIT_LOW_WORD_REGISTERS), 30)
        for low_register, high_register in COUNTER_32BIT_LOW_WORD_REGISTERS.items():
            with self.subTest(low_register=low_register):
                self.assertEqual(REGISTER_CONFIG[high_register][0], REGISTER_CONFIG[low_register][0])
                self.assertNotRegex(REGISTER_CONFIG[low_register][0], r"(?:слово|\bH\b|\bL\b)")
        self.assertEqual(REGISTER_BY_NUMBER[58][2], "Model ID / Protocol ID B")
        self.assertEqual(REGISTER_BY_NUMBER[16651][5:7], (0.1, "V"))
        self.assertEqual(REGISTER_CONFIG[142][1:3], (0.01, "Ah"))
        self.assertEqual(REGISTER_CONFIG[143][1:3], (0.01, "Ah"))
        self.assertEqual(REGISTER_CONFIG[157][1:3], (0.01, "kWh"))
        self.assertEqual(REGISTER_CONFIG[187][1:3], (0.01, "kWh"))
        self.assertEqual(REGISTER_CONFIG[450][0], "Споживання з мережі за місяць")
        self.assertEqual(REGISTER_CONFIG[451][0], "Споживання з мережі за місяць")
        self.assertEqual(
            REGISTER_BY_NUMBER[68][2:5],
            ("Состояние силовых клемм", "только чтение", "uint16_t"),
        )
        self.assertEqual(REGISTER_BY_NUMBER[70][2], "Статус топологии / single")
        self.assertEqual(REGISTER_BY_NUMBER[437][2], "Reserved после мощности сети A")
        self.assertEqual(
            FAST_BLOCKS,
            [(401, 19), (433, 5), (448, 8), (529, 2), (537, 9),
             (801, 2), (817, 6), (16641, 16)],
        )
        for register in (404, 407, 433, 436, 537, 545, 801, 818, 16655):
            with self.subTest(register=register):
                self.assertTrue(
                    any(start <= register < start + count for start, count in FAST_BLOCKS),
                    f"R{register} must be read on every fast-poll cycle",
                )

    def test_12ku_cards_prioritize_measured_output_voltage(self) -> None:
        from solar_inverter.services.inverter_service_core import METER_DEFINITIONS

        output_voltage = next(item for item in METER_DEFINITIONS if item[0] == 537)
        output_load = next(item for item in METER_DEFINITIONS if item[0] == 545)
        self.assertEqual(output_voltage[1], [89])
        self.assertEqual(output_load[1], [94])
        lcd = (WEB_ROOT / "scripts" / "lcd.js").read_text(encoding="utf-8")
        flow = energy_flow_source()
        self.assertIn("numberValue([537, 89])", lcd)
        self.assertIn("firstRegister([537, 89])", flow)
        self.assertIn("firstRegister([545, 94])", flow)
        self.assertIn("const batterySocSource = firstRegister([407, 139, 133, 339])", flow)
        self.assertIn("const measuredBatteryDirection", flow)
        self.assertIn("? measuredBatteryDirection > 0", flow)
        self.assertIn("? measuredBatteryDirection < 0", flow)
        translations = (WEB_ROOT / "scripts" / "translations.js").read_text(encoding="utf-8")
        self.assertIn("demoBatteryHome: 'ДЕМО · БАТ. → ДІМ · − розряд'", translations)
        self.assertIn("demoBatteryHome: 'ДЕМО · БАТ. → ДОМ · − разрядка'", translations)
        self.assertIn("demoBatteryHome: 'DEMO · BAT. → HOME · − discharging'", translations)
        self.assertNotIn("numberValue([84, 437, 436])", lcd)

    def test_build_and_installer_payload_manifests_match(self) -> None:
        build = runpy.run_path(str(ROOT / "deploy" / "build_update_bundle.py"))
        installer = runpy.run_path(str(ROOT / "deploy" / "update_bundle_src" / "__main__.py"))
        build_payload = set(build["project_payload_files"]())
        required_runtime = set(installer["REQUIRED_RUNTIME_FILES"])
        required_runtime.add(installer["SERVICE_PAYLOAD"])
        generated_payload = {build["UPSTREAM_VERSION_PAYLOAD"]}
        self.assertTrue(required_runtime - generated_payload <= build_payload)
        self.assertNotIn("deploy/solar-dashboard-update.pyz", build_payload)
        self.assertNotIn("solar_invertor_web_stats.sqlite3", build_payload)
        self.assertNotIn("config/home-assistant_v2.db", build_payload)
        for relative_name in build_payload:
            self.assertTrue((ROOT / relative_name).is_file(), relative_name)

    def test_first_party_app_files_do_not_exceed_900_lines(self) -> None:
        source_extensions = {".py", ".js", ".css", ".html"}
        source_roots = (ROOT / "solar_inverter", ROOT / "deploy")
        source_files = [ROOT / "solar_invertor_web.py"]
        for source_root in source_roots:
            source_files.extend(
                path
                for path in source_root.rglob("*")
                if path.is_file()
                and path.suffix in source_extensions
                and "__pycache__" not in path.parts
            )

        oversized = {
            str(path.relative_to(ROOT)): len(path.read_text(encoding="utf-8").splitlines())
            for path in source_files
            if len(path.read_text(encoding="utf-8").splitlines()) > 900
        }
        self.assertEqual(oversized, {})


@unittest.skipUnless(shutil.which("node"), "Node.js is required for JavaScript renderer tests")
class DashboardRendererTests(unittest.TestCase):
    def test_demo_register_values_round_trip_like_live_v131_values(self) -> None:
        chart_path = WEB_ROOT / "scripts" / "charts.js"
        probe = textwrap.dedent(
            """
            const fs = require('fs');
            const source = fs.readFileSync(process.argv[1], 'utf8');
            const start = source.indexOf('function demoRawValue');
            const end = source.indexOf('function continuousDemoChartValue', start);
            eval(source.slice(start, end));
            const samples = [
              {register:81, scale:.1, signed:false, requested:230.04},
              {register:82, scale:.01, signed:false, requested:12.345},
              {register:95, scale:1, signed:true, requested:-123},
              {register:130, scale:.1, signed:true, requested:18.04},
              {register:130, scale:.1, signed:true, requested:-18.04},
              {register:134, scale:1, signed:false, requested:-936},
              {register:67, scale:1, signed:false, requested:4.7},
              {register:94, scale:.1, signed:false, requested:24.94}
            ];
            console.log(JSON.stringify(samples.map(item => demoRegisterReading(item, item.requested))));
            """
        )
        result = subprocess.run(
            [shutil.which("node") or "node", "-e", probe, str(chart_path)],
            check=True, capture_output=True, text=True,
        )
        readings = json.loads(result.stdout)
        self.assertEqual(readings, [
            {"raw": 2300, "value": 230, "display": "230.0", "available": True},
            {"raw": 1235, "value": 12.35, "display": "12.35", "available": True},
            {"raw": 65413, "value": -123, "display": "-123", "available": True},
            {"raw": 180, "value": 18, "display": "18.0", "available": True},
            {"raw": 65356, "value": -18, "display": "-18.0", "available": True},
            {"raw": 936, "value": -936, "display": "-936", "available": True},
            {"raw": 5, "value": 5, "display": "5", "available": True},
            {"raw": 249, "value": 24.9, "display": "24.9", "available": True},
        ])
        browser_source = script_source("app.js", "charts.js", "energy-flow-cards.js", "energy-flow.js", "lcd.js")
        self.assertIn("function registerNumericValue(register)", browser_source)
        self.assertGreaterEqual(browser_source.count("registerNumericValue("), 18)

    def test_demo_r67_to_r70_words_describe_each_energy_route(self) -> None:
        chart_path = WEB_ROOT / "scripts" / "charts.js"
        capture_path = WEB_ROOT / "scripts" / "chart-demo-capture.js"
        probe = textwrap.dedent(
            """
            const fs = require('fs');
            const source = fs.readFileSync(process.argv[1], 'utf8');
            const captureSource = fs.readFileSync(process.argv[2], 'utf8');
            const start = source.indexOf('function interpolate');
            const end = source.indexOf('function demoSolarEnergySummary', start);
            eval(captureSource + '\\n' + source.slice(start, end));
            console.log(JSON.stringify([10, 30, 50, 70, 90, 110].map(second => {
              const values = realisticDemoScenario(second).values;
              return [values.get(67), values.get(68), values.get(69), values.get(70), values.get(322), values.get(325), values.get(133), values.get(139), values.get(339), values.get(407)];
            })));
            """
        )
        result = subprocess.run(
            [shutil.which("node") or "node", "-e", probe, str(chart_path), str(capture_path)],
            check=True, capture_output=True, text=True,
        )
        frames = json.loads(result.stdout)
        self.assertEqual([frame[0] for frame in frames], [4, 3, 5, 4, 6, 4])
        self.assertEqual([frame[3] for frame in frames], [0, 0, 0, 0, 0, 0])
        self.assertEqual([frame[4] for frame in frames], [0, 0, 0, 0, 0, 0])
        self.assertEqual([frame[5] for frame in frames], [4, 3, 5, 4, 6, 4])
        expected_r69 = [624, 611, 768, 720, 620, 1360]
        self.assertEqual([frame[2] for frame in frames], expected_r69)
        # Every frame has a normal main output in R68; source terminals vary by route.
        self.assertTrue(all(((frame[1] >> 6) & 3) == 1 for frame in frames))
        self.assertEqual([frame[1] & 3 for frame in frames], [0, 2, 0, 0, 0, 0])
        self.assertEqual([(frame[1] >> 2) & 3 for frame in frames], [0, 0, 0, 0, 2, 0])
        self.assertEqual(
            [frames[index][6:] for index in (3, 4)],
            [[None, None, None, 71], [None, None, None, 71]],
        )

    def test_captured_demo_grid_charge_has_a_matching_grid_route(self) -> None:
        chart_path = WEB_ROOT / "scripts" / "charts.js"
        capture_path = WEB_ROOT / "scripts" / "chart-demo-capture.js"
        probe = textwrap.dedent(
            """
            const fs = require('fs');
            const source = fs.readFileSync(process.argv[1], 'utf8');
            const captureSource = fs.readFileSync(process.argv[2], 'utf8');
            const start = source.indexOf('function interpolate');
            const end = source.indexOf('function realisticDemoScenario', start);
            eval(captureSource + '\\n' + source.slice(start, end));
            const discharge = capturedRegisterLogDemoScenario(46).values;
            const charge = capturedRegisterLogDemoScenario(26).values;
            console.log(JSON.stringify({
              discharge: [discharge.get(130), discharge.get(134), discharge.get(69)],
              charge: [charge.get(81), charge.get(130), charge.get(134), charge.get(69)]
            }));
            """
        )
        result = subprocess.run(
            [shutil.which("node") or "node", "-e", probe, str(chart_path), str(capture_path)],
            check=True, capture_output=True, text=True,
        )
        demo = json.loads(result.stdout)
        self.assertLess(demo["discharge"][0], 0)
        self.assertLess(demo["discharge"][1], 0)
        self.assertEqual(demo["discharge"][2] & (1 << 8), 1 << 8)
        self.assertEqual(demo["charge"][0], 230)
        self.assertGreater(demo["charge"][1], 0)
        self.assertGreater(demo["charge"][2], 0)
        self.assertEqual(demo["charge"][3] & ((1 << 0) | (1 << 5)), (1 << 0) | (1 << 5))

    def test_full_r68_battery_state_forces_a_complete_soc_display(self) -> None:
        flow = energy_flow_source()
        lcd = (WEB_ROOT / "scripts" / "lcd.js").read_text(encoding="utf-8")
        self.assertIn("firstRegister([407, 139, 133, 339])", flow)
        self.assertIn("function effectiveBatterySoc(measuredSoc, terminalState)", flow)
        self.assertIn("if (terminalState?.battery === 4) return 100", flow)
        self.assertIn("const effectiveSoc = effectiveBatterySoc(batterySoc, terminalState)", flow)
        self.assertIn("batteryLevelKnown ? `${Math.round(batteryLevel)}%` : '—'", flow)
        self.assertIn("numberValue([407, 139, 133, 339])", lcd)
        self.assertIn("const batterySoc = effectiveBatterySoc(measuredBatterySoc, terminalState)", lcd)

    def test_api_battery_soc_uses_r68_full_state_without_mutating_raw_data(self) -> None:
        from solar_inverter.components.web_dashboard import effective_battery_soc

        full_terminal_state = 4 << 8
        self.assertEqual(effective_battery_soc(73.0, full_terminal_state), 100.0)
        self.assertEqual(effective_battery_soc(73.0, 3 << 8), 73.0)
        self.assertEqual(effective_battery_soc(None, full_terminal_state), 100.0)
        self.assertIsNone(effective_battery_soc(None, None))

    def test_api_signs_battery_current_and_power_during_discharge(self) -> None:
        from solar_inverter.components.web_dashboard import web_state
        from solar_inverter.services.inverter_service import state, state_lock

        with state_lock:
            original_values = dict(state["values"])
            state["values"].update({68: 2 << 8, 69: 1 << 8, 130: 57, 134: 306})
        try:
            snapshot = web_state("en")
            readings = {item["register"]: item for item in snapshot["registers"]}
            meters = {item["register"]: item for item in snapshot["meters"]}
            self.assertEqual(readings[130]["value"], -5.7)
            self.assertEqual(readings[134]["value"], -306)
            self.assertEqual(meters[130]["value"], -5.7)
            self.assertEqual(meters[134]["value"], -306)
        finally:
            with state_lock:
                state["values"] = original_values

    def test_lcd_uses_canonical_state_registers_for_connections_and_flow(self) -> None:
        lcd = (WEB_ROOT / "scripts" / "lcd.js").read_text(encoding="utf-8")
        self.assertIn("firstRegister([67, 325])", lcd)
        self.assertIn("firstRegister([68])", lcd)
        self.assertIn("firstRegister([69])", lcd)
        self.assertIn("decodeEnergyTerminalState(terminalStateSource)", lcd)
        self.assertIn("decodeEnergyFlowState(flowStateSource)", lcd)
        self.assertIn("flowState.gridToRectifier || flowState.gridToLoad || flowState.rectifierToGrid", lcd)
        self.assertIn("const loadFlowActive = outputConnected && outputCanSupply", lcd)

    def test_all_tabs_use_complete_translation_catalogs(self) -> None:
        translation_path = WEB_ROOT / "scripts" / "translations.js"
        probe = textwrap.dedent(
            """
            const fs = require('fs');
            const source = fs.readFileSync(process.argv[1], 'utf8');
            eval(source + `
              console.log(JSON.stringify({
                ui: Object.fromEntries(
                  Object.entries(UI_TRANSLATIONS).map(([language, values]) =>
                    [language, Object.keys(values)])
                ),
                data: Object.keys(DATA_TRANSLATIONS)
              }));
            `);
            """
        )
        result = subprocess.run(
            [shutil.which("node") or "node", "-e", probe, str(translation_path)],
            check=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
        translation_keys = json.loads(result.stdout)
        catalogs = {language: set(keys) for language, keys in translation_keys["ui"].items()}
        self.assertEqual(catalogs["uk"], catalogs["ru"])
        self.assertEqual(catalogs["uk"], catalogs["en"])

        sources = [(WEB_ROOT / "index.html").read_text(encoding="utf-8")]
        sources.extend(path.read_text(encoding="utf-8") for path in (WEB_ROOT / "scripts").glob("*.js"))
        used_keys: set[str] = set()
        for source in sources:
            used_keys.update(re.findall(r'data-i18n(?:-aria|-placeholder|-title)?="([^"]+)"', source))
            used_keys.update(re.findall(r'data-disabled-reason="([^"]+)"', source))
            used_keys.update(re.findall(r"\bt\(\s*['\"]([^'\"]+)['\"]", source))
        self.assertEqual(used_keys - catalogs["uk"], set())
        localized_literals: set[str] = set()
        for source in sources:
            localized_literals.update(re.findall(
                r"localizeDataText\(\s*['\"]([^'\"]+)['\"]",
                source,
            ))
        self.assertEqual(localized_literals - set(translation_keys["data"]), set())

        api_catalog = json.loads(
            (WEB_ROOT / "data" / "data-translations.json").read_text(encoding="utf-8")
        )
        self.assertTrue(set(translation_keys["data"]).issubset(api_catalog))
        self.assertTrue(all({"ru", "en"}.issubset(values) for values in api_catalog.values()))
        workbook_translations = [values for values in api_catalog.values() if "uk" in values]
        self.assertEqual(len(workbook_translations), 404)
        from solar_inverter.services.register_profile_12ku import REGISTER_PROFILE
        workbook_sources = {
            value
            for row in REGISTER_PROFILE
            for value in (row[1], row[2])
            if any(0x0400 <= ord(character) <= 0x04FF for character in value)
        }
        self.assertEqual(workbook_sources - set(api_catalog), set())
        self.assertTrue(all(
            not re.search(r"[\u0400-\u04FF]", api_catalog[source]["en"])
            for source in workbook_sources
        ))

    def test_demo_populates_fan_for_dashboard_charts_and_lcd_data(self) -> None:
        html_source = (WEB_ROOT / "index.html").read_text(encoding="utf-8")
        chart_source = dashboard_chart_source()
        flow_source = energy_flow_source()
        lcd_source = (WEB_ROOT / "scripts" / "lcd.js").read_text(encoding="utf-8")
        css_source = dashboard_css()
        self.assertIn("const fanSpeed =", chart_source)
        self.assertIn("function capturedRegisterLogDemoScenario(elapsedSeconds)", chart_source)
        self.assertIn("Do not let unrelated live register states rebuild graph controls", chart_source)
        self.assertIn("[67, 5], [68, 576], [69, 33536]", chart_source)
        self.assertIn("Every V1.31 R69 power-route bit is demonstrated at least once", chart_source)
        self.assertIn("const scenarioIndex = Math.floor(Math.max(0, elapsedSeconds) / 20) % 6", chart_source)
        self.assertIn("1 << 10", chart_source)
        self.assertIn("demoFallbackValue(register, scenario.elapsedSeconds)", chart_source)
        self.assertIn("Identity captured from the real inverter on 2026-08-19", chart_source)
        self.assertIn("[1, 0x4a32], [2, 0x3531]", chart_source)
        self.assertIn("[57, 0], [58, 64], [59, 0], [60, 0], [61, 0], [62, 0]", chart_source)
        self.assertIn("const DEMO_DEVICE_IDENTITY = 'Model ID 64 · Device type 0 · SN J25110266-1H00028'", script_source("app.js"))
        self.assertIn("second / 120 * 100", chart_source)
        self.assertIn("[801, fanSpeed]", chart_source)
        self.assertIn("renderEnergyFlow(lastData, demoRegisterRows)", chart_source)
        self.assertIn("A demo flow change must be observable from every tab", chart_source)
        self.assertIn("function synchronizeDemoChartDefinitions(scenario)", chart_source)
        self.assertIn("function dashboardDefinitionData(data)", chart_source)
        self.assertIn("return {...data, registers: demoRegisterRows, meters: [...demoMeters.values()]};", chart_source)
        self.assertIn("item.displayValue = registerVersionDisplay(matchingRegister", chart_source)
        self.assertIn("registerInterpretation({...matchingRegister, versionDisplay: item.displayValue})", chart_source)
        self.assertIn("item.source = `R${item.register} · ${t('demoMode')}`", chart_source)
        self.assertIn("renderLcd(lastData, demoRegisterRows)", chart_source)
        self.assertIn('id="lcd-inverter-fan-speed"', html_source)
        self.assertIn("const inverterFanSpeedReading = numberValue([801])", lcd_source)
        self.assertIn("const inverterFanRpm = Number.isFinite(inverterFanSpeed)", lcd_source)
        self.assertIn("fanSpeedRpm(inverterFanSpeed)", lcd_source)
        self.assertIn("setText('#lcd-inverter-fan-speed', reading(inverterFanRpm, 'RPM', 0))", lcd_source)
        self.assertIn("flex: 0 1 clamp(22px,6.6cqw,56px)", css_source)
        self.assertIn("overflow: hidden", css_source)
        self.assertIn("registerInterpretation(statusRegister) || localizeDataText(statusRegister.display)", lcd_source)
        self.assertIn("const isPercentage = register.unit === '%'", chart_source)
        self.assertIn("isPercentage ? Math.max(0, Math.min(100, value)) : value", chart_source)
        self.assertIn("function seedDemoHistory()", chart_source)
        self.assertIn("const pointCounts = {day: 288, week: 336, month: 360, year: 365, lifetime: 365}", chart_source)
        self.assertIn("const demoWindowSeconds = Number.isFinite(windowSeconds) ? windowSeconds : 315360000", chart_source)
        self.assertNotIn("displaySeconds", chart_source)
        self.assertIn("previousValue + random() * scale * .01", chart_source)
        self.assertIn("Math.max(0, Math.min(100, inverterFanSpeed))", flow_source)
        self.assertIn("const INVERTER_FAN_MAX_RPM = 3000", flow_source)
        self.assertIn("function fanSpeedRpm(normalizedSpeed)", flow_source)
        self.assertIn("reading(fanSpeedRpmValue, 'RPM', 0)", flow_source)
        self.assertIn("if (Array.isArray(saved))", flow_source)
        self.assertIn("return config.defaults", flow_source)
        self.assertIn("const interpretation = register ? registerInterpretation(register) : ''", flow_source)
        self.assertIn("function outputSourceFromPriority(priority, availableSources)", flow_source)
        self.assertIn("const outputPriority = decodeBoundedRegister(inverterPrioritySource, 3)", flow_source)
        self.assertIn("outputSourceFromPriority(outputPriority", flow_source)
        self.assertIn("function compactFlowCardState(registerNumber, raw)", flow_source)
        self.assertIn("case 530:", flow_source)
        self.assertIn("case 529: return enumCode(['GPB', 'PGB', 'PBG', 'MKS/MKP'])", flow_source)
        self.assertNotIn("`${name}: ${interpretation}`", flow_source)
        self.assertIn("row.classList.toggle('flow-card-state-value', Boolean(interpretation))", flow_source)
        self.assertIn("registerRawExplanation(register)", flow_source)
        self.assertIn("function updateInverterFanAnimation(fanRow, normalizedSpeed)", flow_source)
        self.assertIn("const shouldRotate = effectiveSpeed > 0", flow_source)
        self.assertIn("const INVERTER_FAN_MAX_ROTATION_MS = 750", flow_source)
        self.assertIn("{duration: INVERTER_FAN_MAX_ROTATION_MS, iterations: Infinity}", flow_source)
        self.assertIn("smoothlyUpdateInverterFanRate(inverterFanAnimation, playbackRate)", flow_source)
        self.assertIn("inverterFanLastKnownSpeed ?? 0", flow_source)
        self.assertIn("const playbackRate = effectiveSpeed / 100", flow_source)
        self.assertIn("inverterFanAnimation.pause()", flow_source)
        self.assertIn("Array.from(fullLabel).slice(0, 3).join('')", flow_source)
        self.assertIn("element.dataset.sourceIcon = mode.icon", flow_source)
        self.assertIn("element.setAttribute('aria-label', fullLabel)", flow_source)
        self.assertIn("icon: 'grid'", flow_source)
        self.assertIn("icon: 'pv'", flow_source)
        self.assertIn("icon: 'generator'", flow_source)
        self.assertIn("icon: 'battery'", flow_source)
        self.assertIn('.energy-source-icon[data-source-icon="grid"]', css_source)
        self.assertIn('.energy-source-icon[data-source-icon="pv"]::before', css_source)
        self.assertIn('.energy-source-icon[data-source-icon="generator"]', css_source)
        self.assertIn('.energy-source-icon[data-source-icon="battery"]::before', css_source)
        self.assertNotIn("--fan-duration", flow_source)
        self.assertNotIn("var(--fan-duration, 1s)", css_source)
        self.assertIn(".energy-inverter-fan-row.css-animation-fallback.active .energy-inverter-fan-rotor", css_source)
        self.assertIn("transform-box: view-box; transform-origin: 12px 12px", css_source)
        self.assertIn("position: absolute; z-index: 3; left: 22px; top: 50%; bottom: auto", css_source)
        self.assertIn(".energy-inverter .energy-node-value { top: 76% }", css_source)
        self.assertIn("flex-direction: column; width: 60px; max-width: 60px", css_source)
        self.assertIn("flex: 0 0 48px; width: 60px; height: 48px", css_source)
        self.assertIn("left: 4px; top: 50%; bottom: auto; flex-direction: column", css_source)
        self.assertIn("left: 72%; right: auto; top: 49%; width: 52%", css_source)
        self.assertIn("color: #fff; font-size: clamp(18px,5.2vw,22px)", css_source)
        self.assertIn("font-size: clamp(16px, 2.2vw, 24px); line-height: 1.15", css_source)
        self.assertIn(".energy-inverter .energy-mode-definition {", css_source)
        self.assertIn("display: block; width: 100%; margin-top: 2px", css_source)
        self.assertNotIn(".energy-inverter .energy-mode-definition { display: none }", css_source)
        self.assertIn("transform: translate(-50%,-50%)", css_source)

    def test_lcd_information_pages_follow_the_manual_order(self) -> None:
        lcd = (WEB_ROOT / "scripts" / "lcd.js").read_text(encoding="utf-8")
        translations = (WEB_ROOT / "scripts" / "translations.js").read_text(encoding="utf-8")
        css_source = "\n".join(
            path.read_text(encoding="utf-8") for path in (WEB_ROOT / "styles").glob("*.css")
        )
        expected = {
            1: (83, 538, 91), 2: (129, 137, 537, 89),
            3: (129, 137, 545, 94), 4: (129, 137, 542, 93),
            5: (129, 137, 541, 92), 6: (151, 153),
            7: (159, 160, 130), 8: (157,), 9: (162,), 10: (163,),
        }
        for page, registers in expected.items():
            start = lcd.index(f"code: 'P{page}'")
            end_marker = f"code: 'P{page + 1}'" if page < 10 else "];\n      const page"
            end = lcd.index(end_marker, start)
            block = lcd[start:end]
            for register in registers:
                self.assertRegex(block, rf"(?:numberValue\(\[{register}\]\)|registerLabel\([^\n]*\b{register}\b|versionValue\([^\n]*\b{register}\b|interpretedValue\([^\n]*\b{register}\b)")
        self.assertIn("registerLabel(157, t('dailyPvEnergy'))", lcd)
        self.assertNotIn("code: 'P11'", lcd)
        self.assertNotIn("code: 'P12'", lcd)
        self.assertNotIn("registerLabel(403, t('bmsConnection'))", lcd[lcd.index("code: 'P1'"):lcd.index("code: 'P10'")])
        app = (WEB_ROOT / "scripts" / "app.js").read_text(encoding="utf-8")
        runtime = (ROOT / "solar_inverter" / "services" / "inverter_service_runtime.py").read_text(encoding="utf-8")
        self.assertIn("const lcdInformationPageCount = 10", app)
        self.assertIn('re.fullmatch(r"P(?:[1-9]|10)", clean_page)', runtime)
        self.assertNotRegex(lcd + translations, r"(?i)local(?:ьной|ьної)? SQLite")
        self.assertIn("justify-items: center; color: #fff; text-align: center", css_source)
        self.assertIn("display: grid; place-items: center; width: 100%; gap: 0", css_source)
        self.assertIn("color: #fff; font-size: 18px; font-weight: 950", css_source)
        self.assertIn("justify-items: center; text-align: center; font-size: 14px", css_source)
        self.assertIn(".lcd-readouts { grid-template-columns: repeat(2,minmax(0,1fr))", css_source)
        self.assertIn(".gauge-picker { width: calc(100% - 16px)", css_source)

    def test_lcd_main_screen_matches_device_layout_and_live_v131_values(self) -> None:
        html = (WEB_ROOT / "index.html").read_text(encoding="utf-8")
        lcd = (WEB_ROOT / "scripts" / "lcd.js").read_text(encoding="utf-8")
        css_source = dashboard_css()
        for element_id in (
            "lcd-device-display", "lcd-battery-voltage", "lcd-charge-voltage",
            "lcd-battery-current", "lcd-soc", "lcd-grid-voltage", "lcd-frequency",
            "lcd-ac2-voltage", "lcd-ac2-frequency", "lcd-output-voltage",
            "lcd-output-frequency", "lcd-pv-voltage", "lcd-pv-current",
            "lcd-pv-power", "lcd-pv-day-energy",
        ):
            self.assertIn(f'id="{element_id}"', html)
        self.assertIn("container-type: inline-size; width: 100%; min-width: 0; aspect-ratio: 1.65", css_source)
        self.assertIn(".lcd-battery-scale", css_source)
        for symbol_id in (
            "lcd-icon-source-square", "lcd-icon-source-wide", "lcd-icon-grid", "lcd-icon-arrow-long",
            "lcd-icon-arrow-compact", "lcd-icon-solar", "lcd-icon-sun",
            "lcd-icon-battery-vertical", "lcd-icon-battery-horizontal",
        ):
            self.assertIn(f'id="{symbol_id}"', html)
        self.assertIn(".lcd-battery-level-fill", css_source)
        self.assertIn(".lcd-digits-extra-long", css_source)
        self.assertIn("width: 19%; gap: .55cqw; overflow: hidden", css_source)
        self.assertIn(".lcd-panel { width: 100%; min-width: 0", css_source)
        self.assertIn("displayValue.length >= 8", lcd)
        self.assertIn(".lcd-column-input", css_source)
        self.assertIn(".lcd-column-output", css_source)
        self.assertIn(".lcd-column-pv", css_source)
        self.assertIn(".lcd-device-display > .lcd-column", css_source)
        self.assertIn("const outputVoltage = numberValue([537, 89])", lcd)
        self.assertIn("const outputFrequency = numberValue([91, 538])", lcd)
        self.assertIn("const pvVoltage = numberValue([609])", lcd)
        self.assertIn("const pvCurrent = sumValues([152, 155])", lcd)
        self.assertIn("const pvPower = numberValue([161]) ?? sumValues([153, 156])", lcd)
        self.assertIn("const dailyPvEnergy = numberValue([157])", lcd)
        self.assertIn("setMeasure('#lcd-pv-day-energy', dailyPvEnergy)", lcd)
        self.assertIn("--lcd-soc", lcd)
        self.assertIn('id="lcd-manual-context"', html)
        self.assertIn("manualContext.dataset.icons !== iconSignature", lcd)
        self.assertIn("manualContext.replaceChildren(icons)", lcd)
        self.assertIn("/static/assets/lcd-icons/${iconName}.svg", lcd)
        for icon_name in ("ac-input", "ac-output", "battery", "load", "solar", "charger", "energy"):
            self.assertTrue((WEB_ROOT / "assets" / "lcd-icons" / f"{icon_name}.svg").is_file())

    def test_fan_animation_keeps_one_timeline_across_data_updates(self) -> None:
        flow_path = WEB_ROOT / "scripts" / "energy-flow.js"
        probe = textwrap.dedent(
            """
            const fs = require('fs');
            global.window = {matchMedia: () => ({matches: false})};
            const classes = new Set();
            let animateCalls = 0;
            let playCalls = 0;
            let pauseCalls = 0;
            const rateUpdates = [];
            const animation = {
              playState: 'running', playbackRate: 1,
              pause() { pauseCalls += 1; this.playState = 'paused'; },
              play() { playCalls += 1; this.playState = 'running'; },
              updatePlaybackRate(value) { rateUpdates.push(value); this.playbackRate = value; },
              cancel() {}
            };
            const rotor = {
              style: {},
              animate() { animateCalls += 1; return animation; }
            };
            const row = {
              querySelector: () => rotor,
              classList: {
                add: name => classes.add(name),
                remove: name => classes.delete(name),
                toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); }
              }
            };
            const source = fs.readFileSync(process.argv[1], 'utf8');
            eval(source + `
              updateInverterFanAnimation(row, 50);
              updateInverterFanAnimation(row, 80);
              updateInverterFanAnimation(row, 0);
              updateInverterFanAnimation(row, 25);
              console.log(JSON.stringify({
                animateCalls, playCalls, pauseCalls, rateUpdates,
                playbackRate: animation.playbackRate,
                active: classes.has('active'),
                fallback: classes.has('css-animation-fallback')
              }));
            `);
            """
        )
        result = subprocess.run(
            [shutil.which("node") or "node", "-e", probe, str(flow_path)],
            check=True,
            capture_output=True,
            text=True,
        )
        self.assertEqual(
            json.loads(result.stdout),
            {
                "animateCalls": 1,
                "playCalls": 2,
                "pauseCalls": 2,
                "rateUpdates": [0, 0.5, 0.8, 0, 0, 0.25],
                "playbackRate": 0.25,
                "active": True,
                "fallback": False,
            },
        )

    def test_energy_and_gauge_renderers(self) -> None:
        renderer_path = WEB_ROOT / "scripts" / "renderers.js"
        probe = textwrap.dedent(
            """
            const fs = require('fs');
            const elements = new Map();
            function element(selector) {
              const value = {
                textContent: '', hidden: false, active: false,
                classList: {toggle(name, enabled) { if (name === 'active') value.active = enabled; }}
              };
              elements.set(selector, value);
              return value;
            }
            global.document = {querySelector: selector => elements.get(selector) || null};
            element('#card'); element('#value'); element('#values'); element('#direction');
            const source = fs.readFileSync(process.argv[1], 'utf8');
            eval(source + `
              DashboardRenderers.energyCard({
                nodeSelector: '#card', active: true,
                values: {'#value': '52.4 V'},
                valuesSelector: '#values', valuesVisible: false,
                directionSelector: '#direction', direction: 'CHARGING'
              });
              const meter = {key:'battery', colour:'#34d399', register:129, unit:'V', detail:'R129', interpretation:'PV mode'};
              const gauge = DashboardRenderers.gaugeCard({
                meter, label:'Battery', showSpeedometer:false, scale:'',
                translations:{drag:'Drag', remove:'Remove'}
              });
              console.log(JSON.stringify({
                active: elements.get('#card').active,
                value: elements.get('#value').textContent,
                hidden: elements.get('#values').hidden,
                direction: elements.get('#direction').textContent,
                noSpeedometer: gauge.includes('no-speedometer') && !gauge.includes('<svg'),
                register: gauge.includes('R129'),
                interpretation: gauge.includes('PV mode')
              }));
            `);
            """
        )
        result = subprocess.run(
            [shutil.which("node") or "node", "-e", probe, str(renderer_path)],
            check=True,
            capture_output=True,
            text=True,
        )
        self.assertEqual(
            json.loads(result.stdout),
            {
                "active": True,
                "value": "52.4 V",
                "hidden": True,
                "direction": "CHARGING",
                "noSpeedometer": True,
                "register": True,
                "interpretation": True,
            },
        )

    def test_ttn_v131_state_and_bit_field_interpretations(self) -> None:
        interpretation_path = WEB_ROOT / "scripts" / "interpretations.js"
        probe = textwrap.dedent(
            """
            const fs = require('fs');
            let currentLanguage = 'en';
            const source = fs.readFileSync(process.argv[1], 'utf8');
            eval(source + `
              const versionRegisters = [
                {register:17, raw:1, display:'1', available:true},
                {register:18, raw:31, display:'31', available:true},
                {register:27, raw:1, display:'1', available:true},
                {register:28, raw:31, display:'31', available:true},
                {register:61, raw:0, display:'0', available:true},
                {register:62, raw:72, display:'72', available:true}
              ];
              const englishState = registerInterpretation({register:67, raw:4, available:true, unit:'', name:'State'});
              currentLanguage = 'uk';
              const ukrainianState = registerInterpretation({register:67, raw:4, available:true, unit:'', name:'State'});
              currentLanguage = 'ru';
              const russianState = registerInterpretation({register:67, raw:4, available:true, unit:'', name:'State'});
              currentLanguage = 'en';
              console.log(JSON.stringify({
                pvMode: englishState,
                ukrainianState,
                russianState,
                serialWord: registerInterpretation({register:3, raw:18766, available:true, unit:'', name:'SN'}),
                serialPadding: registerInterpretation({register:10, raw:0, available:true, unit:'', name:'SN'}),
                protocolDisplay: registerVersionDisplay(versionRegisters[0], versionRegisters),
                controlSoftwareDisplay: registerVersionDisplay(versionRegisters[3], versionRegisters),
                deviceTypeDisplay: registerVersionDisplay(versionRegisters[5], versionRegisters),
                deviceTypeInterpretation: registerInterpretation({register:62, raw:72, available:true, versionDisplay: registerVersionDisplay(versionRegisters[5], versionRegisters)}),
                protocolMajor: registerInterpretation({register:17, raw:1, available:true, unit:'', name:'Version', versionDisplay:'V1.3'}),
                controlSoftwareMinor: registerInterpretation({register:28, raw:31, available:true, unit:'', name:'Version', versionDisplay:'V1.3'}),
                bmsCan: registerInterpretation({register:66, raw:1, available:true, unit:'', name:'Status'}),
                bmsPacket: registerInterpretation({register:402, raw:37, available:true, unit:'', name:'Packet ID'}),
                bmsDebugLocked: registerInterpretation({register:403, raw:2, available:true, unit:'', name:'Status'}),
                energyFlow: registerInterpretation({register:69, raw:(1 << 4) | (1 << 9), available:true, unit:'', name:'Flow status'}),
                faultsClear: registerInterpretation({register:71, raw:0, available:true, unit:'', name:'Fault'}),
                faults: registerInterpretation({register:71, raw:(1 << 1) | (1 << 4), available:true, unit:'', name:'Fault'}),
                fanStalled: registerInterpretation({register:802, raw:1, available:true, unit:'', name:'Fan status'}),
                unavailable: registerInterpretation({register:67, raw:null, available:false, unit:'', name:'State'})
              }));
            `);
            """
        )
        result = subprocess.run(
            [shutil.which("node") or "node", "-e", probe, str(interpretation_path)],
            check=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
        self.assertEqual(
            json.loads(result.stdout),
            {
                "pvMode": "PV mode",
                "ukrainianState": "Робота від PV",
                "russianState": "Работа от PV",
                "serialWord": "SN word R3: 0x494E → “IN”; each word contains up to two ASCII characters",
                "serialPadding": "SN word R10: 0x0000 is empty padding or the end of the identifier",
                "protocolDisplay": "V1.3",
                "controlSoftwareDisplay": "V1.3",
                "deviceTypeDisplay": "0x00000048 · Single inverter (device code 72)",
                "deviceTypeInterpretation": "0x00000048 · Single inverter (device code 72)",
                "protocolMajor": "protocol version: major component = 1; decoded display V1.3",
                "controlSoftwareMinor": "control-board software version: minor component = 31; decoded display V1.3",
                "bmsCan": "ID locked through CAN",
                "bmsPacket": "BMS packet ID: 37",
                "bmsDebugLocked": "BMS ID locked",
                "energyFlow": "PV \N{RIGHTWARDS ARROW} rectifier; Inverter \N{RIGHTWARDS ARROW} main output",
                "faultsClear": "No active faults",
                "faults": "Bus overvoltage; Overtemperature",
                "fanStalled": "Fan stalled or not rotating",
                "unavailable": "",
            },
        )

    def test_energy_flow_decodes_terminal_and_route_bits_without_guessing(self) -> None:
        flow_path = WEB_ROOT / "scripts" / "energy-flow.js"
        probe = textwrap.dedent(
            """
            const fs = require('fs');
            const source = fs.readFileSync(process.argv[1], 'utf8');
            eval(source + `
              const terminal = decodeEnergyTerminalState({available:true, raw:0x00AA});
              const flow = decodeEnergyFlowState({available:true, raw:592});
              console.log(JSON.stringify({
                terminal: {
                  grid: terminal.grid, generator: terminal.generator,
                  pv1: terminal.pv1, output: terminal.output,
                  battery: terminal.battery
                },
                flow: {
                  pvToRectifier: flow.pvToRectifier,
                  rectifierToInverter: flow.rectifierToInverter,
                  inverterToMainOutput: flow.inverterToMainOutput,
                  gridToLoad: flow.gridToLoad
                },
                invalid: decodeEnergyFlowState({available:true, raw:65535})
              }));
            `);
            """
        )
        result = subprocess.run(
            [shutil.which("node") or "node", "-e", probe, str(flow_path)],
            check=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
        self.assertEqual(
            json.loads(result.stdout),
            {
                "terminal": {"grid": 2, "generator": 2, "pv1": 2, "output": 2, "battery": 0},
                "flow": {
                    "pvToRectifier": True,
                    "rectifierToInverter": True,
                    "inverterToMainOutput": True,
                    "gridToLoad": False,
                },
                "invalid": None,
            },
        )

    def test_speedometers_are_only_used_for_measurable_values(self) -> None:
        gauge_path = WEB_ROOT / "scripts" / "gauges.js"
        probe = textwrap.dedent(
            """
            const fs = require('fs');
            const source = fs.readFileSync(process.argv[1], 'utf8');
            eval(source + `
              console.log(JSON.stringify({
                zeroVolts: showsSpeedometer({value: 0, unit: 'V'}),
                fanPercent: showsSpeedometer({value: 62, unit: '%'}),
                energy: showsSpeedometer({value: 12.5, unit: 'kWh'}),
                inverterStatus: showsSpeedometer({value: 3, unit: '', label: 'Status'}),
                batteryMode: showsSpeedometer({value: 2, unit: '', label: 'Battery mode'}),
                flags: showsSpeedometer({value: 255, unit: '', label: 'Flags'}),
                unavailable: showsSpeedometer({value: NaN, unit: 'A'})
              }));
            `);
            """
        )
        result = subprocess.run(
            [shutil.which("node") or "node", "-e", probe, str(gauge_path)],
            check=True,
            capture_output=True,
            text=True,
        )
        self.assertEqual(
            json.loads(result.stdout),
            {
                "zeroVolts": True,
                "fanPercent": True,
                "energy": True,
                "inverterStatus": False,
                "batteryMode": False,
                "flags": False,
                "unavailable": False,
            },
        )


if __name__ == "__main__":
    unittest.main()

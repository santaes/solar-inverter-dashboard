    const CHARTS_PER_PAGE = 12;
    let chartPage = 0;
    let chartsViewRenderPending = false;
    const hydratedChartHistoryPeriods = new Set();
    const GRID_CONSUMPTION_REGISTERS = new Set([449, 451, 453, 455]);
    const ENERGY_PERIOD_BY_REGISTER = new Map([
      [449, 'day'], [451, 'month'], [453, 'year'], [455, 'lifetime']
    ]);

    function chartPeriodForItem(item) {
      return ENERGY_PERIOD_BY_REGISTER.get(Number(item?.register)) || 'realtime';
    }

    function chartPeriodLabel(period) {
      const keys = {realtime: 'periodRealtime', day: 'periodDay', week: 'periodWeek', month: 'periodMonth', year: 'periodYear', lifetime: 'periodLifetime'};
      return t(keys[period] || keys.realtime);
    }

    function selectedChartPeriodLabel(items) {
      const periods = new Set(items.map(item => chartPeriodForItem(item)));
      return periods.size === 1 ? chartPeriodLabel([...periods][0]) : t('periodMixed');
    }

    const chartCanvasLayouts = new WeakMap();
    const visibleChartCanvases = new Set();
    const chartResizeObserver = typeof ResizeObserver === 'function'
      ? new ResizeObserver(entries => {
          entries.forEach(entry => {
            chartCanvasLayouts.set(entry.target, {
              width: entry.contentRect.width,
              height: entry.contentRect.height
            });
          });
          scheduleVisibleChartDraw();
        })
      : null;
    const chartVisibilityObserver = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(entries => {
          entries.forEach(entry => {
            if (entry.isIntersecting) visibleChartCanvases.add(entry.target);
            else visibleChartCanvases.delete(entry.target);
          });
          scheduleVisibleChartDraw();
        }, {rootMargin: '1000px 0px'})
      : null;

    function observeRenderedCharts() {
      chartResizeObserver?.disconnect();
      chartVisibilityObserver?.disconnect();
      visibleChartCanvases.clear();
      document.querySelectorAll('.chart-host[data-chart-key]').forEach(host => {
        if (chartResizeObserver) chartResizeObserver.observe(host);
        else chartCanvasLayouts.set(host, {width: 300, height: 220});
        if (chartVisibilityObserver) chartVisibilityObserver.observe(host);
        else visibleChartCanvases.add(host);
      });
    }

    function isTimelineValue(item) {
      const unit = String(item?.unit || '').trim();
      const register = Number(item?.register);
      return Number.isFinite(register)
        && GRID_CONSUMPTION_REGISTERS.has(register)
        && /^(?:k?wh)$/i.test(unit);
    }

    function timelineDefinitions() {
      // A counter can be present both as a dashboard meter and as the raw
      // physical register from the register map. They are the same series;
      // prefer the long-standing meter key so saved selections keep working.
      const preferred = [...chartDefinitions.values()]
        .filter(isTimelineValue)
        .sort((left, right) => {
          const leftMeter = left.key.startsWith('meter-') ? 0 : 1;
          const rightMeter = right.key.startsWith('meter-') ? 0 : 1;
          return leftMeter - rightMeter;
        });
      const registers = new Set();
      return preferred.filter(item => {
        if (registers.has(item.register)) return false;
        registers.add(item.register);
        return true;
      });
    }

    function collectChartDefinitions(data) {
      const definitions = new Map();
      const registerCategories = new Map(
        data.registers.map(register => [register.register, String(register.group || '')])
      );
      data.meters.forEach(meter => {
        const value = meter.available !== false && Number.isFinite(meter.value) ? meter.value : null;
        const bmsFormula = meter.register === 413 ? r413BmsFormula(value) : '';
        definitions.set(`meter-${meter.register}`, {
          key: `meter-${meter.register}`,
          register: meter.register,
          label: localizeApiField(meter, 'label'),
          detail: `${t('gaugeDetail', {
            unit: meter.unit || t('unitValue'),
            register: meter.register
          })}${bmsFormula ? ` · ${bmsFormula}` : ''}`,
          unit: meter.unit,
          value,
          minimum: meter.minimum,
          maximum: meter.maximum,
          available: meter.available ?? !String(meter.source || '').toLowerCase().includes('mbpoll'),
          category: registerCategories.get(meter.register) || '',
          source: bmsFormula ? `R413 · ${bmsFormula}` : localizeApiField(meter, 'source')
        });
      });
      data.registers.forEach(register => {
        const value = registerNumericValue(register);
        const bmsFormula = register.register === 413 && register.available ? r413BmsFormula(value) : '';
        const displayValue = registerVersionDisplay(register, data.registers);
        const decodedMeaning = registerInterpretation({...register, versionDisplay: displayValue});
        const localizedDescription = localizeApiField(register, 'description');
        const interpretation = [...new Set([localizedDescription, decodedMeaning].filter(Boolean))].join(' · ');
        const isPercentage = register.unit === '%';
        const chartValue = value === null
          ? null
          : isPercentage ? Math.max(0, Math.min(100, value)) : value;
        definitions.set(`register-${register.register}`, {
          key: `register-${register.register}`,
          register: register.register,
          label: localizeApiField(register, 'name'),
          detail: `R${register.register} · ${localizeApiField(register, 'group')}${bmsFormula ? ` · ${bmsFormula}` : ''}`,
          unit: register.unit,
          scale: Number(register.scale) || 1,
          signed: Boolean(register.signed),
          value: chartValue,
          displayValue,
          minimum: isPercentage ? 0 : null,
          maximum: isPercentage ? 100 : null,
          available: register.available,
          category: String(register.group || ''),
          period: ENERGY_PERIOD_BY_REGISTER.get(Number(register.register)) || '',
          interpretation,
          source: register.available
            ? `R${register.register}${bmsFormula ? ` · ${bmsFormula}` : ''}`
            : t('noData')
        });
      });
      return definitions;
    }
    function updateGaugeSelectionActions() {
      const allGaugesSelected = chartDefinitions.size > 0 && [...chartDefinitions.keys()].every(key =>
        dashboardSelections.has(key)
      );
      const setDisabled = (selector, disabled) => {
        const button = document.querySelector(selector);
        if (button.disabled !== disabled) button.disabled = disabled;
      };
      setDisabled('#select-all-gauges', chartDefinitions.size === 0 || allGaugesSelected);
      setDisabled('#clear-all-gauges', dashboardSelections.size === 0);
    }
    function renderGaugePickerList() {
      if (!document.querySelector('#gauge-picker').open) return;
      const host = document.querySelector('#gauge-picker-list');
      const query = document.querySelector('#gauge-picker-search').value.trim().toLowerCase();
      const matchingItems = [...chartDefinitions.values()].filter(item =>
        `${item.label} ${item.detail} ${item.interpretation || ''} ${item.unit}`.toLowerCase().includes(query)
      );
      const items = matchingItems;
      const hiddenCount = 0;
      const signature = `${currentLanguage}|${query}|${items.map(item =>
        `${item.key}:${item.label}:${item.detail}:${item.interpretation || ''}:${item.unit}:${dashboardSelections.has(item.key)}`).join('|')}`;
      if (host.dataset.signature === signature) {
        updateGaugeSelectionActions();
        return;
      }
      host.dataset.signature = signature;
      host.innerHTML = items.map(item => `<label class="gauge-picker-option">
        <input type="checkbox" data-picker-value-key="${item.key}" ${dashboardSelections.has(item.key) ? 'checked' : ''}>
        <span class="gauge-picker-name">${item.label}<small>${item.detail}${item.unit ? ` · ${item.unit}` : ''}${item.interpretation ? `<br>${item.interpretation}` : ''}</small></span>
      </label>`).join('') + (hiddenCount > 0
        ? `<div class="value-list-limit">${t('moreValuesAvailable', {count: hiddenCount})}</div>`
        : '');
      updateGaugeSelectionActions();
    }
    let gaugeSelectionRenderPending = false;
    function renderGaugeSelectionChanges() {
      if (gaugeSelectionRenderPending) return;
      gaugeSelectionRenderPending = true;
      updateGaugeSelectionActions();
      requestAnimationFrame(() => window.setTimeout(() => {
        gaugeSelectionRenderPending = false;
        saveSelections('inverter-dashboard-gauges-v2', dashboardSelections);
        if (!document.querySelector('#dashboard-view').hidden) renderDashboardValues();
        if (!document.querySelector('#charts-view').hidden) {
          renderChartCards();
        }
        if (document.querySelector('#gauge-picker').open) renderGaugePickerList();
      }, 0));
    }
    function selectAllGaugeSelections() {
      chartDefinitions.forEach((_item, key) => dashboardSelections.add(key));
      renderGaugeSelectionChanges();
    }
    function clearDashboardSelections() {
      dashboardSelections.clear();
      renderGaugeSelectionChanges();
    }
    function synchronizeTimelineCharts() {
      const timelineKeys = new Set(timelineDefinitions().map(item => item.key));
      chartSelections.forEach(key => {
        if (timelineKeys.has(key)) return;
        chartSelections.delete(key);
        chartHistory.delete(key);
      });
      if (!chartSelections.size) timelineKeys.forEach(key => chartSelections.add(key));
    }

    function renderChartSelectionList() {
      const host = document.querySelector('#chart-selection-list');
      if (!host) return;
      const query = document.querySelector('#chart-selection-search').value.trim().toLowerCase();
      const items = timelineDefinitions().filter(item =>
        `${item.label} ${item.detail} ${item.unit}`.toLowerCase().includes(query)
      );
      const signature = `${currentLanguage}|${query}|${items.map(item =>
        `${item.key}:${item.label}:${item.detail}:${item.unit}:${chartSelections.has(item.key)}`
      ).join('|')}`;
      // Polls and demo frames update values continuously. Preserve the existing
      // checkbox nodes unless the selectable chart list actually changed.
      if (host.dataset.signature === signature) return;
      host.dataset.signature = signature;
      host.innerHTML = items.map(item => `<label class="chart-selection-option">
        <input type="checkbox" data-chart-selection-key="${item.key}" ${chartSelections.has(item.key) ? 'checked' : ''}>
        <span>${item.label}<small>${item.detail}${item.unit ? ` · ${item.unit}` : ''}</small></span>
      </label>`).join('') || `<div class="chart-empty">${t('noData')}</div>`;
    }

    function setChartSelection(key, selected) {
      if (!timelineDefinitions().some(item => item.key === key)) return;
      if (selected) {
        chartSelections.add(key);
        if (!chartHistory.has(key)) chartHistory.set(key, []);
      } else {
        chartSelections.delete(key);
        chartHistory.delete(key);
      }
      saveSelections('inverter-chart-values-v3', chartSelections);
      renderChartSelectionList();
      renderChartCards();
    }
    function openGaugePicker() {
      const picker = document.querySelector('#gauge-picker');
      // Rebuild from the original server labels on every open so the dialog
      // can never retain labels produced for a previously selected language.
      if (lastData) chartDefinitions = collectChartDefinitions(dashboardDefinitionData(lastData));
      if (typeof picker.showModal === 'function') picker.showModal();
      else picker.setAttribute('open', '');
      requestAnimationFrame(() => window.setTimeout(() => {
        renderGaugePickerList();
        document.querySelector('#gauge-picker-search').focus({preventScroll: true});
      }, 0));
    }
    function updateChartDefinitions(data) {
      const next = collectChartDefinitions(data);
      const chartMetadataSignature = definitions => [...definitions.values()]
        .filter(isTimelineValue)
        .map(item => `${item.key}:${item.label}:${item.detail}:${item.unit}:${chartPeriodForItem(item)}`)
        .join('|');
      const oldChartMetadata = chartMetadataSignature(chartDefinitions);
      const nextChartMetadata = chartMetadataSignature(next);
      chartDefinitions = next;
      synchronizeTimelineCharts();
      if (oldChartMetadata !== nextChartMetadata) {
        // Do not let unrelated live register states rebuild graph controls.
        // Only the small set of selectable time-series metadata can do that.
        renderChartSelectionList();
        renderChartCards();
      }
      renderGaugePickerList();
      if (!chartDemoRunning) renderDashboardValues();
    }
    function renderChartCards() {
      if (document.querySelector('#charts-view').hidden) return;
      const grid = document.querySelector('#chart-grid');
      const selected = timelineDefinitions().map(item => item.key)
        .filter(key => chartSelections.has(key));
      document.querySelector('#chart-demo-button').disabled = false;
      document.querySelector('#chart-selection-count').textContent =
        selected.length ? t('chartCount', {
          count: selected.length,
          period: selectedChartPeriodLabel(selected.map(key => chartDefinitions.get(key)))
        }) : t('noValuesSelected');

      if (!selected.length) {
        chartPage = 0;
        grid.dataset.signature = `${currentLanguage}|empty`;
        grid.innerHTML = `<div class="chart-empty">${t('selectValues')}</div>`;
        observeRenderedCharts();
        return;
      }

      const pageCount = Math.ceil(selected.length / CHARTS_PER_PAGE);
      chartPage = Math.max(0, Math.min(chartPage, pageCount - 1));
      const pageStart = chartPage * CHARTS_PER_PAGE;
      const pageItems = selected.slice(pageStart, pageStart + CHARTS_PER_PAGE);
      const signature = `${currentLanguage}|${chartPage}|${selected.length}|${pageItems.map(key => {
        const item = chartDefinitions.get(key);
        return `${key}:${item.label}:${item.detail}:${item.interpretation || ''}:${item.unit}:${chartPeriodForItem(item)}`;
      }).join('|')}`;
      if (grid.dataset.signature === signature) {
        scheduleVisibleChartDraw();
        return;
      }
      grid.dataset.signature = signature;
      const pagination = pageCount > 1 ? `<nav class="chart-pagination" aria-label="${t('chartPagination')}">
        <button type="button" data-chart-page="previous" ${chartPage === 0 ? 'disabled' : ''}>${t('previousPage')}</button>
        <span>${t('chartPageSummary', {page: chartPage + 1, pages: pageCount})}</span>
        <button type="button" data-chart-page="next" ${chartPage === pageCount - 1 ? 'disabled' : ''}>${t('nextPage')}</button>
      </nav>` : '';
      grid.innerHTML = pagination + pageItems.map((key, pageIndex) => {
        const item = chartDefinitions.get(key);
        const index = pageStart + pageIndex;
        const colour = chartColour(item, index);
        const period = chartPeriodLabel(chartPeriodForItem(item));
        return `<article class="chart-card" style="--accent:${colour}" data-open-chart="${key}" role="button" tabindex="0" aria-label="${t('chartAria', {label: item.label, period})}">
          <div class="chart-card-head">
            <h3 title="${item.label}">${item.label}</h3>
            <div class="chart-latest" id="latest-${key}">—</div>
          </div>
          <div class="muted">${item.detail} · ${t('chartPeriodValue', {period})}</div>
          ${item.interpretation ? `<div class="chart-interpretation">${item.interpretation}</div>` : ''}
          <div class="chart-host" id="chart-${key}" data-chart-key="${key}" data-chart-colour="${colour}" aria-hidden="true"></div>
        </article>`;
      }).join('');
      observeRenderedCharts();
    }
    function changeChartPage(direction) {
      chartPage += direction === 'next' ? 1 : -1;
      renderChartCards();
    }
    function scheduleChartsViewRender() {
      if (chartsViewRenderPending) return;
      chartsViewRenderPending = true;
      requestAnimationFrame(() => window.setTimeout(() => {
        chartsViewRenderPending = false;
        if (document.querySelector('#charts-view').hidden) return;
        renderChartSelectionList();
        renderChartCards();
        void hydrateChartHistory();
      }, 0));
    }

    async function hydrateChartHistory() {
      if (chartDemoRunning) return;
      const periods = [...new Set(timelineDefinitions().map(chartPeriodForItem))]
        .filter(period => !hydratedChartHistoryPeriods.has(period));
      if (!periods.length) return;
      await Promise.all(periods.map(async period => {
        try {
          const response = await fetch(`/api/historical?period=${encodeURIComponent(period)}`, {cache: 'no-store'});
          if (!response.ok) return;
          const data = await response.json();
          if (!Array.isArray(data.points)) return;
          timelineDefinitions().filter(item => chartPeriodForItem(item) === period).forEach(item => {
            const history = data.points.flatMap(point => Number.isFinite(Number(point?.[item.register]))
              && Number.isFinite(Number(point?.time))
              ? [{time: Number(point.time), value: Number(point[item.register])}]
              : []);
            if (history.length) chartHistory.set(item.key, history);
          });
          hydratedChartHistoryPeriods.add(period);
        } catch (error) {
          console.debug('Chart history unavailable:', error.message);
        }
      }));
      if (!document.querySelector('#charts-view').hidden) scheduleVisibleChartDraw();
    }
    function recordChartSamples(data) {
      // Demo frames are owned by the demo loop, which updates existing chart
      // histories and schedules a single in-place redraw.  Live polling still
      // arrives while the demo is running; rebuilding definitions or drawing
      // from here would compete with that loop and visibly remount the charts.
      if (chartDemoRunning) return;
      updateChartDefinitions(data);
      const now = Date.now();
      chartSelections.forEach(key => {
        const item = chartDefinitions.get(key);
        if (!item || item.available === false || !Number.isFinite(item.value)) return;
        const history = chartHistory.get(key) || [];
        history.push({time: now, value: item.value});
        trimChartHistory(history, now, item);
        chartHistory.set(key, history);
      });
      if (!document.querySelector('#charts-view').hidden) drawAllCharts();
    }
    function interpolate(start, end, ratio) {
      return start + (end - start) * Math.max(0, Math.min(1, ratio));
    }
    function realisticDemoScenario(elapsedSeconds) {
      return capturedRegisterLogDemoScenario(elapsedSeconds);
    }
    // Retained for future synthetic examples; the user-facing demo replays
    // the captured inverter data above.
    function legacySyntheticDemoScenario(elapsedSeconds) {
      const second = elapsedSeconds % 120;
      const ripple = Math.sin(second * .37);
      let gridAvailable = true;
      let pvVoltage;
      let pvPower;
      let loadPower;
      let batteryCurrent;
      let batterySoc;
      let statusCode;
      let outputPriority;
      let chargingPriority;
      let caseKey;
      let generatorPower = 0;
      let parallelState = 0;

      if (second < 20) {
        // PV supplies the home and charges the battery; surplus production is curtailed.
        gridAvailable = false;
        pvVoltage = 326 + ripple * 4;
        pvPower = 7200 + Math.sin(second * .21) * 260;
        loadPower = 2500 + Math.sin(second * .29) * 140;
        batteryCurrent = 42 + ripple * 1.5;
        batterySoc = 72 + second * .08;
        statusCode = 4;
        outputPriority = 2;
        chargingPriority = 1;
        caseKey = 'demoSolarChargeExport';
      } else if (second < 40) {
        // Grid supplies the home and charges the battery.
        pvVoltage = 0;
        pvPower = 0;
        loadPower = 2900 + ripple * 130;
        batteryCurrent = 18 + ripple;
        batterySoc = 73.6 + (second - 20) * .05;
        statusCode = 3;
        outputPriority = 0;
        chargingPriority = 0;
        caseKey = 'demoGridHome';
        parallelState = 1;
      } else if (second < 60) {
        // With PV and AC input unavailable, the battery supplies the home.
        gridAvailable = false;
        pvVoltage = 0;
        pvPower = 0;
        loadPower = 2300 + Math.sin(second * .31) * 160;
        batteryCurrent = -loadPower / 51.8;
        batterySoc = 74.4 - (second - 40) * .09;
        statusCode = 5;
        outputPriority = 0;
        chargingPriority = 2;
        caseKey = 'demoBatteryHome';
        parallelState = 2;
      } else if (second < 80) {
        // Solar supplies the home; surplus production is curtailed and the battery remains idle.
        gridAvailable = false;
        pvVoltage = 324 + ripple * 3;
        pvPower = 5600 + ripple * 220;
        loadPower = 2700 + Math.sin(second * .27) * 130;
        batteryCurrent = ripple * .08;
        batterySoc = 100;
        statusCode = 4;
        outputPriority = 2;
        chargingPriority = 1;
        caseKey = 'demoSolarExport';
        parallelState = 3;
      } else if (second < 100) {
        // The generator is a one-way source that supplies the inverter and home.
        gridAvailable = false;
        pvVoltage = 0;
        pvPower = 0;
        loadPower = 2800 + Math.sin(second * .25) * 120;
        batteryCurrent = 0;
        batterySoc = 100;
        statusCode = 6;
        outputPriority = 3;
        chargingPriority = 0;
        generatorPower = 3400 + ripple * 180;
        caseKey = 'demoGeneratorHome';
        parallelState = 4;
      } else {
        // With AC input unavailable, solar and battery jointly supply the home.
        gridAvailable = false;
        pvVoltage = 320 + ripple * 3;
        pvPower = 1500 + ripple * 120;
        loadPower = 2500 + Math.sin(second * .25) * 120;
        batteryCurrent = -(20 + ripple);
        batterySoc = 72.5 - (second - 100) * .07;
        statusCode = 4;
        outputPriority = 2;
        chargingPriority = 1;
        caseKey = 'demoMixedSources';
      }

      const gridVoltage = gridAvailable ? 230 + Math.sin(second * .19) * 1.4 : 0;
      const gridFrequency = gridAvailable ? 50 + Math.sin(second * .17) * .025 : 0;
      const batteryVoltage = 52.1 + (batterySoc - 75) * .09 + batteryCurrent * .018;
      const batteryTemperature = 29.5 + Math.abs(batteryCurrent) * .055 + Math.sin(second * .08) * .3;
      const batteryPower = batteryVoltage * batteryCurrent;
      const fanSpeed = Math.min(100, Math.max(0,
        second / 120 * 100
      ));
      const powerFactor = .86;
      const apparentLoadPower = loadPower / powerFactor;
      const gridPower = gridAvailable ? Math.max(0,
        loadPower + Math.max(0, batteryPower)
          - Math.max(0, pvPower) - Math.max(0, -batteryPower) - Math.max(0, generatorPower)
      ) : 0;
      const inputMode = generatorPower > 20 ? 2 : 0;
      const generatorVoltage = generatorPower > 20 ? 230 : 0;
      const generatorCurrent = generatorVoltage > 0 ? generatorPower / generatorVoltage : 0;
      const pvChargingCurrent = pvPower > loadPower ? Math.max(0, batteryCurrent) : 0;
      const gridTerminalState = gridAvailable ? 2 : 0;
      const generatorTerminalState = generatorPower > 20 ? 2 : 0;
      const pv1TerminalState = pvPower > 20 ? 2 : 0;
      const outputTerminalState = loadPower > 0 ? 1 : 0;
      const batteryTerminalState = batteryCurrent > .3 ? 3 : batteryCurrent < -.3 ? 2 : batterySoc <= 20 ? 1 : 4;
      const chargingStage = batteryCurrent > .3 ? 1 : 0;
      const energyTerminalState = gridTerminalState
        | generatorTerminalState << 2
        | pv1TerminalState << 4
        | outputTerminalState << 6
        | batteryTerminalState << 8
        | chargingStage << 11;
      const energyFlowState = (gridPower > 20 ? (1 << 0) | (1 << 1) : 0)
        | (generatorPower > 20 ? (1 << 2) | (1 << 3) : 0)
        | (pvPower > 20 ? 1 << 4 : 0)
        | (batteryCurrent > .3 ? 1 << 5 : 0)
        | (gridPower > 20 || generatorPower > 20 || pvPower > 20 ? 1 << 6 : 0)
        | (batteryCurrent < -.3 ? 1 << 8 : 0)
        | (loadPower > 0 ? 1 << 9 : 0);
      const energyProgress = second / 120;
      return {
        elapsedSeconds: second,
        statusCode,
        caseKey,
        generatorPower,
        pvVoltage,
        pvPower,
        values: new Map([
          // TTN-INV external Modbus map V1.31. Public R numbers are the
          // workbook's zero-based addresses plus one.
          // Identity captured from the real inverter on 2026-08-19.
          [1, 0x4a32], [2, 0x3531], [3, 0x3130], [4, 0x3236], [5, 0x362d],
          [6, 0x3148], [7, 0x3030], [8, 0x3032], [9, 0x3800], [10, 0],
          [17, 1], [18, 5], [27, 768], [28, 1],
          [57, 0], [58, 64], [59, 0], [60, 0], [61, 0], [62, 0],
          [63, 0], [64, 0], [65, 768], [66, 2], [67, statusCode],
          [68, energyTerminalState],
          [69, energyFlowState],
          [70, parallelState], [71, 0], [72, 0], [73, 0], [74, 0],
          [75, 0], [76, 0], [77, 1], [78, 8224], [79, 0], [80, 1],
          [81, gridVoltage], [82, gridVoltage > 0 ? gridPower / gridVoltage : 0],
          [83, gridFrequency], [84, gridPower],
          [85, generatorVoltage], [86, generatorCurrent], [87, generatorVoltage > 0 ? 50 : 0],
          [88, generatorPower],
          [89, 230 + Math.sin(second * .13) * .8], [90, loadPower / 230], [91, 50],
          [92, loadPower], [93, apparentLoadPower], [94, loadPower / 120], [95, gridPower],
          [129, batteryVoltage], [130, batteryCurrent],
          [131, 0], [132, 0],
          [133, batterySoc], [134, batteryPower],
          [135, 0], [136, 0],
          [137, batteryVoltage], [138, batteryCurrent], [139, batterySoc],
          [140, batteryTemperature + .6], [141, 57.1],
          [142, 170], [143, 128], [144, 1], [145, 1], [146, 0], [147, 0],
          [148, 0], [149, 0], [150, 0],
          [151, pvVoltage], [152, pvVoltage > 0 ? pvPower / pvVoltage : 0],
          [153, pvPower], [154, 0], [155, 0], [156, 0],
          [157, 8.4 + energyProgress], [158, 1820.7 + energyProgress],
          [159, pvChargingCurrent], [160, 0], [161, pvPower],
          [162, 428.6 + energyProgress], [163, 3420.4 + energyProgress],
          [164, 4.2 + energyProgress], [165, 96.3 + energyProgress],
          [166, 812.5 + energyProgress], [167, 6432.8 + energyProgress],
          [168, 3.1 + energyProgress], [169, 71.8 + energyProgress],
          [170, 605.7 + energyProgress], [171, 4890.4 + energyProgress],
          [172, 7.8 + energyProgress], [173, 181.6 + energyProgress],
          [174, 1530.2 + energyProgress], [175, 12270.5 + energyProgress],
          [176, 6.9 + energyProgress], [177, 162.4 + energyProgress],
          [178, 1378.1 + energyProgress], [179, 11042.7 + energyProgress],
          [180, 1.2 + energyProgress], [181, 28.5 + energyProgress],
          [182, 241.8 + energyProgress], [183, 1920.6 + energyProgress],
          [184, 2.8 + energyProgress], [185, 65.7 + energyProgress],
          [186, 558.4 + energyProgress], [187, 4471.2 + energyProgress],
          [188, loadPower], [189, 0], [190, 0],
          [321, inputMode], [322, parallelState], [323, outputPriority], [324, chargingPriority], [325, statusCode],
          [337, 2], [339, batterySoc],
          [341, 47.5], [342, batteryVoltage],
          [343, Math.max(0, -batteryCurrent)], [344, Math.max(0, batteryCurrent)],
          [345, 61], [346, 48], [349, 48], [350, 2],
          [375, batteryCurrent > 1 ? 1 : batteryCurrent < -1 ? 0 : 3],
          [376, 57.1], [377, 54.4], [378, 80], [379, 80], [383, 58.4],
          [384, 2], [385, 2], [386, 30],
          [401, 1], [402, 1], [403, 8306],
          [404, batteryVoltage], [405, batteryCurrent],
          [406, batteryTemperature + .6], [407, batterySoc], [408, 100],
          [409, 128], [410, 170], [411, 57.1], [412, 80], [413, 120],
          [414, 20], [415, 10], [416, 48], [417, 57.6], [418, 0], [419, 0],
          [433, gridVoltage], [434, gridVoltage > 0 ? gridPower / gridVoltage : 0],
          [435, gridFrequency], [436, gridPower], [437, gridPower],
          [448, 0], [449, 840], [450, 0], [451, 9630],
          [452, 1], [453, 18420], [454, 3], [455, 42100],
          [529, outputPriority], [530, inputMode],
          [537, 230], [538, 50], [539, loadPower / 230], [541, loadPower],
          [542, apparentLoadPower], [545, loadPower / 120],
          [801, fanSpeed], [802, fanSpeed > 0 ? 1 : 0],
          [817, 34.2 + pvPower / 12000], [818, 46.2], [819, 38.1],
          [820, 36.8], [821, 27.4], [822, batteryTemperature],
          [823, 31.5 + pvPower / 10000],
          [16641, 2], [16642, 0],
          [16643, outputPriority], [16644, inputMode], [16645, chargingPriority],
          [16646, 60], [16647, 10], [16648, 0],
          [16649, 44], [16650, 42], [16651, 56.4], [16652, 54],
          [16653, 46], [16654, 52], [16655, 154], [16656, 264]
        ])
      };
    }
    function demoSolarEnergySummary(elapsedSeconds) {
      // The 120-second demo represents a compressed 12-hour operating window.
      const boundedSeconds = Math.max(0, Math.min(120, elapsedSeconds));
      const simulatedSecondsPerDemoSecond = 360;
      const integrationStep = .25;
      let generatedKwh = 0;
      for (let second = 0; second < boundedSeconds; second += integrationStep) {
        const step = Math.min(integrationStep, boundedSeconds - second);
        const pvPower = realisticDemoScenario(second + step / 2).pvPower;
        generatedKwh += Math.max(0, Number(pvPower) || 0)
          * step * simulatedSecondsPerDemoSecond / 3_600_000;
      }
      return {
        today_kwh: generatedKwh,
        week_kwh: 93.8 + generatedKwh,
        month_kwh: 428.6 + generatedKwh,
        year_kwh: 3420.4 + generatedKwh,
        error: ''
      };
    }
    function demoRawValue(register, value) {
      const scale = Number(register.scale) || 1;
      const registerNumber = Number(register.register);
      const protocolValue = registerNumber === 134 ? Math.abs(value) : value;
      let base = Math.round(protocolValue / scale);
      base = register.signed
        ? Math.max(-32768, Math.min(32767, base))
        : Math.max(0, Math.min(65533, base));
      let raw = base < 0 ? base + 65536 : base;
      // V1.31 reserves 0xFFFE and 0xFFFF for unsupported/no-data.
      if (raw === 65534 || raw === 65535) raw = 0;
      return raw;
    }
    function demoDisplayValue(value, scale) {
      if (scale === .01) return value.toFixed(2);
      if (scale === .1) return value.toFixed(1);
      if (scale === 1) return Math.round(value).toString();
      return Number(value.toFixed(3)).toString();
    }
    function demoRegisterReading(register, requestedValue) {
      const scale = Number(register.scale) || 1;
      const raw = demoRawValue(register, requestedValue);
      let base = register.signed && raw >= 32768 ? raw - 65536 : raw;
      let value = base * scale;
      if (Number(register.register) === 134 && requestedValue < 0) value = -value;
      value = Number(value.toFixed(6));
      return {raw, value, display: demoDisplayValue(value, scale), available: true};
    }
    function demoCapturedRawReading(register, raw) {
      if (!Number.isInteger(raw) || raw >= 65534) return {raw, value: null, display: '—', available: false};
      const value = (register.signed && raw >= 32768 ? raw - 65536 : raw) * (Number(register.scale) || 1);
      return {raw, value: Number(value.toFixed(6)), display: demoDisplayValue(value, Number(register.scale) || 1), available: true};
    }
    function continuousDemoChartValue(item, history) {
      const value = Number(item?.value);
      const previous = history.at(-1)?.value;
      if (!Number.isFinite(value) || !Number.isFinite(previous)) return value;
      if (!/^(?:k?wh)$/i.test(String(item.unit || ''))) return value;
      const scale = Math.max(.001, Number(item.scale) || .1);
      return demoRegisterReading(item, Math.max(value, previous + scale * .01)).value;
    }
    function demoFallbackValue(register, elapsedSeconds) {
      const registerNumber = Number(register.register) || 0;
      const scale = Number(register.scale) || 1;
      const text = `${register.group || ''} ${register.name || ''} ${register.unit || ''}`.toLocaleLowerCase();
      const phase = Math.sin(elapsedSeconds * .12 + registerNumber * .37);
      const wave = (base, amplitude) => base + phase * amplitude;

      if (String(register.unit || '').trim() === '%') return Math.max(0, Math.min(100, wave(65, 12)));
      if (/(status|state|mode|priority|alarm|fault|warning|enable|switch|стан|режим|пріоритет|состояни|приоритет|авар|помил|ошиб)/u.test(text)) {
        return registerNumber % 4;
      }
      if (/(°c|температур|temperature)/u.test(text)) return wave(29, 2.5);
      if (/(hz|герц|частот|frequency)/u.test(text)) return wave(50, .04);
      if (/(kwh|квт·год|квтч)/u.test(text)) return 125 + registerNumber % 600 + elapsedSeconds / 120;
      if (/(wh|ват.*год)/u.test(text)) return 1200 + registerNumber % 5000 + elapsedSeconds * 2;
      if (/(kw|квт)/u.test(text)) return wave(2.4, .35);
      if (/(w|ват)/u.test(text)) return Math.max(0, wave(1800 + registerNumber % 900, 180));
      if (/(volt|вольт|\bv\b)/u.test(text)) {
        if (/(battery|bms|батар|акумулятор|аккумулятор)/u.test(text)) return wave(52.4, .35);
        if (/(pv|solar|соняч|солнеч)/u.test(text)) return wave(320, 4);
        return wave(230, 1.2);
      }
      if (/(amp|ампер|\ba\b)/u.test(text)) return wave(8, 1.4);
      if (/(rpm|об\/хв|об\/мин)/u.test(text)) return Math.max(0, wave(1400, 180));
      return scale * (10 + registerNumber % 90) + phase * scale;
    }
    function applyDemoEnergyFrame(scenario) {
      demoFlowCase = scenario.caseKey;
      demoRegisterRows = lastData ? lastData.registers.map(register => {
        const scenarioValue = scenario.values.get(register.register);
        const capturedRaw = CAPTURED_REGISTER_LOG_RAW_VALUES.get(Number(register.register));
        const reading = Number.isFinite(scenarioValue)
          ? demoRegisterReading(register, scenarioValue)
          : Number.isInteger(capturedRaw)
            ? demoCapturedRawReading(register, capturedRaw)
            : register.supported
              ? demoRegisterReading(register, demoFallbackValue(register, scenario.elapsedSeconds))
              : {raw: null, value: null, display: '—', available: false};
        return {
          ...register,
          ...reading
        };
      }) : [];
      const demoRowsByNumber = new Map(
        demoRegisterRows.map(register => [Number(register.register), register])
      );
      demoGeneratorPower = registerNumericValue(demoRowsByNumber.get(88)) ?? 0;
      demoPvVoltage = registerNumericValue(demoRowsByNumber.get(151)) ?? 0;
      demoPvPower = registerNumericValue(demoRowsByNumber.get(161)) ?? 0;
      if (lastData) {
        updateChartDefinitions(dashboardDefinitionData(lastData));
        // A demo flow change must be observable from every tab, not only
        // while the Dashboard tab happens to be visible.
        renderEnergyFlow(lastData, demoRegisterRows);
        if (!document.querySelector('#lcd-view').hidden) {
          renderLcd(lastData, demoRegisterRows);
        }
      }
    }
    function trimChartHistory(history, currentTime, item = null) {
      const windowMilliseconds = getPeriodWindowSeconds(chartPeriodForItem(item)) * 1000;
      const oldestAllowed = currentTime - windowMilliseconds;
      while (history.length && history[0].time < oldestAllowed) history.shift();
    }

    function getPeriodWindowSeconds(period) {
      const periodMap = {
        'realtime': 120,
        'day': 86400,
        'week': 604800,
        'month': 2592000,
        'year': 31536000,
        'lifetime': Number.POSITIVE_INFINITY,
        '24h': 86400,
        '7d': 604800,
        '30d': 2592000
      };
      return periodMap[period] || 120;
    }

    function formatChartTime(timestamp) {
      const locale = currentLanguage === 'uk' ? 'uk-UA' : currentLanguage === 'ru' ? 'ru-RU' : 'en-GB';
      return new Date(timestamp).toLocaleTimeString(locale, {
        timeZone: 'Europe/Madrid',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    }
    async function fillChartExampleData() {
      if (chartDemoRunning) {
        chartDemoCancelRequested = true;
        return;
      }
      const selected = [...chartSelections].filter(key => chartDefinitions.has(key));
      const registerKeys = [...chartDefinitions.keys()].filter(key => key.startsWith('register-'));
      const meterKeys = [...chartDefinitions.keys()].filter(key => key.startsWith('meter-'));
      const demoKeys = [...new Set([...registerKeys, ...meterKeys, ...selected])];
      if (!demoKeys.length) return;

      const buttons = document.querySelectorAll('.all-data-demo-button');
      const setButtonState = (text, disabled = false) => buttons.forEach(button => {
        button.textContent = text;
        button.disabled = disabled;
      });
      chartDemoRunning = true;
      chartDemoCancelRequested = false;
      // Establish the first demo frame as the baseline. Every later scenario
      // change can then notify about grid and battery flow changes.
      lastRealFlowState = null;
      document.documentElement.classList.add('demo-energy-flow');
      demoKeys.forEach(key => chartHistory.set(key, []));
      const initialScenario = realisticDemoScenario(0);
      applyDemoEnergyFrame(initialScenario);
      if (lastData) render(lastData);
      synchronizeDemoChartDefinitions(initialScenario);
      seedDemoHistory();
      if (!document.querySelector('#dashboard-view').hidden) renderDashboardValues();
      drawAllCharts();

      try {
        const demoStartedAt = Date.now();
        const demoDuration = 120000;

        while (Date.now() - demoStartedAt < demoDuration) {
          const elapsedBeforeWait = Math.floor((Date.now() - demoStartedAt) / 1000);
          setButtonState(t('stopDemo', {
            elapsed: elapsedBeforeWait,
            seconds: Math.floor(demoDuration / 1000),
            count: registerKeys.length
          }));
          const pollRateSelect = document.querySelector('#modbus-poll-rate');
          const selectedIndex = pollRateSelect ? Number(pollRateSelect.value) : 0;
          await wait(requestIntervals[selectedIndex] ?? 2000);
          if (chartDemoCancelRequested) break;

          const now = Date.now();
          const elapsedSeconds = Math.min(119.999, (now - demoStartedAt) / 1000);
          const scenario = realisticDemoScenario(elapsedSeconds);
          applyDemoEnergyFrame(scenario);
          synchronizeDemoChartDefinitions(scenario);
          registerKeys.forEach(key => {
            const item = chartDefinitions.get(key);
            if (!item) return;
            const history = chartHistory.get(key) || [];
            const value = continuousDemoChartValue(item, history);
            item.value = value;
            history.push({time: now, value});
            trimChartHistory(history, now, item);
            chartHistory.set(key, history);
          });
          meterKeys.forEach(key => {
            const item = chartDefinitions.get(key);
            if (!item) return;
            const history = chartHistory.get(key) || [];
            const value = continuousDemoChartValue(item, history);
            item.value = value;
            history.push({time: now, value});
            trimChartHistory(history, now, item);
            chartHistory.set(key, history);
          });
          const elapsed = Math.min(
            Math.floor(demoDuration / 1000),
            Math.floor((now - demoStartedAt) / 1000)
          );
          setButtonState(t('stopDemo', {
            elapsed,
            seconds: Math.floor(demoDuration / 1000),
            count: registerKeys.length
          }));
          if (!document.querySelector('#dashboard-view').hidden) {
            renderDashboardValues();
            scheduleRegisterRender(demoRegisterRows);
            renderGridConsumptionEnergy(demoRegisterRows);
          }
          if (!document.querySelector('#charts-view').hidden) scheduleVisibleChartDraw();
          if (!document.querySelector('#register-map-view').hidden && lastData) {
            renderRegisterMap(registerMapDisplayData(lastData));
          }
        }
      } finally {
        chartDemoRunning = false;
        chartDemoCancelRequested = false;
        lastRealFlowState = null;
        document.documentElement.classList.remove('demo-energy-flow');
        demoRegisterRows = null;
        demoFlowCase = '';
        demoGeneratorPower = 0;
        demoPvVoltage = 0;
        demoPvPower = 0;
        setButtonState(t('runDemo'));
        if (lastData) {
          recordChartSamples(lastData);
          render(lastData);
        }
      }
    }

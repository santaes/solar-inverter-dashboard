    const colours = [
      'var(--flow-grid-colour)', 'var(--flow-inverter-colour)',
      'var(--flow-battery-colour)', 'var(--flow-solar-colour)',
      'var(--flow-home-colour)', 'var(--flow-alert-colour)',
      'var(--flow-generator-colour)'
    ];
    let lastData = null;
    let dashboardInstance = window.__INITIAL_STATE__?.dashboard_instance || '';
    let dashboardVersion = window.__INITIAL_STATE__?.dashboard_version || '';
    let chartStylesheetPromise = null;
    let dashboardReloadPending = false;
    let chartDemoRunning = false;
    let chartDemoCancelRequested = false;
    let demoRegisterRows = null;
    let demoFlowCase = '';
    let demoGeneratorPower = 0;
    let demoPvVoltage = 0;
    let demoPvPower = 0;
    let currentView = 'dashboard';
    let lcdPageIndex = 0;
    const lcdInformationPageCount = 10;
    let lcdEnterNotice = false;
    let refreshInFlight = false;
    let refreshTimer = null;
    let refreshController = null;
    let versionCheckTimer = null;
    let versionCheckController = null;
    let pageIsActive = true;
    let lastLoggedSiteVisits = null;
    let flowAlertText = '';
    let flowAlertTimer = null;
    const DEMO_DEVICE_IDENTITY = 'Model ID 64 · Device type 0 · SN J25110266-1H00028';
    const requestIntervals = [500, 1000, 2000, 5000, 10000];
    const hiddenRefreshInterval = 30000;
    const flowAnimationStates = new Map();
    let chartDefinitions = new Map();
    function registerMapDisplayData(data) {
      return chartDemoRunning && demoRegisterRows
        ? {...data, registers: demoRegisterRows}
        : data;
    }
    window.showFlowChangeAlert = function showFlowChangeAlert(message) {
      flowAlertText = String(message || '');
      if (!flowAlertText) return;
      if (flowAlertTimer !== null) window.clearTimeout(flowAlertTimer);
      const box = document.querySelector('#error');
      if (box && (chartDemoRunning || !lastData?.error)) {
        box.textContent = flowAlertText;
        box.classList.add('show');
      }
      flowAlertTimer = window.setTimeout(() => {
        flowAlertTimer = null;
        flowAlertText = '';
        if (chartDemoRunning || !lastData?.error) document.querySelector('#error')?.classList.remove('show');
      }, 5000);
    };
    const chartSelections = savedSelections('inverter-chart-values-v3');
    const dashboardSelections = savedSelections('inverter-dashboard-gauges-v2');
    const chartHistory = new Map();
    const dashboardGaugeRanges = savedMap('inverter-dashboard-gauge-ranges-v2');
    const dashboardGaugeColours = savedMap('inverter-dashboard-gauge-colours-v2');

    function numericValue(value) {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : null;
    }

    function registerNumericValue(register) {
      if (!register || register.available === false) return null;
      if (typeof register.value === 'number' && Number.isFinite(register.value)) {
        return register.value;
      }
      return numericValue(register.display);
    }





































    const REGISTER_RENDER_LIMIT = 80;
    let registerRenderLimit = REGISTER_RENDER_LIMIT;
    let editingRegister = null;

    function registerActionLabel(action) {
      const labels = {
        edit: {uk: 'Редагувати', ru: 'Изменить', en: 'Edit'},
        save: {uk: 'Зберегти', ru: 'Сохранить', en: 'Save'},
        cancel: {uk: 'Скасувати', ru: 'Отмена', en: 'Cancel'},
        live: {uk: 'З Modbus', ru: 'Из Modbus', en: 'Use live'}
      };
      return labels[action][currentLanguage] || labels[action].uk;
    }

    async function saveManualRegisterValue(register, value, clear = false) {
      const payload = value && typeof value === 'object'
        ? {register, fields: value, clear}
        : {register, value, clear};
      const response = await fetch('/api/manual-register-value', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to save register value');
      editingRegister = null;
      await refresh();
    }

    function renderRegisters(registers) {
      const query = document.querySelector('#search').value.trim().toLowerCase();
      const shown = registers.filter(item =>
        `${item.register} ${localizeApiField(item, 'group')} ${localizeApiField(item, 'name')} ${item.description || ''} ${registerVersionDisplay(item, registers)} ${registerInterpretation(item)} ${item.unit}`.toLowerCase().includes(query)
      );
      const available = registers.filter(item => item.available).length;
      document.querySelector('#register-count').textContent =
        t('registerCount', {
          available,
          waiting: registers.length - available,
          catalog: registers.length,
          shown: shown.length
        });
      const visible = shown.slice(0, registerRenderLimit);
      document.querySelector('#registers').innerHTML = visible.map(item => {
        const value = registerNumericValue(item);
        const bmsFormula = item.register === 413 && item.available ? r413BmsFormula(value) : '';
        const displayValue = registerVersionDisplay(item, registers);
        const displayRegister = {...item, versionDisplay: displayValue};
        const interpretation = registerInterpretation(displayRegister);
        const accessNote = item.maintenance ? t('registerMaintenanceReadOnly') : t('registerReadOnly');
        const descriptionReference = item.description_reference
          ? t('registerDescriptionSource', {source: item.description_reference})
          : '';
        const descriptions = [...new Set([item.description, interpretation, descriptionReference, accessNote].filter(Boolean))];
        return `<tr class="${item.available ? '' : 'unavailable'}">
          <td>R${item.register}</td><td>${localizeApiField(item, 'group')}</td><td>${localizeApiField(item, 'name')}</td>
          <td class="register-meaning">${descriptions.join(' · ') || '—'}</td>
          <td class="register-live-value">${localizeDataText(displayValue)} ${item.unit}${bmsFormula ? `<br><small>${bmsFormula}</small>` : ''}</td><td class="register-raw-value">${registerRawExplanation(displayRegister)}</td></tr>`;
      }).join('');
      visible.forEach(item => {
        const row = document.querySelector(`#registers tr:nth-child(${visible.indexOf(item) + 1})`);
        if (!row) return;
        const cell = document.createElement('td');
        if (editingRegister === item.register) {
          const field = (column, name, value, multiline = false) => {
            const control = document.createElement(multiline ? 'textarea' : 'input');
            if (!multiline) control.type = 'text';
            control.value = value || '';
            control.dataset.registerField = name;
            control.dataset.register = String(item.register);
            control.setAttribute('aria-label', `${name} for R${item.register}`);
            row.cells[column].replaceChildren(control);
          };
          field(1, 'group', localizeApiField(item, 'group'));
          field(2, 'name', localizeApiField(item, 'name'));
          field(3, 'description', item.description || '', true);
          field(4, 'value', registerNumericValue(item));
          const valueControls = row.cells[4];
          valueControls.className = 'register-edit-value';
          const valueInput = valueControls.querySelector('[data-register-field="value"]');
          if (valueInput) valueInput.type = 'number';
          const unitInput = document.createElement('input');
          unitInput.type = 'text'; unitInput.value = item.unit || ''; unitInput.placeholder = 'unit';
          unitInput.dataset.registerField = 'unit'; unitInput.dataset.register = String(item.register);
          unitInput.setAttribute('aria-label', `unit for R${item.register}`);
          valueControls.append(' ', unitInput);
          const editor = document.createElement('div');
          editor.className = 'register-value-editor';
          const save = document.createElement('button');
          save.type = 'button'; save.dataset.registerSave = String(item.register);
          save.textContent = registerActionLabel('save');
          const cancel = document.createElement('button');
          cancel.type = 'button'; cancel.dataset.registerCancel = String(item.register);
          cancel.textContent = registerActionLabel('cancel');
          editor.append(save, cancel);
          if (item.manual) {
            const live = document.createElement('button');
            live.type = 'button'; live.dataset.registerLive = String(item.register);
            live.textContent = registerActionLabel('live');
            editor.append(live);
          }
          cell.append(editor);
        } else {
          const edit = document.createElement('button');
          edit.type = 'button'; edit.className = 'register-action';
          edit.dataset.registerEdit = String(item.register);
          edit.textContent = registerActionLabel('edit');
          cell.append(edit);
        }
        row.append(cell);
      });
      const remaining = shown.length - visible.length;
      const listActions = document.querySelector('#register-list-actions');
      listActions.hidden = remaining <= 0;
      document.querySelector('#register-load-more').textContent = t('loadMoreRegisters', {count: remaining});
    }

    document.querySelector('#registers').addEventListener('click', event => {
      const editButton = event.target.closest('[data-register-edit]');
      if (editButton) {
        editingRegister = Number(editButton.dataset.registerEdit);
        renderRegisters(lastData?.registers || []);
        document.querySelector(`[data-register="${editingRegister}"][data-register-field="group"]`)?.focus();
        return;
      }
      const saveButton = event.target.closest('[data-register-save]');
      if (saveButton) {
        const register = Number(saveButton.dataset.registerSave);
        const fields = {};
        document.querySelectorAll(`[data-register="${register}"][data-register-field]`).forEach(input => {
          fields[input.dataset.registerField] = input.value;
        });
        const clearValue = !String(fields.value || '').trim();
        if (clearValue) delete fields.value;
        void saveManualRegisterValue(register, fields, clearValue);
        return;
      }
      const cancelButton = event.target.closest('[data-register-cancel]');
      if (cancelButton) {
        editingRegister = null;
        renderRegisters(lastData?.registers || []);
        return;
      }
      const liveButton = event.target.closest('[data-register-live]');
      if (liveButton) void saveManualRegisterValue(Number(liveButton.dataset.registerLive), null, true);
    });

    let pendingRegisterRows = null;
    let registerRenderPending = false;
    function scheduleRegisterRender(registers) {
      pendingRegisterRows = registers;
      if (registerRenderPending) return;
      registerRenderPending = true;
      const renderPendingRegisters = () => {
        registerRenderPending = false;
        if (pendingRegisterRows) renderRegisters(pendingRegisterRows);
      };
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(renderPendingRegisters, {timeout: 750});
      } else {
        window.setTimeout(renderPendingRegisters, 0);
      }
    }

    function formatFileSize(bytes) {
      const value = Number(bytes || 0);
      if (value < 1024) return `${value} B`;
      if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
      if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
      return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    }

    function renderRegisterLog(log = {}) {
      const status = document.querySelector('#register-log-status');
      const active = Boolean(log.active);
      status.classList.toggle('active', active && !log.error);
      status.classList.toggle('error-text', Boolean(log.error));
      if (log.error) {
        status.textContent = t('registerLogError', {error: localizeApiField(log, 'error')});
      } else if (active) {
        status.textContent = t('registerLogActive', {
          filename: log.filename,
          changes: log.changes || 0,
          size: formatFileSize(log.size_bytes)
        });
      } else if (log.available) {
        status.textContent = t('registerLogStopped', {
          filename: log.filename,
          changes: log.changes || 0,
          size: formatFileSize(log.size_bytes)
        });
      } else {
        status.textContent = t('registerLogIdle');
      }
      if (Number.isFinite(Number(log.free_bytes))) {
        status.textContent += ` · ${t('registerLogStorage', {
          free: formatFileSize(log.free_bytes),
          count: log.pruned_files || 0
        })}`;
      }
      if (active && log.physical_button_capture) {
        status.textContent += ` · ${t('registerLogPhysicalCapture', {
          seconds: Number(log.capture_interval_seconds || .5).toLocaleString(
            currentLanguage === 'uk' ? 'uk-UA' : currentLanguage === 'ru' ? 'ru-RU' : 'en-GB'
          )
        })}`;
      }
      document.querySelector('#register-log-start').disabled = active;
      document.querySelector('#register-log-stop').disabled = !active;
      document.querySelector('#register-log-note').disabled = !active;
      document.querySelector('#register-log-mark').disabled = !active;
      document.querySelector('#register-log-download').hidden = !log.available;
      // Poll rate and read mode are now in the modbus debug modal
    }

    async function updateRegisterLog(action, note = '') {
      const buttons = document.querySelectorAll('#register-log-start, #register-log-stop, #register-log-mark');
      buttons.forEach(button => button.disabled = true);
      try {
        const payload = {action, note, language: currentLanguage};
        if (action === 'start') {
          payload.translations = Object.fromEntries(
            Object.entries(DATA_TRANSLATIONS).map(([source, translations]) => [
              source,
              currentLanguage === 'uk' ? source : translations[currentLanguage] ?? source
            ])
          );
        }
        const response = await fetch('/api/register-log', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
        if (lastData) lastData.register_log = result;
        if (action === 'mark') document.querySelector('#register-log-note').value = '';
        renderRegisterLog(result);
      } catch (error) {
        const status = document.querySelector('#register-log-status');
        status.className = 'logger-status error-text';
        status.textContent = t('registerLogRequestError', {error: localizeDataText(error.message)});
        const active = Boolean(lastData?.register_log?.active);
        document.querySelector('#register-log-start').disabled = active;
        document.querySelector('#register-log-stop').disabled = !active;
        document.querySelector('#register-log-mark').disabled = !active;
      }
    }
    function renderCycleStatus(data) {
      const configuredSeconds = (requestIntervals[data.poll_rate_index] ?? 2000) / 1000;
      document.querySelector('#cycle').textContent = data.paused
        ? t('cyclePaused', {cycle: data.cycle_id})
        : t('cycleReads', {
            cycle: data.cycle_id,
            seconds: configuredSeconds.toString(),
            readSeconds: data.read_seconds.toFixed(2),
            reads: data.successful
          });
    }
    function render(data) {
      lastData = data;
      document.querySelector('#identifier').textContent = getDisplayIdentifier(data);
      const status = document.querySelector('#status');
      status.classList.toggle('online', chartDemoRunning || (data.online && !data.paused));
      status.classList.toggle('paused', !chartDemoRunning && data.paused);
      status.querySelector('.status-label').textContent =
        chartDemoRunning
          ? t('demoMode')
          : data.paused ? t('paused') : data.online ? t('online') : t('offline');
      const appToggle = document.querySelector('#app-toggle');
      appToggle.textContent = data.paused ? t('startMonitoring') : t('stopMonitoring');
      appToggle.classList.toggle('start', data.paused);
      document.querySelector('#updated').textContent =
        t('updated', {time: localizeDataText(data.updated_at)});
      renderCycleStatus(data);
      const totalVisitors = Number(data.site_visits || 0);
      const numberLocale = currentLanguage === 'uk' ? 'uk-UA' : currentLanguage === 'ru' ? 'ru-RU' : 'en-GB';
      document.querySelector('#site-visits').textContent =
        t('visitors', {
          count: totalVisitors.toLocaleString(numberLocale),
          date: data.site_visits_date
        });
      if (lastLoggedSiteVisits !== totalVisitors) {
        const visitDetails = {};
        visitDetails[t('totalVisitorsLabel')] = totalVisitors;
        visitDetails[t('dateLabel')] = data.site_visits_date;
        visitDetails[t('openedLabel')] = new Date().toISOString();
        visitDetails[t('referrerLabel')] = document.referrer || t('direct');
        visitDetails[t('browserLanguageLabel')] = navigator.language;
        visitDetails[t('browserLabel')] = navigator.userAgent;
        visitDetails[t('viewportLabel')] = `${window.innerWidth}x${window.innerHeight}`;
        console.log(t('visitConsole'), visitDetails);
        lastLoggedSiteVisits = totalVisitors;
      }
      // Poll rate and read mode are now in the modbus debug modal
      const error = document.querySelector('#error');
      const connectionError = chartDemoRunning ? '' : data.error;
      const visibleNotice = connectionError
        ? t('connectionError', {error: localizeApiField(data, 'error')})
        : flowAlertText;
      error.textContent = visibleNotice;
      error.classList.toggle('show', Boolean(visibleNotice));
      renderRegisterLog(data.register_log);
      renderGridConsumptionEnergy(data.registers);
      const displayedRegisters = chartDemoRunning && demoRegisterRows ? demoRegisterRows : data.registers;
      scheduleRegisterRender(displayedRegisters);
      renderEnergyFlow(data, displayedRegisters);
      renderLcd(data, displayedRegisters);
      updateChartDefinitions(dashboardDefinitionData(data));
      if (currentView === 'register-map') renderRegisterMap(registerMapDisplayData(data));
    }

    function reloadDashboardForVersion(data) {
      if (dashboardReloadPending || !data) return false;
      const instanceChanged = Boolean(
        dashboardInstance && data.dashboard_instance && data.dashboard_instance !== dashboardInstance
      );
      const versionChanged = Boolean(
        dashboardVersion && data.dashboard_version && data.dashboard_version !== dashboardVersion
      );
      if (!instanceChanged && !versionChanged) return false;
      dashboardReloadPending = true;
      pageIsActive = false;
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      if (versionCheckTimer !== null) window.clearTimeout(versionCheckTimer);
      refreshTimer = null;
      versionCheckTimer = null;
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set('_dashboard', data.dashboard_instance || data.dashboard_version);
      window.location.replace(nextUrl.toString());
      return true;
    }

    async function checkDashboardVersion() {
      if (!pageIsActive || dashboardReloadPending || versionCheckController) return;
      versionCheckController = new AbortController();
      try {
        const response = await fetch(`/api/version?_=${Date.now()}`, {
          cache: 'no-store',
          signal: versionCheckController.signal
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (reloadDashboardForVersion(data)) return;
        if (data.dashboard_instance) dashboardInstance = data.dashboard_instance;
        if (data.dashboard_version) dashboardVersion = data.dashboard_version;
      } catch (error) {
        if (error.name !== 'AbortError') console.debug('Dashboard version check failed:', error.message);
      } finally {
        versionCheckController = null;
        scheduleDashboardVersionCheck();
      }
    }

    function scheduleDashboardVersionCheck(delay = null) {
      if (versionCheckTimer !== null) window.clearTimeout(versionCheckTimer);
      versionCheckTimer = null;
      if (!pageIsActive || dashboardReloadPending || !lastData?.paused) return;
      versionCheckTimer = window.setTimeout(checkDashboardVersion, delay ?? (document.hidden ? 30000 : 5000));
    }

    async function refresh() {
      if (refreshInFlight) return;
      refreshInFlight = true;
      refreshController = new AbortController();
      try {
        const response = await fetch(`/api/state?lang=${encodeURIComponent(currentLanguage)}`, {
          cache: 'no-store',
          signal: refreshController.signal
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (reloadDashboardForVersion(data)) return;
        if (data.dashboard_instance) dashboardInstance = data.dashboard_instance;
        if (data.dashboard_version) dashboardVersion = data.dashboard_version;
        lastData = data;
        recordChartSamples(data);
        if (!chartDemoRunning) render(data);
      } catch (error) {
        if (error.name === 'AbortError') return;
        if (chartDemoRunning) return;
        const box = document.querySelector('#error');
        box.textContent = t('connectionLost', {error: error.message});
        box.classList.add('show');
      } finally {
        refreshInFlight = false;
        refreshController = null;
        if (!lastData?.paused) {
          if (versionCheckTimer !== null) window.clearTimeout(versionCheckTimer);
          versionCheckTimer = null;
          scheduleRefresh();
        } else {
          if (refreshTimer !== null) window.clearTimeout(refreshTimer);
          refreshTimer = null;
          scheduleDashboardVersionCheck();
        }
      }
    }

    function scheduleRefresh(delay = null) {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      refreshTimer = null;
      if (!pageIsActive) return;
      // Poll rate is now in the modbus debug modal, use default if not accessible
      const pollRateSelect = document.querySelector('#modbus-poll-rate');
      const selectedIndex = pollRateSelect ? Number(pollRateSelect.value) : 2;
      const selectedInterval = requestIntervals[selectedIndex] ?? 2000;
      const milliseconds = delay ?? (document.hidden
        ? Math.max(hiddenRefreshInterval, selectedInterval)
        : selectedInterval);
      refreshTimer = window.setTimeout(refresh, milliseconds);
    }

    async function updateSetting(setting, value) {
      await fetch('/api/settings', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({[setting]: value})
      });
      if (setting === 'paused' && value === true) {
        if (refreshTimer !== null) window.clearTimeout(refreshTimer);
        refreshTimer = null;
        refreshController?.abort();
        scheduleDashboardVersionCheck(0);
      } else {
        if (versionCheckTimer !== null) window.clearTimeout(versionCheckTimer);
        versionCheckTimer = null;
        scheduleRefresh(0);
      }
    }

    let registerMapFeedbackTimer = null;
    async function uploadRegisterMap(file) {
      const button = document.querySelector('#register-map-upload-button');
      const input = document.querySelector('#register-map-file');
      if (!file) return;
      if (file.size > 1024 * 1024) {
        button.textContent = t('registerMapFileTooLarge');
        input.value = '';
        registerMapFeedbackTimer = window.setTimeout(() => {
          button.textContent = t('uploadRegisterMap');
          registerMapFeedbackTimer = null;
        }, 5000);
        return;
      }
      if (registerMapFeedbackTimer !== null) window.clearTimeout(registerMapFeedbackTimer);
      button.disabled = true;
      button.textContent = t('registerMapUploading');
      try {
        const response = await fetch('/api/register-map', {
          method: 'POST',
          headers: {'Content-Type': 'text/csv; charset=utf-8'},
          body: file
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
        button.textContent = t('registerMapUploaded', {count: result.count});
        scheduleRefresh(0);
      } catch (error) {
        const message = t('registerMapUploadError', {error: error.message});
        button.textContent = message;
        button.title = message;
      } finally {
        button.disabled = false;
        input.value = '';
        registerMapFeedbackTimer = window.setTimeout(() => {
          button.textContent = t('uploadRegisterMap');
          button.title = t('registerMapHelp');
          registerMapFeedbackTimer = null;
        }, 5000);
      }
    }

    function wait(milliseconds) {
      return new Promise(resolve => setTimeout(resolve, milliseconds));
    }

    function ensureChartStylesheet() {
      if (chartStylesheetPromise) return chartStylesheetPromise;
      const existing = document.querySelector('#uplot-stylesheet');
      if (existing?.sheet) return Promise.resolve();
      chartStylesheetPromise = new Promise((resolve, reject) => {
        const link = existing || document.createElement('link');
        link.id = 'uplot-stylesheet';
        link.rel = 'stylesheet';
        link.href = `/static/vendor/uPlot.min.css?v=${encodeURIComponent(dashboardVersion)}`;
        link.addEventListener('load', resolve, {once: true});
        link.addEventListener('error', () => reject(new Error('uPlot CSS')), {once: true});
        if (!existing) document.head.append(link);
      }).catch(error => {
        chartStylesheetPromise = null;
        throw error;
      });
      return chartStylesheetPromise;
    }

    function showView(view) {
      currentView = ['dashboard', 'charts', 'lcd', 'register-map'].includes(view) ? view : 'dashboard';
      document.querySelector('#dashboard-view').hidden = currentView !== 'dashboard';
      document.querySelector('#charts-view').hidden = currentView !== 'charts';
      document.querySelector('#lcd-view').hidden = currentView !== 'lcd';
      document.querySelector('#register-map-view').hidden = currentView !== 'register-map';
      document.querySelectorAll('.view-tab').forEach(button => {
        const active = button.dataset.view === currentView;
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', String(active));
        button.tabIndex = active ? 0 : -1;
      });
      if (currentView === 'charts') {
        void ensureChartStylesheet().then(() => {
          if (currentView === 'charts') scheduleChartsViewRender();
        }).catch(error => {
          const box = document.querySelector('#error');
          box.textContent = t('connectionLost', {error: error.message});
          box.classList.add('show');
        });
      }
      if (currentView === 'lcd' && lastData) {
        renderLcd(lastData, chartDemoRunning && demoRegisterRows ? demoRegisterRows : lastData.registers);
      }
      if (currentView === 'dashboard') renderDashboardValues();
      if (currentView === 'register-map' && lastData) renderRegisterMap(registerMapDisplayData(lastData));
      if (currentView === 'dashboard' && chartDemoRunning && lastData && demoRegisterRows) {
        requestAnimationFrame(() => renderEnergyFlow(lastData, demoRegisterRows));
      }
    }

    async function recordDemoLcdKey(key) {
      if (!chartDemoRunning || !lastData?.register_log?.active) return;
      const page = lcdPageIndex === 0 ? 'LCD' : `P${lcdPageIndex}`;
      try {
        const response = await fetch('/api/register-log', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            action: 'lcd_key',
            key,
            page,
            demo_case: demoFlowCase || 'demoMode'
          })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
        lastData.register_log = result;
        renderRegisterLog(result);
      } catch (error) {
        const status = document.querySelector('#register-log-status');
        status.className = 'logger-status error-text';
        status.textContent = t('registerLogRequestError', {error: localizeDataText(error.message)});
      }
    }

    function handleLcdKey(key) {
      if (key === 'escape') {
        lcdPageIndex = 0;
        lcdEnterNotice = false;
      } else if (key === 'up') {
        lcdPageIndex = lcdPageIndex <= 1 ? lcdInformationPageCount : lcdPageIndex - 1;
        lcdEnterNotice = false;
      } else if (key === 'down') {
        lcdPageIndex = lcdPageIndex === 0 || lcdPageIndex >= lcdInformationPageCount
          ? 1
          : lcdPageIndex + 1;
        lcdEnterNotice = false;
      } else if (key === 'enter') {
        lcdEnterNotice = true;
      } else {
        return;
      }
      if (lastData) {
        renderLcd(lastData, chartDemoRunning && demoRegisterRows ? demoRegisterRows : lastData.registers);
      }
      void recordDemoLcdKey(key);
    }

    function refreshDisabledButtonHints(root = document) {
      const buttons = root.matches?.('button') ? [root] : root.querySelectorAll?.('button') || [];
      buttons.forEach(button => {
        if (button.disabled) {
          const reason = button.dataset.disabledReason || 'actionUnavailable';
          if (button.dataset.generatedDisabledHint === 'true' || !button.hasAttribute('title')) {
            button.title = t(reason);
            button.dataset.generatedDisabledHint = 'true';
          }
          button.setAttribute('aria-disabled', 'true');
        } else {
          if (button.dataset.generatedDisabledHint === 'true') {
            button.removeAttribute('title');
            delete button.dataset.generatedDisabledHint;
          }
          button.removeAttribute('aria-disabled');
        }
      });
    }

    function applyLanguage(language, save = true) {
      currentLanguage = ['uk', 'ru', 'en'].includes(language) ? language : 'uk';
      document.documentElement.lang = currentLanguage;
      document.querySelectorAll('[data-i18n]').forEach(element => {
        element.textContent = t(element.dataset.i18n);
      });
      document.querySelectorAll('[data-i18n-aria]').forEach(element => {
        element.setAttribute('aria-label', t(element.dataset.i18nAria));
      });
      document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
        element.setAttribute('placeholder', t(element.dataset.i18nPlaceholder));
      });
      document.querySelectorAll('[data-i18n-title]').forEach(element => {
        element.setAttribute('title', t(element.dataset.i18nTitle));
      });
      document.querySelectorAll('.language-option').forEach(button => {
        const active = button.dataset.language === currentLanguage;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      });
      refreshDisabledButtonHints();
      document.querySelector('#theme-name').textContent =
        document.documentElement.dataset.theme === 'light' ? t('themeLight') : t('themeDark');
      showView(currentView);
      if (!chartDemoRunning) {
        document.querySelectorAll('.all-data-demo-button').forEach(button => {
          button.textContent = t('runDemo');
        });
      }
      if (save) {
        try {
          window.localStorage.setItem('solar-invertor-language', currentLanguage);
        } catch {
          // Language switching still works when browser storage is unavailable.
        }
      }
      if (save) scheduleRefresh(0);
      lastLoggedSiteVisits = null;
      if (lastData) {
        document.querySelector('#gauges').innerHTML = '';
        render(lastData);
        renderGaugePickerList();
        renderChartCards();
        renderDashboardValues();
      } else {
        document.querySelector('#app-toggle').textContent = t('stopMonitoring');
        document.querySelector('#status .status-label').textContent = t('offline');
        document.querySelector('#cycle').textContent = t('cycleInitial');
        document.querySelector('#site-visits').textContent = t('visitorsInitial');
        document.querySelector('#updated').textContent = t('notUpdated');
        renderChartCards();
      }
      requestAnimationFrame(drawAllCharts);
    }

    function initialLanguage() {
      try {
        const savedLanguage = window.localStorage.getItem('solar-invertor-language');
        if (['uk', 'ru', 'en'].includes(savedLanguage)) return savedLanguage;
      } catch {
        // Use Ukrainian when browser storage is unavailable.
      }
      return 'uk';
    }

    function applyTheme(theme, save = true) {
      const selectedTheme = theme === 'light' ? 'light' : 'dark';
      document.documentElement.dataset.theme = selectedTheme;
      document.querySelector('#theme-toggle').checked = selectedTheme === 'light';
      document.querySelector('#theme-name').textContent =
        selectedTheme === 'light' ? t('themeLight') : t('themeDark');
      if (save) {
        try {
          window.localStorage.setItem('inverter-theme', selectedTheme);
        } catch {
          // Theme still changes when browser storage is unavailable.
        }
      }
      if (currentView === 'charts') {
        requestAnimationFrame(() => window.setTimeout(drawAllCharts, 0));
      }
    }

    function initialTheme() {
      try {
        const savedTheme = window.localStorage.getItem('inverter-theme');
        if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;
      } catch {
        // Fall through to the system preference.
      }
      return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }

    function getCustomDeviceName() {
      try {
        return window.localStorage.getItem('custom-device-name') || '';
      } catch {
        return '';
      }
    }

    function saveCustomDeviceName(name) {
      try {
        if (name && name.trim()) {
          window.localStorage.setItem('custom-device-name', name.trim());
        } else {
          window.localStorage.removeItem('custom-device-name');
        }
      } catch {
        // Settings still work when browser storage is unavailable.
      }
    }

    function getDisplayIdentifier(data) {
      const customName = getCustomDeviceName();
      if (customName && customName.trim()) return customName.trim();
      const identifier = chartDemoRunning ? DEMO_DEVICE_IDENTITY : data?.online ? data.identifier : '';
      if (!identifier) return t('waitingInverter');
      return identifier
        .replace(/\bModel ID\b/g, t('modelIdLabel'))
        .replace(/\bDevice type\b/g, t('deviceTypeLabel'))
        .replace(/\bSN\b/g, t('serialNumberLabel'));
    }

    // Make functions globally available for app-events.js
    window.getCustomDeviceName = getCustomDeviceName;
    window.saveCustomDeviceName = saveCustomDeviceName;
    window.getDisplayIdentifier = getDisplayIdentifier;

    async function loadLogs() {
      try {
        const response = await fetch('/api/logs');
        const data = await response.json();
        document.querySelector('#logs-content').textContent = data.logs || 'No logs available';
      } catch (error) {
        document.querySelector('#logs-content').textContent = 'Failed to load logs: ' + error;
      }
    }
    window.loadLogs = loadLogs;
    window.renderCycleStatus = renderCycleStatus;

    async function loadModbusDebug() {
      try {
        const response = await fetch(`/api/state?lang=${encodeURIComponent(currentLanguage)}`);
        const data = await response.json();
        const modbusRequests = document.querySelector('#modbus-requests');
        const modbusSuccessful = document.querySelector('#modbus-successful');
        const modbusFailed = document.querySelector('#modbus-failed');
        const modbusCycleSeconds = document.querySelector('#modbus-cycle-seconds');
        const modbusReadSeconds = document.querySelector('#modbus-read-seconds');
        const modbusCycleId = document.querySelector('#modbus-cycle-id');
        const modbusError = document.querySelector('#modbus-error');
        const modbusConnectionMode = document.querySelector('#modbus-connection-mode');

        if (modbusRequests) modbusRequests.textContent = data.requests || '—';
        if (modbusSuccessful) modbusSuccessful.textContent = data.successful || '—';
        if (modbusFailed) modbusFailed.textContent = data.failed || '—';
        if (modbusCycleSeconds) modbusCycleSeconds.textContent = data.cycle_seconds ? data.cycle_seconds.toFixed(2) : '—';
        if (modbusReadSeconds) modbusReadSeconds.textContent = data.read_seconds ? data.read_seconds.toFixed(2) : '—';
        if (modbusCycleId) modbusCycleId.textContent = data.cycle_id || '—';
        if (modbusError) modbusError.textContent = data.error || '—';
        try {
          const connectionMode = window.localStorage.getItem('connection-mode') || 'rtu';
          if (modbusConnectionMode) modbusConnectionMode.textContent = connectionMode === 'rtu' ? 'RTU (Serial)' : 'TCP (Network)';
        } catch {
          if (modbusConnectionMode) modbusConnectionMode.textContent = '—';
        }
      } catch (error) {
        const modbusError = document.querySelector('#modbus-error');
        if (modbusError) modbusError.textContent = 'Failed to load modbus debug: ' + error;
      }
    }
    window.loadModbusDebug = loadModbusDebug;

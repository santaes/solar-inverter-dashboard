    const FLOW_CARD_MAX_VALUES = 3;
    const FLOW_CARD_SELECTION_KEY_PREFIX = 'inverter-flow-card-values-v2:';
    const FAST_POLL_SELECTION_KEY = 'inverter-fast-poll-registers-v1';
    const LEGACY_FLOW_CARD_SELECTION_KEY = 'inverter-flow-card-values-v1';
    const FLOW_CARD_CONFIG = Object.freeze({
      solar: {label: 'solarPanels', defaults: [151, 153, 152], registers: [151, 152, 153, 154, 155, 156, 157, 158, 159, 160, 161, 162, 163]},
      inverter: {label: 'inverter', defaults: [545, 801, 537], registers: [67, 68, 69, 321, 323, 324, 325, 529, 530, 537, 538, 539, 541, 542, 545, 801, 802]},
      generator: {label: 'generator', defaults: [88, 86, 85], registers: [85, 86, 87, 88]},
      home: {label: 'home', defaults: [541, 539, 537], registers: [89, 90, 91, 92, 93, 94, 188, 189, 190, 537, 538, 539, 541, 542, 545]},
      grid: {label: 'grid', defaults: [84, 82, 81], registers: [81, 82, 83, 84, 95, 180, 181, 182, 183, 184, 185, 186, 187, 433, 434, 435, 436]},
      battery: {label: 'battery', defaults: [407, 405, 404], registers: [66, 129, 130, 131, 132, 133, 134, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 341, 342, 343, 344, 345, 346, 375, 376, 377, 378, 379, 383, 384, 385, 386, 401, 402, 403, 404, 405, 406, 407, 408, 409, 410, 411, 412, 413, 414, 415, 416, 417, 418, 419, 16651, 16652, 16653, 16654, 16671, 16672]}
    });
    let activeFlowCardPicker = null;
    let lastFastPollSelection = null;
    let pendingFastPollSelection = null;
    let lastRealFlowState = null;

    function legacyFlowCardSelections() {
      try {
        const saved = JSON.parse(window.localStorage.getItem(LEGACY_FLOW_CARD_SELECTION_KEY) || '{}');
        return saved && typeof saved === 'object' ? saved : {};
      } catch {
        return {};
      }
    }
    function normalizeFlowCardSelection(cardKey, selection) {
      const config = FLOW_CARD_CONFIG[cardKey];
      if (!config || !Array.isArray(selection)) return null;
      return [...new Set(selection.map(Number))]
        .filter(register => config.registers.includes(register))
        .slice(0, FLOW_CARD_MAX_VALUES);
    }
    function flowCardSelection(cardKey) {
      const config = FLOW_CARD_CONFIG[cardKey];
      if (!config) return [];
      try {
        const saved = JSON.parse(window.localStorage.getItem(`${FLOW_CARD_SELECTION_KEY_PREFIX}${cardKey}`) || 'null');
        const normalized = normalizeFlowCardSelection(cardKey, saved);
        if (normalized !== null) return normalized;
      } catch {
        // Fall through to migrate the legacy shared selection below.
      }
      const legacySelection = normalizeFlowCardSelection(cardKey, legacyFlowCardSelections()[cardKey]);
      if (legacySelection !== null) {
        saveFlowCardSelection(cardKey, legacySelection);
        return legacySelection;
      }
      return config.defaults;
    }
    function saveFlowCardSelection(cardKey, selection) {
      const normalized = normalizeFlowCardSelection(cardKey, selection);
      if (normalized === null) return;
      try {
        window.localStorage.setItem(
          `${FLOW_CARD_SELECTION_KEY_PREFIX}${cardKey}`,
          JSON.stringify(normalized)
        );
      } catch {
        // The selected readings still apply until the page is closed.
      }
    }
    function syncFlowCardSelectionsForFastPoll(selection = null) {
      const registers = selection || fastPollSelection();
      const signature = registers.join(',');
      if (signature === lastFastPollSelection) return;
      lastFastPollSelection = signature;
      fetch('/api/settings', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({fast_selected_registers: registers})
      }).catch(() => {
        lastFastPollSelection = null;
        // The dashboard remains usable if the local browser cannot reach the API.
      });
    }
    function defaultFastPollSelection() {
      if (Array.isArray(lastData?.default_fast_selected_registers)) {
        return [...new Set(lastData.default_fast_selected_registers.map(Number))].filter(Number.isInteger);
      }
      return [...new Set(Object.keys(FLOW_CARD_CONFIG).flatMap(cardKey => flowCardSelection(cardKey)))];
    }
    function fastPollSelection() {
      const hasReportedSelection = Array.isArray(lastData?.fast_selected_registers);
      const reported = hasReportedSelection
        ? [...new Set(lastData.fast_selected_registers.map(Number))].filter(Number.isInteger)
        : [];
      if (pendingFastPollSelection !== null) {
        if (hasReportedSelection && reported.join(',') === pendingFastPollSelection.join(',')) {
          pendingFastPollSelection = null;
        } else {
          return [...pendingFastPollSelection];
        }
      }
      if (hasReportedSelection) return reported;
      try {
        const saved = JSON.parse(window.localStorage.getItem(FAST_POLL_SELECTION_KEY) || 'null');
        if (Array.isArray(saved)) return [...new Set(saved.map(Number))].filter(Number.isInteger);
      } catch {}
      return defaultFastPollSelection();
    }
    function setFastPollSelection(registers) {
      const selected = [...new Set(registers.map(Number))].filter(Number.isInteger);
      try { window.localStorage.setItem(FAST_POLL_SELECTION_KEY, JSON.stringify(selected)); } catch {}
      pendingFastPollSelection = selected;
      lastFastPollSelection = null;
      syncFlowCardSelectionsForFastPoll(selected);
      return selected;
    }
    function formatFlowCardRegister(register, absolute = false) {
      const value = registerNumericValue(register);
      if (!Number.isFinite(value)) return t('noData');
      const unit = String(register.unit || '').trim();
      const displayedValue = absolute ? Math.abs(value) : value;
      return `${Number(displayedValue.toFixed(unit === 'A' || unit === 'V' || unit === '%' ? 1 : 2))}${unit ? ` ${unit}` : ''}`;
    }
    function compactFlowCardState(registerNumber, raw) {
      const enumCode = values => values[raw] || `#${raw}`;
      switch (registerNumber) {
        case 66: return enumCode(['BMS?', 'BMS CAN', 'BMS SERIAL', 'BMS REMOTE']);
        case 67:
        case 325: return enumCode(['POWER', 'INIT', 'STANDBY', 'GRID', 'PV', 'BAT', 'GEN', 'FAULT', 'OFF', 'TEST', 'UPDATE']);
        case 68: {
          const active = [];
          if ((raw & 3) > 0) active.push('GRID');
          if (((raw >> 2) & 3) > 0) active.push('GEN');
          if (((raw >> 4) & 3) > 0 || ((raw >> 14) & 3) > 0) active.push('PV');
          if (((raw >> 6) & 3) > 0) active.push('OUT');
          if (((raw >> 8) & 7) > 0) active.push('BAT');
          return active.length ? active.join(' / ') : 'OFF';
        }
        case 69: {
          const active = [];
          if (raw & 0x0003) active.push('GRID');
          if (raw & 0x000c) active.push('GEN');
          if (raw & 0x0010) active.push('PV');
          if (raw & 0x0120) active.push('BAT');
          if (raw & 0x0640) active.push('INV');
          return active.length ? active.join(' / ') : 'IDLE';
        }
        case 321:
        case 530:
        case 16644: return enumCode(['APP', 'UPS', 'GEN']);
        case 323:
        case 529: return enumCode(['GPB', 'PGB', 'PBG', 'MKS/MKP']);
        case 324: return enumCode(['PNG', 'OPV', 'PVF']);
        case 375: return enumCode(['IDLE', 'CC/CV', 'FLOAT', 'EQUAL']);
        case 403: return enumCode(['BMS?', 'BMS REMOTE', 'BMS OK']);
        case 802: return raw === 0 ? 'FAN OK' : 'FAN FAULT';
        default: return `#${raw}`;
      }
    }
    function renderFlowCardValues(cardKey, selector, registers, visible = true) {
      const host = document.querySelector(selector);
      if (!host) return;
      host.hidden = !visible;
      if (!visible) return;
      const byNumber = new Map(registers.map(register => [Number(register.register), register]));
      const selected = flowCardSelection(cardKey);
      host.replaceChildren(...selected.map(number => {
        const register = byNumber.get(number);
        const row = document.createElement('span');
        const interpretation = register ? registerInterpretation(register) : '';
        const raw = Number(register?.raw);
        const fullText = interpretation || (register ? formatFlowCardRegister(register, cardKey === 'grid') : t('noData'));
        row.textContent = interpretation && Number.isInteger(raw)
          ? compactFlowCardState(number, raw)
          : fullText;
        row.classList.toggle('flow-card-state-value', Boolean(interpretation));
        row.title = fullText + (register ? ` · ${registerRawExplanation(register)}` : '');
        return row;
      }));
    }
    function renderFlowCardPickerList() {
      const host = document.querySelector('#flow-card-picker-list');
      const config = FLOW_CARD_CONFIG[activeFlowCardPicker];
      if (!host || !config) return;
      const query = document.querySelector('#flow-card-picker-search').value.trim().toLowerCase();
      const selected = flowCardSelection(activeFlowCardPicker);
      const selectedOrder = new Map(selected.map((register, index) => [register, index]));
      const byNumber = new Map((lastData?.registers || []).map(register => [Number(register.register), register]));
      const choices = [...config.registers]
        .sort((left, right) => {
          const leftOrder = selectedOrder.get(left);
          const rightOrder = selectedOrder.get(right);
          if (leftOrder !== undefined && rightOrder !== undefined) return leftOrder - rightOrder;
          if (leftOrder !== undefined) return -1;
          if (rightOrder !== undefined) return 1;
          return config.registers.indexOf(left) - config.registers.indexOf(right);
        })
        .map(number => byNumber.get(number) || {register: number, name: `R${number}`, unit: '', available: false})
        .filter(register => `${register.register} ${localizeApiField(register, 'name')}`.toLowerCase().includes(query));
      host.replaceChildren(...choices.map(register => {
        const option = document.createElement('label');
        option.className = 'gauge-picker-option';
        const input = document.createElement('input');
        input.type = 'checkbox'; input.dataset.flowCardRegister = String(register.register);
        input.checked = selected.includes(Number(register.register));
        input.disabled = !input.checked && selected.length >= FLOW_CARD_MAX_VALUES;
        const copy = document.createElement('span');
        copy.className = 'gauge-picker-name';
        copy.textContent = localizeApiField(register, 'name') || `R${register.register}`;
        const detail = document.createElement('small');
        detail.textContent = `R${register.register}${register.unit ? ` · ${register.unit}` : ''}`;
        copy.append(detail); option.append(input, copy);
        return option;
      }));
    }
    function openFlowCardPicker(cardKey) {
      const config = FLOW_CARD_CONFIG[cardKey];
      if (!config) return;
      activeFlowCardPicker = cardKey;
      document.querySelector('#flow-card-picker-title').textContent = t('flowCardSettingsTitle', {card: t(config.label)});
      document.querySelector('#flow-card-picker-search').value = '';
      renderFlowCardPickerList();
      const picker = document.querySelector('#flow-card-picker');
      if (typeof picker.showModal === 'function') picker.showModal();
      else picker.setAttribute('open', '');
    }
    function setFlowCardRegister(register, selected) {
      if (!activeFlowCardPicker) return;
      const current = flowCardSelection(activeFlowCardPicker).filter(number => number !== register);
      if (selected && current.length < FLOW_CARD_MAX_VALUES) current.push(register);
      saveFlowCardSelection(activeFlowCardPicker, current);
      if (lastData) renderEnergyFlow(lastData, chartDemoRunning && demoRegisterRows ? demoRegisterRows : lastData.registers);
      renderFlowCardPickerList();
    }

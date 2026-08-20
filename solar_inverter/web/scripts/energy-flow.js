    let inverterFanAnimation = null;
    let inverterFanAnimationRotor = null;
    let inverterFanLastKnownSpeed = null;
    let inverterFanTargetRate = 0;
    let inverterFanRateFrame = null;
    let inverterFanRateFrameTime = null;
    let inverterFanPauseAtRest = false;
    const INVERTER_FAN_MAX_ROTATION_MS = 750;
    // R801 is a 0–100 % PWM/speed command. The dashboard presents the
    // corresponding fan speed using the inverter fan's 3000 RPM full scale.
    const INVERTER_FAN_MAX_RPM = 3000;
    const INVERTER_FAN_RATE_SMOOTHING_MS = 280;
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
    function truncateText(text, maxLength = 20) {
      if (!text || text.length <= maxLength) return text;
      return text.slice(0, maxLength - 1) + '…';
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
        const name = register ? localizeApiField(register, 'name') : `R${number}`;
        const interpretation = register ? registerInterpretation(register) : '';
        const raw = Number(register?.raw);
        const compactAcMode = [321, 530, 16644].includes(number)
          && Number.isInteger(raw) ? ['APP', 'UPS', 'GEN'][raw] || '' : '';
        // The V1.31 interpreter is the single localized source for every
        // enum and bit-field. Do not replace it with a partial English code
        // list in the flow cards.
        // Pair every decoded enum with its localized register name. For
        // example, R323 is a configured output priority, never evidence of
        // the currently active source of energy.
        const fullText = compactAcMode || (interpretation
          ? `${name}: ${interpretation}`
          : (register ? formatFlowCardRegister(register, cardKey === 'grid') : t('noData')));
        row.textContent = truncateText(fullText, 25);
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
    function decodeEnergyTerminalState(source) {
      const raw = Number(source?.raw);
      if (!source?.available || !Number.isInteger(raw) || raw < 0 || raw >= 65535) return null;
      return {
        raw,
        grid: raw & 0x03,
        generator: (raw >> 2) & 0x03,
        pv1: (raw >> 4) & 0x03,
        output: (raw >> 6) & 0x03,
        battery: (raw >> 8) & 0x07,
        charging: (raw >> 11) & 0x07,
        pv2: (raw >> 14) & 0x03
      };
    }
    function decodeEnergyFlowState(source) {
      const raw = Number(source?.raw);
      if (!source?.available || !Number.isInteger(raw) || raw < 0 || raw >= 65535) return null;
      return {
        raw,
        gridToRectifier: Boolean(raw & 1 << 0),
        gridToLoad: Boolean(raw & 1 << 1),
        generatorToRectifier: Boolean(raw & 1 << 2),
        generatorToLoad: Boolean(raw & 1 << 3),
        pvToRectifier: Boolean(raw & 1 << 4),
        rectifierToBattery: Boolean(raw & 1 << 5),
        rectifierToInverter: Boolean(raw & 1 << 6),
        rectifierToGrid: Boolean(raw & 1 << 7),
        batteryToInverter: Boolean(raw & 1 << 8),
        inverterToMainOutput: Boolean(raw & 1 << 9),
        inverterToSecondaryOutput: Boolean(raw & 1 << 10)
      };
    }
    function decodeBoundedRegister(source, maximum) {
      const raw = Number(source?.raw);
      return source?.available && Number.isInteger(raw) && raw >= 0 && raw <= maximum ? raw : null;
    }
    function effectiveBatterySoc(measuredSoc, terminalState) {
      if (terminalState?.battery === 4) return 100;
      return Number.isFinite(measuredSoc) ? Math.max(0, Math.min(100, measuredSoc)) : null;
    }
    function parallelTopologyCode(state) {
      return [null, '1Φ', '3Φ-R', '3Φ-S', '3Φ-T'][state] || '';
    }
    function outputSourceFromPriority(priority, availableSources) {
      // R323 is the active output-source priority: GPB, PGB, PBG, or MKS.
      // It is used when R69's instantaneous flow bits are unavailable.
      const sourceOrders = [
        ['grid', 'pv', 'battery'],
        ['pv', 'grid', 'battery'],
        ['pv', 'battery', 'grid'],
        ['generator', 'pv', 'battery', 'grid']
      ];
      return sourceOrders[priority]?.find(source => availableSources[source]) || null;
    }
    function uniqueLabels(values) {
      return [...new Set(values.filter(Boolean))];
    }
    function fanSpeedRpm(normalizedSpeed) {
      return normalizedSpeed * INVERTER_FAN_MAX_RPM / 100;
    }
    function setInverterFanPlaybackRate(animation, playbackRate) {
      if (typeof animation.updatePlaybackRate === 'function') {
        animation.updatePlaybackRate(playbackRate);
      } else {
        animation.playbackRate = playbackRate;
      }
    }
    function smoothlyUpdateInverterFanRate(animation, targetRate) {
      inverterFanTargetRate = targetRate;
      const currentRate = Number(animation.playbackRate) || 0;
      if (inverterFanRateFrame === null && Math.abs(currentRate - targetRate) <= .002) {
        if (inverterFanPauseAtRest && targetRate === 0) animation.pause();
        return;
      }
      if (typeof window.requestAnimationFrame !== 'function') {
        setInverterFanPlaybackRate(animation, targetRate);
        if (inverterFanPauseAtRest && targetRate === 0) animation.pause();
        return;
      }
      if (inverterFanRateFrame !== null) return;
      const tick = now => {
        const elapsed = inverterFanRateFrameTime === null ? 16 : Math.max(1, now - inverterFanRateFrameTime);
        inverterFanRateFrameTime = now;
        const currentRate = Number(animation.playbackRate) || 0;
        const progress = 1 - Math.exp(-elapsed / INVERTER_FAN_RATE_SMOOTHING_MS);
        const nextRate = currentRate + (inverterFanTargetRate - currentRate) * progress;
        setInverterFanPlaybackRate(animation, nextRate);
        if (Math.abs(inverterFanTargetRate - nextRate) > .002) {
          inverterFanRateFrame = window.requestAnimationFrame(tick);
          return;
        }
        setInverterFanPlaybackRate(animation, inverterFanTargetRate);
        inverterFanRateFrame = null;
        inverterFanRateFrameTime = null;
        if (inverterFanPauseAtRest && inverterFanTargetRate === 0) animation.pause();
      };
      inverterFanRateFrame = window.requestAnimationFrame(tick);
    }
    function updateInverterFanAnimation(fanRow, normalizedSpeed) {
      const rotor = fanRow?.querySelector('.energy-inverter-fan-rotor');
      if (Number.isFinite(normalizedSpeed)) {
        inverterFanLastKnownSpeed = Math.max(0, Math.min(100, normalizedSpeed));
      }
      const effectiveSpeed = inverterFanLastKnownSpeed ?? 0;
      const shouldRotate = effectiveSpeed > 0;
      fanRow?.classList.toggle('active', effectiveSpeed > 0);
      if (!rotor) return;

      if (typeof rotor.animate !== 'function') {
        fanRow.classList.add('css-animation-fallback');
        if (effectiveSpeed > 0) {
          rotor.style.animationDuration = `${(75 / effectiveSpeed).toFixed(3)}s`;
        }
        rotor.style.animationPlayState = shouldRotate ? 'running' : 'paused';
        return;
      }
      fanRow.classList.remove('css-animation-fallback');
      if (!inverterFanAnimation || inverterFanAnimationRotor !== rotor) {
        inverterFanAnimation?.cancel();
        inverterFanAnimationRotor = rotor;
        inverterFanAnimation = rotor.animate(
          [{transform: 'rotate(0deg)'}, {transform: 'rotate(360deg)'}],
          {duration: INVERTER_FAN_MAX_ROTATION_MS, iterations: Infinity}
        );
        inverterFanAnimation.pause();
      }
      if (!shouldRotate) {
        // Decelerate instead of abruptly pausing when the next Modbus poll
        // reports 0 %. A later non-zero value replaces this target in-place.
        inverterFanTargetRate = 0;
        inverterFanPauseAtRest = true;
        smoothlyUpdateInverterFanRate(inverterFanAnimation, 0);
        return;
      }

      const playbackRate = effectiveSpeed / 100;
      inverterFanPauseAtRest = false;
      if (inverterFanAnimation.playState === 'paused') {
        // Resume from zero and ramp up; reusing the same animation timeline
        // keeps the blade position continuous between telemetry updates.
        setInverterFanPlaybackRate(inverterFanAnimation, 0);
        inverterFanAnimation.play();
      }
      smoothlyUpdateInverterFanRate(inverterFanAnimation, playbackRate);
    }

    function formatEnergy(kilowattHours) {
      if (kilowattHours === null || kilowattHours === undefined || kilowattHours === '') return t('noData');
      const value = Number(kilowattHours);
      if (!Number.isFinite(value)) return t('noData');
      const locale = currentLanguage === 'uk' ? 'uk-UA' : currentLanguage === 'ru' ? 'ru-RU' : 'en-GB';
      if (value < 1) return `${Math.round(value * 1000).toLocaleString(locale)} Wh`;
      if (value < 1000) return `${value.toLocaleString(locale, {maximumFractionDigits: 2})} kWh`;
      return `${(value / 1000).toLocaleString(locale, {maximumFractionDigits: 2})} MWh`;
    }
    function renderGridConsumptionEnergy(registers = []) {
      const valuesByRegister = new Map(registers.map(register => [Number(register.register), register]));
      // R449/R451/R453 are the live 32-bit grid-import counters (their high
      // words R448/R450/R452 are read in the same fast block).  R184–R186
      // remain a compatibility fallback for devices that expose those totals.
      const firstAvailableValue = numbers => numbers
        .map(number => registerNumericValue(valuesByRegister.get(number)))
        .find(Number.isFinite);
      const values = {
        '#grid-energy-today': firstAvailableValue([449, 184]),
        '#grid-energy-month': firstAvailableValue([451, 185]),
        '#grid-energy-year': firstAvailableValue([453, 186])
      };
      Object.entries(values).forEach(([selector, value]) => {
        const element = document.querySelector(selector);
        if (element) element.textContent = formatEnergy(value);
      });
    }
    function renderEnergyFlow(data, registers = data.registers || []) {
      const byNumber = new Map(registers.map(register => [register.register, register]));
      const firstRegister = numbers => numbers
        .map(number => byNumber.get(number))
        .find(register => register?.available);
      const numberValue = numbers => {
        const register = firstRegister(numbers);
        return registerNumericValue(register);
      };
      const summedValue = numbers => {
        const values = numbers
          .map(number => byNumber.get(number))
          .filter(register => register?.available)
          .map(register => registerNumericValue(register))
          .filter(Number.isFinite);
        return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
      };
      const registerText = (sources, fallbackNumbers = []) => {
        const actualNumbers = sources
          .flat()
          .map(source => typeof source === 'number' ? source : source?.register)
          .filter(Number.isFinite);
        const numbers = actualNumbers.length ? actualNumbers : fallbackNumbers;
        return [...new Set(numbers)].map(number => `R${number}`).join(' · ') || '—';
      };
      const selectedRegisterText = cardKey =>
        flowCardSelection(cardKey).map(number => `R${number}`).join(', ') || t('noData');
      const reading = (value, unit, digits = 0) =>
        Number.isFinite(value) ? `${Number(value.toFixed(digits))} ${unit}` : t('noData');
      const modeDetails = (source, modes) => {
        const raw = Number(source?.raw);
        if (!source?.available || !Number.isFinite(raw) || raw === 65535) {
          return {label: '—', description: ''};
        }
        // Never leak an undecoded register number into the flow card. The
        // register interpreter has the V1.31 definition (or explicitly says
        // that the value is unknown), and is also localized.
        return modes[raw] || {label: '?', descriptionText: registerInterpretation(source)};
      };
      const setText = (selector, value) => {
        const element = document.querySelector(selector);
        if (element && element.textContent !== value) element.textContent = value;
      };
      const setModeText = (selector, definitionSelector, mode) => {
        const fullLabel = String(mode.label ?? '\u2014');
        const displayLabel = Array.from(fullLabel).slice(0, 3).join('');
        const description = mode.descriptionText || (mode.description ? t(mode.description) : '');
        setText(definitionSelector, description);
        const element = document.querySelector(selector);
        if (element) {
          if (mode.icon) {
            element.textContent = '';
            element.dataset.sourceIcon = mode.icon;
            element.classList.add('energy-source-icon');
          } else {
            delete element.dataset.sourceIcon;
            element.classList.remove('energy-source-icon');
            if (element.textContent !== displayLabel) element.textContent = displayLabel;
          }
          element.setAttribute('aria-label', fullLabel);
          element.title = [fullLabel, description].filter(Boolean).join(' \u2014 ');
        }
      };
      const setFlow = (selector, enabled, reverse, watts) => {
        const connector = document.querySelector(selector);
        if (!connector) return;
        const now = performance.now();
        const previous = flowAnimationStates.get(selector) || {
          active: false,
          reverse: false,
          lastConfirmedAt: 0
        };
        const confirmedActive = Boolean(enabled);
        const selectedRate = Number(document.querySelector('#modbus-poll-rate')?.value) ?? 0;
        const holdMilliseconds = Math.max(750, (requestIntervals[selectedRate] ?? 2000) * 1.25);
        const temporarilyMissing = !confirmedActive && !Number.isFinite(watts);
        const active = confirmedActive || (
          temporarilyMissing
          && previous.active
          && now - previous.lastConfirmedAt <= holdMilliseconds
        );
        const directionReversed = confirmedActive ? Boolean(reverse) : previous.reverse;

        // Set the speed only when a flow starts. Updating animation-duration on
        // every Modbus cycle restarts the CSS animation and causes visible flicker.
        if (active && !previous.active) {
          const strength = Number.isFinite(watts) ? Math.abs(watts) : 0;
          const duration = Math.max(.55, Math.min(2.2, 2.2 - strength / 5000 * 1.5));
          connector.style.setProperty('--flow-duration', `${duration.toFixed(2)}s`);
        }
        if (connector.classList.contains('active') !== active) {
          connector.classList.toggle('active', active);
        }
        if (connector.classList.contains('reverse') !== directionReversed) {
          connector.classList.toggle('reverse', directionReversed);
        }
        flowAnimationStates.set(selector, {
          active,
          reverse: directionReversed,
          lastConfirmedAt: confirmedActive ? now : previous.lastConfirmedAt
        });
      };

      const gridVoltageSource = firstRegister([81, 433]);
      const flowStateSource = firstRegister([69]);
      const simplifiedStateSource = firstRegister([67, 325]);
      const gridCurrentSource = firstRegister([82, 434]);
      const gridPowerSource = firstRegister([84, 436]);
      const gridModeSource = firstRegister([67, 325]);
      const generatorVoltageSource = firstRegister([85]);
      const generatorCurrentSource = firstRegister([86]);
      const generatorPowerSource = firstRegister([88]);
      const pvVoltageSource = firstRegister([609, 151, 154]);
      const pvPowerSource = firstRegister([161, 153, 156]);
      const loadPowerSource = firstRegister([541, 92, 188]);
      // R545 is the verified detailed output-load reading. R94 is the
      // fast-block fallback when detailed registers are unavailable.
      const inverterLoadSource = firstRegister([545, 94]);
      const inverterFanSpeedSource = firstRegister([801]);
      const outputVoltageSource = firstRegister([537, 89]);
      const outputCurrentSource = firstRegister([90, 539]);
      // The BMS bank (R404/R405/R407) is read on every fast cycle and is the
      // live source shown by the battery card.  Prefer it over the optional
      // inverter fast-bank values so a BMS-reported discharge is animated even
      // when R130 was not selected for an extra read.
      const batteryVoltageSource = firstRegister([404, 137, 129, 342]);
      const batteryCurrentSource = firstRegister([405, 130]);
      const batterySocSource = firstRegister([407, 139, 133, 339]);
      const batteryPowerSource = firstRegister([134, 149]);
      const inverterPrioritySource = firstRegister([529, 323, 16643]);
      const inverterAcModeSource = firstRegister([530, 321, 16644]);
      const inverterChargeModeSource = firstRegister([324, 16645]);
      const inverterStateSource = simplifiedStateSource;
      const gridVoltage = registerNumericValue(gridVoltageSource);
      const measuredGridCurrent = registerNumericValue(gridCurrentSource);
      const measuredGridPower = registerNumericValue(gridPowerSource);
      const measuredGeneratorVoltage = registerNumericValue(generatorVoltageSource);
      const measuredGeneratorCurrent = registerNumericValue(generatorCurrentSource);
      const measuredGeneratorPower = registerNumericValue(generatorPowerSource);
      const pv1Power = numberValue([153]);
      const pv2Power = numberValue([156]);
      const producingPvVoltage = Number.isFinite(pv2Power) && (!Number.isFinite(pv1Power) || pv2Power > pv1Power)
        ? numberValue([154, 151]) : numberValue([151, 154]);
      const pvVoltage = chartDemoRunning && Number.isFinite(demoPvVoltage)
        ? demoPvVoltage : numberValue([609]) ?? producingPvVoltage;
      const pvPower = chartDemoRunning && Number.isFinite(demoPvPower)
        ? demoPvPower : numberValue([161]) ?? summedValue([153, 156]);
      const measuredPvCurrent = summedValue([152, 155]);
      const pvCurrent = Number.isFinite(measuredPvCurrent)
        ? Math.abs(measuredPvCurrent)
        : null;
      const loadPowerReading = registerNumericValue(loadPowerSource);
      const measuredLoadPower = Number.isFinite(loadPowerReading) ? loadPowerReading : null;
      const inverterLoad = registerNumericValue(inverterLoadSource);
      const inverterFanSpeed = registerNumericValue(inverterFanSpeedSource);
      const outputVoltage = registerNumericValue(outputVoltageSource);
      const outputCurrent = registerNumericValue(outputCurrentSource);
      const batteryVoltage = registerNumericValue(batteryVoltageSource);
      const batteryCurrentReading = registerNumericValue(batteryCurrentSource);
      const batteryCurrent = Number.isFinite(batteryCurrentReading) ? batteryCurrentReading : null;
      const batterySoc = registerNumericValue(batterySocSource);
      const batteryPowerReading = registerNumericValue(batteryPowerSource);
      const calculatedBatteryPower = Number.isFinite(batteryVoltage) && Number.isFinite(batteryCurrent)
        ? batteryVoltage * batteryCurrent
        : null;
      // Keep the sign supplied by the live power value. If power is not
      // available, voltage × signed current provides the same convention.
      const batteryPower = Number.isFinite(batteryPowerReading)
        ? batteryPowerReading
        : calculatedBatteryPower;
      const liveMeasurementsFresh = chartDemoRunning || Boolean(data.online);
      const terminalStateSource = firstRegister([68]);
      const terminalState = liveMeasurementsFresh ? decodeEnergyTerminalState(terminalStateSource) : null;
      const energyFlowState = liveMeasurementsFresh ? decodeEnergyFlowState(flowStateSource) : null;
      const inverterState = decodeBoundedRegister(inverterStateSource, 10);
      const parallelState = 0;
      // These R67/R325 states are not an operating energy route. Do not infer
      // animated power arrows from leftover measurements while the unit is
      // starting, idle, faulted, stopped, factory-testing, or updating.
      const flowSuppressedByState = [0, 1, 2, 7, 8, 9, 10].includes(inverterState);
      const measuredBatteryConnected = (Number.isFinite(batteryVoltage) && Math.abs(batteryVoltage) > 5)
        || (Number.isFinite(batteryCurrent) && Math.abs(batteryCurrent) >= .05)
        || (Number.isFinite(batteryPower) && Math.abs(batteryPower) >= 1);
      const batteryConnected = liveMeasurementsFresh && (
        terminalState?.battery !== 0 || measuredBatteryConnected
      );
      const measuredBatteryActive = (Number.isFinite(batteryCurrent) && Math.abs(batteryCurrent) >= .05)
        || (Number.isFinite(batteryPower) && Math.abs(batteryPower) >= 1);
      const measuredBatteryDirection = (Number.isFinite(batteryPower) && batteryPower <= -1)
        || (Number.isFinite(batteryCurrent) && batteryCurrent <= -.05)
        ? -1
        : (Number.isFinite(batteryPower) && batteryPower >= 1)
          || (Number.isFinite(batteryCurrent) && batteryCurrent >= .05)
          ? 1
          : 0;
      // The signed live reading is authoritative: negative is discharge and
      // positive is charge. R69/R68 are fallbacks only while power/current is
      // too close to zero to establish a real direction.
      const batteryActive = liveMeasurementsFresh && batteryConnected
        && (!flowSuppressedByState || measuredBatteryActive) && (energyFlowState
        && !measuredBatteryActive
        ? energyFlowState.rectifierToBattery || energyFlowState.batteryToInverter
        : measuredBatteryActive || (terminalState ? terminalState.battery === 2 || terminalState.battery === 3 : false)
      );
      const batteryCharging = batteryActive && (measuredBatteryDirection
        ? measuredBatteryDirection > 0
        : energyFlowState ? energyFlowState.rectifierToBattery && !energyFlowState.batteryToInverter
          : terminalState?.battery === 3);
      const batteryDischarging = batteryActive && (measuredBatteryDirection
        ? measuredBatteryDirection < 0
        : energyFlowState ? energyFlowState.batteryToInverter
          : terminalState?.battery === 2);
      const pvConnected = liveMeasurementsFresh && (Boolean(energyFlowState?.pvToRectifier) || (terminalState
        ? terminalState.pv1 !== 0 || terminalState.pv2 !== 0
        : Number.isFinite(pvVoltage) && Math.abs(pvVoltage) > .5));
      const pvNormal = energyFlowState?.pvToRectifier || (terminalState
        ? terminalState.pv1 === 2 || terminalState.pv2 === 2
        : pvConnected);
      const pvAbnormal = !energyFlowState?.pvToRectifier && terminalState
        ? (terminalState.pv1 === 1 || terminalState.pv2 === 1) && !pvNormal
        : false;
      const pvActive = liveMeasurementsFresh && !flowSuppressedByState && pvConnected && pvNormal && (energyFlowState
        ? energyFlowState.pvToRectifier
        : Number.isFinite(pvPower) && pvPower > 20);
      const pvSourceAvailable = liveMeasurementsFresh && (
        (Number.isFinite(pvVoltage) && Math.abs(pvVoltage) > 20)
        || (Number.isFinite(pvCurrent) && Math.abs(pvCurrent) >= .05)
        || (Number.isFinite(pvPower) && Math.abs(pvPower) >= 1)
      );
      const solarDataVisible = liveMeasurementsFresh && pvConnected;
      const pvReceiving = false;
      const gridVoltagePresent = Number.isFinite(gridVoltage) && Math.abs(gridVoltage) > 80;
      const measuredGridConnected = gridVoltagePresent
        || (Number.isFinite(measuredGridCurrent) && Math.abs(measuredGridCurrent) > .05)
        || (Number.isFinite(measuredGridPower) && Math.abs(measuredGridPower) > 20);
      // R81 is the physical mains input. R68 confirms whether that input is
      // electrically normal, but may lag a live R433/R434 measurement.
      const gridTerminalConnected = energyFlowState?.gridToRectifier || energyFlowState?.gridToLoad
        ? true
        : terminalState
        ? terminalState.grid !== 0 || measuredGridConnected
        : measuredGridConnected;
      const gridAvailable = liveMeasurementsFresh && gridTerminalConnected;
      const gridRouteActive = Boolean(energyFlowState?.gridToRectifier || energyFlowState?.gridToLoad);
      const gridNormal = gridRouteActive || (terminalState?.grid === 1 ? false : gridAvailable);
      const gridAbnormal = !gridRouteActive && terminalState?.grid === 1 && !measuredGridConnected;
      // R68 output bits can be stale while R537/R541 show a live household
      // load. The home is always the consuming endpoint of an online system;
      // never present it as a stopped inverter output.
      const outputConnected = liveMeasurementsFresh;
      const outputCanSupply = liveMeasurementsFresh;
      const loadPower = Number.isFinite(measuredLoadPower) ? Math.max(0, measuredLoadPower) : null;
      const batteryChargePower = batteryCharging && Number.isFinite(batteryPower) ? Math.abs(batteryPower) : 0;
      const batteryDischargePower = batteryDischarging && Number.isFinite(batteryPower) ? Math.abs(batteryPower) : 0;
      const calculatedGridPower = chartDemoRunning
        ? gridAvailable && Number.isFinite(measuredGridPower)
          ? measuredGridPower
          : gridAvailable && Number.isFinite(pvPower) && Number.isFinite(loadPower)
          ? loadPower + batteryChargePower - pvPower - batteryDischargePower
          : gridAvailable ? null : 0
        : gridAvailable && Number.isFinite(measuredGridPower)
          ? measuredGridPower
        : gridAvailable && Number.isFinite(loadPower)
            ? loadPower + batteryChargePower - batteryDischargePower - Math.max(0, pvPower || 0)
            : null;
      // This installation uses the grid as a one-way source. Some firmware
      // revisions report imported R84/R436 power with a negative CT sign, so
      // expose its magnitude and never infer an export from that sign.
      const gridPower = Number.isFinite(calculatedGridPower) ? Math.abs(calculatedGridPower) : null;
      const gridCurrent = gridAvailable && Number.isFinite(measuredGridCurrent)
        ? Math.abs(measuredGridCurrent)
        : Number.isFinite(gridPower) && Number.isFinite(gridVoltage) && Math.abs(gridVoltage) > .1
          ? gridPower / Math.abs(gridVoltage)
          : null;
      const generatorPower = chartDemoRunning && Number.isFinite(demoGeneratorPower)
        ? demoGeneratorPower
        : Number.isFinite(measuredGeneratorPower) ? Math.abs(measuredGeneratorPower) : null;
      const generatorVoltage = chartDemoRunning && Number.isFinite(demoGeneratorPower) && demoGeneratorPower > 20
        ? 230
        : Number.isFinite(measuredGeneratorVoltage) ? Math.abs(measuredGeneratorVoltage) : null;
      const generatorCurrent = Number.isFinite(measuredGeneratorCurrent)
        ? Math.abs(measuredGeneratorCurrent)
        : Number.isFinite(generatorPower) && Number.isFinite(generatorVoltage) && generatorVoltage > .1
          ? generatorPower / generatorVoltage
          : null;
      const measuredGeneratorConnected = Number.isFinite(generatorVoltage) && generatorVoltage > 80;
      const generatorConnected = liveMeasurementsFresh && (energyFlowState?.generatorToRectifier || energyFlowState?.generatorToLoad || (terminalState
        ? terminalState.generator !== 0
        : measuredGeneratorConnected));
      const generatorRouteActive = Boolean(energyFlowState?.generatorToRectifier || energyFlowState?.generatorToLoad);
      const generatorNormal = generatorRouteActive || (terminalState ? terminalState.generator === 2 : generatorConnected);
      const generatorAbnormal = !generatorRouteActive && terminalState?.generator === 1;
      const generatorActive = !flowSuppressedByState && generatorConnected && generatorNormal && (energyFlowState
        ? energyFlowState.generatorToRectifier || energyFlowState.generatorToLoad
        : (Number.isFinite(generatorPower) && generatorPower > 20)
          || (Number.isFinite(generatorCurrent) && generatorCurrent > .1));
      const generatorSourceAvailable = liveMeasurementsFresh && (
        (Number.isFinite(generatorVoltage) && Math.abs(generatorVoltage) > 80)
        || (Number.isFinite(generatorCurrent) && Math.abs(generatorCurrent) >= .05)
        || (Number.isFinite(generatorPower) && Math.abs(generatorPower) >= 1)
      );
      const batteryPowerSources = batteryPowerSource
        ? [batteryPowerSource]
        : [batteryVoltageSource, batteryCurrentSource];
      const gridRegisterSources = Number.isFinite(measuredGridPower)
        ? [gridPowerSource, gridCurrentSource, gridVoltageSource, gridModeSource]
        : gridAvailable && Number.isFinite(loadPower)
          ? [loadPowerSource, pvPowerSource, batteryPowerSources, gridVoltageSource, gridModeSource]
        : gridAvailable ? [gridModeSource, gridVoltageSource] : [gridModeSource];

      // The home is the load endpoint, not an inverter-controlled device.
      // Keep it visible and consuming even when output telemetry is delayed;
      // only the flow animation needs a fresh measurement.
      const homeConnected = true;
      const homeActive = liveMeasurementsFresh;
      const outputPriority = decodeBoundedRegister(inverterPrioritySource, 3);
      const priorityOutputSource = !energyFlowState && !flowSuppressedByState && homeActive
        ? outputSourceFromPriority(outputPriority, {
          grid: gridAvailable && gridNormal,
          pv: pvActive,
          battery: batteryDischarging,
          generator: generatorActive
        })
        : null;
      const homeFlowActive = liveMeasurementsFresh;
      const measuredGridSupplying = Number.isFinite(gridPower) && gridPower >= 1;
      const gridImporting = measuredGridSupplying
        ? true
        : energyFlowState
          ? energyFlowState.gridToRectifier || energyFlowState.gridToLoad
          : priorityOutputSource === 'grid';
      const gridFlowActive = (!flowSuppressedByState || measuredGridSupplying)
        && gridAvailable && gridNormal && gridImporting;
      const batterySupplyingOutput = energyFlowState
        ? batteryDischarging
        : priorityOutputSource ? priorityOutputSource === 'battery' : batteryDischarging;
      const gridFlowState = !gridAvailable
        ? 'off'
        : gridAbnormal ? 'abnormal'
          : gridFlowActive ? 'import' : 'ready';
      const batteryFlowState = !batteryConnected
        ? 'off'
        : terminalState?.battery === 1 ? 'low'
          : terminalState?.battery === 4 ? 'full'
            : batteryCharging ? 'charge'
              : batteryDischarging ? 'discharge' : 'idle';
      const solarFlowState = !pvConnected
        ? 'off'
        : pvAbnormal ? 'abnormal'
          : pvReceiving ? 'receiving'
            : pvActive ? 'supplying' : 'idle';
      const generatorFlowState = !generatorConnected
        ? 'off'
        : generatorAbnormal ? 'abnormal'
          : generatorActive ? 'supplying' : 'idle';
      if (!chartDemoRunning && !data.online) {
        lastRealFlowState = null;
      } else {
        const nextRealFlowState = [
          gridFlowState, batteryFlowState, solarFlowState, generatorFlowState
        ].join('|');
        if (lastRealFlowState !== null && lastRealFlowState !== nextRealFlowState) {
          const [previousGrid, previousBattery, previousSolar, previousGenerator] = lastRealFlowState.split('|');
          const notices = [];
          if (previousGrid !== gridFlowState) {
            const gridText = {
              off: t('notConnected'), abnormal: t('connectedAbnormal'), ready: t('gridReady'),
              import: t('gridSupplying')
            }[gridFlowState];
            notices.push(`${t('grid')}: ${gridText}`);
          }
          if (previousBattery !== batteryFlowState) {
            const batteryText = {
              off: t('notConnected'), low: t('batteryLow'), full: t('batteryFull'),
              idle: t('batteryIdle'), charge: t('charging'), discharge: t('discharging')
            }[batteryFlowState];
            notices.push(`${t('battery')}: ${batteryText}`);
          }
          if (previousSolar !== solarFlowState) {
            const solarText = {
              off: t('notConnected'), abnormal: t('connectedAbnormal'), idle: t('batteryIdle'),
              receiving: t('receiving'), supplying: t('supplying')
            }[solarFlowState];
            notices.push(`PV: ${solarText}`);
          }
          if (previousGenerator !== generatorFlowState) {
            const generatorText = {
              off: t('notConnected'), abnormal: t('connectedAbnormal'), idle: t('batteryIdle'),
              supplying: t('supplying')
            }[generatorFlowState];
            notices.push(`${t('generator')}: ${generatorText}`);
          }
          if (notices.length) window.showFlowChangeAlert?.(notices.join(' · '));
        }
        lastRealFlowState = nextRealFlowState;
      }
      const displayedGridVoltage = gridAvailable && Number.isFinite(gridVoltage)
        ? Math.abs(gridVoltage)
        : 0;
      const displayedHouseVoltage = Number.isFinite(outputVoltage) ? Math.abs(outputVoltage) : null;
      const displayedGridPower = gridAvailable && Number.isFinite(gridPower) ? gridPower : 0;
      const displayedGridCurrent = gridAvailable && Number.isFinite(gridCurrent) ? gridCurrent : 0;
      const measuredEnergyFlowActive = measuredBatteryActive || measuredGridSupplying
        || (Number.isFinite(pvPower) && pvPower > 20)
        || (Number.isFinite(generatorPower) && generatorPower > 20)
        || (Number.isFinite(loadPower) && loadPower > 20);
      const inverterActive = chartDemoRunning || (Boolean(data.online)
        && (!flowSuppressedByState || measuredEnergyFlowActive) && (
          pvConnected || outputConnected || batteryConnected || gridAvailable || generatorConnected
        ));
      const inverterOutputPriority = modeDetails(inverterPrioritySource, {
        0: {label: 'GPB', description: 'modeGpbShort'},
        1: {label: 'PGB', description: 'modePgbShort'},
        2: {label: 'PBG', description: 'modePbgShort'},
        3: {label: 'MKS', description: 'modeMksShort'}
      });
      // The source badge is part of the live flow card: prefer the R69 route
      // over R67's broad operating state or a ready-but-idle input terminal.
      const routedInputMode = energyFlowState
        ? energyFlowState.gridToRectifier || energyFlowState.gridToLoad
          ? {label: t('grid'), description: 'modeGridInputShort', icon: 'grid'}
          : energyFlowState.generatorToRectifier || energyFlowState.generatorToLoad
            ? {label: t('generator'), description: 'modeGeneratorInputShort', icon: 'generator'}
            : energyFlowState.pvToRectifier
              ? {label: 'PV', description: 'modeSolarShort', icon: 'pv'}
              : energyFlowState.batteryToInverter
                ? {label: t('battery'), description: 'modeBatteryInputShort', icon: 'battery'}
                : null
        : null;
      const inverterInputMode = !inverterActive
        ? {label: '—', description: ''}
        : routedInputMode || inverterState === 3 && gridAvailable
          ? {label: t('grid'), description: 'modeGridInputShort', icon: 'grid'}
          : inverterState === 4 && pvActive
            ? {label: 'PV', description: 'modeSolarShort', icon: 'pv'}
            : inverterState === 5 && batteryDischarging
              ? {label: t('battery'), description: 'modeBatteryInputShort', icon: 'battery'}
              : inverterState === 6 && generatorActive
                ? {label: t('generator'), description: 'modeGeneratorInputShort', icon: 'generator'}
                : gridAvailable
                  ? {label: t('grid'), description: 'modeGridInputShort', icon: 'grid'}
                  : pvActive
                    ? {label: 'PV', description: 'modeSolarShort', icon: 'pv'}
                    : batteryDischarging
                      ? {label: t('battery'), description: 'modeBatteryInputShort', icon: 'battery'}
                      : inverterState !== null
                        ? {label: '?', descriptionText: registerInterpretation(inverterStateSource)}
                        : {label: '—', description: ''};
      const inverterBatteryMode = modeDetails(inverterChargeModeSource, {
        0: {label: 'PNG', description: 'modePngShort'},
        1: {label: 'OPV', description: 'modeOpvShort'},
        2: {label: 'PVF', description: 'modePvfShort'}
      });

      const routeFlowState = flowSuppressedByState ? null : energyFlowState;
      const routeSources = uniqueLabels([
        gridImporting && t('grid'),
        (routeFlowState
          ? routeFlowState.generatorToRectifier || routeFlowState.generatorToLoad
          : generatorActive) && t('generator'),
        (routeFlowState ? routeFlowState.pvToRectifier : pvActive) && 'PV',
        batterySupplyingOutput && t('battery')
      ]);
      const routeDestinations = uniqueLabels([
        // R69 can lag actual output measurements; a live load always has a home destination.
        homeFlowActive && t('home'),
        batteryCharging && t('battery'),
        routeFlowState?.rectifierToInverter && !(
          routeFlowState.inverterToMainOutput || routeFlowState.inverterToSecondaryOutput
        ) && t('inverter')
      ]);
      const topologyCode = parallelTopologyCode(parallelState);
      const routeText = routeSources.length && routeDestinations.length
        ? `${routeSources.join(' + ')} → ${routeDestinations.join(' + ')}`
        : inverterState === 7
          ? t('flowFault')
          : [0, 1, 2, 8, 9, 10].includes(inverterState)
            ? t('flowStopped')
            : data.online ? t('batteryIdle') : t('offline');
      const demoStatus = chartDemoRunning ? t(demoFlowCase || 'demoMode') : '';
      const statusText = [demoStatus, topologyCode, routeText].filter(Boolean).join(' · ');
      setText('#energy-flow-status', statusText);
      const statusElement = document.querySelector('#energy-flow-status');
      if (statusElement) {
        statusElement.title = [
          inverterStateSource && `R${inverterStateSource.register}: ${registerInterpretation(inverterStateSource) || inverterStateSource.display}`,
          flowStateSource && `R${flowStateSource.register}: ${registerInterpretation(flowStateSource) || flowStateSource.display}`,
        ].filter(Boolean).join('\n');
      }
      setText('#energy-solar-registers', chartDemoRunning
        ? t('demoMode')
        : registerText([pvVoltageSource, pvPowerSource], [151, 153, 154, 156]));
      setText('#energy-inverter-registers', registerText(
        [inverterLoadSource, inverterFanSpeedSource, inverterStateSource, flowStateSource, inverterPrioritySource, inverterChargeModeSource],
        [545, 94, 801, 67, 68, 69, 70, 529, 324]
      ));
      setText('#energy-home-registers', registerText(
        [outputCurrentSource, loadPowerSource, outputVoltageSource, flowStateSource],
        [90, 92, 537, 68, 69]
      ));
      setText('#energy-battery-registers', registerText(
        [batteryVoltageSource, batteryCurrentSource, batteryPowerSources, batterySocSource, flowStateSource],
        [129, 130, 134, 133, 68, 69]
      ));
      setText('#energy-grid-registers', registerText([gridRegisterSources, flowStateSource], [84, 82, 69]));
      setText('#energy-generator-registers', chartDemoRunning
        ? t('demoMode')
        : registerText([generatorVoltageSource, generatorCurrentSource, generatorPowerSource, flowStateSource], [85, 86, 88, 69]));
      for (const cardKey of Object.keys(FLOW_CARD_CONFIG)) {
        setText(`#energy-${cardKey}-registers`, selectedRegisterText(cardKey));
      }
      DashboardRenderers.energyCard({
        nodeSelector: '#energy-solar-node',
        active: pvActive,
        valuesSelector: '.energy-solar-values',
        valuesVisible: solarDataVisible,
        values: {
          '#energy-solar-voltage': Number.isFinite(pvVoltage) ? reading(Math.abs(pvVoltage), 'V', 1) : '— V',
          '#energy-solar-power': Number.isFinite(pvPower) ? reading(Math.abs(pvPower), 'W') : '— W',
          '#energy-solar-current': Number.isFinite(pvCurrent) ? reading(pvCurrent, 'A', 1) : '— A'
        },
        directionSelector: '#energy-solar-direction',
        direction: !pvConnected
          ? t('notConnected')
          : pvAbnormal
            ? t('connectedAbnormal')
          : pvActive
            ? pvReceiving ? t('receiving') : t('supplying')
            : t('batteryIdle')
      });
      DashboardRenderers.energyCard({
        nodeSelector: '#energy-generator-node',
        active: generatorConnected,
        valuesSelector: '.energy-generator-values',
        valuesVisible: generatorConnected,
        values: {
          '#energy-generator-power': generatorConnected ? reading(generatorPower || 0, 'W') : '— W',
          '#energy-generator-current': generatorConnected ? reading(generatorCurrent || 0, 'A', 1) : '— A',
          '#energy-generator-voltage': generatorConnected ? reading(generatorVoltage, 'V', 1) : '— V'
        },
        directionSelector: '#energy-generator-direction',
        direction: generatorAbnormal
          ? t('connectedAbnormal')
          : generatorActive ? t('supplying') : generatorConnected ? t('batteryIdle') : t('notConnected')
      });
      const normalizedFanSpeed = Number.isFinite(inverterFanSpeed)
        ? Math.max(0, Math.min(100, inverterFanSpeed))
        : null;
      const fanSpeedRpmValue = Number.isFinite(normalizedFanSpeed)
        ? fanSpeedRpm(normalizedFanSpeed)
        : null;
      DashboardRenderers.energyCard({
        nodeSelector: '#energy-inverter-node',
        active: inverterActive,
        values: {
          '#energy-inverter-load': Number.isFinite(inverterLoad) ? reading(inverterLoad, '%', 1) : '— %',
          '#energy-inverter-fan-speed': Number.isFinite(fanSpeedRpmValue) ? reading(fanSpeedRpmValue, 'RPM', 0) : '— RPM'
        }
      });
      const inverterFanRow = document.querySelector('#energy-inverter-fan-row');
      updateInverterFanAnimation(inverterFanRow, normalizedFanSpeed);
      setModeText('#energy-inverter-ac-mode', '#energy-inverter-ac-definition', inverterOutputPriority);
      setModeText('#energy-inverter-input-mode', '#energy-inverter-input-definition', inverterInputMode);
      setModeText('#energy-inverter-charge-mode', '#energy-inverter-charge-definition', inverterBatteryMode);
      DashboardRenderers.energyCard({
        nodeSelector: '#energy-home-node',
        active: homeConnected,
        valuesSelector: '.energy-home-values',
        valuesVisible: homeConnected,
        values: {
          '#energy-home-current': Number.isFinite(outputCurrent) ? reading(Math.abs(outputCurrent), 'A', 2) : '— A',
          '#energy-home-voltage': Number.isFinite(displayedHouseVoltage) ? reading(displayedHouseVoltage, 'V', 1) : '— V',
          '#energy-home-power': Number.isFinite(loadPower) ? reading(loadPower, 'W') : '— W'
        },
        directionSelector: '#energy-home-direction',
        direction: t('consuming')
      });
      DashboardRenderers.energyCard({
        nodeSelector: '#energy-grid-node',
        active: gridAvailable,
        values: {
          '#energy-grid-power': reading(displayedGridPower, 'W'),
          '#energy-grid-current': reading(displayedGridCurrent, 'A', 2),
          '#energy-grid-voltage': reading(displayedGridVoltage, 'V', 1)
        },
        directionSelector: '#energy-grid-direction',
        direction: gridAbnormal
          ? t('connectedAbnormal')
          : gridFlowActive ? t('gridSupplying') : gridAvailable ? t('gridReady') : t('notConnected')
      });
      DashboardRenderers.energyCard({
        nodeSelector: '#energy-battery-node',
        active: liveMeasurementsFresh && batteryConnected,
        valuesSelector: '.energy-battery-values',
        valuesVisible: liveMeasurementsFresh && batteryConnected,
        values: {
          '#energy-battery-current': Number.isFinite(batteryCurrent) ? reading(batteryCurrent, 'A', 1) : '— A',
          '#energy-battery-power': Number.isFinite(batteryPower) ? reading(batteryPower, 'W') : '— W',
          '#energy-battery-voltage': Number.isFinite(batteryVoltage) ? reading(batteryVoltage, 'V', 1) : '— V'
        },
        directionSelector: '#energy-battery-direction',
        direction: !batteryConnected
          ? t('notConnected')
          : terminalState?.battery === 1
            ? t('batteryLow')
            : terminalState?.battery === 4
              ? t('batteryFull')
              : batteryActive
          ? batteryCharging
            ? t('charging')
            : batteryDischarging ? t('discharging') : t('batteryIdle')
          : t('batteryIdle')
      });
      const batteryIcon = document.querySelector('#energy-battery-icon');
      const effectiveSoc = effectiveBatterySoc(batterySoc, terminalState);
      const batteryLevelKnown = Number.isFinite(effectiveSoc);
      const batteryLevel = effectiveSoc ?? 0;
      batteryIcon?.style.setProperty('--battery-level', `${batteryLevel}%`);
      setText('#energy-battery-percent', batteryLevelKnown ? `${Math.round(batteryLevel)}%` : '—');
      batteryIcon?.setAttribute(
        'aria-label',
        batteryLevelKnown ? `${t('battery')} ${Math.round(batteryLevel)}%` : `${t('battery')} ${t('noData')}`
      );
      renderFlowCardValues('solar', '.energy-solar-values', registers, solarDataVisible);
      renderFlowCardValues('inverter', '.energy-inverter-values', registers, true);
      renderFlowCardValues('generator', '.energy-generator-values', registers, generatorConnected);
      renderFlowCardValues('home', '.energy-home-values', registers, homeConnected);
      renderFlowCardValues('grid', '.energy-grid-values', registers, gridAvailable);
      renderFlowCardValues('battery', '.energy-battery-values', registers, liveMeasurementsFresh && batteryConnected);
      syncFlowCardSelectionsForFastPoll();
      // PV is a one-way source and can only supply the inverter.
      setFlow('#energy-pv-flow', pvActive && inverterActive && !pvReceiving, false, pvPower);
      document.querySelector('#energy-pv-flow')?.classList.toggle('disconnected', !pvSourceAvailable);
      // Home is deliberately one-way: it can consume energy but never supply it.
      setFlow('#energy-home-flow', homeFlowActive, false, loadPower);
      document.querySelector('#energy-home-flow')?.classList.toggle('disconnected', !homeConnected);
      // Generator is a one-way source: animation always travels toward the inverter.
      setFlow(
        '#energy-generator-flow',
        generatorActive && inverterActive,
        true,
        generatorActive ? generatorPower : 0
      );
      document.querySelector('#energy-generator-flow')?.classList.toggle('disconnected', !generatorSourceAvailable);
      // Grid is a one-way source; animation always travels toward the inverter.
      setFlow(
        '#energy-grid-flow',
        gridFlowActive && inverterActive,
        true,
        gridFlowActive ? Math.abs(gridPower || 0) : 0
      );
      document.querySelector('#energy-grid-flow')?.classList.toggle('disconnected', !(
        liveMeasurementsFresh && measuredGridConnected
      ));
      // Battery and inverter exchange energy in both directions.
      setFlow('#energy-battery-flow', batteryActive && inverterActive, batteryCharging && !batterySupplyingOutput, batteryPower);
      document.querySelector('#energy-battery-flow')?.classList.toggle('disconnected', !(
        liveMeasurementsFresh && measuredBatteryConnected
      ));

      const status = document.querySelector('#energy-flow-status');
      status?.classList.toggle('active', inverterActive);
    }

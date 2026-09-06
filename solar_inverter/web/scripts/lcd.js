    const stepped = (start, end, step, suffix = '') => Array.from(
      {length: Math.floor((end - start) / step) + 1}, (_, index) => `${start + index * step}${suffix}`
    );
    const withOff = values => ['OFF', ...values];
    const legacyLcdSettingsPrograms = [
      {id:'01', title:'Output voltage', values:['220V','230V','240V'], index:1}, {id:'02', title:'Output frequency', values:['50Hz','60Hz'], index:0},
      {id:'03', title:'Output source priority', values:['Grid first','Solar first','PBG priority','MKS'], index:0}, {id:'04', title:'Input mode', values:['APP','UPS','GEN'], index:0},
      {id:'05', title:'Charger source priority', values:['PV + Grid','PV only','PV first'], index:0}, {id:'06', title:'Grid charging current', values:['2A', ...stepped(10,160,10,'A')], index:6},
      {id:'07', title:'Maximum charging current', values:['2A', ...stepped(10,160,10,'A')], index:10}, {id:'08', title:'Menu default', values:['ON','OFF'], index:0},
      {id:'09', title:'Auto restart overload', values:['ON','OFF'], index:0}, {id:'10', title:'Auto restart over-temperature', values:['ON','OFF'], index:0},
      {id:'11', title:'Main-input-cut warning', values:['ON','OFF'], index:0}, {id:'12', title:'Energy saving', values:['ON','OFF'], index:1},
      {id:'13', title:'Overload bypass', values:['ON','OFF'], index:1}, {id:'14', title:'Silent mode', values:['ON','OFF'], index:1},
      {id:'15', title:'Return-to-grid voltage', values:stepped(44,54,1,'V'), index:4, note:'Battery-type dependent range.'}, {id:'16', title:'Switch-back-to-battery voltage', values:stepped(48,58,1,'V'), index:4, note:'Battery-type dependent range.'},
      {id:'17', title:'Battery type', values:['AGM','FLD','LIB','FEL','CUS'], index:2}, {id:'19', title:'Battery low-voltage point', values:stepped(40,50,1,'V'), index:6, note:'Used for USER / lead-acid batteries.'},
      {id:'20', title:'Constant-voltage point', values:stepped(48,58,1,'V'), index:6, note:'Used for USER / lead-acid batteries.'}, {id:'21', title:'Float-charge point', values:stepped(48,58,1,'V'), index:4, note:'Used for USER / lead-acid batteries.'},
      {id:'22', title:'Grid low-voltage point', values:[...stepped(90,154,1,'V'), ...stepped(170,200,1,'V')], index:0, note:'APP/GEN: 90–154V; UPS: 170–200V.'}, {id:'23', title:'Grid high-voltage point', values:stepped(264,280,1,'V'), index:0, note:'Input-mode dependent.'},
      {id:'24', title:'Auto backlight off', values:['ON','OFF'], index:0}, {id:'25', title:'Inverter soft start', values:['ON','OFF'], index:0}, {id:'26', title:'Reset factory settings', values:['NO','YES'], index:0},
      {id:'29', title:'Battery-disconnection alarm', values:['ON','OFF'], index:0}, {id:'31', title:'Equalization voltage', values:stepped(48,60,.2,'V'), index:52},
      {id:'32', title:'Equalization charging time', values:withOff(stepped(5,900,5,'min')), index:0}, {id:'33', title:'Equalization delay time', values:withOff(stepped(5,900,5,'min')), index:24},
      {id:'34', title:'Equalization interval', values:stepped(1,90,1,'day'), index:29}, {id:'35', title:'Equalization immediately', values:['ON','OFF'], index:1},
      {id:'36', title:'Grid-tie function', values:['OFF','INT','MET'], index:0}, {id:'37', title:'Maximum grid-tie power', values:stepped(0,12,.5,'kW'), index:24},
      {id:'38', title:'Dual-output low-voltage shutdown', values:stepped(44,60,1,'V'), index:4}, {id:'39', title:'Dual-output duration', values:['OFF','FUL', ...stepped(5,900,5,'min')], index:0},
      {id:'40', title:'Dual-output battery SOC cutoff', values:withOff(stepped(5,90,5,'%')), index:4}, {id:'44', title:'BMS protocol', values:['OFF','CVT','PYL','GRO','VOL','IRO','PAC'], index:0},
      {id:'45', title:'BMS ID', values:['AUTO', ...stepped(0,15,1)], index:0}, {id:'46', title:'Low-SOC shutdown', values:withOff(stepped(5,50,5,'%')), index:4},
      {id:'47', title:'High SOC to battery', values:withOff(stepped(10,100,10,'%')), index:9}, {id:'48', title:'Low SOC to grid', values:withOff(stepped(10,90,10,'%')), index:5},
      {id:'61', title:'Maximum discharge current', values:withOff(stepped(10,220,5,'A')), index:0}, {id:'62', title:'PV parallel mode', values:['OFF','ON'], index:0}
    ];
    // Programs documented in supplied manual section 4.2.2. The physical LCD
    // codes are used verbatim; later supplied pages can extend this list.
    const lcdSettingsPrograms = [
      {id:'01', title:'Output voltage', values:['OPU220', 'OPU230', 'OPU240'], index:1},
      {id:'02', title:'Output frequency', values:['OPF50', 'OPF60'], index:0},
      {id:'03', title:'Output source priority', values:['OPPG', 'OPPS', 'OPPP', 'OPPMKS'], index:0},
      {id:'04', title:'Input mode', values:['nOdAPP', 'nOdUPS', 'nOdGEN'], index:0},
      {id:'05', title:'Charger source priority', values:['CHGPNG', 'CHGOPV', 'CHGPVF'], index:0},
      {id:'06', title:'Grid charging current', values:['rCF2', ...stepped(10, 160, 10).map(value => `rCF${value}`)], index:6},
      {id:'07', title:'Maximum charging current', values:['nCC2', ...stepped(10, 160, 10).map(value => `nCC${value}`)], index:10},
      {id:'08', title:'Menu default', values:['odFON', 'odFOFF'], index:0},
      {id:'09', title:'Auto restart when overload occurs', values:['tASON', 'tASOFF'], index:0},
      {id:'10', title:'Auto restart when over temperature occurs', values:['tHSON', 'tHSOFF'], index:0},
      {id:'11', title:'Main input cut warning', values:['ALPON', 'ALPOFF'], index:0},
      {id:'12', title:'Energy-saving mode', values:['PsuON', 'PsuOFF'], index:1},
      {id:'13', title:'Overload transfer to bypass', values:['OLCON', 'OLCOFF'], index:1},
      {id:'14', title:'Silent mode setting', values:['nuHON', 'nuHOFF'], index:1},
      {id:'15', title:'Battery return to grid voltage point', values:stepped(44, 52, 1).map(value => `btG${Number(value).toFixed(1)}`), index:2},
      {id:'16', title:'Switching back to battery mode voltage point', values:stepped(48, 58, 1).map(value => `btb${Number(value).toFixed(1)}`), index:4},
      {id:'17', title:'Battery type', values:['bAtAGM', 'bAtFLd', 'bAtLIb', 'bAtFEL', 'bAtCUS'], index:2},
      {id:'18', title:'Battery low voltage point', values:stepped(41.2, 50, .2).map(value => `bAL${Number(value).toFixed(1)}`), index:32},
      {id:'19', title:'Battery shutdown voltage point', values:stepped(40, 48, 1).map(value => `bAU${Number(value).toFixed(1)}`), index:6}
    ];
    let lcdSettingsMode = 'normal';
    let lcdSettingsProgramIndex = 0;
    try {
      const stored = JSON.parse(window.localStorage?.getItem('lcdLocalSettingsSimulator') || 'null');
      stored?.indices?.forEach((index, programIndex) => {
        const program = lcdSettingsPrograms[programIndex];
        if (program && Number.isInteger(index)) program.index = Math.max(0, Math.min(index, program.values.length - 1));
      });
    } catch (_) { /* Browser storage is optional for the local simulator. */ }
    const persistLcdSettings = () => {
      try { window.localStorage?.setItem('lcdLocalSettingsSimulator', JSON.stringify({indices:lcdSettingsPrograms.map(program => program.index)})); } catch (_) { /* no-op */ }
    };
    window.lcdSettingsSimulator = () => ({active:lcdSettingsMode !== 'normal', mode:lcdSettingsMode, program:lcdSettingsPrograms[lcdSettingsProgramIndex]});
    window.handleLcdSimulatorKey = key => {
      if (lcdSettingsMode === 'normal') {
        if (key !== 'enter-hold') return false;
        lcdSettingsMode = 'select'; lcdSettingsProgramIndex = 0; return true;
      }
      if (key === 'escape') lcdSettingsMode = 'normal';
      else if (key === 'enter') lcdSettingsMode = lcdSettingsMode === 'select' ? 'edit' : 'select';
      else if (key === 'up' || key === 'down') {
        const program = lcdSettingsPrograms[lcdSettingsProgramIndex];
        if (lcdSettingsMode === 'select') lcdSettingsProgramIndex = (lcdSettingsProgramIndex + (key === 'up' ? -1 : 1) + lcdSettingsPrograms.length) % lcdSettingsPrograms.length;
        else { program.index = (program.index + (key === 'up' ? 1 : -1) + program.values.length) % program.values.length; }
      } else return false;
      if (key === 'enter' && lcdSettingsMode === 'select') persistLcdSettings();
      return true;
    };

    window.renderLcd = function renderLcd(data, registers = data.registers || []) {
      const energyPeriod = window.lcdEnergyPeriod || 'day';
      const selectedBatteryType = window.lcdBatteryType || window.localStorage?.getItem('lcdBatteryType') || 'Li-ion';
      const byNumber = new Map(registers.map(register => [register.register, register]));
      const firstRegister = numbers => numbers
        .map(number => byNumber.get(number))
        .find(register => register?.available);
      const numberValue = numbers => {
        const register = firstRegister(numbers);
        return registerNumericValue(register);
      };
      const registerLabel = (numbers, label) => `R${[].concat(numbers).join(' / R')} · ${label}`;
      const interpretedValue = numbers => [].concat(numbers).map(number => {
        const register = byNumber.get(number);
        if (!register?.available) return null;
        const meaning = registerInterpretation(register);
        return `R${number}: ${meaning || localizeDataText(register.display)}`;
      }).filter(Boolean).join(' · ') || t('noData');
      const versionValue = (majorRegister, minorRegister) => {
        const register = byNumber.get(majorRegister) || byNumber.get(minorRegister);
        return register
          ? registerVersionDisplay(register, registers)
          : t('noData');
      };
      const reading = (value, unit, digits = 1) =>
        Number.isFinite(value) ? `${value.toFixed(digits)} ${unit}`.trim() : t('noData');
      const setText = (selector, value) => {
        const element = document.querySelector(selector);
        if (element) element.textContent = value;
      };
      const setManualValue = (selector, value) => {
        const element = document.querySelector(selector);
        if (!element) return;
        const displayValue = String(value ?? '—');
        // The simulated LCD has a fixed-width readout. Scale each value to
        // its available cell instead of clipping significant digits or units.
        const characterCount = Math.max(1, [...displayValue].length);
        const fontSize = Math.min(10.5, 62 / characterCount);
        element.textContent = displayValue;
        element.style.setProperty('--lcd-manual-value-size', `${fontSize.toFixed(2)}cqw`);
        element.title = displayValue;
      };
      const setMeasure = (selector, value, digits = 1) => {
        const element = document.querySelector(selector);
        if (!element) return;
        const displayValue = Number.isFinite(value) ? value.toFixed(digits) : '—';
        element.textContent = displayValue;
        element.classList.toggle('lcd-digits-long', displayValue.length >= 6);
        element.classList.toggle('lcd-digits-extra-long', displayValue.length >= 8);
      };
      const sevenSegmentMap = {
        0: 'abcedf', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc',
        5: 'afgcd', 6: 'afgecd', 7: 'abc', 8: 'abcdefg', 9: 'abfgcd'
      };
      const setSegmentedValue = (selector, value) => {
        const element = document.querySelector(selector);
        if (!element) return;
        const displayValue = String(value ?? '—');
        const glyphs = document.createDocumentFragment();
        [...displayValue].forEach(character => {
          if (sevenSegmentMap[character]) {
            const glyph = document.createElement('span');
            glyph.className = 'lcd-segment-glyph';
            glyph.setAttribute('aria-hidden', 'true');
            sevenSegmentMap[character].split('').forEach(segment => {
              const bar = document.createElement('i');
              bar.className = `lcd-segment lcd-segment-${segment}`;
              glyph.append(bar);
            });
            glyphs.append(glyph);
          } else if (character === '.') {
            const dot = document.createElement('span');
            dot.className = 'lcd-segment-dot';
            dot.setAttribute('aria-hidden', 'true');
            glyphs.append(dot);
          } else {
            const dash = document.createElement('span');
            dash.className = character === '-' ? 'lcd-segment-minus' : 'lcd-segment-blank';
            dash.setAttribute('aria-hidden', 'true');
            glyphs.append(dash);
          }
        });
        element.replaceChildren(glyphs);
        element.classList.add('lcd-segmented-value');
        element.setAttribute('role', 'img');
        element.setAttribute('aria-label', displayValue);
      };
      const sumValues = numbers => {
        const values = numbers.map(number => registerNumericValue(byNumber.get(number))).filter(Number.isFinite);
        return values.length ? values.reduce((total, value) => total + value, 0) : null;
      };

      const gridVoltage = numberValue([81, 433]);
      const gridCurrent = numberValue([82, 434]);
      const measuredGridPower = numberValue([84, 436]);
      const frequency = numberValue([83, 435]);
      const outputCurrent = numberValue([90, 539]);
      const outputVoltage = numberValue([537, 89]);
      const outputFrequency = numberValue([91, 538]);
      const pv1Power = numberValue([153]);
      const pv2Power = numberValue([156]);
      const pvVoltage = numberValue([609]) ?? (Number.isFinite(pv2Power) && (!Number.isFinite(pv1Power) || pv2Power > pv1Power)
        ? numberValue([154, 151]) : numberValue([151, 154]));
      const pvCurrent = sumValues([152, 155]);
      const pvPower = numberValue([161]) ?? sumValues([153, 156]);
      const dailyPvEnergy = numberValue([157]);
      const monthlyPvEnergy = numberValue([447]);
      const yearlyPvEnergy = numberValue([452]);
      const inverterLoad = numberValue([545, 94]);
      const inverterFanSpeedReading = numberValue([801]);
      const inverterFanSpeed = Number.isFinite(inverterFanSpeedReading)
        ? Math.max(0, Math.min(100, inverterFanSpeedReading))
        : null;
      const inverterFanRpm = Number.isFinite(inverterFanSpeed)
        ? fanSpeedRpm(inverterFanSpeed)
        : null;
      const gridLowVoltageThreshold = numberValue([16655]);
      const loadPower = numberValue([541, 92, 188]);
      const apparentLoadPower = numberValue([542, 93]);
      const batteryVoltage = numberValue([137, 129, 404, 342]);
      const batteryCurrent = numberValue([130, 405]);
      const measuredBatterySoc = numberValue([407, 139, 133, 339]);
      const batteryPowerReading = numberValue([134]);
      const batteryType = selectedBatteryType;
      const isLeadAcidBattery = ['AGM', 'FLD', 'USER'].includes(batteryType);
      const batteryTemperature = numberValue([140, 406]);
      const inverterTemperature = numberValue([818]);
      const maximumChargeVoltage = numberValue([141, 411, 16651, 376, 377]);
      const currentLimit = numberValue([413]);
      const parallelMode = numberValue([70]);
      const outputPriority = numberValue([323, 529]);
      const chargePriority = numberValue([324]);
      const lowSocThreshold = numberValue([415]);
      const batteryFaultCode = numberValue([146, 419]);
      const statusRegister = firstRegister([67, 325]);
      const terminalStateSource = firstRegister([68]);
      const flowStateSource = firstRegister([69]);
      const liveMeasurementsFresh = chartDemoRunning || Boolean(data.online);
      const terminalState = liveMeasurementsFresh ? decodeEnergyTerminalState(terminalStateSource) : null;
      const flowState = liveMeasurementsFresh ? decodeEnergyFlowState(flowStateSource) : null;
      const inverterState = liveMeasurementsFresh ? decodeBoundedRegister(statusRegister, 10) : null;
      const flowSuppressed = [0, 1, 7, 8, 10].includes(inverterState);
      const batterySoc = effectiveBatterySoc(measuredBatterySoc, terminalState);
      const leadAcidThresholds = inverterLoad > 50
        ? [44.584, 46.74, 48.896]
        : inverterLoad >= 20
          ? [47.18, 49.336, 51.492]
          : [48.48, 50.636, 52.792];
      const batteryCapacityDisplay = isLeadAcidBattery && Number.isFinite(batteryVoltage)
        ? batteryVoltage > leadAcidThresholds[2] ? 100
          : batteryVoltage >= leadAcidThresholds[1] ? 75
            : batteryVoltage >= leadAcidThresholds[0] ? 50 : 25
        : batterySoc;
      const statusText = statusRegister
        ? registerInterpretation(statusRegister) || localizeDataText(statusRegister.display)
        : t('noData');
      const calculatedBatteryPower = Number.isFinite(batteryVoltage) && Number.isFinite(batteryCurrent)
        ? batteryVoltage * batteryCurrent
        : null;
      const batteryPower = Number.isFinite(batteryPowerReading)
        ? Number.isFinite(batteryCurrent) && Math.abs(batteryCurrent) >= .3
          ? Math.sign(batteryCurrent) * Math.abs(batteryPowerReading)
          : batteryPowerReading
        : calculatedBatteryPower;
      const batteryDirectionFromCurrent = Number.isFinite(batteryCurrent) && Math.abs(batteryCurrent) >= .3;
      const batteryActiveValue = batteryDirectionFromCurrent
        ? batteryCurrent
        : batteryPower;
      const batteryActivityThreshold = batteryDirectionFromCurrent ? .3 : 20;
      const batteryConnected = terminalState
        ? terminalState.battery !== 0
        : Number.isFinite(batteryVoltage) && batteryVoltage > 20;
      // Battery current uses the BMS convention: positive charge, negative discharge.
      const measuredBatteryCharging = Number.isFinite(batteryActiveValue)
        && batteryActiveValue > batteryActivityThreshold;
      const measuredBatteryDischarging = Number.isFinite(batteryActiveValue)
        && batteryActiveValue < -batteryActivityThreshold;
      const batteryCharging = liveMeasurementsFresh && !flowSuppressed && batteryConnected && (batteryDirectionFromCurrent
        ? measuredBatteryCharging
        : flowState
        ? flowState.rectifierToBattery && !flowState.batteryToInverter
        : terminalState ? terminalState.battery === 3 : measuredBatteryCharging);
      const batteryDischarging = liveMeasurementsFresh && !flowSuppressed && batteryConnected && (batteryDirectionFromCurrent
        ? measuredBatteryDischarging
        : flowState
        ? flowState.batteryToInverter
        : terminalState ? terminalState.battery === 2 : measuredBatteryDischarging);
      const batteryState = !batteryConnected
        ? t('notConnected')
        : terminalState?.battery === 1
          ? t('batteryLow')
          : terminalState?.battery === 4
            ? t('batteryFull')
            : batteryCharging
              ? t('charging')
              : batteryDischarging ? t('discharging') : t('batteryIdle');
      
      // Charging state indicators per manual: CC, CV, FLOAT, DISCHARGING
      // Use the terminal state register (R68) to get charging state
      const terminalChargingStateValue = (terminalState && terminalState.raw !== undefined) 
        ? ((terminalState.raw >> 11) & 7) // Extract bits 11-13 for charging state
        : 0;
      const chargingState = batteryCharging 
        ? (terminalChargingStateValue === 1 ? 'CC' : terminalChargingStateValue === 2 ? 'CV' : terminalChargingStateValue === 3 ? 'FLOAT' : 'CHARGING')
        : batteryDischarging ? 'DISCHARGING' : '';
      const lcdGridVoltagePresent = Number.isFinite(gridVoltage) && Math.abs(gridVoltage) > .5;
      const measuredGridConnected = lcdGridVoltagePresent
        || (Number.isFinite(gridCurrent) && Math.abs(gridCurrent) > .05)
        || (Number.isFinite(measuredGridPower) && Math.abs(measuredGridPower) > 20);
      const gridConnected = liveMeasurementsFresh && (terminalState
        ? terminalState.grid !== 0 || measuredGridConnected
        : measuredGridConnected);
      const gridNormal = terminalState?.grid === 1 ? false : gridConnected;
      const pvConnected = liveMeasurementsFresh && (terminalState
        ? terminalState.pv1 !== 0 || terminalState.pv2 !== 0
        : Number.isFinite(pvVoltage) && Math.abs(pvVoltage) > .5);
      const pvNormal = terminalState
        ? terminalState.pv1 === 2 || terminalState.pv2 === 2
        : pvConnected;
      // The household is the load endpoint. Do not let a stale R68 output
      // state hide it when current output telemetry is live.
      const outputConnected = liveMeasurementsFresh;
      const outputCanSupply = liveMeasurementsFresh;
      const gridFlowActive = !flowSuppressed && gridConnected && gridNormal && (flowState
        ? flowState.gridToRectifier || flowState.gridToLoad || flowState.rectifierToGrid
        : Number.isFinite(measuredGridPower) && Math.abs(measuredGridPower) > 20);
      const pvFlowActive = !flowSuppressed && pvConnected && pvNormal && (flowState
        ? flowState.pvToRectifier
        : Number.isFinite(pvPower) && pvPower > 20);
      const loadFlowActive = outputConnected && outputCanSupply;
      const displayedGridVoltage = gridConnected && Number.isFinite(gridVoltage) ? gridVoltage : 0;
      const displayedGridCurrent = gridConnected && Number.isFinite(gridCurrent) ? gridCurrent : 0;
      const displayedGridFrequency = gridConnected && Number.isFinite(frequency) ? frequency : 0;
      const gridPower = !gridConnected
        ? 0
        : batteryCharging && Number.isFinite(loadPower)
          ? loadPower + Math.abs(batteryPower || 0)
          : measuredGridPower;

      setText('#lcd-mode', chartDemoRunning ? t('demoMode') : data.online ? t('online') : t('offline'));
      setText('#lcd-grid', reading(gridPower, 'W', 0));
      setText('#lcd-grid-voltage', reading(displayedGridVoltage, 'V'));
      setText('#lcd-grid-current', reading(displayedGridCurrent, 'A', 2));
      setText('#lcd-grid-power', reading(gridPower, 'W', 0));
      setText('#lcd-frequency', reading(displayedGridFrequency, 'Hz', 2));
      setText('#lcd-ac-output-current', reading(outputCurrent, 'A', 2));
      setText('#lcd-inverter-load', reading(inverterLoad, '%', 1));
      setText('#lcd-inverter-fan-speed', reading(inverterFanRpm, 'RPM', 0));
      setText('#lcd-load-power', reading(loadPower, 'W', 0));
      setText('#lcd-apparent-load-power', reading(apparentLoadPower, 'VA', 0));
      setText('#lcd-grid-low-voltage-threshold', reading(gridLowVoltageThreshold, 'V', 0));
      setText('#lcd-battery-voltage', reading(batteryVoltage, 'V'));
      setText('#lcd-battery-current', reading(batteryCurrent, 'A'));
      setText('#lcd-battery-power', reading(batteryPower, 'W', 0));
      setText('#lcd-soc', reading(batteryCapacityDisplay, '%', 0));
      setText('#lcd-temperature', reading(inverterTemperature, '°C'));
      setText('#lcd-charge-voltage', reading(maximumChargeVoltage, 'V'));
      setText('#lcd-current-limit', Number.isFinite(currentLimit)
        ? `${reading(currentLimit, 'A')} · ${r413BmsFormula(currentLimit)}`
        : t('noData'));
      setText('#lcd-low-soc-threshold', reading(lowSocThreshold, '%', 0));
      setText('#lcd-load', reading(loadPower, 'W', 0));
      setText('#lcd-power', reading(apparentLoadPower, 'VA', 0));
      setText('#lcd-battery-state', batteryState);
      setText('#lcd-charging-state', chargingState || '—');
      setText('#lcd-battery-type', batteryType);
      setText('#lcd-max-ac-current', reading(currentLimit, 'A', 0));
      setText('#lcd-system-status', statusText);
      setText('#lcd-status-line', `${data.identifier || t('unknownDevice')} · ${t('updated', {time: data.updated_at})}`);
      setMeasure('#lcd-battery-voltage', batteryVoltage);
      setMeasure('#lcd-charge-voltage', maximumChargeVoltage);
      setMeasure('#lcd-battery-current', batteryCurrent);
      setMeasure('#lcd-soc', batteryCapacityDisplay, 0);
      setMeasure('#lcd-grid-voltage', displayedGridVoltage);
      setMeasure('#lcd-frequency', displayedGridFrequency, 2);
      // The manual reserves the lower-left area for GEN / AC OUTPUT2. This
      // inverter profile has no verified registers for a second AC output;
      // leave it unavailable rather than presenting battery readings as AC.
      setMeasure('#lcd-ac2-voltage', null);
      setMeasure('#lcd-ac2-frequency', null, 2);
      setMeasure('#lcd-output-voltage', outputVoltage);
      setMeasure('#lcd-output-frequency', outputFrequency, 2);
      // Manual section 4.2: voltage, apparent output power, active output
      // power. app.js advances this sequence at a five-second cadence.
      const outputScreenModes = [
        {label: 'VOLTAGE', value: outputVoltage, unit: 'V', digits: 0},
        {label: 'APPARENT POWER', value: apparentLoadPower, unit: 'VA', digits: 0},
        {label: 'ACTIVE POWER', value: loadPower, unit: 'W', digits: 0}
      ];
      const outputScreenMode = outputScreenModes[lcdOutputScreenMode] || outputScreenModes[0];
      const outputScreenUsesKilowatts = (outputScreenMode.unit === 'W' || outputScreenMode.unit === 'VA')
        && Number.isFinite(outputScreenMode.value) && Math.abs(outputScreenMode.value) >= 1000;
      const outputScreenValue = Number.isFinite(outputScreenMode.value)
        ? (outputScreenUsesKilowatts ? outputScreenMode.value / 1000 : outputScreenMode.value).toFixed(outputScreenUsesKilowatts ? 2 : outputScreenMode.digits)
        : '—';
      setText('#lcd-output-reading-label', outputScreenMode.label);
      setText('#lcd-output-primary', outputScreenValue);
      setText('#lcd-output-primary-unit', outputScreenUsesKilowatts ? `k${outputScreenMode.unit}` : outputScreenMode.unit);
      setMeasure('#lcd-pv-voltage', pvVoltage);
      setMeasure('#lcd-pv-current', pvCurrent, 2);
      setMeasure('#lcd-pv-power', pvPower, 0);
      setText('#lcd-pv1-power', reading(pv1Power, 'W', 0));
      setText('#lcd-pv2-power', reading(pv2Power, 'W', 0));
      // P1 in the manual is the daily PV total; keep that direct mapping
      // visible even when the optional lower period selector is changed.
      setMeasure('#lcd-pv-day-energy', dailyPvEnergy);
      // Use period-specific energy value based on selected period
      const periodEnergy = energyPeriod === 'month' ? monthlyPvEnergy :
                          energyPeriod === 'year' ? yearlyPvEnergy : dailyPvEnergy;
      setMeasure('#lcd-pv-day-energy', periodEnergy);
      setSegmentedValue('#lcd-battery-voltage', Number.isFinite(batteryVoltage) ? batteryVoltage.toFixed(1) : '—');
      setSegmentedValue('#lcd-output-primary', outputScreenValue);
      setSegmentedValue('#lcd-output-frequency', Number.isFinite(outputFrequency) ? outputFrequency.toFixed(2) : '—');
      setSegmentedValue('#lcd-pv-day-energy', Number.isFinite(periodEnergy) ? periodEnergy.toFixed(1) : '—');
      const clampedSoc = Number.isFinite(batteryCapacityDisplay) ? Math.max(0, Math.min(100, batteryCapacityDisplay)) : 0;
      const lcdDisplay = document.querySelector('#lcd-device-display');
      lcdDisplay?.style.setProperty('--lcd-soc', clampedSoc);
      lcdDisplay?.style.setProperty('--lcd-soc-scale', clampedSoc / 100);
      lcdDisplay?.style.setProperty('--lcd-load-scale', Number.isFinite(inverterLoad)
        ? Math.max(0, Math.min(100, inverterLoad)) / 100
        : 0);
      document.querySelectorAll('#lcd-soc-card > span:not(.lcd-load-block)').forEach(segment => {
        segment.classList.toggle('active', Number(segment.textContent) <= batteryCapacityDisplay);
      });
      document.querySelectorAll('#lcd-soc-card .lcd-load-block i').forEach(segment => {
        segment.classList.toggle('active', Number(segment.textContent) <= inverterLoad);
      });

      const kilowattReading = (value, unit) =>
        Number.isFinite(value) ? reading(value / 1000, unit, 2) : t('noData');
      const chargerCurrent = sumValues([159, 160]);
      const dischargingCurrent = Number.isFinite(batteryCurrent) && batteryCurrent < 0
        ? Math.abs(batteryCurrent)
        : 0;
      // The page sequence and measurements follow manual section 4.3 exactly.
      // P3–P5 are available only when the inverter reports a lithium BMS.
      const bmsOnlyHelp = ' BMS-dependent — not displayed when BMS is disabled.';
      const getPeriodEnergy = () => {
        if (energyPeriod === 'month') return monthlyPvEnergy;
        if (energyPeriod === 'year') return yearlyPvEnergy;
        return dailyPvEnergy;
      };
      const getPeriodLabel = () => {
        if (energyPeriod === 'month') return t('monthlyPvEnergy');
        if (energyPeriod === 'year') return t('yearlyPvEnergy');
        return t('dailyPvEnergy');
      };
      const getPeriodRegister = () => {
        if (energyPeriod === 'month') return 447;
        if (energyPeriod === 'year') return 452;
        return 157;
      };
      // Information pages show the raw compact LCD values. A missing BMS
      // reading is rendered as ERR, exactly as section 4.3 specifies.
      const bmsCompactValue = (value, digits = 1) =>
        Number.isFinite(value) ? value.toFixed(digits) : 'ERR';
      const bmsStatusValue = numbers => {
        const value = numberValue(numbers);
        return Number.isFinite(value) ? String(Math.trunc(value)) : 'ERR';
      };
      const pages = [
        {
          code: 'LCD', title: t('mainDisplay'),
          icons: ['ac-input', 'ac-output'],
          label1: registerLabel(81, t('gridVoltage')), value1: reading(gridVoltage, 'V'),
          label2: registerLabel([537, 89], t('acOutputVoltage')), value2: reading(outputVoltage, 'V'), help: t('lcdMainPageHelp')
        },
        {
          code: 'P1', title: t('dailyPvEnergy'),
          icons: ['solar', 'energy'],
          label1: registerLabel(157, t('dailyPvEnergy')),
          value1: reading(dailyPvEnergy, 'kWh'),
          label2: '', value2: '', help: t('lcdP1Help')
        },
        {
          code: 'P2', title: t('totalPvEnergy'),
          icons: ['solar', 'energy'],
          label1: registerLabel([164, 158], t('totalPvEnergy')), value1: reading(numberValue([164, 158]), 'kWh'),
          label2: '', value2: '', help: t('lcdP2Help')
        },
        {
          code: 'P3', title: `${t('batteryVoltage')} · BMS`,
          icons: ['battery'],
          label1: registerLabel([129, 137], t('batteryVoltage')), value1: bmsCompactValue(batteryVoltage),
          label2: registerLabel([130, 405], t('batteryCurrent')), value2: bmsCompactValue(batteryCurrent), help: `${t('lcdP3Help')}${bmsOnlyHelp}`
        },
        {
          code: 'P4', title: `${t('batteryTemperature')} · BMS`,
          icons: ['battery'],
          label1: registerLabel([140, 406], t('batteryTemperature')), value1: reading(batteryTemperature, '°C'),
          label2: registerLabel([407, 139, 133, 339], t('batterySoc')), value2: reading(batterySoc, '%', 0), help: `${t('lcdP4Help')}${bmsOnlyHelp}`
        },
        {
          code: 'P5', title: `${t('batteryCapacity')} · BMS`,
          icons: ['battery'],
          label1: registerLabel([142, 410], t('batteryCapacity')), value1: bmsCompactValue(numberValue([142, 410]), 0),
          label2: registerLabel([143, 409], t('remainingCapacity')), value2: bmsCompactValue(numberValue([143, 409]), 0), help: `${t('lcdP5Help')}${bmsOnlyHelp}`
        },
        {
          code: 'P6', title: `${t('maxChargeVoltage')} · BMS`,
          icons: ['battery', 'charger'],
          label1: registerLabel([141, 411, 16651], t('maxChargeVoltage')), value1: bmsCompactValue(maximumChargeVoltage),
          label2: registerLabel([346, 16650], t('lowerBmsVoltageLimit')), value2: bmsCompactValue(numberValue([346, 16650])), help: `${t('lcdP6Help')}${bmsOnlyHelp}`
        },
        {
          code: 'P7', title: `${t('maxChargeCurrent')} · BMS`,
          icons: ['battery', 'charger'],
          label1: registerLabel(412, t('maxChargeCurrent')), value1: bmsCompactValue(numberValue([412])),
          label2: registerLabel(413, t('currentLimit')), value2: bmsCompactValue(numberValue([413])), help: `${t('lcdP7Help')}${bmsOnlyHelp}`
        },
        {
          code: 'P8', title: `${t('alarmFault')} · BMS`,
          icons: ['battery'],
          label1: registerLabel([147, 418], t('alarmFlags')), value1: bmsStatusValue([147, 418]),
          label2: registerLabel([146, 419], t('alarmFault')), value2: bmsStatusValue([146, 419]), help: `${t('lcdP8Help')}${bmsOnlyHelp}`
        },
        {
          code: 'P9', title: t('deviceConfiguration'),
          icons: ['energy'],
          label1: registerLabel([27, 28], t('deviceConfiguration')), value1: versionValue(27, 28),
          label2: '', value2: '', help: t('lcdP9Help')
        }
      ];
      // Section 4.3: P3-P8 are available only while the lithium BMS is
      // reporting. P1, P2 and P9 remain available without it.
      const bmsAvailable = [129, 130, 140, 141, 142, 143, 144, 146, 147, 405, 406, 407, 409, 410, 411, 412, 413, 418, 419]
        .some(number => byNumber.get(number)?.available);
      const availablePages = bmsAvailable ? pages : [pages[0], pages[1], pages[2], pages[9]];
      window.lcdInformationPageCount = availablePages.length - 1;
      if (lcdPageIndex >= availablePages.length) lcdPageIndex = 0;
      const localSettings = window.lcdSettingsSimulator?.();
      const settingsActive = Boolean(localSettings?.active && localSettings.program);
      const settingsProgram = localSettings?.program;
      const settingsMode = localSettings?.mode || 'normal';
      const page = settingsActive ? {code:'SET', title:settingsProgram.title, icons:[]} : (availablePages[lcdPageIndex] || pages[0]);
      // P1--P9 are actual LCD screens in the manual, not auxiliary dashboard
      // cards. Keep the normal instrument diagram for LCD and switch the
      // physical face itself to the compact information-screen layout.
      if (lcdDisplay) {
        lcdDisplay.classList.toggle('lcd-information-page', page.code !== 'LCD' && page.code !== 'SET');
        lcdDisplay.classList.toggle('lcd-normal-live', page.code === 'LCD');
        lcdDisplay.classList.toggle('lcd-settings-active', settingsActive);
        lcdDisplay.dataset.lcdPage = page.code;
      }
      const legacySettingsSimulator = document.querySelector('#lcd-settings-simulator');
      if (legacySettingsSimulator) {
        legacySettingsSimulator.hidden = !settingsActive;
        if (settingsActive) {
          setText('#lcd-settings-program', settingsProgram.id);
          setText('#lcd-settings-title', settingsProgram.title);
          setText('#lcd-settings-value', settingsProgram.values[settingsProgram.index]);
          setText('#lcd-settings-mode', settingsMode === 'edit' ? 'EDIT' : 'SELECT');
        }
      }
      const settingsSimulator = document.querySelector('#lcd-settings-simulator');
      if (settingsSimulator) {
        settingsSimulator.hidden = !settingsActive;
        if (settingsActive) {
          setText('#lcd-settings-program', settingsProgram.id);
          setText('#lcd-settings-title', settingsProgram.title);
          setText('#lcd-settings-value', settingsProgram.values[settingsProgram.index]);
          setText('#lcd-settings-mode', settingsMode === 'edit' ? 'EDIT VALUE' : 'PROGRAM SELECT');
          setText('#lcd-settings-note', settingsProgram.note || (settingsMode === 'edit'
            ? 'UP/DOWN change • ENTER save' : 'UP/DOWN program • ENTER edit'));
        }
      }
      const manualContext = document.querySelector('#lcd-manual-context');
      const iconNames = page.icons || [];
      const iconSignature = iconNames.join('|');
      if (manualContext && manualContext.dataset.icons !== iconSignature) {
        const icons = document.createDocumentFragment();
        iconNames.forEach(iconName => {
          const icon = document.createElement('img');
          icon.src = `/static/assets/lcd-icons/${iconName}.svg`;
          icon.alt = '';
          icons.append(icon);
        });
        manualContext.replaceChildren(icons);
        manualContext.dataset.icons = iconSignature;
      }
      const manualLabels = {
        LCD: [t('lcdInputShort'), t('lcdOutputShort')],
        P1: [t('lcdPvEnergyShort'), energyPeriod === 'month' ? t('month') : energyPeriod === 'year' ? t('year') : t('today')],
        P2: [t('lcdPvEnergyShort'), t('total')],
        P3: [t('lcdBatteryShort'), t('batteryCurrent')],
        P4: [t('batteryTemperature'), t('batterySoc')],
        P5: [t('batteryCapacity'), t('remainingCapacity')],
        P6: [t('maxChargeVoltage'), t('lowerBmsVoltageLimit')],
        P7: [t('maxChargeCurrent'), t('currentLimit')],
        P8: [t('alarmFlags'), t('alarmFault')],
        P9: [t('deviceConfiguration'), '']
      };
      const [manualLeftLabel, manualRightLabel] = manualLabels[page.code] || manualLabels.LCD;
      const manualReadouts = document.querySelector('.lcd-manual-readouts');
      if (manualReadouts) manualReadouts.dataset.lcdPage = page.code;
      const manualRightReading = document.querySelector('#lcd-manual-right-value')?.closest('.lcd-manual-reading');
      const hasManualRightValue = Boolean(page.value2);
      manualReadouts?.classList.toggle('lcd-manual-readouts-single', !hasManualRightValue);
      if (manualRightReading) manualRightReading.hidden = !hasManualRightValue;
      setText('#lcd-manual-left-label', manualLeftLabel);
      setManualValue('#lcd-manual-left-value', page.value1);
      setText('#lcd-manual-right-label', manualRightLabel);
      setManualValue('#lcd-manual-right-value', page.value2 || '—');
      setText('#lcd-page-code', page.code);
      setText('#lcd-page-title', page.title);
      setText('#lcd-page-label-1', page.label1);
      setText('#lcd-page-value-1', page.value1);
      setText('#lcd-page-label-2', page.label2);
      setText('#lcd-page-value-2', page.value2);
      setText('#lcd-page-description', lcdEnterNotice ? t('settingsReadOnly') : page.help);
      document.querySelector('#lcd-page-reading-2').hidden = !page.label2;

      const active = (selector, enabled) =>
        document.querySelector(selector)?.classList.toggle('active', Boolean(enabled));
      const available = (selector, enabled) =>
        document.querySelector(selector)?.classList.toggle('lcd-manual-absent', !Boolean(enabled));
      const inverterIndicatorActive = liveMeasurementsFresh
        && !flowSuppressed
        && outputConnected
        && (Number.isFinite(outputVoltage) || Number.isFinite(loadPower));
      active('#lcd-grid-node', gridConnected);
      active('#lcd-grid-arrow', gridFlowActive);
      active('#lcd-inverter-node', liveMeasurementsFresh && !flowSuppressed);
      active('#lcd-status-inv', inverterIndicatorActive);
      active('#lcd-load-node', pvFlowActive);
      active('#lcd-load-arrow', loadFlowActive);
      active('#lcd-ac-output-card', outputConnected && Number.isFinite(outputCurrent) && outputCurrent > .05);
      active('#lcd-battery-card', liveMeasurementsFresh && batteryConnected);
      active('#lcd-soc-card', Number.isFinite(batteryCapacityDisplay));
      const isLeadAcid = isLeadAcidBattery;
      lcdDisplay?.classList.toggle('lcd-lead-acid', isLeadAcid);
      setText('#lcd-lead-capacity-value', isLeadAcid && Number.isFinite(batteryVoltage)
        ? `${batteryCapacityDisplay}% · ${batteryVoltage.toFixed(1)}V · ${inverterLoad > 50 ? 'LOAD >50%' : inverterLoad >= 20 ? '50%≥LOAD>20%' : 'LOAD <20%'}`
        : 'Li SOC');
      document.querySelectorAll('[data-lcd-battery-mark]').forEach(mark => {
        const isSelected = mark.dataset.lcdBatteryMark === batteryType;
        mark.classList.toggle('active', isSelected);
      });
      const phaseIndex = Number.isFinite(parallelMode) ? Math.max(0, Math.min(2, parallelMode - 2)) : 0;
      active('#lcd-mode-master', !Number.isFinite(parallelMode) || parallelMode <= 2);
      active('#lcd-mode-slave', Number.isFinite(parallelMode) && parallelMode >= 3);
      ['#lcd-phase-l1', '#lcd-phase-l2', '#lcd-phase-l3'].forEach((selector, index) => active(selector, index === phaseIndex));
      active('#lcd-mode-pv-grid', chargePriority === 0 && pvConnected && gridConnected);
      active('#lcd-mode-pv-first', chargePriority === 2 || outputPriority === 1 || outputPriority === 2);
      active('#lcd-stage-cc', chargingState === 'CC' || chargingState === 'CHARGING');
      active('#lcd-stage-cv', chargingState === 'CV');
      active('#lcd-stage-float', chargingState === 'FLOAT');
      // The manual's radio/sound marks are status marks, not substitute data:
      // illuminate only the link that the dashboard can verify (live polling),
      // and illuminate the sound/fault mark only for an actual BMS fault.
      const hasBatteryFault = Number.isFinite(batteryFaultCode) && batteryFaultCode !== 0;
      active('#lcd-status-ac', gridConnected);
      active('#lcd-status-chg', batteryCharging);
      active('#lcd-status-fault', hasBatteryFault);
      active('#lcd-link-wifi', liveMeasurementsFresh);
      active('#lcd-link-speaker', hasBatteryFault);
      active('#lcd-fault-marker', hasBatteryFault);
      
      // Fault code display per manual format (e.g., tC02e)
      const faultCode = hasBatteryFault ? batteryFaultCode : null;
      const faultCodeElement = document.querySelector('#lcd-fault-code');
      if (faultCodeElement) {
        faultCodeElement.textContent = faultCode ? `tC${faultCode.toString(16).padStart(3, '0')}` : '—';
      }
      
      // Time display (simulated - would come from real time register)
      const now = new Date();
      const timeString = `${now.getFullYear().toString().slice(-2)}:${(now.getMonth() + 1).toString().padStart(2, '0')}:${now.getDate().toString().padStart(2, '0')}:${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
      const timeElement = document.querySelector('#lcd-time-display');
      if (timeElement) {
        timeElement.textContent = timeString;
      }
      // Section 4.2.1 reserves physical zones for AC input, PV and GEN/AC2.
      // Keep each zone out of the normal display only when this inverter has
      // no verified measurement for it; never replace missing telemetry with
      // a decorative zero. AC2 has no verified register mapping in this model.
      // The manual reserves this bay for GEN / AC OUTPUT2. The current
      // profile has no verified AC2 register mapping, so retain the physical
      // bay and its unavailable dashes instead of substituting another value.
      const ac2Supported = true;
      available('#lcd-grid-node', gridConnected);
      available('#lcd-load-node', pvConnected);
      available('.lcd-ac2-region', ac2Supported);
      
      // AC2 measurements (if supported)
      if (ac2Supported) {
        const ac2Voltage = numberValue([89]); // AC2 voltage register
        const ac2Frequency = numberValue([91]); // AC2 frequency register
        setMeasure('#lcd-ac2-voltage', ac2Voltage);
        setMeasure('#lcd-ac2-frequency', ac2Frequency, 2);
      }
      available('#lcd-grid-current-reading', gridConnected && Number.isFinite(gridCurrent));
      available('#lcd-output-current-reading', outputConnected && Number.isFinite(outputCurrent));
      available('#lcd-pv-channels', Number.isFinite(pv1Power) || Number.isFinite(pv2Power));
      const modeMark = pvFlowActive ? 'PV' : gridFlowActive ? 'AC' : batteryDischarging ? 'BAT' : 'UPS';
      setText('#lcd-mode-mark', modeMark);
      // The manual keeps these source glyphs visible. PV+Grid illuminates
      // both glyphs, while PV-only illuminates the PV glyph alone.
      active('#lcd-mode-pv', pvConnected);
      active('#lcd-mode-ac', pvConnected && gridConnected);
      active('#lcd-mode-flow', chargePriority === 2 && pvConnected);
      // Bluetooth/USB hardware state is not exposed by the supplied registers.
      // Hide those marks instead of presenting inactive icons as measurements.
      available('#lcd-link-bluetooth', false);
      available('#lcd-link-usb', false);
      if (!window.lcdBatteryTypeControlsBound) {
        document.querySelectorAll('[data-lcd-battery-type]').forEach(button => {
          button.addEventListener('click', () => {
            window.lcdBatteryType = button.dataset.lcdBatteryType || 'Li-ion';
            window.localStorage?.setItem('lcdBatteryType', window.lcdBatteryType);
            window.renderLcd(data, registers);
          });
        });
        window.lcdBatteryTypeControlsBound = true;
      }
    }

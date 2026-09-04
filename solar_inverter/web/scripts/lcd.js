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
      const pages = [
        {
          code: 'LCD', title: t('mainDisplay'),
          icons: ['ac-input', 'ac-output'],
          label1: registerLabel(81, t('gridVoltage')), value1: reading(gridVoltage, 'V'),
          label2: registerLabel([537, 89], t('acOutputVoltage')), value2: reading(outputVoltage, 'V'), help: t('lcdMainPageHelp')
        },
        {
          code: 'P1', title: getPeriodLabel(),
          icons: ['solar', 'energy'],
          label1: registerLabel(getPeriodRegister(), getPeriodLabel()),
          value1: reading(getPeriodEnergy(), 'kWh'),
          label2: '', value2: '', help: energyPeriod === 'month' ? t('lcdP1MonthHelp') : energyPeriod === 'year' ? t('lcdP1YearHelp') : t('lcdP1Help')
        },
        {
          code: 'P2', title: t('totalPvEnergy'),
          icons: ['solar', 'energy'],
          label1: registerLabel([164, 158], t('totalPvEnergy')), value1: reading(numberValue([164, 158]), 'kWh'),
          label2: '', value2: '', help: t('lcdP2Help')
        },
        {
          code: 'P3', title: t('batteryVoltage'),
          icons: ['battery'],
          label1: registerLabel([129, 137], t('batteryVoltage')), value1: reading(batteryVoltage, 'V'),
          label2: registerLabel([130, 405], t('batteryCurrent')), value2: reading(batteryCurrent, 'A', 1), help: t('lcdP3Help')
        },
        {
          code: 'P4', title: t('batteryTemperature'),
          icons: ['battery'],
          label1: registerLabel([140, 406], t('batteryTemperature')), value1: reading(batteryTemperature, '°C'),
          label2: registerLabel([407, 139, 133, 339], t('batterySoc')), value2: reading(batterySoc, '%', 0), help: t('lcdP4Help')
        },
        {
          code: 'P5', title: t('batteryCapacity'),
          icons: ['battery'],
          label1: registerLabel([142, 410], t('batteryCapacity')), value1: reading(numberValue([142, 410]), 'Ah', 0),
          label2: registerLabel([143, 409], t('remainingCapacity')), value2: reading(numberValue([143, 409]), 'Ah', 0), help: t('lcdP5Help')
        },
        {
          code: 'P6', title: t('maxChargeVoltage'),
          icons: ['battery', 'charger'],
          label1: registerLabel([141, 411, 16651], t('maxChargeVoltage')), value1: reading(maximumChargeVoltage, 'V'),
          label2: registerLabel(16650, t('lowerBmsVoltageLimit')), value2: reading(numberValue([16650]), 'V'), help: t('lcdP6Help')
        },
        {
          code: 'P7', title: t('maxChargeCurrent'),
          icons: ['battery', 'charger'],
          label1: registerLabel(412, t('maxChargeCurrent')), value1: reading(numberValue([412]), 'A', 1),
          label2: registerLabel(413, t('currentLimit')), value2: reading(numberValue([413]), 'A', 1), help: t('lcdP7Help')
        },
        {
          code: 'P8', title: t('alarmFault'),
          icons: ['battery'],
          label1: registerLabel([147, 418], t('alarmFlags')), value1: interpretedValue([147, 418]),
          label2: registerLabel([146, 419], t('alarmFault')), value2: interpretedValue([146, 419]), help: t('lcdP8Help')
        },
        {
          code: 'P9', title: t('deviceConfiguration'),
          icons: ['energy'],
          label1: registerLabel([27, 28], t('deviceConfiguration')), value1: versionValue(27, 28),
          label2: '', value2: '', help: t('lcdP9Help')
        }
      ];
      const page = pages[lcdPageIndex] || pages[0];
      // P1--P9 are actual LCD screens in the manual, not auxiliary dashboard
      // cards. Keep the normal instrument diagram for LCD and switch the
      // physical face itself to the compact information-screen layout.
      if (lcdDisplay) {
        lcdDisplay.classList.toggle('lcd-information-page', page.code !== 'LCD');
        lcdDisplay.classList.toggle('lcd-normal-live', page.code === 'LCD');
        lcdDisplay.dataset.lcdPage = page.code;
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
      document.querySelectorAll('[data-lcd-battery-type]').forEach(button => {
        const isSelected = button.dataset.lcdBatteryType === batteryType;
        button.classList.toggle('active', isSelected);
        button.setAttribute('aria-pressed', String(isSelected));
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
      const ac2Supported = false; // Set to true if AC2 registers are available
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

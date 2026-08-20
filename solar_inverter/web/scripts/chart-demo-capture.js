    // Captured from register_changes_ru_20260817_225757_021057.csv on the
    // connected TTN 12KU.  The sequence replays the observed BMS-current,
    // output-voltage, load, and load-percentage changes while all other
    // captured values stay faithful to the initial device snapshot.
    const CAPTURED_REGISTER_LOG_VALUES = Object.freeze([
      [67, 5], [68, 576], [69, 33536],
      [81, 0], [82, 0], [83, 0], [84, 0], [85, 0], [86, 0], [88, 0],
      [89, 230], [90, 2.44], [91, 50], [92, 260], [93, 562], [94, 4.6], [95, 0],
      [129, 52.8], [130, 5.7], [133, 6.5], [134, 306], [137, 52.8], [138, -6.1], [139, 65],
      [140, 33.8], [141, 57.1],
      [151, 0], [152, 0], [153, 0], [154, 0], [155, 0], [156, 0], [157, .03], [161, 0],
      [159, 0], [160, 0],
      [404, 52.8], [407, 64], [433, 0], [434, 0], [436, 0],
      [448, 0], [449, 11.01], [450, 0], [451, 160.82], [452, 0], [453, 546.6],
      [529, 0], [530, 1], [537, 230.1], [539, 2.35], [541, 208], [542, 540], [545, 4.6],
      [801, 30], [818, 40], [822, 38]
    ]);
    // Packed (register, raw) uint16 pairs from the 18-Aug-2026 live capture.
    // Keeping the source data raw preserves every one of its 386 real readings.
    const CAPTURED_REGISTER_LOG_RAW_BASE64 = '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';
    // register_changes_ru_20260818_124921_523466.csv: 386 observed registers.
    const LATEST_CAPTURED_REGISTER_LOG_RAW_BASE64 = [
      'AAFKMgACNTEAAzEwAAQyNgAFNi0ABjFIAAcwMAAIMDIACTgAAAoAAAARAAEAEgAFABMAAAAUAAAAFQAAABYAAAAXAAAAGAAAABkA',
      'AAAaAAAAGwMAABwAAQAdAAAAHgAAAB8AAAAgAAAAIQAAACIAAAAjAAAAJAAAACUAAAA5AAAAOgBAADsAAAA8AAAAPQAAAD4AAAA/',
      'AAAAQAAAAEEDAABCAAIAQwAFAEQCQABFgwAARgAAAEcAAABIAAAASQAAAEoAAABLAAAATAAAAE0AAABOAAAATwAAAFAAAABRAAAA',
      'UgAAAFMAAABUAAAAVQAAAFYAAABXAAAAWAAAAFkI/ABaAPQAWxOIAFwBBABdAjIAXgAuAF8AAACBAhAAggA5AIMAAACEAAAAhQBB',
      'AIYBMgCJAhAAiv/DAIsAQQCMAVIAjQI7AI7//wCP//8AkAByAJEAAACSAAAAkwAAAJQAAACVAAAAlgAAAJcAAACYAAAAmQAAAJoA',
      'AACbAAAAnAAAAJ0AAwCeARkAnwAAAKAAAAChAAABQQABAUMAAAFEAAIBRQAFAVEAAwFTAEEBVRHdAVYCEAFX/90BWP/OAVkCYgFa',
      'AeABXQHgAV7/8QFlAAABZgAAAWcAAAFoAAABaQAAAWoAAAFtAAABbgAAAW8AAAF3AAABeAI7AXkCOwF6AyABewMgAXwAAAF9AAAB',
      'fgAAAX8CSAGAAAABgRwgAYIIcAGDAAABhAAAAZEABAGSAAEBkwByAZQCEwGV/6ABlgFdAZcAWAGYAGQBmf//AZr//wGbAjsBnAMg',
      'AZ0F+gGeAAABnwAUAaAAMgGhAFoBogAAAaMAAAGxAAABsgAAAbMAAAK0AAACtQAAArYCmgK3AAACuC7IArkAAAK6kR4DIQAeAyIA',
      'AAMxAeADMgHqAzMB6gM0AAADNQHqAzYB4AM3AYYDUf//A1L5hwNhABoDYgAIA2MAEQNkABYDZQAtA2YAAhABAAAQAgAAEAMAABAL',
      'AAAQDAAAEA0AABAvAAASAQAAEgIAABIDAAASBAAAEgUAABIGAAASCQAAEgoAABILAAASDAAAEg0AABIOAAASDwAAEhAAACABAAAg',
      'AgAAIAMAACAEAABAAQAAQJEAAECTAABAlQAAQJYAAUCXAAFAmAAEQJkAAUCaB9BAnAMAQJ0AAUCeVklAnzFIQKBLMkChQVVAogAA',
      'QKMAAEEBAAJBAgAAQQMAAEEEAAFBBQACQQYAFEEHAAhBCAADQQkB4EEKAdRBCwI7QQwCO0ENAfBBDgIUQQ8AtEEQAQhBEwAAQRQC',
      'SEEVAABBFgB4QRcAWkEYAABBGQHgQRr/8UEbAABBHAAAQR0AeEEeAABBHwAEQSAAAUEhABRBIgBaQSMAMkEkAAFBJgABQSgAAUEp',
      'AAFBKgAAQSsAAEEsAABBLQAAQS4AAEEvAABBMABGQTEAAUEyAAFBMwAAQTQAAEE1ADZBNgAtQTcAFkE4ABFBOQAIQToAGkE7AABB',
      'PAAfQT0AH0E+AB9BPwAfQUAAH0FMAFBBTQAAQXsAAEF8AABBfQAAQX4AAEF/AABBgAAAQYsAAEGMAAA='
    ].join('');
    const COMPLETE_LATEST_CAPTURE_BASE64 = [
      'AAFKMgACNTEAAzEwAAQyNgAFNi0ABjFIAAcwMAAIMDIACTgAAAoAAAARAAEAEgAFABMAAAAUAAAAFQAAABYAAAAXAAAAGAAAABkA',
      'AAAaAAAAGwMAABwAAQAdAAAAHgAAAB8AAAAgAAAAIQAAACIAAAAjAAAAJAAAACUAAAA5AAAAOgBAADsAAAA8AAAAPQAAAD4AAAA/',
      'AAAAQAAAAEEDAABCAAIAQwAFAEQCQABFgwAARgAAAEcAAABIAAAASQAAAEoAAABLAAAATAAAAE0AAABOAAAATwAAAFAAAABRAAAA',
      'UgAAAFMAAABUAAAAVQAAAFYAAABXAAAAWAAAAFkI/ABaAPQAWxOIAFwBBABdAjIAXgAuAF8AAACBAhAAggA5AIMAAACEAAAAhQBB',
      'AIYBMgCJAhAAiv/DAIsAQQCMAVIAjQI7AI7//wCP//8AkAByAJEAAACSAAAAkwAAAJQAAACVAAAAlgAAAJcAAACYAAAAmQAAAJoA',
      'AACbAAAAnAAAAJ0AAwCeARkAnwAAAKAAAAChAAABQQABAUMAAAFEAAIBRQAFAVEAAwFTAEEBVRHdAVYCEAFX/90BWP/OAVkCYgFa',
      'AeABXQHgAV7/8QFlAAABZgAAAWcAAAFoAAABaQAAAWoAAAFtAAABbgAAAW8AAAF3AAABeAI7AXkCOwF6AyABewMgAXwAAAF9AAAB',
      'fgAAAX8CSAGAAAABgRwgAYIIcAGDAAABhAAAAZEABAGSAAEBkwByAZQCEwGV/6ABlgFdAZcAWAGYAGQBmf//AZr//wGbAjsBnAMg',
      'AZ0F+gGeAAABnwAUAaAAMgGhAFoBogAAAaMAAAGxAAABsgAAAbMAAAG0AAABtQAAAbgAAAG5AAABugAAAbsAAAG8AAABvQAAAb4A',
      'AAG/AAABwAAAAcEDYwHCAAABw0I1AcQAAAHF2OcBxgAAAcfhXQIRAAACEgABAhkJEgIaE4gCGwEPAhwAAAIdAZgCHgJ1Ah8AAAIg',
      'AAACIQAzAiIAAAIjAw0CJAAAAiUyqgImAAACJ7q2AigAAAIpvtUCYQDVAmIAAAJjACQCZAAAAmUACAJmAAACZwARAmgAAAJpACUC',
      'agAAAmsCdQJsAAACbQpCAm4AAAJvCwACcQDWAnIAJgJzAAgCdAARAnUAAAJ2AAACdwATAngAAAJ5ATgCegAAAnsFFQJ8AAACfQW8',
      'AoEA1QKCACUCgwAIAoQAEQKFAAAChgAAAocAEgKIAAACiQE9AooAAAKLBS0CjAAAAo0FRAKhCPwCohOIAqUANAKrCPoCrBOKAq0B',
      'agKu/+gCrwAAArAAAAKxAAACsgAAArMAAAK0AAACtQAAArYCmgK3AAACuC7IArkAAAK6kR4DIQAeAyIAAAMxAeADMgHqAzMB6gM0',
      'AAADNQHqAzYB4AM3AYYDUf//A1L5hwNhABoDYgAIA2MAEQNkABYDZQAtA2YAAhABAAAQAgAAEAMAABALAAAQDAAAEA0AABAvAAAS',
      'AQAAEgIAABIDAAASBAAAEgUAABIGAAASCQAAEgoAABILAAASDAAAEg0AABIOAAASDwAAEhAAACABAAAgAgAAIAMAACAEAABAAQAA',
      'QJEAAECTAABAlQAAQJYAAUCXAAFAmAAEQJkAAUCaB9BAnAMAQJ0AAUCeVklAnzFIQKBLMkChQVVAogAAQKMAAEEBAAJBAgAAQQMA',
      'AEEEAAFBBQACQQYAFEEHAAhBCAADQQkB4EEKAdRBCwI7QQwCO0ENAfBBDgIUQQ8AtEEQAQhBEwAAQRQCSEEVAABBFgB4QRcAWkEY',
      'AABBGQHgQRr/8UEbAABBHAAAQR0AeEEeAABBHwAEQSAAAUEhABRBIgBaQSMAMkEkAAFBJgABQSgAAUEpAAFBKgAAQSsAAEEsAABB',
      'LQAAQS4AAEEvAABBMABGQTEAAUEyAAFBMwAAQTQAAEE1ADZBNgAtQTcAFkE4ABFBOQAIQToAGkE7AABBPAAfQT0AH0E+AB9BPwAf',
      'QUAAH0FMAFBBTQAAQXsAAEF8AABBfQAAQX4AAEF/AABBgAAAQYsAAEGMAAA='
    ].join('');
    const CAPTURED_REGISTER_LOG_RAW_VALUES = (() => {
      const bytes = Uint8Array.from(atob(COMPLETE_LATEST_CAPTURE_BASE64), character => character.charCodeAt(0));
      const values = new Map();
      for (let offset = 0; offset < bytes.length; offset += 4) {
        values.set((bytes[offset] << 8) | bytes[offset + 1], (bytes[offset + 2] << 8) | bytes[offset + 3]);
      }
      return values;
    })();
    const CAPTURED_REGISTER_LOG_FRAMES = Object.freeze([
      {current: -9.6, voltage: 232.2, load: 408, loadPercent: 5.1},
      {current: -9.1, voltage: 233.8, load: 384, loadPercent: 5.1},
      {current: -9.5, voltage: 230.1, load: 392, loadPercent: 5.1},
      {current: -9.6, voltage: 230.4, load: 384, loadPercent: 5.1},
      {current: -10, voltage: 230.4, load: 384, loadPercent: 5.1},
      {current: -8.9, voltage: 230.4, load: 384, loadPercent: 5.1},
      {current: -9.1, voltage: 230.1, load: 384, loadPercent: 5.1},
      {current: -8.9, voltage: 230.4, load: 400, loadPercent: 5.1},
      {current: -10, voltage: 230.1, load: 392, loadPercent: 5.1},
      {current: -9, voltage: 230.4, load: 392, loadPercent: 5.1},
      {current: -9.7, voltage: 228.7, load: 392, loadPercent: 5.1},
      {current: -9.2, voltage: 230.1, load: 384, loadPercent: 5.1}
    ]);
    function capturedRegisterLogDemoScenario(elapsedSeconds) {
      const frame = CAPTURED_REGISTER_LOG_FRAMES[
        Math.floor(Math.max(0, elapsedSeconds) / 3) % CAPTURED_REGISTER_LOG_FRAMES.length
      ];
      const scenarioIndex = Math.floor(Math.max(0, elapsedSeconds) / 20) % 6;
      // Every V1.31 R69 power-route bit is demonstrated at least once. Each
      // frame supplies the complete direction-related snapshot, so a value
      // from the real inverter can never leak into the demo.
      const scenarios = [
        {caseKey: 'demoSolarChargeExport', inverterState: 4, terminal: 2 << 4 | 1 << 6 | 3 << 8 | 1 << 11, flow: 1 << 4 | 1 << 5 | 1 << 6 | 1 << 9, pvPower: 2700, batteryCurrent: 18, gridPower: 0, generatorPower: 0},
        {caseKey: 'demoGridHome', inverterState: 3, terminal: 2 | 1 << 6 | 3 << 8 | 1 << 11, flow: 1 << 0 | 1 << 1 | 1 << 5 | 1 << 6 | 1 << 9, pvPower: 0, batteryCurrent: 12, gridPower: frame.load + 630, generatorPower: 0},
        {caseKey: 'demoBatteryHome', inverterState: 5, terminal: 1 << 6 | 2 << 8, flow: 1 << 8 | 1 << 9, pvPower: 0, batteryCurrent: -Math.abs(frame.current), gridPower: 0, generatorPower: 0},
        {caseKey: 'demoSolarExport', inverterState: 4, terminal: 2 << 4 | 1 << 6 | 4 << 8, flow: 1 << 4 | 1 << 6 | 1 << 7 | 1 << 9, pvPower: 3600, batteryCurrent: 0, gridPower: Math.max(0, 3600 - frame.load), generatorPower: 0},
        {caseKey: 'demoGeneratorHome', inverterState: 6, terminal: 2 << 2 | 1 << 6 | 3 << 8 | 1 << 11, flow: 1 << 2 | 1 << 3 | 1 << 5 | 1 << 6 | 1 << 9, pvPower: 0, batteryCurrent: 8, gridPower: 0, generatorPower: frame.load + 420},
        {caseKey: 'demoMixedSources', inverterState: 4, terminal: 2 << 4 | 1 << 6 | 2 << 8, flow: 1 << 4 | 1 << 6 | 1 << 8 | 1 << 10, pvPower: 1700, batteryCurrent: -8, gridPower: 0, generatorPower: 0}
      ];
      const scenario = scenarios[scenarioIndex];
      const outputCurrent = frame.load / frame.voltage;
      const values = new Map();
      values.set(67, scenario.inverterState); values.set(68, scenario.terminal); values.set(69, scenario.flow);
      values.set(70, 0); values.set(322, 0); values.set(325, scenario.inverterState);
      values.set(81, scenario.gridPower ? 230 : 0); values.set(82, Math.abs(scenario.gridPower) / 230); values.set(83, scenario.gridPower ? 50 : 0); values.set(84, scenario.gridPower);
      values.set(433, scenario.gridPower ? 230 : 0); values.set(434, Math.abs(scenario.gridPower) / 230); values.set(435, scenario.gridPower ? 50 : 0); values.set(436, scenario.gridPower);
      values.set(85, scenario.generatorPower ? 230 : 0); values.set(86, scenario.generatorPower / 230); values.set(87, scenario.generatorPower ? 50 : 0); values.set(88, scenario.generatorPower);
      values.set(151, scenario.pvPower ? 330 : 0); values.set(152, scenario.pvPower / 330); values.set(153, scenario.pvPower);
      values.set(154, 0); values.set(155, 0); values.set(156, 0); values.set(161, scenario.pvPower);
      values.set(129, 52.8); values.set(130, scenario.batteryCurrent); values.set(134, 52.8 * scenario.batteryCurrent); values.set(137, 52.8); values.set(138, scenario.batteryCurrent); values.set(405, scenario.batteryCurrent); values.set(407, 71);
      values.set(89, frame.voltage); values.set(90, outputCurrent); values.set(91, 50); values.set(92, frame.load); values.set(93, frame.load); values.set(94, frame.loadPercent);
      values.set(188, frame.load); values.set(189, 0); values.set(190, 0);
      values.set(537, frame.voltage); values.set(539, outputCurrent); values.set(541, frame.load); values.set(545, frame.loadPercent);
      return {
        elapsedSeconds: Math.max(0, elapsedSeconds),
        statusCode: scenario.inverterState,
        caseKey: scenario.caseKey,
        generatorPower: scenario.generatorPower,
        pvVoltage: scenario.pvPower ? 330 : 0,
        pvPower: scenario.pvPower,
        values
      };
    }

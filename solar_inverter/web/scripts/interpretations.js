    // Enum and bit-field meanings are taken from TTN-INV Modbus V1.31.
    // Each phrase is ordered Ukrainian, Russian, English.
    const TTN_V131_INTERPRETATIONS = (() => {
      const languageIndex = () => currentLanguage === 'ru' ? 1 : currentLanguage === 'en' ? 2 : 0;
      const text = phrase => phrase?.[languageIndex()] || '';
      const phrase = (uk, ru, en) => [uk, ru, en];
      const join = values => values.filter(Boolean).join(' · ');
      const unknownCode = value => text(phrase(
        `Невідомий код ${value}; у V1.31 він не визначений`,
        `Неизвестный код ${value}; в V1.31 он не определён`,
        `Unknown code ${value}; it is not defined in V1.31`
      ));
      const enumMeaning = (values, value) => text(values[value]) || unknownCode(value);

      const stateMachine = [
        phrase('Увімкнення', 'Включение', 'Power-on'),
        phrase('Ініціалізація', 'Инициализация', 'Init'),
        phrase('Очікування', 'Ожидание', 'Standby'),
        phrase('Мережа', 'Сеть', 'Grid'),
        phrase('PV', 'PV', 'PV'),
        phrase('Батарея', 'Батарея', 'Battery'),
        phrase('Генератор', 'Генератор', 'Generator'),
        phrase('Аварія', 'Авария', 'Fault'),
        phrase('Вимкнення', 'Отключение', 'Shutdown'),
        phrase('Тест', 'Тест', 'Test'),
        phrase('Оновлення ПЗ', 'Обновление ПО', 'Firmware')
      ];
      const bmsConnection = [
        phrase('Пошук ID', 'Поиск ID', 'Searching'),
        phrase('ID CAN', 'ID CAN', 'ID CAN'),
        phrase('ID порт', 'ID порт', 'ID serial'),
        phrase('ID віддалено', 'ID удалённо', 'ID remote')
      ];
      const bmsDebugConnection = [
        phrase('Пошук ID', 'Поиск ID', 'Searching'),
        phrase('ID віддалено', 'ID удалённо', 'ID remote'),
        phrase('ID зафіксовано', 'ID зафиксирован', 'ID locked')
      ];
      const parallelMode = [
        phrase('Один', 'Один', 'Single'),
        phrase('1-фаза', '1-фаза', '1-phase'),
        phrase('3-фаза A/R', '3-фаза A/R', '3-phase A/R'),
        phrase('3-фаза B/S', '3-фаза B/S', '3-phase B/S'),
        phrase('3-фаза C/T', '3-фаза C/T', '3-phase C/T')
      ];
      const outputMode = [
        phrase('APP', 'APP', 'APP'),
        phrase('UPS', 'UPS', 'UPS'),
        phrase('GEN', 'GEN', 'GEN')
      ];
      const outputPriority = [
        phrase('GPB', 'GPB', 'GPB'),
        phrase('PGB', 'PGB', 'PGB'),
        phrase('PBG', 'PBG', 'PBG'),
        phrase('MKS/MKP', 'MKS/MKP', 'MKS/MKP')
      ];
      const chargePriority = [
        phrase('PNG', 'PNG', 'PNG'),
        phrase('OPV', 'OPV', 'OPV'),
        phrase('PVF', 'PVF', 'PVF')
      ];
      const chargingState = [
        phrase('Не вказано', 'Не указано', 'Not specified'),
        phrase('CC/CV', 'CC/CV', 'CC/CV'),
        phrase('Float', 'Float', 'Float'),
        phrase('Вирівнювання', 'Выравнивание', 'Equalisation')
      ];
      const terminalConnection = label => [
        phrase(`${label}: відкл`, `${label}: откл`, `${label}: off`),
        phrase(`${label}: підкл, ненорм`, `${label}: подкл, ненорм`, `${label}: on, abnormal`),
        phrase(`${label}: підкл, норм`, `${label}: подкл, норм`, `${label}: on, normal`)
      ];
      const outputState = [
        phrase('Зупинено', 'Остановлен', 'Stopped'),
        phrase('Норма', 'Норма', 'Normal'),
        phrase('Перевантаження', 'Перегрузка', 'Overload'),
        phrase('КЗ', 'КЗ', 'Short')
      ];
      const batteryState = [
        phrase('Відкл/КЗ', 'Откл/КЗ', 'Disc/Short'),
        phrase('Низька напруга', 'Низкое напряжение', 'Low voltage'),
        phrase('Розряджається', 'Разряжается', 'Discharging'),
        phrase('Заряджається', 'Заряжается', 'Charging'),
        phrase('Повністю заряджена', 'Полностью заряжена', 'Full')
      ];
      const terminalChargingState = [
        phrase('Не заряджається', 'Не заряжается', 'Not charging'),
        phrase('CC', 'CC', 'CC'),
        phrase('CV', 'CV', 'CV'),
        phrase('Float', 'Float', 'Float'),
        phrase('Вирівнювання', 'Выравнивание', 'Equalisation')
      ];

      const flowBits = [
        phrase('Мережа→випр', 'Сеть→выпр', 'Grid→rect'),
        phrase('Мережа→нав', 'Сеть→нагр', 'Grid→load'),
        phrase('Ген→випр', 'Ген→выпр', 'Gen→rect'),
        phrase('Ген→нав', 'Ген→нагр', 'Gen→load'),
        phrase('PV→випр', 'PV→выпр', 'PV→rect'),
        phrase('Випр→бат', 'Выпр→бат', 'Rect→bat'),
        phrase('Випр→інв', 'Выпр→инв', 'Rect→inv'),
        phrase('Випр→мережа', 'Выпр→сеть', 'Rect→grid'),
        phrase('Бат→інв', 'Бат→инв', 'Bat→inv'),
        phrase('Інв→вих1', 'Инв→вых1', 'Inv→out1'),
        phrase('Інв→вих2', 'Инв→вых2', 'Inv→out2'),
        phrase('BIT11 рез', 'BIT11 рез', 'BIT11 res'),
        phrase('Wi-Fi', 'Wi-Fi', 'Wi-Fi'),
        phrase('Енергозбереж', 'Энергосбереж', 'Eco'),
        phrase('BIT14 рез', 'BIT14 рез', 'BIT14 res'),
        phrase('Тихий', 'Тихий', 'Silent')
      ];
      const fault1Bits = [
        phrase('Помилка мережі', 'Ошибка сети', 'Grid fault'),
        phrase('Перенапруга DC', 'Перенапряжение DC', 'DC overvolt'),
        phrase('Занижена напруга DC', 'Пониженное напряжение DC', 'DC undervolt'),
        phrase('Надструм батареї', 'Сверхток батареи', 'Bat overcurrent'),
        phrase('Перегрів', 'Перегрев', 'Overtemp'),
        phrase('Перенапруга батареї', 'Перенапряжение батареи', 'Bat overvolt'),
        phrase('Помилка батареї', 'Ошибка батареи', 'Bat fault'),
        phrase('КЗ DC', 'КЗ DC', 'DC short'),
        phrase('Помилка інвертора', 'Ошибка инвертора', 'Inv fault'),
        phrase('Перенапруга інвертора', 'Перенапряжение инвертора', 'Inv overvolt'),
        phrase('Занижена напруга інвертора', 'Пониженное напряжение инвертора', 'Inv undervolt'),
        phrase('КЗ інвертора', 'КЗ инвертора', 'Inv short'),
        phrase('Захист від’ємної потужності', 'Защита отриц. мощности', 'Neg power'),
        phrase('Перевантаження', 'Перегрузка', 'Overload'),
        phrase('Невідповідність моделі', 'Несоответствие модели', 'Model mismatch'),
        phrase('Завантажувач відсутній', 'Загрузчик отсутствует', 'No bootloader')
      ];
      const fault2Bits = [
        phrase('Запис ПЗ', 'Запись ПО', 'Flash'),
        phrase('Полярність PV', 'Полярность PV', 'PV polarity'),
        phrase('SN паралелі', 'SN параллели', 'Parallel SN'),
        phrase('Зв\'язок паралелі', 'Связь параллели', 'Parallel comm'),
        phrase('Різниця напруг батарей', 'Разница напряжений батарей', 'Bat voltage diff'),
        phrase('Різниця напруг мережі', 'Разница напряжений сети', 'Grid voltage diff'),
        phrase('Різниця частоти мережі', 'Разница частоты сети', 'Grid freq diff'),
        phrase('Відсутня фаза', 'Отсутствует фаза', 'Phase missing'),
        phrase('Втрата синхронізації', 'Потеря синхронизации', 'Sync lost'),
        phrase('Помилка BMS', 'Ошибка BMS', 'BMS fault'),
        phrase('Помилка MCU', 'Ошибка MCU', 'MCU fault'),
        phrase('BIT11 рез', 'BIT11 рез', 'BIT11 res'),
        phrase('Ненормальне навантаження', 'Ненормальная нагрузка', 'Load anomaly'),
        phrase('Перенапруга PV', 'Перенапряжение PV', 'PV overvolt')
      ];
      const alarm1Bits = [
        phrase('Батарея відкл', 'Батарея откл', 'Bat disc'),
        phrase('Занижена напруга батареї', 'Пониженное напряжение батареи', 'Bat undervolt'),
        phrase('Низька напруга батареї', 'Низкое напряжение батареи', 'Bat low'),
        phrase('КЗ зарядного', 'КЗ зарядного', 'Charger short'),
        phrase('BIT04 рез', 'BIT04 рез', 'BIT04 res'),
        phrase('Перезаряд батареї', 'Перезаряд батареи', 'Bat overcharge'),
        phrase('Втрата BMS', 'Потеря BMS', 'BMS lost'),
        phrase('Перегрів (рез)', 'Перегрев (рез)', 'Overtemp (res)'),
        phrase('Вентилятор заблоковано', 'Вентилятор заблокирован', 'Fan stalled'),
        phrase('Помилка EEPROM', 'Ошибка EEPROM', 'EEPROM fault'),
        phrase('Перевантаження', 'Перегрузка', 'Overload'),
        phrase('Сигнал генератора (рез)', 'Сигнал генератора (рез)', 'Gen signal (res)'),
        phrase('Слабка PV', 'Слабая PV', 'Weak PV'),
        phrase('Втрата синхронізації', 'Потеря синхронизации', 'Sync lost'),
        phrase('Відсутня фаза', 'Отсутствует фаза', 'Phase missing'),
        phrase('Версія несумісна (рез)', 'Версия несовместима (рез)', 'Version incompatible (res)')
      ];
      const alarm2Bits = [
        phrase('Зв\'язок паралелі', 'Связь параллели', 'Parallel comm'),
        phrase('Різниця напруги/частоти', 'Разница напряжения/частоты', 'Volt/freq diff'),
        phrase('Вимкнення низький SOC', 'Отключение низкий SOC', 'Low SOC shutdown'),
        phrase('Попередження низький SOC', 'Предупреждение низкий SOC', 'Low SOC warning'),
        phrase('Різниця напруг батарей/відкл', 'Разница напряжений батарей/откл', 'Bat diff/disc'),
        phrase('КЗ батареї', 'КЗ батареи', 'Bat short'),
        phrase('Батарея нижче запуску', 'Батарея ниже запуска', 'Bat below start'),
        phrase('Перевантаження генератора', 'Перегрузка генератора', 'Gen overload'),
        phrase('Занижена напруга генератора', 'Пониженное напряжение генератора', 'Gen undervolt'),
        phrase('Перенапруга генератора', 'Перенапряжение генератора', 'Gen overvolt'),
        phrase('Помилка CT/лічильника', 'Ошибка CT/счётчика', 'CT/meter fault'),
        phrase('Нестабільна мережа', 'Нестабильная сеть', 'Unstable grid'),
        phrase('Помилка лічильника', 'Ошибка счётчика', 'Meter fault')
      ];

      function decodeBits(raw, definitions, clearPhrase) {
        const active = definitions.flatMap((definition, bit) => raw & (1 << bit) ? [text(definition)] : []);
        return active.length ? active.join('; ') : text(clearPhrase);
      }
      function energyTerminalStatus(raw) {
        const connection = (label, shift) => enumMeaning(terminalConnection(label), (raw >> shift) & 3);
        return join([
          connection(text(phrase('Мережа', 'Сеть', 'Grid')), 0),
          connection(text(phrase('Генератор', 'Генератор', 'Generator')), 2),
          connection('PV1', 4),
          enumMeaning(outputState, (raw >> 6) & 3),
          enumMeaning(batteryState, (raw >> 8) & 7),
          enumMeaning(terminalChargingState, (raw >> 11) & 7),
          connection('PV2', 14)
        ]);
      }
      function rgbMode(raw) {
        const mode = raw & 0xff;
        const value = (raw >> 8) & 0xff;
        const modes = [
          phrase('Постійно увімкнено', 'Постоянно включено', 'Always on'),
          phrase('Блимання', 'Мигание', 'Flashing'),
          phrase('Пульсація', 'Пульсация', 'Breathing'),
          phrase('Плинний ефект', 'Текущий эффект', 'Flowing'),
          phrase('Прокручування вгору', 'Прокрутка вверх', 'Scrolling up'),
          phrase('Прокручування вниз', 'Прокрутка вниз', 'Scrolling down'),
          phrase('Відстеження', 'Отслеживание', 'Tracking')
        ];
        const modeText = text(modes[mode]);
        if (!modeText) return unknownCode(mode);
        if (mode >= 1 && mode <= 3) return `${modeText} · ${value * 100} ms`;
        if (mode === 4 || mode === 5) return `${modeText} · ${value}%`;
        return modeText;
      }
      function reservedMeaning() {
        return text(phrase(
          'Поле зарезервовано у V1.31; стан не слід інтерпретувати',
          'Поле зарезервировано в V1.31; состояние не следует интерпретировать',
          'Reserved in V1.31; do not infer an operating state'
        ));
      }
      function serialNumberWord(registerNumber, raw) {
        const hexadecimal = raw.toString(16).toUpperCase().padStart(4, '0');
        const bytes = [(raw >> 8) & 0xff, raw & 0xff];
        const characters = bytes
          .filter(value => value >= 0x20 && value <= 0x7e)
          .map(value => String.fromCharCode(value))
          .join('');
        if (!characters) {
          return text(phrase(
            `Слово SN R${registerNumber}: 0x${hexadecimal} — порожнє доповнення або кінець ідентифікатора`,
            `Слово SN R${registerNumber}: 0x${hexadecimal} — пустое заполнение или конец идентификатора`,
            `SN word R${registerNumber}: 0x${hexadecimal} is empty padding or the end of the identifier`
          ));
        }
        return text(phrase(
          `Слово SN R${registerNumber}: 0x${hexadecimal} → «${characters}»; кожне слово містить до двох ASCII-символів`,
          `Слово SN R${registerNumber}: 0x${hexadecimal} → «${characters}»; каждое слово содержит до двух ASCII-символов`,
          `SN word R${registerNumber}: 0x${hexadecimal} → “${characters}”; each word contains up to two ASCII characters`
        ));
      }
      function versionComponent(label, component, raw, firstRegister, secondRegister, decodedVersion = '') {
        const names = {
          protocol: phrase('версії протоколу', 'версии протокола', 'protocol version'),
          controlSoftware: phrase('версії ПЗ плати керування', 'версии ПО платы управления', 'control-board software version')
        };
        const componentNames = component === 'major'
          ? phrase('старша складова', 'старшая составляющая', 'major component')
          : phrase('молодша складова', 'младшая составляющая', 'minor component');
        const decoded = decodedVersion
          ? text(phrase(
              `; відображувана версія ${decodedVersion}`,
              `; отображаемая версия ${decodedVersion}`,
              `; decoded display ${decodedVersion}`
            ))
          : '';
        return text(phrase(
          `${text(names[label])}: ${text(componentNames)} = ${raw}${decoded}`,
          `${text(names[label])}: ${text(componentNames)} = ${raw}${decoded}`,
          `${text(names[label])}: ${text(componentNames)} = ${raw}${decoded}`
        ));
      }
      function registerInterpretation(register) {
        if (!register?.available || register.raw === null || register.raw === undefined) return '';
        const rawNumber = Number(register.raw);
        if (!Number.isFinite(rawNumber)) return '';
        const raw = rawNumber & 0xffff;
        const registerNumber = Number(register.register);
        if (registerNumber >= 1 && registerNumber <= 10) {
          return serialNumberWord(registerNumber, raw);
        }
        switch (registerNumber) {
          case 17: return versionComponent('protocol', 'major', raw, 17, 18, register.versionDisplay);
          case 18: return versionComponent('protocol', 'minor', raw, 17, 18, register.versionDisplay);
          case 27: return versionComponent('controlSoftware', 'major', raw, 27, 28, register.versionDisplay);
          case 28: return versionComponent('controlSoftware', 'minor', raw, 27, 28, register.versionDisplay);
          case 61:
          case 62: return register.versionDisplay || '';
          case 66: return enumMeaning(bmsConnection, raw);
          case 67:
          case 325: return enumMeaning(stateMachine, raw);
          case 68: return energyTerminalStatus(raw);
          case 69: return decodeBits(raw, flowBits, phrase('Немає активних прапорців потоку', 'Нет активных флагов потока', 'No active energy-flow flags'));
          case 70:
          case 322: return enumMeaning(parallelMode, raw);
          case 71: return decodeBits(raw, fault1Bits, phrase('Активних несправностей немає', 'Активных неисправностей нет', 'No active faults'));
          case 72: return decodeBits(raw, fault2Bits, phrase('Активних несправностей немає', 'Активных неисправностей нет', 'No active faults'));
          case 73: return decodeBits(raw, alarm1Bits, phrase('Активних попереджень немає', 'Активных предупреждений нет', 'No active warnings'));
          case 74: return decodeBits(raw, alarm2Bits, phrase('Активних попереджень немає', 'Активных предупреждений нет', 'No active warnings'));
          case 77:
          case 80: return rgbMode(raw);
          case 144:
          case 145: return reservedMeaning();
          case 146: return text(phrase(
            `Маска несправностей BMS 0x${raw.toString(16).toUpperCase().padStart(4, '0')}; окремі біти у V1.31 не визначені`,
            `Маска неисправностей BMS 0x${raw.toString(16).toUpperCase().padStart(4, '0')}; отдельные биты в V1.31 не определены`,
            `BMS fault mask 0x${raw.toString(16).toUpperCase().padStart(4, '0')}; V1.31 does not define the individual bits`
          ));
          case 147: return text(phrase(
            `Маска попереджень BMS 0x${raw.toString(16).toUpperCase().padStart(4, '0')}; окремі біти у V1.31 не визначені`,
            `Маска предупреждений BMS 0x${raw.toString(16).toUpperCase().padStart(4, '0')}; отдельные биты в V1.31 не определены`,
            `BMS warning mask 0x${raw.toString(16).toUpperCase().padStart(4, '0')}; V1.31 does not define the individual bits`
          ));
          case 401: return text(phrase(
            `Код протоколу BMS ${raw}; таблиці кодів у V1.31 немає`,
            `Код протокола BMS ${raw}; таблицы кодов в V1.31 нет`,
            `BMS protocol code ${raw}; V1.31 provides no code table`
          ));
          case 321:
          case 530: return enumMeaning(outputMode, raw);
          case 323:
          case 529: return enumMeaning(outputPriority, raw);
          case 324: return enumMeaning(chargePriority, raw);
          case 337: return text(phrase(
            `Код типу батареї ${raw}; V1.31 відсилає до налаштування 0x4100 конкретної моделі`,
            `Код типа батареи ${raw}; V1.31 отсылает к настройке 0x4100 конкретной модели`,
            `Battery-type code ${raw}; V1.31 refers to model-specific setting 0x4100`
          ));
          case 375: return enumMeaning(chargingState, raw);
          case 402: return text(phrase(`ID пакета BMS: ${raw}`, `ID пакета BMS: ${raw}`, `BMS packet ID: ${raw}`));
          case 403: return enumMeaning(bmsDebugConnection, raw);
          case 418:
          case 419: return text(phrase(
            `Бітова маска BMS 0x${raw.toString(16).toUpperCase().padStart(4, '0')}; окремі біти у V1.31 не визначені`,
            `Битовая маска BMS 0x${raw.toString(16).toUpperCase().padStart(4, '0')}; отдельные биты в V1.31 не определены`,
            `BMS bit mask 0x${raw.toString(16).toUpperCase().padStart(4, '0')}; V1.31 does not define the individual bits`
          ));
          case 802: return raw === 0
            ? text(phrase('Вентилятор працює нормально', 'Вентилятор работает нормально', 'Fan operating normally'))
            : text(phrase('Вентилятор заблоковано або він не обертається', 'Вентилятор заблокирован или не вращается', 'Fan stalled or not rotating'));
          default: {
            const semanticName = `${register.name_source || register.name || ''} ${register.group_source || register.group || ''}`.toLocaleLowerCase();
            if (!String(register.unit || '').trim() && /(state|status|mode|priority|alarm|fault|warning|enable|switch|стан|режим|пріоритет|помил|попереджен|состояни|приоритет|авар|ошиб)/u.test(semanticName)) {
              return text(phrase(
                `Код ${raw}; таблиці значень для цього поля у V1.31 немає`,
                `Код ${raw}; таблицы значений для этого поля в V1.31 нет`,
                `Code ${raw}; V1.31 provides no value table for this field`
              ));
            }
            return '';
          }
        }
      }
      function rawEncodingExplanation(register, raw) {
        const scale = Number(register?.scale);
        const value = Number(register?.value);
        const unit = String(register?.unit || '').trim();
        if (register?.word_format === 'h_l') {
          return text(phrase(
            'Складова 32-бітного значення: старше або молодше 16-бітне слово',
            'Составляющая 32-битного значения: старшее или младшее 16-битное слово',
            'Part of a 32-bit value: the high or low 16-bit word'
          ));
        }
        if (Number.isFinite(scale) && scale !== 1 && Number.isFinite(value)) {
          const valueText = Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
          return text(phrase(
            `Масштаб ×${scale} → ${valueText}${unit ? ` ${unit}` : ''}`,
            `Масштаб ×${scale} → ${valueText}${unit ? ` ${unit}` : ''}`,
            `Scale ×${scale} → ${valueText}${unit ? ` ${unit}` : ''}`
          ));
        }
        if (register?.signed) return '';
        return text(phrase(
          '16-бітне беззнакове слово; пряме значення',
          '16-битное беззнаковое слово; прямое значение',
          '16-bit unsigned word; direct value'
        ));
      }
      function registerRawExplanation(register) {
        if (!register?.available || register.raw === null || register.raw === undefined) return text(phrase('Немає даних', 'Нет данных', 'No data'));
        const rawNumber = Number(register.raw);
        if (!Number.isFinite(rawNumber)) return String(register.raw);
        const raw = rawNumber & 0xffff;
        if (raw === 0xffff) return text(phrase('0xFFFF — немає даних', '0xFFFF — нет данных', '0xFFFF — no data'));
        if (raw === 0xfffe) return text(phrase('0xFFFE — не підтримується', '0xFFFE — не поддерживается', '0xFFFE — not supported'));
        const hexadecimal = `0x${raw.toString(16).toUpperCase().padStart(4, '0')}`;
        const signedValue = register.signed && raw >= 0x8000 ? raw - 0x10000 : raw;
        const signedNote = register.signed
          ? text(phrase(`зі знаком ${signedValue}`, `со знаком ${signedValue}`, `signed ${signedValue}`))
          : '';
        const interpretation = registerInterpretation(register);
        const encoding = rawEncodingExplanation(register, raw);
        return [String(raw), hexadecimal, signedNote, encoding, interpretation].filter(Boolean).join(' · ');
      }
      return Object.freeze({registerInterpretation, registerRawExplanation});
    })();

    function registerInterpretation(register) {
      return TTN_V131_INTERPRETATIONS.registerInterpretation(register);
    }
    function registerRawExplanation(register) {
      return TTN_V131_INTERPRETATIONS.registerRawExplanation(register);
    }

    function registerVersionDisplay(register, registers) {
      const registerNumber = Number(register?.register);
      const versionPair = registerNumber === 17 || registerNumber === 18
        ? [17, 18]
        : registerNumber === 27 || registerNumber === 28
          ? [27, 28]
          : null;
      const deviceTypePair = registerNumber === 61 || registerNumber === 62 ? [61, 62] : null;
      const pair = versionPair || deviceTypePair;
      if (!pair) return String(register?.display ?? register?.raw ?? '');
      const byNumber = new Map(registers.map(item => [Number(item.register), item]));
      const majorRegister = byNumber.get(pair[0]);
      const minorRegister = byNumber.get(pair[1]);
      if (!majorRegister?.available || !minorRegister?.available) return String(register?.display ?? '—');
      const major = Number(majorRegister.raw);
      const lowWord = Number(minorRegister.raw);
      if (!Number.isFinite(major) || !Number.isFinite(lowWord)) {
        return String(register?.display ?? register?.raw ?? '');
      }
      if (deviceTypePair) {
        const code = ((major & 0xffff) * 0x10000 + (lowWord & 0xffff)) >>> 0;
        const codeText = `0x${code.toString(16).toUpperCase().padStart(8, '0')}`;
        const knownType = code === 0x00000048
          ? (typeof t === 'function' ? t('deviceTypeSingle') : 'Single inverter (device code 72)')
          : (typeof t === 'function'
            ? t('unknownDeviceType', {code})
            : `Unknown device type (${code})`);
        return `${codeText} · ${knownType}`;
      }
      const minor = lowWord >= 10 ? Math.trunc(lowWord / 10) : lowWord;
      return `V${major}.${minor}`;
    }

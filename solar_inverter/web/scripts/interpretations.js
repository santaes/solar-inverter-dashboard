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
        phrase('Увімкнення живлення', 'Включение питания', 'Power-on mode'),
        phrase('Ініціалізація системи', 'Инициализация системы', 'System initialisation'),
        phrase('Очікування без активного джерела', 'Ожидание без активного источника', 'Standby; no active source'),
        phrase('Робота від мережі', 'Работа от сети', 'Grid (mains) mode'),
        phrase('Робота від PV', 'Работа от PV', 'PV mode'),
        phrase('Робота від батареї', 'Работа от батареи', 'Battery mode'),
        phrase('Робота від генератора', 'Работа от генератора', 'Generator mode'),
        phrase('Аварійний стан; перевірте коди несправностей', 'Аварийное состояние; проверьте коды неисправностей', 'Fault mode; inspect the fault codes'),
        phrase('Вимкнення інвертора', 'Отключение инвертора', 'Shutdown mode'),
        phrase('Заводський тестовий режим', 'Заводской тестовый режим', 'Factory test mode'),
        phrase('Оновлення програмного забезпечення', 'Обновление программного обеспечения', 'Firmware upgrade mode')
      ];
      const bmsConnection = [
        phrase('Пошук ID BMS', 'Поиск ID BMS', 'Searching for a BMS ID'),
        phrase('ID зафіксовано через CAN', 'ID зафиксирован через CAN', 'ID locked through CAN'),
        phrase('ID зафіксовано через послідовний порт', 'ID зафиксирован через последовательный порт', 'ID locked through the serial port'),
        phrase('ID зафіксовано віддалено', 'ID зафиксирован удалённо', 'ID locked remotely')
      ];
      const bmsDebugConnection = [
        phrase('Пошук ID BMS', 'Поиск ID BMS', 'Searching for a BMS ID'),
        phrase('ID BMS зафіксовано віддалено', 'ID BMS зафиксирован удалённо', 'BMS ID locked remotely'),
        phrase('ID BMS зафіксовано', 'ID BMS зафиксирован', 'BMS ID locked')
      ];
      const parallelMode = [
        phrase('Один інвертор', 'Один инвертор', 'Single unit'),
        phrase('Однофазна паралельна робота', 'Однофазная параллельная работа', 'Single-phase parallel operation'),
        phrase('Трифазна паралельна робота, фаза A/R', 'Трёхфазная параллельная работа, фаза A/R', 'Three-phase parallel, phase A/R'),
        phrase('Трифазна паралельна робота, фаза B/S', 'Трёхфазная параллельная работа, фаза B/S', 'Three-phase parallel, phase B/S'),
        phrase('Трифазна паралельна робота, фаза C/T', 'Трёхфазная параллельная работа, фаза C/T', 'Three-phase parallel, phase C/T')
      ];
      const outputMode = [
        phrase('APP — широкий допустимий діапазон AC', 'APP — широкий допустимый диапазон AC', 'APP — wide accepted AC range'),
        phrase('UPS — стабільний вузький діапазон AC', 'UPS — стабильный узкий диапазон AC', 'UPS — stable, narrow AC range'),
        phrase('GEN — вхід генератора; підтримується окремими моделями', 'GEN — вход генератора; поддерживается отдельными моделями', 'GEN — generator input; supported by selected models')
      ];
      const outputPriority = [
        phrase('GPB — мережа першою, батарея в резерві', 'GPB — сеть первой, батарея в резерве', 'GPB — grid first, battery held in reserve'),
        phrase('PGB — PV → мережа → батарея', 'PGB — PV → сеть → батарея', 'PGB — PV → grid → battery'),
        phrase('PBG — PV → батарея → мережа', 'PBG — PV → батарея → сеть', 'PBG — PV → battery → grid'),
        phrase('MKS/MKP — пріоритет генератора; залежить від моделі', 'MKS/MKP — приоритет генератора; зависит от модели', 'MKS/MKP — generator priority; model dependent')
      ];
      const chargePriority = [
        phrase('PNG — заряджання від PV і мережі', 'PNG — зарядка от PV и сети', 'PNG — charge from PV and grid'),
        phrase('OPV — заряджання лише від PV', 'OPV — зарядка только от PV', 'OPV — charge from PV only'),
        phrase('PVF — PV першим, мережа резервна; залежить від моделі', 'PVF — PV первым, сеть резервная; зависит от модели', 'PVF — PV first with grid backup; model dependent')
      ];
      const chargingState = [
        phrase('Активну стадію заряджання не вказано; фактичний напрямок визначається за струмом', 'Активная стадия зарядки не указана; фактическое направление определяется по току', 'No active charging stage is reported; actual direction is determined from current'),
        phrase('Основне заряджання CC/CV', 'Основная зарядка CC/CV', 'Main CC/CV charging stage'),
        phrase('Підтримувальне (float) заряджання', 'Поддерживающая (float) зарядка', 'Float charging stage'),
        phrase('Вирівнювальне заряджання', 'Выравнивающая зарядка', 'Equalisation charging stage')
      ];
      const terminalConnection = label => [
        phrase(`${label}: відкл`, `${label}: откл`, `${label}: off`),
        phrase(`${label}: підкл, ненорм`, `${label}: подкл, ненорм`, `${label}: on, abnormal`),
        phrase(`${label}: підкл, норм`, `${label}: подкл, норм`, `${label}: on, normal`)
      ];
      const outputState = [
        phrase('Вихід зупинено', 'Выход остановлен', 'Output stopped'),
        phrase('Нормальний вихід', 'Нормальный выход', 'Output normal'),
        phrase('Перевантаження виходу', 'Перегрузка выхода', 'Output overloaded'),
        phrase('Коротке замикання виходу', 'Короткое замыкание выхода', 'Output short circuit')
      ];
      const batteryState = [
        phrase('Батарея не підключена або коротке замикання', 'Батарея не подключена или короткое замыкание', 'Battery disconnected or short-circuited'),
        phrase('Низька напруга батареї', 'Низкое напряжение батареи', 'Battery voltage low'),
        phrase('Батарея розряджається', 'Батарея разряжается', 'Battery discharging'),
        phrase('Батарея заряджається', 'Батарея заряжается', 'Battery charging'),
        phrase('Батарея повністю заряджена', 'Батарея полностью заряжена', 'Battery fully charged')
      ];
      const terminalChargingState = [
        phrase('Заряджання не виконується', 'Зарядка не выполняется', 'Not charging'),
        phrase('Заряджання постійним струмом', 'Зарядка постоянным током', 'Constant-current charging'),
        phrase('Заряджання постійною напругою', 'Зарядка постоянным напряжением', 'Constant-voltage charging'),
        phrase('Підтримувальне заряджання', 'Поддерживающая зарядка', 'Float charging'),
        phrase('Вирівнювальне заряджання', 'Выравнивающая зарядка', 'Equalisation charging')
      ];

      const flowBits = [
        phrase('Мережа → випрямляч', 'Сеть → выпрямитель', 'Grid → rectifier'),
        phrase('Мережа → навантаження', 'Сеть → нагрузка', 'Grid → load'),
        phrase('Генератор → випрямляч', 'Генератор → выпрямитель', 'Generator → rectifier'),
        phrase('Генератор → навантаження', 'Генератор → нагрузка', 'Generator → load'),
        phrase('PV → випрямляч', 'PV → выпрямитель', 'PV → rectifier'),
        phrase('Випрямляч → батарея', 'Выпрямитель → батарея', 'Rectifier → battery'),
        phrase('Випрямляч → інвертор', 'Выпрямитель → инвертор', 'Rectifier → inverter'),
        phrase('Випрямляч → мережа', 'Выпрямитель → сеть', 'Rectifier → grid'),
        phrase('Батарея → інвертор', 'Батарея → инвертор', 'Battery → inverter'),
        phrase('Інвертор → основний вихід', 'Инвертор → основной выход', 'Inverter → main output'),
        phrase('Інвертор → другий вихід', 'Инвертор → второй выход', 'Inverter → secondary output'),
        phrase('BIT11 зарезервовано', 'BIT11 зарезервирован', 'BIT11 is reserved'),
        phrase('Wi-Fi підключено', 'Wi-Fi подключён', 'Wi-Fi connected'),
        phrase('Енергозберігальний режим', 'Энергосберегающий режим', 'Energy-saving mode'),
        phrase('BIT14 зарезервовано', 'BIT14 зарезервирован', 'BIT14 is reserved'),
        phrase('Тихий режим', 'Тихий режим', 'Silent mode')
      ];
      const fault1Bits = [
        phrase('Помилка плавного запуску мережі', 'Ошибка плавного запуска сети', 'Grid soft-start failure'),
        phrase('Перенапруга DC-шини', 'Перенапряжение DC-шины', 'Bus overvoltage'),
        phrase('Занижена напруга DC-шини', 'Пониженное напряжение DC-шины', 'Bus undervoltage'),
        phrase('Надструм батареї', 'Сверхток батареи', 'Battery overcurrent'),
        phrase('Перегрів', 'Перегрев', 'Overtemperature'),
        phrase('Перенапруга батареї', 'Перенапряжение батареи', 'Battery overvoltage'),
        phrase('Помилка плавного запуску батареї', 'Ошибка плавного запуска батареи', 'Battery soft-start failure'),
        phrase('Коротке замикання DC-шини', 'Короткое замыкание DC-шины', 'Bus short circuit'),
        phrase('Помилка плавного запуску інвертора', 'Ошибка плавного запуска инвертора', 'Inverter soft-start failure'),
        phrase('Перенапруга інвертора', 'Перенапряжение инвертора', 'Inverter overvoltage'),
        phrase('Занижена напруга інвертора', 'Пониженное напряжение инвертора', 'Inverter undervoltage'),
        phrase('Коротке замикання інвертора', 'Короткое замыкание инвертора', 'Inverter short circuit'),
        phrase('Захист від від’ємної потужності', 'Защита от отрицательной мощности', 'Negative-power protection'),
        phrase('Аварія перевантаження', 'Авария перегрузки', 'Overload fault'),
        phrase('Невідповідність моделі та обладнання', 'Несоответствие модели и оборудования', 'Model and hardware mismatch'),
        phrase('Завантажувач відсутній', 'Загрузчик отсутствует', 'Bootloader missing')
      ];
      const fault2Bits = [
        phrase('Запис програми', 'Запись программы', 'Program flashing'),
        phrase('Зворотна полярність PV', 'Обратная полярность PV', 'PV reverse connection'),
        phrase('Помилка серійного номера паралельної системи', 'Ошибка серийного номера параллельной системы', 'Parallel serial-number anomaly'),
        phrase('Помилка зв’язку паралельної системи', 'Ошибка связи параллельной системы', 'Parallel communication anomaly'),
        phrase('Велика різниця напруг батарей у паралелі', 'Большая разница напряжений батарей в параллели', 'Large parallel battery-voltage difference'),
        phrase('Велика різниця напруг мережі у паралелі', 'Большая разница напряжений сети в параллели', 'Large parallel grid-voltage difference'),
        phrase('Велика різниця частоти мережі у паралелі', 'Большая разница частоты сети в параллели', 'Large parallel grid-frequency difference'),
        phrase('Відсутня фаза у паралельній системі', 'Отсутствует фаза в параллельной системе', 'Parallel phase missing'),
        phrase('Втрачено синхронізацію паралельного виходу', 'Потеряна синхронизация параллельного выхода', 'Parallel output synchronisation lost'),
        phrase('Несправність BMS', 'Неисправность BMS', 'BMS fault'),
        phrase('Несправність MCU', 'Неисправность MCU', 'MCU fault'),
        phrase('BIT11 зарезервовано', 'BIT11 зарезервирован', 'BIT11 is reserved'),
        phrase('Ненормальне навантаження інвертора', 'Ненормальная нагрузка инвертора', 'Inverter load anomaly'),
        phrase('Перенапруга PV', 'Перенапряжение PV', 'PV overvoltage')
      ];
      const alarm1Bits = [
        phrase('Батарея не підключена', 'Батарея не подключена', 'Battery not connected'),
        phrase('Занижена напруга батареї', 'Пониженное напряжение батареи', 'Battery undervoltage'),
        phrase('Низька напруга батареї', 'Низкое напряжение батареи', 'Battery voltage low'),
        phrase('Коротке замикання зарядного пристрою', 'Короткое замыкание зарядного устройства', 'Charger short circuit'),
        phrase('BIT04 зарезервовано', 'BIT04 зарезервирован', 'BIT04 is reserved'),
        phrase('Перезаряд батареї', 'Перезаряд батареи', 'Battery overcharge'),
        phrase('Втрачено BMS', 'Потеряна BMS', 'BMS connection lost'),
        phrase('Перегрів (зарезервовано)', 'Перегрев (зарезервировано)', 'Overtemperature (reserved)'),
        phrase('Вентилятор заблоковано', 'Вентилятор заблокирован', 'Fan stalled'),
        phrase('Помилка EEPROM', 'Ошибка EEPROM', 'EEPROM fault'),
        phrase('Перевантаження', 'Перегрузка', 'Overload'),
        phrase('Аномальна форма сигналу генератора (зарезервовано)', 'Аномальная форма сигнала генератора (зарезервировано)', 'Generator waveform anomaly (reserved)'),
        phrase('Недостатня енергія PV', 'Недостаточная энергия PV', 'Weak PV energy'),
        phrase('Втрачено сигнал синхронізації паралельної системи', 'Потерян сигнал синхронизации параллельной системы', 'Parallel synchronisation signal lost'),
        phrase('Відсутня фаза у паралельній системі', 'Отсутствует фаза в параллельной системе', 'Parallel phase missing'),
        phrase('Несумісна версія паралельної системи (зарезервовано)', 'Несовместимая версия параллельной системы (зарезервировано)', 'Parallel version incompatible (reserved)')
      ];
      const alarm2Bits = [
        phrase('Помилка зв’язку паралельної системи', 'Ошибка связи параллельной системы', 'Parallel communication anomaly'),
        phrase('Велика різниця напруги або частоти мережі у паралелі', 'Большая разница напряжения или частоты сети в параллели', 'Large parallel grid voltage/frequency difference'),
        phrase('Вимкнення через низький SOC', 'Отключение из-за низкого SOC', 'Shutdown due to low SOC'),
        phrase('Попередження про низький SOC', 'Предупреждение о низком SOC', 'Low-SOC warning'),
        phrase('Велика різниця напруг батарей або батарея не підключена', 'Большая разница напряжений батарей или батарея не подключена', 'Large parallel battery-voltage difference or disconnected battery'),
        phrase('Коротке замикання батареї', 'Короткое замыкание батареи', 'Battery short circuit'),
        phrase('Батарея нижче напруги запуску', 'Батарея ниже напряжения запуска', 'Battery below startup voltage'),
        phrase('Перевантаження генератора', 'Перегрузка генератора', 'Generator overload'),
        phrase('Занижена напруга генератора', 'Пониженное напряжение генератора', 'Generator undervoltage'),
        phrase('Перенапруга генератора', 'Перенапряжение генератора', 'Generator overvoltage'),
        phrase('Помилка підключення зовнішнього CT/лічильника', 'Ошибка подключения внешнего CT/счётчика', 'External CT/meter connection anomaly'),
        phrase('Нестабільна мережа', 'Нестабильная сеть', 'Unstable grid'),
        phrase('Помилка зв’язку з лічильником', 'Ошибка связи со счётчиком', 'Meter communication failure')
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

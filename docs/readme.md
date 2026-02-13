### 1.1. Telegram WebApp
В окружении мини‑приложения доступен объект:

- `window.Telegram.WebApp` → далее в коде `tg`

Ключевые методы:
- `tg.ready()` — сообщает Telegram, что приложение готово.
- `tg.expand()` — пытается развернуть мини‑приложение по высоте.
- `tg.sendData(string)` — отправляет строку в бота как `web_app_data` (обработчик в aiogram ловит `@router.message(F.web_app_data)`).
- `tg.showAlert(text)` — показывает алерт внутри мини‑приложения.

### 1.2. Google Apps Script endpoint (чтение слотов)
Код строит URL вида:

`APPS_SCRIPT_URL?token=READ_TOKEN&from=YYYY-MM-DD&to=YYYY-MM-DD`

Ожидаемый ответ — JSON:

```json
{
  "from": "2026-02-12",
  "to": "2026-02-25",
  "slots": [
    {"date":"2026-02-12","time":"10:00","status":"свободно"},
    {"date":"2026-02-12","time":"11:00","status":"занято"}
  ]
}
```

Важно:
- `status` приводится к нижнему регистру и сравнивается со строкой `"свободно"`.
- даты передаются и сравниваются **в ISO** (`YYYY-MM-DD`).

---

## 2) Константы и глобальные переменные

### 2.1. Константы
- `APPS_SCRIPT_URL` — адрес GAS `/exec`
- `READ_TOKEN` — токен доступа на чтение (передаётся как query‑параметр `token=`)

### 2.2. Глобальные переменные состояния
- `selectedDate: Date|null` — выбранная дата (объект `Date`)
- `selectedTime: string|null` — выбранное время (`"HH:MM"`)
- `slotsByDate: Map<string, Array<{time: string, status: string}>>`
  - ключ — дата ISO (`"2026-02-12"`)
  - значение — массив слотов внутри дня
- `isLoading: boolean` — блокировка событий, чтобы не было двойных запросов/кликов
- `fp` — инстанс flatpickr (календарь)

---

## 3) Привязка Telegram темы к CSS

```js
document.documentElement.style.setProperty("--tg-theme-bg-color", tg.themeParams.bg_color || "#ffffff");
...
```

Это позволяет в CSS использовать переменные `--tg-theme-*` и “подстраивать” мини‑приложение под тему Telegram.

---

## 4) Вспомогательные функции

### 4.1. `$()`
```js
function $(id) { return document.getElementById(id); }
```
Простой шорткат, чтобы доставать DOM‑элемент по id.

### 4.2. `setGlobalLock(on, text)`
Показывает/прячет “оверлей загрузки” (элемент `#globalLock`):
- когда `on=true` → добавляет класс `active` и пишет `text`
- когда `on=false` → убирает `active`

### 4.3. `setHint(text)`
Пишет подсказку в `#dateHint`.

### 4.4. `setDatePickerEnabled(enabled)`
Включает/выключает `<input id="dateInput">` (чтобы пользователь не кликал в процессе загрузки).

---

## 5) Работа с датами и временем

### 5.1. `iso(date)`
Преобразует объект `Date` в ISO‑строку `YYYY-MM-DD`.

### 5.2. `formatDateForAPI(date)`
Сейчас просто возвращает `iso(date)`.

### 5.3. `formatDateDisplay(date)`
Делает красивую строку для UI, например:
`12 февраля 2026, четверг`

### 5.4. `parseTimeToMinutes("HH:MM")`
Переводит время в минуты от начала дня:
- `"09:00"` → `540`

Используется для сортировки слотов и сравнения “прошло/не прошло”.

### 5.5. `nowMinutesLocal()`
Текущее время (локальное) в минутах от начала дня.
Используется чтобы скрывать слоты, которые уже начались “сегодня”.

---

## 6) Загрузка слотов из Google Apps Script

### 6.1. `loadSlotsWindow()`
Основная функция загрузки расписания на окно 14 дней.

**Что делает:**
1. Вычисляет диапазон дат:
   - `from = сегодня`
   - `to = сегодня + 13 дней` (итого 14 календарных дней)
2. Делает `fetch()` по GAS URL.
3. Парсит JSON.
4. Очищает `slotsByDate`.
5. Пробегает `data.slots` и кладёт слоты в `Map`:
   - `slotsByDate.set(date, [])`
   - `slotsByDate.get(date).push({time, status})`
6. Сортирует внутри каждого дня по времени.
7. Печатает в консоль список дат, которые пришли.

---

## 7) Логика доступности дат/времени

### 7.1. `dateHasFreeSlots(dateStr)`
Проверяет, есть ли в `slotsByDate[dateStr]` хотя бы один слот `"свободно"`.

### 7.2. `isSelectableDate(date)`
Возвращает `true`, если:
- день присутствует в `slotsByDate`
- и внутри есть хотя бы один слот `"свободно"`

Эта функция используется в `flatpickr.disable` — то есть влияет на то, можно ли выбрать дату кликом.

### 7.3. `getOccupiedTimes(dateStr)` / `getFreeTimes(dateStr)`
Разбирают слоты по статусу и возвращают массивы времен `"HH:MM"`.

---

## 8) Управление шагами UI (step1/step2/step3)

### 8.1. `goToStep(n)`
Снимает `active` со всех `.step`, затем включает `#step{n}`.

Пример:
- `goToStep(1)` — календарь
- `goToStep(2)` — выбор времени
- `goToStep(3)` — подтверждение

Функция экспортируется в `window.goToStep`.

---

## 9) Выбор времени (слоты)

### 9.1. `window.backToTime()`
Кнопка “Назад” из шага подтверждения к шагу выбора времени:
- сбрасывает `selectedTime`
- вызывает `loadTimeSlots()` чтобы заново показать слоты

### 9.2. `renderTimeSlots(dateStr)`
Рендерит сетку слотов в `#timeSlots`.

**Алгоритм:**
1. Очищает контейнер.
2. Формирует `occupied` и `free` множества.
3. Формирует `times` (все времена для дня) и сортирует.
4. Для каждого времени:
   - если “сегодня” и время уже прошло → **скрывает слот**
   - иначе создаёт `<div class="time-slot">`
     - занято → `occupied` + текст `❌ HH:MM`
     - свободно → `available` + текст `✅ HH:MM` + обработчик клика

**На клик по свободному слоту:**
- подсвечивает выбранный слот (класс `selected`)
- записывает `selectedTime`
- через небольшой `setTimeout` переводит на шаг 3 и подставляет подтверждение:
  - `#confirmDate`, `#confirmTime`, `#confirmDuration`

### 9.3. `loadTimeSlots()`
Переходит на шаг 2 и вызывает `renderTimeSlots()`.

Перед рендером проверяет:
- если на дату нет свободных слотов → показывает алерт и возвращает на шаг 1

---

## 10) Подтверждение записи и отправка данных в бота

### 10.1. `window.confirmBooking()`
Финальная функция подтверждения:
1. Проверяет, что выбраны `selectedDate` и `selectedTime`
2. Формирует объект:
   ```js
   { date: "YYYY-MM-DD", time: "HH:MM" }
   ```
3. Отправляет в бота:
   ```js
   tg.sendData(JSON.stringify(data));
   ```

**Что происходит дальше:**
- Telegram закрывает мини‑приложение (обычно сразу после `sendData`).
- В боте aiogram прилетает update с `web_app_data`, где лежит эта строка.

---

## 11) Инициализация календаря (flatpickr)

В конце файла стоит IIFE:

```js
(async () => { ... })();
```

**Шаги инициализации:**
1. Включает блокировку UI: `isLoading = true`
2. Прячет ввод: `setDatePickerEnabled(false)`
3. Загружает слоты: `await loadSlotsWindow()`
4. Создаёт `flatpickr("#dateInput", {...})`

Ключевые параметры flatpickr:
- `minDate: "today"` — нельзя выбрать прошлые даты
- `dateFormat: "d.m.Y"` — отображение в input
- `disable: [...]` — массив “запрещающих функций”
  - `(date) => date.getDay() === 0` — воскресенье нельзя всегда
  - `(date) => !isSelectableDate(date)` — нельзя выбирать даты без свободных слотов
- `onChange` — обработчик выбора даты

### 11.1. `onChange(selectedDates)`
При выборе даты:
1. Проверяет блокировку `isLoading`
2. Включает загрузку
3. Ставит `selectedDate = selectedDates[0]`, сбрасывает `selectedTime`
4. Перезагружает слоты `await loadSlotsWindow()` (на случай изменений/кэша)
5. Переходит к выбору времени `await loadTimeSlots()`
6. В `finally` выключает блокировку

---

## 13) Контракт данных между фронтом и ботом

Фронт отправляет строго:
```json
{"date":"YYYY-MM-DD","time":"HH:MM"}
```
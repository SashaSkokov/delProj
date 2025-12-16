const tg = window.Telegram.WebApp;

tg.expand();
tg.ready();

// === ВСТАВЬ СЮДА ===
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzIKdC0iGVD4QiqShUKjPykCk58XDfgLIOpfFagkiy5RnUVTFZEs7tYx9ssaM60HVKd/exec";
const READ_TOKEN = "4Hd2gCErhTJZwli_a3WWjPb6zlkYsxmMsxCOg5cz5uM";
// ====================

// Telegram theme
document.documentElement.style.setProperty("--tg-theme-bg-color", tg.themeParams.bg_color || "#ffffff");
document.documentElement.style.setProperty("--tg-theme-text-color", tg.themeParams.text_color || "#000000");
document.documentElement.style.setProperty("--tg-theme-button-color", tg.themeParams.button_color || "#3390ec");
document.documentElement.style.setProperty("--tg-theme-button-text-color", tg.themeParams.button_text_color || "#ffffff");

const STATUS_FREE = "свободно";
const TIMES = ["09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00"];
const LOADING_TEXT = "⏳ Загружаем слоты";

let fp = null;
let selectedDate = null;
let selectedTime = null;

let occupiedSlots = [];
let slotsByDate = new Map();

// защита от повторных выборов даты во время загрузки
let dateBusy = false;

// только один “таймер точек”
let dotsTimer = null;

function iso(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDateForAPI(date) {
  return iso(date);
}

function formatDateDisplay(date) {
  const days = ["воскресенье","понедельник","вторник","среда","четверг","пятница","суббота"];
  const months = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}, ${days[date.getDay()]}`;
}

function goToStep(n) {
  document.querySelectorAll(".step").forEach((s) => s.classList.remove("active"));
  document.getElementById(`step${n}`).classList.add("active");
}

function startDots(messageBase) {
  stopDots();
  let dots = 0;
  const hint = document.getElementById("dateLockHint");
  if (hint) hint.textContent = `${messageBase}...`;

  dotsTimer = setInterval(() => {
    dots = (dots + 1) % 4; // 0..3
    const suffix = ".".repeat(dots) || ".";
    const h = document.getElementById("dateLockHint");
    if (h) h.textContent = `${messageBase}${suffix}`;
  }, 300);
}

function stopDots() {
  if (dotsTimer) {
    clearInterval(dotsTimer);
    dotsTimer = null;
  }
}

function setDateLocked(locked) {
  const input = document.getElementById("dateInput");
  const hint = document.getElementById("dateLockHint");
  if (!input || !hint) return;

  if (locked) {
    input.setAttribute("disabled", "disabled");
    hint.style.display = "block";
    startDots(LOADING_TEXT);
    if (fp) fp.set("clickOpens", false); // чтобы календарь не открывался кликом [file:503]
  } else {
    input.removeAttribute("disabled");
    hint.style.display = "none";
    stopDots();
    if (fp) fp.set("clickOpens", true);
  }
}

function showTimeLoading() {
  document.getElementById("loadingSlots").style.display = "block";
  document.getElementById("timeSlots").style.display = "none";
}

function showTimeGrid() {
  document.getElementById("loadingSlots").style.display = "none";
  document.getElementById("timeSlots").style.display = "grid";
}

async function loadSlots14Days() {
  const from = iso(new Date());
  const toDate = new Date();
  toDate.setDate(toDate.getDate() + 13);
  const to = iso(toDate);

  const url = `${APPS_SCRIPT_URL}?token=${encodeURIComponent(READ_TOKEN)}&from=${from}&to=${to}`;
  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json();

  slotsByDate.clear();
  for (const s of (data.slots || [])) {
    const date = String(s.date || "").trim();
    const time = String(s.time || "").trim();
    const status = String(s.status || "").trim().toLowerCase();

    if (!date || !time) continue;
    if (!slotsByDate.has(date)) slotsByDate.set(date, []);
    slotsByDate.get(date).push({ time, status });
  }
}

function getOccupiedTimes(dateStr) {
  const arr = slotsByDate.get(dateStr) || [];
  return arr.filter(x => x.status !== STATUS_FREE).map(x => x.time);
}

function computeDisabledDates() {
  const disabled = [];
  for (const [date, arr] of slotsByDate.entries()) {
    const hasFree = arr.some(x => x.status === STATUS_FREE);
    if (!hasFree) disabled.push(date);
  }
  return disabled;
}

function applyDisabledDates() {
  if (!fp) return;
  const disabledDates = computeDisabledDates();
  fp.set("disable", [
    (date) => date.getDay() === 0 || date.getDay() === 6,
    ...disabledDates,
  ]);
  fp.redraw();
}

function renderTimeSlots() {
  const container = document.getElementById("timeSlots");
  container.innerHTML = "";

  for (const time of TIMES) {
    const slot = document.createElement("div");
    slot.className = "time-slot";

    const isOccupied = occupiedSlots.includes(time);
    if (isOccupied) {
      slot.classList.add("occupied");
      slot.textContent = `❌ ${time}`;
    } else {
      slot.classList.add("available");
      slot.textContent = `✅ ${time}`;
      slot.addEventListener("click", (event) => selectTime(time, event));
    }

    container.appendChild(slot);
  }

  showTimeGrid();
}

function selectTime(time, event) {
  document.querySelectorAll(".time-slot").forEach((s) => s.classList.remove("selected"));
  event.target.classList.add("selected");

  selectedTime = time;
  document.getElementById("confirmDate").textContent = formatDateDisplay(selectedDate);
  document.getElementById("confirmTime").textContent = selectedTime;
  goToStep(3);
}

async function loadTimeSlotsForSelectedDate() {
  // показываем шаг 2 + лоадер мгновенно (до fetch), чтобы не было ощущения “зависло”
  goToStep(2);
  document.getElementById("selectedDateDisplay").textContent = formatDateDisplay(selectedDate);
  showTimeLoading();

  const dateStr = formatDateForAPI(selectedDate);
  occupiedSlots = getOccupiedTimes(dateStr);

  // отрисовка (после расчёта)
  renderTimeSlots();
}

window.confirmBooking = async function () {
  // перепроверка перед отправкой
  await loadSlots14Days();
  applyDisabledDates();

  const dateStr = formatDateForAPI(selectedDate);
  const occupiedNow = getOccupiedTimes(dateStr);
  if (occupiedNow.includes(selectedTime)) {
    tg.showAlert("❌ Это время уже занято, выбери другое.");
    return;
  }

  tg.sendData(JSON.stringify({ date: dateStr, time: selectedTime }));
};

window.goToStep = goToStep;

(async () => {
  try {
    fp = flatpickr("#dateInput", {
      locale: "ru",
      inline: false,
      minDate: "today",
      dateFormat: "d.m.Y",
      disableMobile: true,
      disable: [(date) => date.getDay() === 0 || date.getDay() === 6],
      onOpen: async () => {
        // обновляем disable-дни при открытии (без лока, чтобы не мешать UX)
        if (dateBusy) return;
        await loadSlots14Days();
        applyDisabledDates();
      },
      onChange: async (selectedDates) => {
        if (selectedDates.length === 0) return;
        if (dateBusy) return;

        dateBusy = true;
        setDateLocked(true); // единственная надпись “⏳ Загружаем слоты...”
        try {
          selectedDate = selectedDates[0];
          selectedTime = null;

          // 1) сразу показываем шаг 2 и лоадер (чтобы действие было моментальным)
          goToStep(2);
          document.getElementById("selectedDateDisplay").textContent = formatDateDisplay(selectedDate);
          showTimeLoading();

          // 2) грузим данные и обновляем календарь (это самое долгое место)
          await loadSlots14Days();
          applyDisabledDates();

          // 3) проверяем что на дату есть свободные слоты
          const dateStr = formatDateForAPI(selectedDate);
          const arr = slotsByDate.get(dateStr) || [];
          const hasFree = arr.some(x => x.status === STATUS_FREE);
          if (!hasFree) {
            fp.clear();
            selectedDate = null;
            tg.showAlert("❌ На выбранную дату нет свободных слотов.");
            goToStep(1);
            return;
          }

          // 4) рисуем слоты и сразу после этого разблокируем выбор даты
          await loadTimeSlotsForSelectedDate();
        } finally {
          setDateLocked(false); // как только слоты показаны — дата снова активна
          dateBusy = false;
        }
      },
    });

    // первичная загрузка (без надписей “подготовка” — ты просил только про слоты)
    await loadSlots14Days();
    applyDisabledDates();
  } catch (e) {
    console.error(e);
    setDateLocked(false);
    tg.showAlert("❌ Не удалось загрузить расписание.");
  }
})();

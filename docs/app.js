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

let fp = null;
let selectedDate = null;
let selectedTime = null;

let occupiedSlots = [];
let slotsByDate = new Map();

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

function setDatePickerLocked(locked, message = "") {
  const input = document.getElementById("dateInput");
  const hint = document.getElementById("dateLockHint");
  if (!input || !hint) return;

  if (locked) {
    input.setAttribute("disabled", "disabled");
    hint.textContent = message || "⏳ Загрузка расписания…";
    hint.style.display = "block";
    if (fp) fp.set("clickOpens", false);
  } else {
    input.removeAttribute("disabled");
    hint.style.display = "none";
    if (fp) fp.set("clickOpens", true);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function lockDatePickerSmart(loadPromise, opts = {}) {
  const minMs = opts.minMs ?? 1200;
  const maxMs = opts.maxMs ?? 5000;

  setDatePickerLocked(true, "⏳ Загрузка расписания…");

  let dots = 0;
  const dotTimer = setInterval(() => {
    dots = (dots + 1) % 4;
    const suffix = ".".repeat(dots);
    const hint = document.getElementById("dateLockHint");
    if (hint) hint.textContent = `⏳ Загрузка расписания${suffix}`;
  }, 250);

  const start = Date.now();
  try {
    // ждём либо загрузку, либо maxMs — что раньше
    await Promise.race([loadPromise, delay(maxMs)]);
  } finally {
    const spent = Date.now() - start;
    const left = Math.max(0, minMs - spent);
    if (left > 0) await delay(left);
    clearInterval(dotTimer);
    setDatePickerLocked(false);
  }
}

async function loadSlots14Days() {
  const from = iso(new Date());
  const toDate = new Date();
  toDate.setDate(toDate.getDate() + 13);
  const to = iso(toDate);

  const url = `${APPS_SCRIPT_URL}?token=${encodeURIComponent(READ_TOKEN)}&from=${from}&to=${to}`;
  const res = await fetch(url);
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

  document.getElementById("loadingSlots").style.display = "none";
  container.style.display = "grid";
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
  goToStep(2);

  const dateStr = formatDateForAPI(selectedDate);

  document.getElementById("selectedDateDisplay").textContent = formatDateDisplay(selectedDate);
  document.getElementById("loadingSlots").style.display = "block";
  document.getElementById("timeSlots").style.display = "none";

  occupiedSlots = getOccupiedTimes(dateStr);
  renderTimeSlots();
}

window.confirmBooking = async function () {
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
    // создаём календарь сразу, но клики блокируем через disabled + clickOpens=false
    fp = flatpickr("#dateInput", {
      locale: "ru",
      inline: false,
      minDate: "today",
      dateFormat: "d.m.Y",
      disableMobile: true,
      disable: [(date) => date.getDay() === 0 || date.getDay() === 6],
      clickOpens: true, // временно выключим через setDatePickerLocked()
      onOpen: async () => {
        // при каждом открытии — обновим данные, но блокировку держим аккуратно
        const p = loadSlots14Days().then(() => applyDisabledDates());
        await lockDatePickerSmart(p, { minMs: 600, maxMs: 5000 });
      },
      onChange: async (selectedDates) => {
        if (selectedDates.length === 0) return;

        selectedDate = selectedDates[0];
        selectedTime = null;

        const p = loadSlots14Days().then(() => applyDisabledDates());
        await lockDatePickerSmart(p, { minMs: 300, maxMs: 5000 });

        const dateStr = formatDateForAPI(selectedDate);
        const arr = slotsByDate.get(dateStr) || [];
        const hasFree = arr.some(x => x.status === STATUS_FREE);
        if (!hasFree) {
          tg.showAlert("❌ На выбранную дату нет свободных слотов.");
          return;
        }

        await loadTimeSlotsForSelectedDate();
      },
    });

    // первичная загрузка при входе
    const p0 = loadSlots14Days().then(() => applyDisabledDates());
    await lockDatePickerSmart(p0, { minMs: 1200, maxMs: 5000 });
  } catch (e) {
    console.error(e);
    setDatePickerLocked(false);
    tg.showAlert("❌ Не удалось загрузить расписание.");
  }
})();

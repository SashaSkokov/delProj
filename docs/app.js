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

let fp = null;                 // flatpickr instance
let selectedDate = null;       // Date
let selectedTime = null;       // "HH:MM"
let slotsByDate = new Map();   // "YYYY-MM-DD" -> [{time,status}]
let occupiedSlots = [];        // ["09:00", ...]

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

function computeDisabledDates() {
  // disable only dates that exist in map AND have no free slots
  const disabled = [];
  for (const [date, arr] of slotsByDate.entries()) {
    const hasFree = arr.some(x => x.status === STATUS_FREE);
    if (!hasFree) disabled.push(date); // "YYYY-MM-DD"
  }
  return disabled;
}

function applyDisabledDates() {
  if (!fp) return;

  const disabledDates = computeDisabledDates();
  fp.set("disable", [
    (date) => date.getDay() === 0 || date.getDay() === 6, // выходные
    ...disabledDates, // полностью занятые дни
  ]);
  fp.redraw();
}

function getOccupiedTimes(dateStr) {
  const arr = slotsByDate.get(dateStr) || [];
  return arr.filter(x => x.status !== STATUS_FREE).map(x => x.time);
}

function goToStep(n) {
  document.querySelectorAll(".step").forEach((s) => s.classList.remove("active"));
  document.getElementById(`step${n}`).classList.add("active");
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

  // данные должны быть уже загружены через loadSlots14Days()
  occupiedSlots = getOccupiedTimes(dateStr);
  renderTimeSlots();
}

// confirm from HTML button
window.confirmBooking = async function () {
  // Опционально “золотая середина”: перепроверка прямо перед подтверждением
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

// init
(async () => {
  try {
    await loadSlots14Days();

    fp = flatpickr("#dateInput", {
      locale: "ru",
      inline: false,
      disableMobile: true,
      minDate: "today",
      dateFormat: "d.m.Y",
      disable: [
        (date) => date.getDay() === 0 || date.getDay() === 6,
        ...computeDisabledDates(),
      ],
      onOpen: async () => {
        // если календарь открыли — обновим данные, чтобы disabled-дни были свежими
        await loadSlots14Days();
        applyDisabledDates();
      },
      onChange: async (selectedDates) => {
        if (selectedDates.length === 0) return;

        selectedDate = selectedDates[0];
        selectedTime = null;

        // обновляем слоты и сразу обновляем disabled-дни
        await loadSlots14Days();
        applyDisabledDates();

        await loadTimeSlotsForSelectedDate();
      },
    });

    // на случай, если после init что-то изменилось
    applyDisabledDates();
  } catch (e) {
    console.error(e);
    tg.showAlert("❌ Не удалось загрузить расписание.");
  }
})();

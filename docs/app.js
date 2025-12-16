const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwa69YWWJjxrgT06n39px-zFq6zgxgfwia5Ix9TpWOIc8EETQVNJwby_yYYdISk2Nxx/exec";
const READ_TOKEN = "4Hd2gCErhTJZwli_a3WWjPb6zlkYsxmMsxCOg5cz5uM";

document.documentElement.style.setProperty("--tg-theme-bg-color", tg.themeParams.bg_color || "#ffffff");
document.documentElement.style.setProperty("--tg-theme-text-color", tg.themeParams.text_color || "#000000");
document.documentElement.style.setProperty("--tg-theme-button-color", tg.themeParams.button_color || "#3390ec");
document.documentElement.style.setProperty("--tg-theme-button-text-color", tg.themeParams.button_text_color || "#ffffff");

let selectedDate = null;
let selectedTime = null;

// date -> [{time, status}]
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

async function loadSlotsWindow() {
  const from = iso(new Date());
  const toDate = new Date();
  toDate.setDate(toDate.getDate() + 13);
  const to = iso(toDate);

  const url = `${APPS_SCRIPT_URL}?token=${encodeURIComponent(READ_TOKEN)}&from=${from}&to=${to}`;
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Bad response from GAS: ${text.slice(0, 200)}`);
  }

  slotsByDate.clear();
  for (const s of (data.slots || [])) {
    const date = s.date;
    const time = s.time;
    const status = (s.status || "").toLowerCase();

    if (!slotsByDate.has(date)) slotsByDate.set(date, []);
    slotsByDate.get(date).push({ time, status });
  }
}

function dateHasFreeSlots(dateStr) {
  const arr = slotsByDate.get(dateStr) || [];
  return arr.some(x => x.status === "свободно");
}

function getOccupiedTimes(dateStr) {
  const arr = slotsByDate.get(dateStr) || [];
  return arr.filter(x => x.status !== "свободно").map(x => x.time);
}

function goToStep(n) {
  document.querySelectorAll(".step").forEach((s) => s.classList.remove("active"));
  document.getElementById(`step${n}`).classList.add("active");
}

function renderTimeSlots(dateStr) {
  const container = document.getElementById("timeSlots");
  container.innerHTML = "";

  const occupied = new Set(getOccupiedTimes(dateStr));
  const times = ["09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00"];

  times.forEach((time) => {
    const slot = document.createElement("div");
    slot.className = "time-slot";

    if (occupied.has(time)) {
      slot.classList.add("occupied");
      slot.textContent = `❌ ${time}`;
    } else {
      slot.classList.add("available");
      slot.textContent = `✅ ${time}`;
      slot.addEventListener("click", (event) => {
        document.querySelectorAll(".time-slot").forEach((s) => s.classList.remove("selected"));
        event.currentTarget.classList.add("selected");
        selectedTime = time;

        setTimeout(() => {
          document.getElementById("confirmDate").textContent = formatDateDisplay(selectedDate);
          document.getElementById("confirmTime").textContent = selectedTime;
          goToStep(3);
        }, 150);
      });
    }

    container.appendChild(slot);
  });

  document.getElementById("loadingSlots").style.display = "none";
  container.style.display = "grid";
}

async function loadTimeSlots() {
  goToStep(2);

  const dateStr = formatDateForAPI(selectedDate);
  document.getElementById("selectedDateDisplay").textContent = formatDateDisplay(selectedDate);
  document.getElementById("loadingSlots").style.display = "block";
  document.getElementById("timeSlots").style.display = "none";

  // если на дату нет свободных слотов — сразу сообщаем и не даём дальше
  if (!dateHasFreeSlots(dateStr)) {
    tg.showAlert("На выбранную дату свободных слотов нет.");
    goToStep(1);
    return;
  }

  renderTimeSlots(dateStr);
}

// кнопка подтверждения
window.confirmBooking = function () {
  if (!selectedDate || !selectedTime) {
    tg.showAlert("Выбери дату и время.");
    return;
  }
  const data = { date: formatDateForAPI(selectedDate), time: selectedTime };
  tg.sendData(JSON.stringify(data));
};

window.goToStep = goToStep;

// init
(async () => {
  try {
    await loadSlotsWindow();

    flatpickr("#dateInput", {
      locale: "ru",
      inline: false,
      minDate: "today",
      dateFormat: "d.m.Y",
      disable: [
        (date) => date.getDay() === 0 || date.getDay() === 6, // выходные
        (date) => {
          const dateStr = iso(date);
          // отключаем дату, если нет свободных слотов (в т.ч. если GAS уже выкинул прошедшие часы)
          return !dateHasFreeSlots(dateStr);
        }
      ],
      onChange: async (selectedDates) => {
        if (selectedDates.length > 0) {
          selectedDate = selectedDates[0];
          // обновим данные на всякий случай (кэш/сдвиг времени)
          await loadSlotsWindow();
          await loadTimeSlots();
        }
      }
    });

  } catch (e) {
    console.error(e);
    tg.showAlert("❌ Не удалось загрузить расписание.");
  }
})();

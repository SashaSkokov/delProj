const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

// === ВСТАВЬ СЮДА ===
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzIKdC0iGVD4QiqShUKjPykCk58XDfgLIOpfFagkiy5RnUVTFZEs7tYx9ssaM60HVKd/exec";
const READ_TOKEN = "4Hd2gCErhTJZwli_a3WWjPb6zlkYsxmMsxCOg5cz5uM";
// ====================

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

let dateBusy = false;
let confirmBusy = false;

let dotsTimer = null;

function iso(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function formatDateForAPI(date) { return iso(date); }

function formatDateDisplay(date) {
  const days = ["воскресенье","понедельник","вторник","среда","четверг","пятница","суббота"];
  const months = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}, ${days[date.getDay()]}`;
}

function goToStep(n) {
  document.querySelectorAll(".step").forEach((s) => s.classList.remove("active"));
  document.getElementById(`step${n}`).classList.add("active");
}
window.goToStep = goToStep;

function stopDots() {
  if (dotsTimer) clearInterval(dotsTimer);
  dotsTimer = null;
}

function startDotsText(targetEl, baseText) {
  stopDots();
  let dots = 0;
  if (targetEl) targetEl.textContent = `${baseText}...`;
  dotsTimer = setInterval(() => {
    dots = (dots + 1) % 4;
    const suffix = ".".repeat(dots) || ".";
    if (targetEl) targetEl.textContent = `${baseText}${suffix}`;
  }, 300);
}

function setDateLocked(locked) {
  const input = document.getElementById("dateInput");
  const hint = document.getElementById("dateLockHint");
  if (!input || !hint) return;

  if (locked) {
    input.setAttribute("disabled", "disabled");
    hint.style.display = "block";
    startDotsText(hint, "⏳ Загружаем слоты");
    if (fp) fp.set("clickOpens", false);
  } else {
    input.removeAttribute("disabled");
    hint.style.display = "none";
    stopDots();
    if (fp) fp.set("clickOpens", true);
  }
}

function getConfirmButton() {
  return document.querySelector('button[onclick="confirmBooking()"]');
}

function setConfirmLocked(locked) {
  const btn = getConfirmButton();
  if (!btn) return;

  if (locked) {
    btn.disabled = true;
    btn.dataset.prevText = btn.textContent;
    startDotsText(btn, "⏳ Проверяем и записываем");
  } else {
    btn.disabled = false;
    stopDots();
    btn.textContent = btn.dataset.prevText || "Подтвердить запись";
    delete btn.dataset.prevText;
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
  goToStep(2);
  document.getElementById("selectedDateDisplay").textContent = formatDateDisplay(selectedDate);
  showTimeLoading();

  const dateStr = formatDateForAPI(selectedDate);
  occupiedSlots = getOccupiedTimes(dateStr);
  renderTimeSlots();
}

async function bookSlotHTTP(dateStr, timeStr) {
  const res = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      date: dateStr,
      time: timeStr,
      initData: tg.initData, // ключевое: валидируем на сервере [web:123]
    }),
  });
  return await res.json();
}

window.confirmBooking = async function () {
  if (confirmBusy) return;
  if (!selectedDate || !selectedTime) return;

  confirmBusy = true;
  setConfirmLocked(true);

  try {
    const dateStr = formatDateForAPI(selectedDate);

    // 1) финальная запись на сервере (там LockService и проверка что слот свободен)
    const result = await bookSlotHTTP(dateStr, selectedTime);

    if (result && result.ok) {
      // успех: можно закрывать или оставить
      tg.showAlert("✅ Запись создана.");
      // tg.close();
      return;
    }

    // конфликт/ошибка: вернуть к выбору
    const err = (result && (result.error || result.message)) ? (result.error || result.message) : "Бронирование недоступно.";
    tg.showAlert(`❌ ${err}\nВыберите другое время или дату.`);

    // обновить слоты и вернуть на выбор времени
    await loadSlots14Days();
    applyDisabledDates();
    goToStep(2);
    await loadTimeSlotsForSelectedDate();
  } catch (e) {
    console.error(e);
    tg.showAlert("❌ Ошибка при записи. Попробуйте ещё раз.");
  } finally {
    setConfirmLocked(false);
    confirmBusy = false;
  }
};

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
        if (dateBusy) return;
        await loadSlots14Days();
        applyDisabledDates();
      },
      onChange: async (selectedDates) => {
        if (selectedDates.length === 0) return;
        if (dateBusy) return;

        dateBusy = true;
        setDateLocked(true);

        try {
          selectedDate = selectedDates[0];
          selectedTime = null;

          // чтобы пользователь видел мгновенную реакцию
          goToStep(2);
          document.getElementById("selectedDateDisplay").textContent = formatDateDisplay(selectedDate);
          showTimeLoading();

          await loadSlots14Days();
          applyDisabledDates();

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

          await loadTimeSlotsForSelectedDate();
        } finally {
          setDateLocked(false);
          dateBusy = false;
        }
      },
    });

    await loadSlots14Days();
    applyDisabledDates();
  } catch (e) {
    console.error(e);
    setDateLocked(false);
    tg.showAlert("❌ Не удалось загрузить расписание.");
  }
})();

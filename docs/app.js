const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

document.documentElement.style.setProperty('--tg-theme-bg-color', tg.themeParams.bg_color || '#ffffff');
document.documentElement.style.setProperty('--tg-theme-text-color', tg.themeParams.text_color || '#000000');
document.documentElement.style.setProperty('--tg-theme-button-color', tg.themeParams.button_color || '#3390ec');
document.documentElement.style.setProperty('--tg-theme-button-text-color', tg.themeParams.button_text_color || '#ffffff');

let selectedDate = null;
let selectedTime = null;
let occupiedSlots = [];

const calendar = flatpickr("#dateInput", {
    locale: "ru",
    inline: false,
    minDate: "today",
    dateFormat: "d.m.Y",
    disable: [
        function(date) {
            return (date.getDay() === 0 || date.getDay() === 6);
        }
    ],
    onChange: function(selectedDates, dateStr, instance) {
        if (selectedDates.length > 0) {
            selectedDate = selectedDates[0];
            loadTimeSlots();
        }
    }
});

async function loadTimeSlots() {
    goToStep(2);

    const dateStr = formatDateForAPI(selectedDate);
    document.getElementById('selectedDateDisplay').textContent =
        formatDateDisplay(selectedDate);

    document.getElementById('loadingSlots').style.display = 'block';
    document.getElementById('timeSlots').style.display = 'none';

    try {
        const apiUrl = `https://your-api.com/api/slots?date=${dateStr}`;

        await new Promise(resolve => setTimeout(resolve, 500));
        occupiedSlots = ['10:00', '14:00', '16:00'];

        renderTimeSlots();
    } catch (error) {
        console.error('Error loading slots:', error);
        tg.showAlert('❌ Ошибка загрузки. Попробуйте позже.');
        goToStep(1);
    }
}

function renderTimeSlots() {
    const container = document.getElementById('timeSlots');
    container.innerHTML = '';

    const times = [
        '09:00', '10:00', '11:00', '12:00',
        '13:00', '14:00', '15:00', '16:00', '17:00'
    ];

    times.forEach(time => {
        const slot = document.createElement('div');
        slot.className = 'time-slot';

        const isOccupied = occupiedSlots.includes(time);

        if (isOccupied) {
            slot.classList.add('occupied');
            slot.innerHTML = `❌<br>${time}`;
        } else {
            slot.classList.add('available');
            slot.innerHTML = `✅<br>${time}`;
            slot.onclick = () => selectTime(time);
        }

        container.appendChild(slot);
    });

    document.getElementById('loadingSlots').style.display = 'none';
    container.style.display = 'grid';
}

function selectTime(time) {
    document.querySelectorAll('.time-slot').forEach(s => {
        s.classList.remove('selected');
    });

    event.target.classList.add('selected');
    selectedTime = time;

    setTimeout(() => {
        document.getElementById('confirmDate').textContent = formatDateDisplay(selectedDate);
        document.getElementById('confirmTime').textContent = selectedTime;
        goToStep(3);
    }, 300);
}

function confirmBooking() {
    console.log("confirmBooking called", selectedDate, selectedTime);
    const data = {
        date: formatDateForAPI(selectedDate),
        time: selectedTime
    };
    console.log("sendData", data);
    tg.sendData(JSON.stringify(data));
}

function goToStep(stepNumber) {
    document.querySelectorAll('.step').forEach(step => {
        step.classList.remove('active');
    });
    document.getElementById(`step${stepNumber}`).classList.add('active');
}

function formatDateForAPI(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatDateDisplay(date) {
    const days = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
    const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
                   'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}, ${days[date.getDay()]}`;
}
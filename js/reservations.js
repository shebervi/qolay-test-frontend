/**
 * Логика страницы бронирования столов
 */

let selectedRestaurantId = null;
let selectedTableId = null;
let availableTables = [];

document.addEventListener('DOMContentLoaded', async () => {
  // Загружаем рестораны
  await loadRestaurants();

  // Устанавливаем минимальную дату (текущая дата + 15 минут)
  const datetimeInput = document.getElementById('reservation-datetime');
  const minDate = new Date(Date.now() + 15 * 60 * 1000);
  datetimeInput.min = minDate.toISOString().slice(0, 16);

  // Обработчики событий
  document.getElementById('restaurant-select').addEventListener('change', handleRestaurantChange);
  document.getElementById('reservation-datetime').addEventListener('change', handleDateTimeChange);
  document.getElementById('reservation-form').addEventListener('submit', handleSubmit);
});

/**
 * Загрузить список ресторанов
 */
async function loadRestaurants() {
  const select = document.getElementById('restaurant-select');
  
  try {
    const restaurants = await API.getRestaurants();
    
    if (!restaurants || restaurants.length === 0) {
      select.innerHTML = '<option value="">Нет доступных ресторанов</option>';
      return;
    }

    select.innerHTML = '<option value="">Выберите ресторан</option>' +
      restaurants.map(restaurant => 
        `<option value="${restaurant.id}">${Utils.escapeHtml(restaurant.name)} - ${Utils.escapeHtml(restaurant.city)}</option>`
      ).join('');
  } catch (error) {
    console.error('Failed to load restaurants:', error);
    select.innerHTML = '<option value="">Ошибка загрузки ресторанов</option>';
    showError('Не удалось загрузить список ресторанов: ' + error.message);
  }
}

/**
 * Обработать выбор ресторана
 */
async function handleRestaurantChange(event) {
  selectedRestaurantId = event.target.value;
  selectedTableId = null;

  const tablesSection = document.getElementById('tables-section');
  const submitBtn = document.getElementById('submit-btn');
  
  if (!selectedRestaurantId) {
    tablesSection.style.display = 'none';
    submitBtn.disabled = true;
    return;
  }

  // Показываем секцию столов
  tablesSection.style.display = 'block';

  // Если есть дата, загружаем столы
  const datetime = document.getElementById('reservation-datetime').value;
  if (datetime) {
    await loadTables(datetime);
  }
}

/**
 * Обработать изменение даты/времени
 */
async function handleDateTimeChange(event) {
  const datetime = event.target.value;
  
  if (!selectedRestaurantId) {
    return;
  }

  if (datetime) {
    await loadTables(datetime);
  }
}

/**
 * Загрузить доступные столы
 */
async function loadTables(datetime) {
  const tablesLoading = document.getElementById('tables-loading');
  const tablesGrid = document.getElementById('tables-grid');
  
  tablesLoading.style.display = 'block';
  tablesGrid.innerHTML = '';
  selectedTableId = null;

  try {
    availableTables = await API.getTableAvailability(selectedRestaurantId, datetime);
    
    if (!availableTables || availableTables.length === 0) {
      tablesGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #999;">Нет доступных столов</p>';
      return;
    }

    tablesGrid.innerHTML = availableTables.map(table => {
      const isAvailable = table.is_available;
      const statusText = isAvailable ? 'Доступен' : 'Занят';
      const tableClass = isAvailable ? '' : 'table-unavailable';
      
      return `
        <div class="table-item ${tableClass}" data-table-id="${table.id}" ${isAvailable ? 'onclick="selectTable(\'' + table.id + '\')"' : ''}>
          <div class="table-number">№${table.number}</div>
          <div class="table-status">${statusText}</div>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('Failed to load tables:', error);
    tablesGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #c33;">Ошибка загрузки столов</p>';
    showError('Не удалось загрузить столы: ' + error.message);
  } finally {
    tablesLoading.style.display = 'none';
  }
}

/**
 * Выбрать стол
 */
function selectTable(tableId) {
  selectedTableId = tableId;

  // Обновляем визуальное отображение
  document.querySelectorAll('.table-item').forEach(item => {
    item.classList.remove('table-selected');
    if (item.dataset.tableId === tableId) {
      item.classList.add('table-selected');
    }
  });

  // Активируем кнопку отправки
  document.getElementById('submit-btn').disabled = false;
}

/**
 * Обработать отправку формы
 */
async function handleSubmit(event) {
  event.preventDefault();

  // Проверяем авторизацию
  if (typeof Auth === 'undefined' || !Auth.isAuthenticated()) {
    // Сохраняем текущий URL для возврата после авторизации
    const returnUrl = encodeURIComponent(window.location.href);
    window.location.href = `user-login.html?redirect=${returnUrl}`;
    return;
  }

  if (!selectedTableId) {
    showError('Пожалуйста, выберите стол');
    return;
  }

  const datetime = document.getElementById('reservation-datetime').value;
  const guestsCount = parseInt(document.getElementById('guests-count').value);
  const comment = document.getElementById('comment').value;

  const submitBtn = document.getElementById('submit-btn');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Отправка...';

  try {
    // Создаем бронь
    await API.createReservation({
      tableId: selectedTableId,
      guestsCount: guestsCount,
      reservationDate: datetime,
      comment: comment || undefined,
    });

    // Показываем успех
    showSuccess('Бронь успешно создана! Ожидайте подтверждения от ресторана.');
    
    // Перенаправляем на страницу профиля через 2 секунды
    setTimeout(() => {
      window.location.href = 'profile.html';
    }, 2000);
  } catch (error) {
    console.error('Failed to create reservation:', error);
    showError('Не удалось создать бронь: ' + error.message);
    
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fas fa-check"></i> Забронировать';
  }
}

/**
 * Показать ошибку
 */
function showError(message) {
  const errorEl = document.getElementById('error-message');
  errorEl.textContent = message;
  errorEl.style.display = 'block';
  
  // Скрыть через 5 секунд
  setTimeout(() => {
    errorEl.style.display = 'none';
  }, 5000);

  // Прокрутить к сообщению
  errorEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/**
 * Показать успех
 */
function showSuccess(message) {
  const successEl = document.getElementById('success-message');
  successEl.textContent = message;
  successEl.style.display = 'block';
  
  // Скрыть сообщение об ошибке если оно было
  document.getElementById('error-message').style.display = 'none';

  // Прокрутить к сообщению
  successEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Экспорт функций для использования в HTML
window.selectTable = selectTable;

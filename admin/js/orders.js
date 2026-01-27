/**
 * Логика страницы заказов в админке
 */

let restaurants = [];
let orders = [];
let tables = [];
let currentFilterCategory = null;
let filterState = {
  tables: [],
  amountRanges: [],
  paymentStatus: [],
  paymentMethods: [],
  orderStatuses: [],
  dateFrom: null,
  dateTo: null,
};
let ordersWebSocket = null;

const ORDER_STATUSES = [
  'DRAFT',
  'PAYMENT_PENDING',
  'PAID',
  'ACCEPTED',
  'COOKING',
  'READY',
  'SERVED',
  'CLOSED',
  'CANCELED',
  'REFUNDED',
];

const STATUS_META = {
  DRAFT: { text: 'Черновик', color: '#95a5a6' },
  PAYMENT_PENDING: { text: 'Ожидает оплаты', color: '#f39c12' },
  PAID: { text: 'Оплачен', color: '#3498db' },
  ACCEPTED: { text: 'Принят', color: '#3498db' },
  COOKING: { text: 'Готовится', color: '#e67e22' },
  READY: { text: 'Готов', color: '#27ae60' },
  SERVED: { text: 'Подано', color: '#27ae60' },
  CLOSED: { text: 'Закрыт', color: '#7f8c8d' },
  CANCELED: { text: 'Отменен', color: '#e74c3c' },
  REFUNDED: { text: 'Возвращен', color: '#e74c3c' },
};

const PAYMENT_METHOD_LABELS = {
  CASH: 'Наличные',
  CARD: 'Картой банка',
  KASPI: 'Kaspi.kz',
  APPLE_PAY: 'Apple Pay',
};

const AMOUNT_RANGES = [
  { label: '0 - 10к', min: 0, max: 10000 },
  { label: '10 - 20к', min: 10000, max: 20000 },
  { label: '20 - 30к', min: 20000, max: 30000 },
  { label: '30 - 40к', min: 30000, max: 40000 },
  { label: '40 - 50к', min: 40000, max: 50000 },
  { label: '50к - 60к', min: 50000, max: 60000 },
  { label: '60к - 70к', min: 60000, max: 70000 },
  { label: '70к - 80к', min: 70000, max: 80000 },
  { label: '80к - 90к', min: 80000, max: 90000 },
  { label: '90к - 100к', min: 90000, max: 100000 },
  { label: '100к+', min: 100000, max: null },
];

let selectedDateRange = { from: null, to: null };
let currentCalendarDate = new Date();

document.addEventListener('DOMContentLoaded', async () => {
  await loadRestaurants();
  await loadTables();
  await loadOrders();
  setupFilters();
  initDatePicker();
  initKanbanDragAndDrop();
  initWebSocket();
});

/**
 * Инициализация drag-and-drop для канбан-доски
 */
function initKanbanDragAndDrop() {
  // Обработчики уже добавлены в renderOrders для каждой карточки
  // Здесь можно добавить глобальные обработчики если нужно
}

/**
 * Обработчик начала перетаскивания
 */
function handleDragStart(e) {
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/html', e.target.outerHTML);
  e.dataTransfer.setData('order-id', e.target.dataset.orderId);
  e.dataTransfer.setData('current-status', e.target.dataset.currentStatus);
  e.target.classList.add('dragging');
  
  // Добавляем визуальную обратную связь
  setTimeout(() => {
    e.target.style.display = 'none';
  }, 0);
}

/**
 * Обработчик окончания перетаскивания
 */
function handleDragEnd(e) {
  e.target.classList.remove('dragging');
  e.target.style.display = '';
  
  // Убираем класс drag-over со всех колонок
  document.querySelectorAll('.kanban-column-content').forEach(col => {
    col.classList.remove('drag-over');
  });
}

/**
 * Обработчик наведения на колонку при перетаскивании
 */
function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('drag-over');
}

/**
 * Обработчик выхода из колонки при перетаскивании
 */
function handleDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

/**
 * Обработчик сброса карточки в колонку
 */
function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  
  const columnContent = e.currentTarget;
  const newStatus = columnContent.dataset.status;
  const orderId = e.dataTransfer.getData('order-id');
  const currentStatus = e.dataTransfer.getData('current-status');
  
  columnContent.classList.remove('drag-over');
  
  if (newStatus && orderId && newStatus !== currentStatus) {
    // Обновляем статус заказа
    updateOrderStatusDirect(orderId, newStatus);
  }
  
  return false;
}

/**
 * Обновить статус заказа напрямую (без селекта)
 */
async function updateOrderStatusDirect(orderId, newStatus) {
  try {
    await AdminAPI.updateOrderStatus(orderId, newStatus);
    
    // WebSocket обновит UI автоматически, но если WebSocket не подключен, перезагружаем
    if (!ordersWebSocket || !ordersWebSocket.isSocketConnected()) {
      await loadOrders();
    }
  } catch (error) {
    console.error('Failed to update order status:', error);
    Utils.showError(error.message || 'Не удалось обновить статус заказа');
    // В случае ошибки всегда перезагружаем
    await loadOrders();
  }
}

/**
 * Загрузить список ресторанов для фильтра
 */
async function loadRestaurants() {
  try {
    const response = await AdminAPI.getRestaurants();
    restaurants = response.data?.data || response.data || [];
    
    // Если WebSocket уже подключен, обновляем подписки через updateWebSocketFilters
    // Это гарантирует единообразную логику подписки и применение фильтров
    if (ordersWebSocket && ordersWebSocket.isSocketConnected()) {
      updateWebSocketFilters();
    }
  } catch (error) {
    console.error('Failed to load restaurants:', error);
    Utils.showError('Не удалось загрузить рестораны');
  }
}

/**
 * Загрузить список столов
 */
async function loadTables() {
  try {
    // Загружаем столы для всех ресторанов
    const allTables = [];
    for (const restaurant of restaurants) {
      try {
        const response = await AdminAPI.getTables(restaurant.id);
        const restaurantTables = response.data?.data || response.data || [];
        allTables.push(...restaurantTables);
      } catch (err) {
        console.error(`Failed to load tables for restaurant ${restaurant.id}:`, err);
      }
    }
    tables = allTables;
  } catch (error) {
    console.error('Failed to load tables:', error);
  }
}

/**
 * Загрузить заказы
 */
async function loadOrders() {
  const kanbanBoard = document.getElementById('kanban-board');
  
  // Собираем фильтры из состояния
  const filters = buildFiltersFromState();

  try {
    // Показываем загрузку в первой колонке
    const firstColumn = document.querySelector('.kanban-column-content[data-status="ACCEPTED"]');
    if (firstColumn) {
      firstColumn.innerHTML = '<div class="loading">Загрузка...</div>';
    }
    
    const response = await AdminAPI.getOrders(filters);
    orders = response.data || [];

    if (orders.length === 0) {
      // Показываем пустое состояние во всех колонках
      document.querySelectorAll('.kanban-column-content').forEach(col => {
        col.innerHTML = '<div class="kanban-column-empty">Нет заказов</div>';
      });
      // Обнуляем счетчики
      document.querySelectorAll('.kanban-count').forEach(count => {
        count.textContent = '0';
      });
      return;
    }

    renderOrders(orders);
    updateFilterBadges();
  } catch (error) {
    console.error('Failed to load orders:', error);
    document.querySelectorAll('.kanban-column-content').forEach(col => {
      col.innerHTML = '<div class="empty-state">Ошибка загрузки заказов</div>';
    });
    Utils.showError('Не удалось загрузить заказы: ' + error.message);
  }
}

/**
 * Построить объект фильтров из состояния
 */
function buildFiltersFromState() {
  const filters = {};

  // Таблицы - отправляем массив для множественного выбора
  if (filterState.tables.length > 0) {
    if (filterState.tables.length === 1) {
      filters.tableNumber = filterState.tables[0];
    } else {
      filters.tableNumber = filterState.tables;
    }
  }

  // Диапазоны сумм - объединяем все диапазоны
  if (filterState.amountRanges.length > 0) {
    const minAmount = Math.min(...filterState.amountRanges.map(r => r.min));
    const maxAmount = Math.max(...filterState.amountRanges.map(r => r.max !== null ? r.max : Infinity));
    filters.minAmount = minAmount;
    if (maxAmount !== Infinity) {
      filters.maxAmount = maxAmount;
    }
  }

  // Способ оплаты - отправляем массив для множественного выбора
  if (filterState.paymentMethods.length > 0) {
    if (filterState.paymentMethods.length === 1) {
      filters.paymentMethod = filterState.paymentMethods[0];
    } else {
      filters.paymentMethod = filterState.paymentMethods;
    }
  }

  // Статус заказа - отправляем массив для множественного выбора
  if (filterState.orderStatuses.length > 0) {
    if (filterState.orderStatuses.length === 1) {
      filters.status = filterState.orderStatuses[0];
    } else {
      filters.status = filterState.orderStatuses;
    }
  }

  // Даты
  if (filterState.dateFrom) {
    filters.dateFrom = filterState.dateFrom;
  }
  if (filterState.dateTo) {
    filters.dateTo = filterState.dateTo;
  }

  return filters;
}

/**
 * Обновить бейджи фильтров
 */
function updateFilterBadges() {
  const badges = {
    table: filterState.tables.length,
    amount: filterState.amountRanges.length,
    payment: filterState.paymentStatus.length + filterState.paymentMethods.length,
    status: filterState.orderStatuses.length,
    date: (filterState.dateFrom || filterState.dateTo) ? 1 : 0,
  };

  Object.keys(badges).forEach(key => {
    const badge = document.getElementById(`${key}-badge`);
    if (badge) {
      if (badges[key] > 0) {
        badge.textContent = badges[key];
        badge.style.display = 'inline-block';
      } else {
        badge.style.display = 'none';
      }
    }
  });
}

/**
 * Настроить фильтры
 */
function setupFilters() {
  // Инициализация
}

/**
 * Переключить панель фильтров
 */
function toggleFilterPanel() {
  const panel = document.getElementById('filter-panel');
  const btn = document.getElementById('filter-toggle-btn');
  
  if (panel.style.display === 'none') {
    panel.style.display = 'block';
    btn.classList.add('active');
    if (!currentFilterCategory) {
      selectFilterCategory('table');
    }
  } else {
    panel.style.display = 'none';
    btn.classList.remove('active');
  }
}

/**
 * Выбрать категорию фильтра
 */
function selectFilterCategory(category) {
  currentFilterCategory = category;
  
  // Обновляем активную категорию
  document.querySelectorAll('.filter-category').forEach(el => {
    el.classList.remove('active');
  });
  document.querySelector(`[data-category="${category}"]`).classList.add('active');
  
  // Показываем опции для выбранной категории
  renderFilterOptions(category);
}

/**
 * Отобразить опции фильтра
 */
function renderFilterOptions(category) {
  const container = document.getElementById('filter-options');
  
  switch (category) {
    case 'table':
      renderTableOptions(container);
      break;
    case 'amount':
      renderAmountOptions(container);
      break;
    case 'payment':
      renderPaymentOptions(container);
      break;
    case 'status':
      renderStatusOptions(container);
      break;
    case 'date':
      renderDateOptions(container);
      break;
  }
}

/**
 * Опции для фильтра по столам
 */
function renderTableOptions(container) {
  const uniqueTables = [...new Set(tables.map(t => t.number))].sort((a, b) => a - b);
  
  container.innerHTML = uniqueTables.map(tableNum => {
    const checked = filterState.tables.includes(tableNum) ? 'checked' : '';
    return `
      <label class="filter-checkbox">
        <input type="checkbox" value="${tableNum}" ${checked} onchange="toggleTableFilter(${tableNum})">
        <span>Стол №${tableNum}</span>
      </label>
    `;
  }).join('');
}

/**
 * Опции для фильтра по сумме
 */
function renderAmountOptions(container) {
  container.innerHTML = AMOUNT_RANGES.map(range => {
    const isSelected = filterState.amountRanges.some(r => r.min === range.min && r.max === range.max);
    const checked = isSelected ? 'checked' : '';
    return `
      <label class="filter-checkbox">
        <input type="checkbox" value="${range.min}-${range.max || 'inf'}" ${checked} onchange="toggleAmountFilter(${range.min}, ${range.max || null})">
        <span>${range.label}</span>
      </label>
    `;
  }).join('');
}

/**
 * Опции для фильтра по оплате
 */
function renderPaymentOptions(container) {
  container.innerHTML = `
    <div style="margin-bottom: 16px;">
      <h4 style="margin-bottom: 8px; font-size: 14px; font-weight: 600;">Статус</h4>
      <label class="filter-checkbox">
        <input type="checkbox" onchange="togglePaymentStatus('paid')">
        <span>Оплачено</span>
      </label>
      <label class="filter-checkbox">
        <input type="checkbox" onchange="togglePaymentStatus('unpaid')">
        <span>Неоплачено</span>
      </label>
    </div>
    <div>
      <h4 style="margin-bottom: 8px; font-size: 14px; font-weight: 600;">Вид оплаты</h4>
      <label class="filter-checkbox">
        <input type="checkbox" value="KASPI" onchange="togglePaymentMethod('KASPI')">
        <span>Kaspi QR</span>
      </label>
      <label class="filter-checkbox">
        <input type="checkbox" value="CARD" onchange="togglePaymentMethod('CARD')">
        <span>Карта</span>
      </label>
      <label class="filter-checkbox">
        <input type="checkbox" value="CASH" onchange="togglePaymentMethod('CASH')">
        <span>Наличные</span>
      </label>
    </div>
  `;
}

/**
 * Опции для фильтра по статусу
 */
function renderStatusOptions(container) {
  container.innerHTML = Object.entries(STATUS_META).map(([status, meta]) => {
    const checked = filterState.orderStatuses.includes(status) ? 'checked' : '';
    return `
      <label class="filter-checkbox">
        <input type="checkbox" value="${status}" ${checked} onchange="toggleOrderStatus('${status}')">
        <span>${meta.text}</span>
      </label>
    `;
  }).join('');
}

/**
 * Опции для фильтра по дате
 */
function renderDateOptions(container) {
  container.innerHTML = `
    <div>
      <p style="margin-bottom: 8px; font-size: 14px;">Выберите диапазон дат</p>
      <button class="btn btn-secondary" onclick="toggleDatePicker()" style="width: 100%;">
        Выбрать даты
      </button>
    </div>
  `;
}

/**
 * Переключить фильтр стола
 */
function toggleTableFilter(tableNum) {
  const index = filterState.tables.indexOf(tableNum);
  if (index > -1) {
    filterState.tables.splice(index, 1);
  } else {
    filterState.tables.push(tableNum);
  }
  updateFilterBadges();
  updateWebSocketFilters(); // Обновляем фильтры WebSocket
  loadOrders();
}

/**
 * Переключить фильтр суммы
 */
function toggleAmountFilter(min, max) {
  const range = { min, max };
  const index = filterState.amountRanges.findIndex(r => r.min === min && r.max === max);
  if (index > -1) {
    filterState.amountRanges.splice(index, 1);
  } else {
    filterState.amountRanges.push(range);
  }
  updateFilterBadges();
  updateWebSocketFilters(); // Обновляем фильтры WebSocket
  loadOrders();
}

/**
 * Переключить статус оплаты
 */
function togglePaymentStatus(status) {
  const index = filterState.paymentStatus.indexOf(status);
  if (index > -1) {
    filterState.paymentStatus.splice(index, 1);
  } else {
    filterState.paymentStatus.push(status);
  }
  updateFilterBadges();
  loadOrders();
}

/**
 * Переключить способ оплаты
 */
function togglePaymentMethod(method) {
  const index = filterState.paymentMethods.indexOf(method);
  if (index > -1) {
    filterState.paymentMethods.splice(index, 1);
  } else {
    filterState.paymentMethods.push(method);
  }
  updateFilterBadges();
  loadOrders();
}

/**
 * Переключить статус заказа
 */
function toggleOrderStatus(status) {
  const index = filterState.orderStatuses.indexOf(status);
  if (index > -1) {
    filterState.orderStatuses.splice(index, 1);
  } else {
    filterState.orderStatuses.push(status);
  }
  updateFilterBadges();
  updateWebSocketFilters(); // Обновляем фильтры WebSocket
  loadOrders();
}

/**
 * Очистить все фильтры
 */
function clearAllFilters() {
  filterState = {
    tables: [],
    amountRanges: [],
    paymentStatus: [],
    paymentMethods: [],
    orderStatuses: [],
    dateFrom: null,
    dateTo: null,
  };
  selectedDateRange = { from: null, to: null };
  updateDateRangeInput();
  updateFilterBadges();
  updateWebSocketFilters(); // Обновляем фильтры WebSocket
  renderFilterOptions(currentFilterCategory);
  loadOrders();
}

/**
 * Инициализация календаря
 */
function initDatePicker() {
  updateCalendar();
  updateDateRangeInput();
}

/**
 * Переключить календарь
 */
function toggleDatePicker() {
  const modal = document.getElementById('date-picker-modal');
  if (modal.style.display === 'none') {
    modal.style.display = 'flex';
    updateCalendar();
  } else {
    modal.style.display = 'none';
  }
}

/**
 * Обновить календарь
 */
function updateCalendar() {
  const grid = document.getElementById('calendar-grid');
  const year = currentCalendarDate.getFullYear();
  const month = currentCalendarDate.getMonth();
  
  // Обновляем селекторы
  const monthSelect = document.getElementById('month-select');
  const yearSelect = document.getElementById('year-select');
  
  if (monthSelect) {
    monthSelect.innerHTML = '';
    const months = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
    months.forEach((m, i) => {
      const option = document.createElement('option');
      option.value = i;
      option.textContent = m;
      if (i === month) option.selected = true;
      monthSelect.appendChild(option);
    });
  }
  
  if (yearSelect) {
    yearSelect.innerHTML = '';
    for (let y = year - 5; y <= year + 5; y++) {
      const option = document.createElement('option');
      option.value = y;
      option.textContent = y;
      if (y === year) option.selected = true;
      yearSelect.appendChild(option);
    }
  }
  
  // Генерируем календарь
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay();
  const adjustedStartingDay = startingDayOfWeek === 0 ? 6 : startingDayOfWeek - 1;
  
  const daysOfWeek = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  
  let html = '<div class="calendar-weekdays">';
  daysOfWeek.forEach(day => {
    html += `<div class="calendar-weekday">${day}</div>`;
  });
  html += '</div><div class="calendar-days">';
  
  // Пустые ячейки в начале
  for (let i = 0; i < adjustedStartingDay; i++) {
    html += '<div class="calendar-day empty"></div>';
  }
  
  // Дни месяца
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const dateStr = formatDateForAPI(date);
    const isInRange = isDateInRange(date);
    const isStart = selectedDateRange.from && formatDateForAPI(selectedDateRange.from) === dateStr;
    const isEnd = selectedDateRange.to && formatDateForAPI(selectedDateRange.to) === dateStr;
    
    let className = 'calendar-day';
    if (isStart) className += ' start';
    if (isEnd) className += ' end';
    if (isInRange && !isStart && !isEnd) className += ' in-range';
    
    html += `<div class="${className}" onclick="selectDate(${year}, ${month}, ${day})">${day}</div>`;
  }
  
  html += '</div>';
  grid.innerHTML = html;
}

/**
 * Изменить месяц
 */
function changeMonth(delta) {
  currentCalendarDate.setMonth(currentCalendarDate.getMonth() + delta);
  updateCalendar();
}

/**
 * Выбрать дату
 */
function selectDate(year, month, day) {
  const date = new Date(year, month, day);
  
  if (!selectedDateRange.from || (selectedDateRange.from && selectedDateRange.to)) {
    selectedDateRange.from = date;
    selectedDateRange.to = null;
  } else if (date < selectedDateRange.from) {
    selectedDateRange.to = selectedDateRange.from;
    selectedDateRange.from = date;
  } else {
    selectedDateRange.to = date;
  }
  
  updateCalendar();
}

/**
 * Проверить, находится ли дата в диапазоне
 */
function isDateInRange(date) {
  if (!selectedDateRange.from) return false;
  if (!selectedDateRange.to) return selectedDateRange.from.getTime() === date.getTime();
  return date >= selectedDateRange.from && date <= selectedDateRange.to;
}

/**
 * Применить диапазон дат
 */
function applyDateRange() {
  if (selectedDateRange.from) {
    filterState.dateFrom = formatDateForAPI(selectedDateRange.from);
  }
  if (selectedDateRange.to) {
    filterState.dateTo = formatDateForAPI(selectedDateRange.to);
  }
  updateDateRangeInput();
  updateFilterBadges();
  toggleDatePicker();
  loadOrders();
}

/**
 * Закрыть календарь
 */
function closeDatePicker() {
  document.getElementById('date-picker-modal').style.display = 'none';
}

/**
 * Обновить поле ввода даты
 */
function updateDateRangeInput() {
  const input = document.getElementById('date-range-input');
  if (selectedDateRange.from && selectedDateRange.to) {
    input.value = `${formatDateForDisplay(selectedDateRange.from)} - ${formatDateForDisplay(selectedDateRange.to)}`;
  } else if (selectedDateRange.from) {
    input.value = formatDateForDisplay(selectedDateRange.from);
  } else {
    input.value = '';
  }
}

/**
 * Форматировать дату для API
 */
function formatDateForAPI(date) {
  return date.toISOString().split('T')[0];
}

/**
 * Форматировать дату для отображения
 */
function formatDateForDisplay(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

/**
 * Отобразить заказы в канбан-формате
 */
function renderOrders(ordersList) {
  // Группируем заказы по статусам
  const ordersByStatus = {
    ACCEPTED: [],
    COOKING: [],
    READY: [],
    CANCELED: []
  };

  ordersList.forEach(order => {
    const status = order.status;
    
    // Маппинг статусов на колонки канбан-доски
    if (status === 'ACCEPTED' || status === 'PAYMENT_PENDING' || status === 'PAID' || status === 'DRAFT') {
      // Новые заказы (принятые, ожидающие оплаты, оплаченные, черновики)
      ordersByStatus.ACCEPTED.push(order);
    } else if (status === 'COOKING') {
      ordersByStatus.COOKING.push(order);
    } else if (status === 'READY' || status === 'SERVED') {
      // Готовые и поданные заказы
      ordersByStatus.READY.push(order);
    } else if (status === 'CANCELED' || status === 'REFUNDED') {
      // Отмененные и возвращенные заказы
      ordersByStatus.CANCELED.push(order);
    } else if (status === 'CLOSED') {
      // Закрытые заказы можно показывать в готовых или скрывать
      // Показываем в готовых
      ordersByStatus.READY.push(order);
    } else {
      // Для неизвестных статусов добавляем в ACCEPTED
      ordersByStatus.ACCEPTED.push(order);
    }
  });

  // Отрисовываем каждую колонку
  Object.keys(ordersByStatus).forEach(status => {
    const columnContent = document.querySelector(`.kanban-column-content[data-status="${status}"]`);
    const countElement = document.getElementById(`count-${status}`);
    
    if (columnContent && countElement) {
      let statusOrders = ordersByStatus[status];
      
      // Сортируем заказы по времени создания (новые сверху)
      statusOrders = statusOrders.sort((a, b) => {
        const dateA = new Date(a.created_at);
        const dateB = new Date(b.created_at);
        return dateB - dateA; // Новые сверху
      });
      
      countElement.textContent = statusOrders.length;

      if (statusOrders.length === 0) {
        columnContent.innerHTML = '<div class="kanban-column-empty">Нет заказов</div>';
      } else {
        columnContent.innerHTML = statusOrders.map(order => renderKanbanCard(order)).join('');
      }

      // Добавляем обработчики drag-and-drop для карточек
      columnContent.querySelectorAll('.kanban-card').forEach(card => {
        card.draggable = true;
        card.addEventListener('dragstart', handleDragStart);
        card.addEventListener('dragend', handleDragEnd);
      });
    }
  });
}

/**
 * Отрисовать карточку заказа для канбан-доски
 */
function renderKanbanCard(order) {
    const total = parseFloat(order.total_kzt || 0);
  const createdAt = new Date(order.created_at);
  const timeStr = createdAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const dateStr = createdAt.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' });
  const waiterName = order.waiter?.account?.name || order.waiter?.account?.username || order.waiter?.account?.phone || 'Не назначен';
  
  // Получаем первые несколько товаров
  const items = order.items || [];
  const displayItems = items.slice(0, 2);
  const hasMoreItems = items.length > 2;

  const itemsHtml = displayItems.map(item => {
    const itemName = item.snapshot_name_ru || item.snapshot_name_kk || item.snapshot_name_en || 'Товар';
    const qty = item.qty || 1;
    return `<div class="kanban-card-item">${qty}× ${Utils.escapeHtml(itemName)}</div>`;
  }).join('');

    return `
    <div class="kanban-card" draggable="true" data-order-id="${order.id}" data-current-status="${order.status}">
      <div class="kanban-card-header">
        <div class="kanban-card-title">Стол № ${order.table?.number || order.snapshot_table_number || 'N/A'}</div>
        <div class="kanban-card-icon"><i class="fas fa-shopping-cart"></i></div>
        </div>
      <div class="kanban-card-info">
        <div class="kanban-card-time">${dateStr} ${timeStr}</div>
        <div class="kanban-card-info-item">
          <strong>Гость:</strong> ${Utils.escapeHtml(order.guest_name || 'Не указано')}
        </div>
        <div class="kanban-card-info-item">
          <strong>Официант:</strong> ${Utils.escapeHtml(waiterName)}
        </div>
        <div class="kanban-card-info-item">
          <strong>Оплата:</strong> ${getPaymentMethodLabel(order.payment_method)}
        </div>
      </div>
      ${items.length > 0 ? `
        <div class="kanban-card-items">
          <div style="font-weight: 600; margin-bottom: 8px; font-size: 12px; color: var(--admin-text-secondary);">
            Заказ (${items.length})
          </div>
          ${itemsHtml}
          ${hasMoreItems ? `
            <button class="kanban-card-action-btn view-all" onclick="showOrderDetails('${order.id}')">
              Смотреть все
            </button>
          ` : ''}
        </div>
      ` : ''}
      <div class="kanban-card-footer">
        <div class="kanban-card-price">${Utils.formatPrice(total)} ₸</div>
        <button class="kanban-card-action-btn" onclick="showOrderDetails('${order.id}')" title="Подробнее">
          Подробнее
            </button>
        </div>
      </div>
    `;
}

/**
 * Показать детали заказа
 */
async function showOrderDetails(orderId) {
  const modal = document.getElementById('order-modal');
  const details = document.getElementById('order-details');

  try {
    modal.style.display = 'flex';
    details.innerHTML = '<div class="loading">Загрузка...</div>';

    const response = await AdminAPI.getOrder(orderId);
    const order = response.data;

    const statusMeta = getStatusMeta(order.status);
    const total = parseFloat(order.total_kzt || 0);
    const subtotal = parseFloat(order.subtotal_kzt || 0);
    const tips = parseFloat(order.tips_kzt || 0);
    const discount = parseFloat(order.discount_kzt || 0);
    const createdAt = new Date(order.created_at).toLocaleString('ru-RU');
    const updatedAt = new Date(order.updated_at).toLocaleString('ru-RU');
    const selectId = `status-detail-${order.id}`;

    const itemsHtml = order.items?.map((item, index) => {
      const itemName = item.snapshot_name_ru || item.snapshot_name_kk || item.snapshot_name_en || 'Товар';
      const variantName = item.snapshot_variant_name_ru || item.snapshot_variant_name_kk || item.snapshot_variant_name_en;
      const variantLabel = variantName || '';
      const unitPrice = parseFloat(item.unit_price_kzt || 0);
      const qty = item.qty || 1;
      const lineTotal = parseFloat(item.line_total_kzt || 0);
      const itemId = item.id || `item-${index}`;
      const readinessStatus = item.readiness_status || 'COOKING';
      const isReady = readinessStatus === 'READY';

      let modifiersHtml = '';
      if (item.modifiers && item.modifiers.length > 0) {
        const modifiersCount = item.modifiers.length;
        modifiersHtml = `
          <div class="order-item-modifiers-new">
            +${modifiersCount} ${modifiersCount === 1 ? 'порция' : 'порции'}
          </div>
        `;
      }

      return `
        <div class="order-item-row-new" data-item-id="${itemId}">
          <div class="order-item-content">
            <div class="order-item-main">
              <span class="order-item-qty">${qty}×</span>
              <span class="order-item-name-new">${Utils.escapeHtml(itemName)}</span>
            </div>
            ${variantLabel ? `<div class="order-item-modifiers-new">Вариант: ${Utils.escapeHtml(variantLabel)}</div>` : ''}
            ${modifiersHtml}
            </div>
          <div class="order-item-right">
            <span class="order-item-price-new">${Utils.formatPrice(lineTotal)} ₸</span>
            <label class="toggle-switch">
              <input type="checkbox" ${isReady ? 'checked' : ''} onchange="toggleOrderItem('${order.id}', '${itemId}', this.checked)" data-item-id="${itemId}">
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
      `;
    }).join('') || '<p>Товары не найдены</p>';

    const items = order.items || [];
    const createdAtDate = new Date(order.created_at);
    const dateStr = createdAtDate.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' });
    const timeStr = createdAtDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const waiterName = order.waiter?.account?.name || order.waiter?.account?.username || order.waiter?.account?.phone || 'Не назначен';

    details.innerHTML = `
      <div class="order-details-new" data-order-id="${order.id}">
        <div class="order-details-header">
          <div class="order-details-header-left">
            <h3 class="order-details-title">Детали заказа</h3>
            <div class="order-table-info">Стол № ${order.table?.number || order.snapshot_table_number || 'N/A'}</div>
            <div class="order-date-time">${dateStr} ${timeStr}</div>
            <div class="order-date-time">Официант: ${Utils.escapeHtml(waiterName)}</div>
            </div>
          <div class="order-details-header-right">
            <span class="order-status-badge-new" id="order-status-badge-${order.id}" style="background: ${statusMeta.color};">
              ${statusMeta.text}
            </span>
            <div class="order-payment-icon"><i class="fas fa-shopping-cart"></i></div>
          </div>
        </div>

        <div class="order-items-section">
          <div class="order-items-title">Заказ (${items.length})</div>
          <div class="order-items-list">
            ${itemsHtml}
          </div>
        </div>

        <div class="order-summary-section-new">
          <div class="order-summary-title">Сумма</div>
          <div class="order-summary-content">
            <div class="order-summary-line">
              <span>Итого</span>
              <span>${Utils.formatPrice(subtotal)} ₸</span>
            </div>
            ${tips > 0 ? `
              <div class="order-summary-line">
                <span>Обслуживание ${Math.round((tips / subtotal) * 100)}%</span>
                <span>${Utils.formatPrice(tips)} ₸</span>
              </div>
            ` : ''}
            ${discount > 0 ? `
              <div class="order-summary-line">
                <span>Скидка</span>
                <span>-${Utils.formatPrice(discount)} ₸</span>
              </div>
            ` : ''}
            <div class="order-summary-total-new">
              <span>Итого к оплате</span>
              <span>${Utils.formatPrice(total)} ₸</span>
            </div>
          </div>
        </div>

        <div class="order-details-actions">
          <button class="btn btn-secondary" onclick="closeOrderModal()">Закрыть</button>
          <div style="display: flex; gap: 12px; align-items: center;">
            ${renderStatusSelect(selectId, order.status)}
            <button class="btn btn-primary" onclick="updateOrderStatusFromModal('${order.id}', '${selectId}')">Сохранить</button>
          </div>
        </div>
      </div>
    `;
  } catch (error) {
    console.error('Failed to load order details:', error);
    details.innerHTML = '<div class="error-message">Не удалось загрузить детали заказа: ' + error.message + '</div>';
  }
}


// Закрытие модального окна при клике вне его
document.addEventListener('click', (e) => {
  const modal = document.getElementById('order-modal');
  if (e.target === modal) {
    closeOrderModal();
  }
  
  const dateModal = document.getElementById('date-picker-modal');
  if (e.target === dateModal) {
    closeDatePicker();
  }
});

function getStatusMeta(status) {
  return STATUS_META[status] || { text: status, color: '#95a5a6' };
}

function renderStatusSelect(id, currentStatus) {
  const options = ORDER_STATUSES.map((status) => {
    const meta = getStatusMeta(status);
    const selected = status === currentStatus ? 'selected' : '';
    return `<option value="${status}" ${selected}>${meta.text}</option>`;
  }).join('');

  return `
    <select id="${id}" class="input" style="min-width: 200px; padding: 10px 12px; font-size: 14px;" data-current-status="${currentStatus}">
      ${options}
    </select>
  `;
}

async function updateOrderStatus(orderId, selectId, options = {}) {
  const select = document.getElementById(selectId);
  if (!select) {
    Utils.showError('Не удалось найти селектор статуса');
    return;
  }

  const status = select.value;

  try {
    await AdminAPI.updateOrderStatus(orderId, status);
    Utils.showSuccess('Статус обновлен');
    
    // WebSocket обновит UI автоматически
    if (!ordersWebSocket || !ordersWebSocket.isSocketConnected()) {
      await loadOrders();
    }

    if (options.refreshModal) {
      await showOrderDetails(orderId);
    }
  } catch (error) {
    console.error('Failed to update order status:', error);
    Utils.showError('Не удалось обновить статус: ' + error.message);
    // В случае ошибки перезагружаем
    await loadOrders();
  }
}

function getPaymentMethodLabel(method) {
  return PAYMENT_METHOD_LABELS[method] || method || 'Не указано';
}

/**
 * Закрыть модальное окно деталей заказа
 */
function closeOrderModal() {
  const modal = document.getElementById('order-modal');
  if (modal) {
    modal.style.display = 'none';
  }
}

/**
 * Отметить заказ как оплаченный
 */
async function markOrderAsPaid(orderId) {
  try {
    await AdminAPI.updateOrderStatus(orderId, 'PAID');
    Utils.showSuccess('Заказ отмечен как оплаченный');
    closeOrderModal();
    
    // WebSocket обновит UI автоматически
    if (!ordersWebSocket || !ordersWebSocket.isSocketConnected()) {
      await loadOrders();
    }
  } catch (error) {
    console.error('Failed to mark order as paid:', error);
    Utils.showError(error.message || 'Не удалось обновить статус заказа');
    await loadOrders();
  }
}

/**
 * Обновить статус заказа из модального окна
 */
async function updateOrderStatusFromModal(orderId, selectId) {
  const select = document.getElementById(selectId);
  if (!select) {
    Utils.showError('Не удалось найти селектор статуса');
    return;
  }

  const newStatus = select.value;
  const currentStatus = select.dataset.currentStatus || '';

  if (newStatus === currentStatus) {
    Utils.showError('Статус не изменился');
    return;
  }

  try {
    // Обновляем визуально статус сразу для лучшего UX
    const statusBadge = document.getElementById(`order-status-badge-${orderId}`);
    if (statusBadge) {
      const newStatusMeta = getStatusMeta(newStatus);
      statusBadge.textContent = newStatusMeta.text;
      statusBadge.style.background = newStatusMeta.color;
    }

    await AdminAPI.updateOrderStatus(orderId, newStatus);
    
    // Обновляем текущий статус в select
    select.dataset.currentStatus = newStatus;
    
    // WebSocket обновит UI автоматически, но если WebSocket не подключен, перезагружаем
    if (!ordersWebSocket || !ordersWebSocket.isSocketConnected()) {
      await loadOrders();
    }
  } catch (error) {
    console.error('Failed to update order status:', error);
    Utils.showError('Не удалось обновить статус: ' + (error.message || 'Неизвестная ошибка'));
    
    // Восстанавливаем предыдущий статус в случае ошибки
    const statusBadge = document.getElementById(`order-status-badge-${orderId}`);
    if (statusBadge) {
      const oldStatusMeta = getStatusMeta(currentStatus);
      statusBadge.textContent = oldStatusMeta.text;
      statusBadge.style.background = oldStatusMeta.color;
    }
    select.value = currentStatus;
  }
}

/**
 * Переключить состояние товара в заказе
 */
async function toggleOrderItem(orderId, itemId, isChecked) {
  try {
    const readinessStatus = isChecked ? 'READY' : 'COOKING';
    
    await AdminAPI.updateItemReadinessStatus(orderId, itemId, readinessStatus);
    
    const statusText = isChecked ? 'Готово' : 'Готовится';
    console.log(`Статус готовности блюда ${itemId} в заказе ${orderId} изменен на: ${statusText}`);
    
    const itemRow = document.querySelector(`[data-item-id="${itemId}"]`);
    if (itemRow) {
      const checkbox = itemRow.querySelector('input[type="checkbox"]');
      if (checkbox) {
        checkbox.checked = isChecked;
      }
    }
  } catch (error) {
    console.error('Ошибка при обновлении статуса готовности блюда:', error);
    alert('Не удалось обновить статус готовности блюда. Попробуйте еще раз.');
    
    const itemRow = document.querySelector(`[data-item-id="${itemId}"]`);
    if (itemRow) {
      const checkbox = itemRow.querySelector('input[type="checkbox"]');
      if (checkbox) {
        checkbox.checked = !isChecked;
      }
    }
  }
}

// Кэш текущих фильтров для предотвращения лишних переподписок
let currentWebSocketFilters = null;

/**
 * Обновить фильтры WebSocket подписки
 */
function updateWebSocketFilters() {
  if (!ordersWebSocket || !ordersWebSocket.isSocketConnected()) {
    return;
  }

  // Не подписываемся, если ресторанов еще нет
  if (!restaurants || restaurants.length === 0) {
    return;
  }

  // Собираем фильтры для подписки
  const filters = {
    statuses: filterState.orderStatuses.length > 0 ? filterState.orderStatuses : undefined,
    tableNumbers: filterState.tables.length > 0 ? filterState.tables : undefined,
  };

  // Если есть фильтры по сумме, добавляем их
  if (filterState.amountRanges.length > 0) {
    const minAmount = Math.min(...filterState.amountRanges.map(r => r.min));
    const maxAmount = Math.max(...filterState.amountRanges.map(r => r.max !== null ? r.max : Infinity));
    if (minAmount > 0) filters.minAmount = minAmount;
    if (maxAmount !== Infinity) filters.maxAmount = maxAmount;
  }

  // Проверяем, изменились ли фильтры
  const filtersChanged = JSON.stringify(currentWebSocketFilters) !== JSON.stringify(filters);
  if (!filtersChanged && currentWebSocketFilters !== null) {
    // Фильтры не изменились, не нужно переподписываться
    return;
  }

  // Сохраняем текущие фильтры
  currentWebSocketFilters = filters;

  // Обновляем подписки для всех ресторанов
  restaurants.forEach(restaurant => {
    const hasFilters = filters.statuses || filters.tableNumbers || filters.minAmount !== undefined || filters.maxAmount !== undefined;
    ordersWebSocket.subscribeToRestaurant(restaurant.id, hasFilters ? filters : null);
  });
}

/**
 * Инициализация WebSocket для live-обновлений заказов
 */
function initWebSocket() {
  // Проверяем, что OrdersWebSocket доступен
  if (typeof OrdersWebSocket === 'undefined') {
    console.warn('OrdersWebSocket not loaded, skipping WebSocket initialization');
    return;
  }

  const serverUrl = CONFIG?.API_BASE_URL || window.location.origin;
  
  // Подписываемся на все рестораны из списка
  const restaurantIds = restaurants.map(r => r.id);
  
  if (restaurantIds.length === 0) {
    console.warn('No restaurants available for WebSocket subscription, will subscribe after restaurants are loaded');
  }

  ordersWebSocket = new OrdersWebSocket(serverUrl, {
    onConnect: () => {
      console.log('WebSocket connected for orders');
      
      // Подписываемся на все рестораны с текущими фильтрами
      // updateWebSocketFilters() сама подписывается на все рестораны в цикле
      if (ordersWebSocket && ordersWebSocket.isSocketConnected()) {
        updateWebSocketFilters();
      }
    },
    onDisconnect: (reason) => {
      console.log('WebSocket disconnected:', reason);
    },
    onOrderCreated: async (data) => {
      console.log('New order created:', data);
      
      // Формируем объект заказа для проверки фильтров
      const orderData = {
        id: data.order_id,
        status: data.status,
        restaurant_id: data.restaurant_id,
        snapshot_table_number: data.snapshot_table_number,
        total_kzt: data.total_kzt,
        created_at: data.created_at,
      };
      
      // Если заказ соответствует текущим фильтрам, добавляем его
      if (shouldShowOrder(orderData)) {
        // Загружаем полную информацию о заказе
        try {
          const response = await AdminAPI.getOrder(data.order_id);
          const fullOrder = response.data;
          
          // Добавляем заказ в начало списка (новые сверху)
          orders.unshift(fullOrder);
          
          // Обновляем UI
          renderOrders(orders);
          Utils.showSuccess(`Новый заказ #${data.order_number} со стола ${data.snapshot_table_number || 'N/A'}`);
        } catch (error) {
          console.error('Failed to load new order details:', error);
          // Если не удалось загрузить детали, просто обновляем список
          await loadOrders();
        }
      }
    },
    onOrderStatusChanged: async (data) => {
      console.log('Order status changed:', data);
      
      // Находим заказ в текущем списке
      const orderIndex = orders.findIndex(o => o.id === data.order_id);
      
      if (orderIndex !== -1) {
        // Обновляем статус заказа
        orders[orderIndex].status = data.new_status;
        orders[orderIndex].updated_at = data.updated_at;
        
        // Обновляем UI без полной перезагрузки
        renderOrders(orders);
        
        // Если модальное окно открыто для этого заказа, обновляем его
        const modal = document.getElementById('order-modal');
        if (modal && modal.style.display !== 'none') {
          const orderDetails = document.getElementById('order-details');
          const orderIdInModal = orderDetails?.querySelector('[data-order-id]')?.dataset?.orderId;
          if (orderIdInModal === data.order_id) {
            await showOrderDetails(data.order_id);
          }
        }
      } else {
        // Заказ не найден в списке, возможно он был отфильтрован
        // Перезагружаем список если заказ соответствует фильтрам
        const orderData = {
          id: data.order_id,
          status: data.new_status,
          restaurant_id: data.restaurant_id,
          snapshot_table_number: null,
          total_kzt: null,
          created_at: data.updated_at,
        };
        if (shouldShowOrder(orderData)) {
          await loadOrders();
        }
      }
    },
    onOrderUpdated: async (data) => {
      console.log('Order updated:', data);
      
      // Находим заказ и обновляем его
      const orderIndex = orders.findIndex(o => o.id === data.order_id);
      
      if (orderIndex !== -1) {
        // Загружаем обновленную информацию о заказе
        try {
          const response = await AdminAPI.getOrder(data.order_id);
          orders[orderIndex] = response.data;
          
          // Обновляем UI
          renderOrders(orders);
        } catch (error) {
          console.error('Failed to load updated order:', error);
          // Если не удалось загрузить, просто обновляем статус
          orders[orderIndex].status = data.status;
          orders[orderIndex].updated_at = data.updated_at;
          renderOrders(orders);
        }
      } else {
        // Заказ не найден, проверяем фильтры
        const orderData = {
          id: data.order_id,
          status: data.status,
          restaurant_id: data.restaurant_id,
          snapshot_table_number: null,
          total_kzt: null,
          created_at: data.updated_at,
        };
        if (shouldShowOrder(orderData)) {
          // Заказ соответствует фильтрам - перезагружаем
          await loadOrders();
        }
      }
    },
    onItemReadinessStatusChanged: async (data) => {
      console.log('Order item readiness status changed:', data);
      
      const orderIndex = orders.findIndex(o => o.id === data.order_id);
      
      if (orderIndex !== -1) {
        const order = orders[orderIndex];
        
        if (order.items && Array.isArray(order.items)) {
          const itemIndex = order.items.findIndex(item => item.id === data.order_item_id);
          
          if (itemIndex !== -1) {
            order.items[itemIndex].readiness_status = data.readiness_status;
            
            renderOrders(orders);
            
            const modal = document.getElementById('order-modal');
            if (modal && modal.style.display !== 'none') {
              const orderDetails = document.getElementById('order-details');
              const orderIdInModal = orderDetails?.querySelector('[data-order-id]')?.dataset?.orderId;
              if (orderIdInModal === data.order_id) {
                const itemRow = orderDetails.querySelector(`[data-item-id="${data.order_item_id}"]`);
                if (itemRow) {
                  const checkbox = itemRow.querySelector('input[type="checkbox"]');
                  if (checkbox) {
                    const isReady = data.readiness_status === 'READY';
                    checkbox.checked = isReady;
                    console.log(`Updated checkbox for item ${data.order_item_id} to ${isReady ? 'checked' : 'unchecked'}`);
                  }
                }
              }
            }
          }
        }
      }
    },
    onError: (error) => {
      console.error('WebSocket error:', error);
    }
  });
}

/**
 * Проверить, должен ли заказ отображаться с учетом текущих фильтров
 */
function shouldShowOrder(orderData) {
  // Если нет активных фильтров, показываем все заказы
  const hasActiveFilters = 
    filterState.tables.length > 0 ||
    filterState.amountRanges.length > 0 ||
    filterState.paymentStatus.length > 0 ||
    filterState.paymentMethods.length > 0 ||
    filterState.orderStatuses.length > 0 ||
    filterState.dateFrom ||
    filterState.dateTo;
  
  if (!hasActiveFilters) {
    return true;
  }
  
  // Проверяем фильтры
  const filters = buildFiltersFromState();
  
  // Проверка по статусу
  if (filters.status) {
    const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
    const orderStatus = orderData.status || orderData.new_status;
    if (!statuses.includes(orderStatus)) {
      return false;
    }
  }
  
  // Проверка по номеру стола
  if (filters.tableNumber) {
    const tables = Array.isArray(filters.tableNumber) ? filters.tableNumber : [filters.tableNumber];
    const tableNum = orderData.snapshot_table_number || orderData.table?.number;
    if (tableNum && !tables.includes(tableNum)) {
      return false;
    }
  }
  
  // Проверка по сумме
  if (filters.minAmount || filters.maxAmount) {
    const total = parseFloat(orderData.total_kzt || 0);
    if (filters.minAmount && total < filters.minAmount) return false;
    if (filters.maxAmount && total > filters.maxAmount) return false;
  }
  
  // Проверка по дате
  if (filters.dateFrom || filters.dateTo) {
    const orderDate = new Date(orderData.created_at || orderData.updated_at);
    if (filters.dateFrom) {
      const fromDate = new Date(filters.dateFrom);
      if (orderDate < fromDate) return false;
    }
    if (filters.dateTo) {
      const toDate = new Date(filters.dateTo);
      toDate.setHours(23, 59, 59, 999);
      if (orderDate > toDate) return false;
    }
  }
  
  return true;
}

// Очистка WebSocket при закрытии страницы
window.addEventListener('beforeunload', () => {
  if (ordersWebSocket) {
    ordersWebSocket.disconnect();
  }
});

// Экспорт функций для использования в HTML
window.handleDragStart = handleDragStart;
window.handleDragEnd = handleDragEnd;
window.handleDragOver = handleDragOver;
window.handleDragLeave = handleDragLeave;
window.handleDrop = handleDrop;
window.updateOrderStatusDirect = updateOrderStatusDirect;
window.closeOrderModal = closeOrderModal;
window.markOrderAsPaid = markOrderAsPaid;
window.toggleOrderItem = toggleOrderItem;
window.updateOrderStatusFromModal = updateOrderStatusFromModal;

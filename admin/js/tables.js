/**
 * Логика страницы столов
 */

let currentTableId = null;
let currentQRTableId = null;
let currentQRImageUrl = null; // Для хранения blob URL QR-кода
let currentQRTokenHash = null; // Для хранения QR токена стола
let restaurants = [];
let currentUser = null;
let currentView = 'tables'; // 'tables' или 'reservations'
let tableReservationsMap = {};

document.addEventListener('DOMContentLoaded', async () => {
  // Получаем текущего пользователя
  if (typeof Auth !== 'undefined') {
    currentUser = Auth.getAuthUser();
  }

  // Загружаем рестораны для фильтра и формы
  await loadRestaurants();
  
  // Обработка фильтра
  document.getElementById('restaurant-filter').addEventListener('change', async (e) => {
    if (currentView === 'tables') {
      await loadTables(e.target.value);
    } else if (currentView === 'reservations') {
      await loadReservations();
    }
  });

  // Обработка формы стола
  document.getElementById('table-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveTable();
  });

  // Обработка формы создания брони
  const reservationForm = document.getElementById('reservation-form');
  if (reservationForm) {
    reservationForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await saveReservation();
    });
  }

  // Скрываем кнопку добавления для WAITER
  const btnAddTable = document.querySelector('button[onclick="openTableModal()"]');
  if (btnAddTable) {
    const canCreateTable = currentUser?.role !== 'WAITER';
    btnAddTable.style.display = canCreateTable ? 'block' : 'none';
  }

  await loadTables();
});

async function loadRestaurants() {
  try {
    const response = await AdminAPI.getRestaurants();
    restaurants = response.data?.data || response.data || [];
    
    // Заполняем фильтр
    const filter = document.getElementById('restaurant-filter');
    filter.innerHTML = '<option value="">Все рестораны</option>' + 
      restaurants.map(r => `<option value="${r.id}">${r.name}</option>`).join('');

    // Заполняем форму
    const formSelect = document.getElementById('table-restaurant');
    formSelect.innerHTML = '<option value="">Выберите ресторан</option>' +
      restaurants.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
  } catch (error) {
    console.error('Failed to load restaurants:', error);
    Utils.showError('Не удалось загрузить рестораны');
  }
}

async function loadTables(restaurantId = null) {
  try {
    const response = await AdminAPI.getTables(restaurantId);
    const tables = response.data?.data || response.data || [];
    
    const container = document.getElementById('tables-list');
    
    if (tables.length === 0) {
      container.innerHTML = '<div class="empty-state">Нет столов. Добавьте первый стол.</div>';
      return;
    }

    // Загружаем брони для всех столов
    let reservationsByTable = {};
    try {
      const filters = { restaurantId: restaurantId || undefined };
      const reservationsResponse = await AdminAPI.getReservations(filters);
      const allReservations = Array.isArray(reservationsResponse) 
        ? reservationsResponse 
        : (reservationsResponse?.data || []);
      
      // Группируем все брони по table_id
      allReservations.forEach(res => {
        if (!res.table_id) return;
        if (res.status !== 'PENDING' && res.status !== 'CONFIRMED') return;
        if (!reservationsByTable[res.table_id]) {
          reservationsByTable[res.table_id] = [];
        }
        reservationsByTable[res.table_id].push(res);
      });
    } catch (error) {
      console.warn('Failed to load reservations for tables:', error);
    }
    tableReservationsMap = reservationsByTable;

    // Проверяем права доступа
    const canEditTable = currentUser?.role !== 'WAITER';
    const canDeleteTable = currentUser?.role !== 'WAITER';

    // Создаем таблицу
    const tableRows = tables.map(table => {
      const restaurant = restaurants.find(r => r.id === table.restaurant_id);
      const statusLabels = {
        'FREE': { text: 'Свободен', class: 'status-free' },
        'OCCUPIED': { text: 'Занят', class: 'status-occupied' },
        'RESERVED': { text: 'Зарезервирован', class: 'status-reserved' }
      };
      const status = statusLabels[table.status] || statusLabels['FREE'];
      
      const reservations = (reservationsByTable[table.id] || [])
        .slice()
        .sort((a, b) => new Date(a.reservation_date) - new Date(b.reservation_date));
      const reservationCount = reservations.length;
      const reservationTime = reservationCount === 1
        ? new Date(reservations[0].reservation_date).toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })
        : null;
      
      // Дата продления QR-кода (пока не реализовано, оставляем прочерк)
      const qrExtensionDate = '-';
      
      return `
        <tr data-table-id="${table.id}">
          <td><strong>Стол №${table.number}</strong></td>
          <td>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="status-badge ${status.class}">${status.text}</span>
              <button class="btn-icon-small" onclick="toggleStatusSelect('${table.id}')" title="Изменить статус">
                <i class="fas fa-sync-alt"></i>
              </button>
              <select id="status-select-${table.id}" class="status-select-inline" onchange="updateTableStatus('${table.id}', this.value)" style="display: none;">
                <option value="FREE" ${table.status === 'FREE' ? 'selected' : ''}>Свободен</option>
                <option value="OCCUPIED" ${table.status === 'OCCUPIED' ? 'selected' : ''}>Занят</option>
                <option value="RESERVED" ${table.status === 'RESERVED' ? 'selected' : ''}>Зарезервирован</option>
              </select>
            </div>
          </td>
          <td>
            ${reservationCount === 1 ? `
              <button class="btn-link" onclick="openReservationDetailsModal('${reservations[0].id}')" style="color: #856404; font-weight: 500; text-decoration: none; background: none; border: none; padding: 0; cursor: pointer;">
                <i class="fas fa-calendar-check" style="margin-right: 4px;"></i>
                ${reservationTime}
              </button>
            ` : reservationCount > 1 ? `
              <button class="btn-link" onclick="openTableReservationsModal('${table.id}', '${table.number}')" style="color: #856404; font-weight: 500; text-decoration: none; background: none; border: none; padding: 0; cursor: pointer;">
                <i class="fas fa-calendar-alt" style="margin-right: 4px;"></i>
                Броней: ${reservationCount}
              </button>
            ` : `
              <button class="btn-link" onclick="openCreateReservationModal('${table.id}', '${table.restaurant_id}')" style="color: var(--primary-color, #ff6b35); text-decoration: none; font-weight: 500; background: none; border: none; padding: 0; cursor: pointer;">
                Добавить
              </button>
            `}
          </td>
          <td>${qrExtensionDate}</td>
          <td>
            <div style="display: flex; gap: 8px; align-items: center;">
              <button class="btn-icon-small" onclick="showQR('${table.id}')" title="QR">
                <i class="fas fa-qrcode"></i>
              </button>
              ${canEditTable ? `
              <button class="btn-icon-small" onclick="editTable('${table.id}')" title="Редактировать">
                <i class="fas fa-edit"></i>
              </button>
              ` : ''}
              ${canDeleteTable ? `
              <button class="btn-icon-small" onclick="deleteTable('${table.id}')" title="Удалить">
                <i class="fas fa-trash"></i>
              </button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');

    container.innerHTML = `
      <table class="admin-table">
        <thead>
          <tr>
            <th>№ стола</th>
            <th>Статус</th>
            <th>Брони</th>
            <th>Дата продления QR-кода</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    `;
  } catch (error) {
    console.error('Failed to load tables:', error);
    Utils.showError('Не удалось загрузить столы');
  }
}

async function loadTable(id) {
  try {
    const response = await AdminAPI.getTable(id);
    const table = response.data?.data || response.data;
    
    currentTableId = id;
    document.getElementById('table-id').value = id;
    document.getElementById('table-restaurant').value = table.restaurant_id;
    document.getElementById('table-number').value = table.number;
    document.getElementById('table-modal-title').textContent = 'Редактировать стол';
  } catch (error) {
    console.error('Failed to load table:', error);
    Utils.showError('Не удалось загрузить стол');
  }
}

async function saveTable() {
  try {
    const data = {
      restaurantId: document.getElementById('table-restaurant').value,
      number: parseInt(document.getElementById('table-number').value),
    };

    if (currentTableId) {
      await AdminAPI.updateTable(currentTableId, data);
      Utils.showSuccess('Стол обновлен');
    } else {
      await AdminAPI.createTable(data);
      Utils.showSuccess('Стол создан');
    }

    closeTableModal();
    await loadTables(document.getElementById('restaurant-filter').value);
  } catch (error) {
    console.error('Failed to save table:', error);
    Utils.showError(error.message || 'Не удалось сохранить стол');
  }
}

async function deleteTable(id) {
  if (!confirm('Вы уверены, что хотите удалить этот стол?')) {
    return;
  }

  try {
    await AdminAPI.deleteTable(id);
    Utils.showSuccess('Стол удален');
    await loadTables(document.getElementById('restaurant-filter').value);
  } catch (error) {
    console.error('Failed to delete table:', error);
    Utils.showError('Не удалось удалить стол');
  }
}

async function showQR(id) {
  currentQRTableId = id;
  document.getElementById('qr-modal').classList.add('active');
  
  // Скрываем кнопку обновления QR для WAITER и KITCHEN
  const rotateQRBtn = document.querySelector('button[onclick="rotateQRToken()"]');
  if (rotateQRBtn && currentUser) {
    const canRotateQR = currentUser.role !== 'WAITER' && currentUser.role !== 'KITCHEN';
    rotateQRBtn.style.display = canRotateQR ? 'block' : 'none';
  }
  
  // Загружаем информацию о столе для получения QR токена
  try {
    const tableResponse = await AdminAPI.getTable(id);
    const table = tableResponse.data?.data || tableResponse.data;
    currentQRTokenHash = table.qr_token_hash || null;
  } catch (error) {
    console.error('Failed to load table info:', error);
    currentQRTokenHash = null;
  }
  
  // Загружаем QR код (всегда в PNG для предпросмотра)
  const preview = document.getElementById('qr-preview');
  preview.innerHTML = '<div class="loading">Загрузка QR кода...</div>';
  
  try {
    // Загружаем QR код через fetch с токеном авторизации
    const token = Auth?.getAuthToken();
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const response = await fetch(`${CONFIG.API_BASE_URL}/admin/tables/${id}/qr?format=png`, {
      headers,
    });
    
    if (response.status === 401) {
      if (typeof Auth !== 'undefined') {
        Auth.clearAuth();
        Auth.redirectToLogin();
      }
      throw new Error('Сессия истекла. Пожалуйста, войдите снова.');
    }
    
    if (!response.ok) {
      throw new Error('Не удалось загрузить QR код');
    }
    
    const blob = await response.blob();
    // Очищаем предыдущий URL, если он был
    if (currentQRImageUrl) {
      window.URL.revokeObjectURL(currentQRImageUrl);
    }
    currentQRImageUrl = window.URL.createObjectURL(blob);
    preview.innerHTML = `<img src="${currentQRImageUrl}" alt="QR код" style="max-width: 100%; height: auto;" />`;
  } catch (error) {
    console.error('Failed to load QR:', error);
    preview.innerHTML = `<div class="empty-state">${error.message || 'Не удалось загрузить QR код'}</div>`;
  }
}

async function downloadQR() {
  if (!currentQRTableId) return;
  
  try {
    const formatSelect = document.getElementById('qr-format-select');
    const format = formatSelect ? formatSelect.value : 'png';
    await AdminAPI.downloadQR(currentQRTableId, format);
    Utils.showSuccess('QR код скачан');
  } catch (error) {
    console.error('Failed to download QR:', error);
    Utils.showError('Не удалось скачать QR код');
  }
}

async function rotateQRToken() {
  if (!currentQRTableId) return;
  
  if (!confirm('Вы уверены? Старый QR код перестанет работать.')) {
    return;
  }

  try {
    await AdminAPI.rotateQRToken(currentQRTableId);
    Utils.showSuccess('QR токен обновлен');
    await showQR(currentQRTableId); // Перезагружаем QR
  } catch (error) {
    console.error('Failed to rotate QR token:', error);
    Utils.showError('Не удалось обновить QR токен');
  }
}

function openTableModal() {
  document.getElementById('table-modal').classList.add('active');
}

function closeTableModal() {
  document.getElementById('table-modal').classList.remove('active');
  currentTableId = null;
  document.getElementById('table-form').reset();
  document.getElementById('table-id').value = '';
  document.getElementById('table-modal-title').textContent = 'Добавить стол';
}

function closeQRModal() {
  document.getElementById('qr-modal').classList.remove('active');
  currentQRTableId = null;
  currentQRTokenHash = null;
  // Очищаем blob URL при закрытии модального окна
  if (currentQRImageUrl) {
    window.URL.revokeObjectURL(currentQRImageUrl);
    currentQRImageUrl = null;
  }
}

/**
 * Открыть ссылку QR-кода в новой вкладке
 */
function openQRLink() {
  if (!currentQRTokenHash) {
    Utils.showError('QR токен не найден. Попробуйте открыть QR код снова.');
    return;
  }
  
  // Формируем URL для меню стола
  // В dev режиме используем localhost, в продакшне - прод URL
  const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const frontendUrl = isDevelopment 
    ? 'http://localhost:3000' 
    : 'https://qolay-frontend.vercel.app';
  const qrUrl = `${frontendUrl}/?table=${currentQRTokenHash}`;
  
  // Открываем в новой вкладке
  window.open(qrUrl, '_blank');
}

async function editTable(id) {
  await loadTable(id);
  openTableModal();
}

function toggleStatusSelect(tableId) {
  const select = document.getElementById(`status-select-${tableId}`);
  if (select) {
    if (select.style.display === 'none') {
      select.style.display = 'inline-block';
      select.focus();
      // Скрываем при клике вне элемента
      setTimeout(() => {
        const hideSelect = (e) => {
          if (!select.contains(e.target) && e.target.closest(`#status-select-${tableId}`) !== select) {
            select.style.display = 'none';
            document.removeEventListener('click', hideSelect);
          }
        };
        document.addEventListener('click', hideSelect);
      }, 100);
    } else {
      select.style.display = 'none';
    }
  }
}

async function updateTableStatus(id, status) {
  try {
    await AdminAPI.updateTableStatus(id, status);
    Utils.showSuccess('Статус стола обновлен');
    await loadTables(document.getElementById('restaurant-filter').value);
  } catch (error) {
    console.error('Failed to update table status:', error);
    Utils.showError(error.message || 'Не удалось обновить статус стола');
    // Перезагружаем таблицы, чтобы вернуть правильный статус
    await loadTables(document.getElementById('restaurant-filter').value);
  }
}

async function downloadAllQR() {
  try {
    const restaurantId = document.getElementById('restaurant-filter')?.value || undefined;
    await AdminAPI.downloadAllQR(restaurantId);
    Utils.showSuccess('Все QR коды скачаны');
  } catch (error) {
    console.error('Failed to download all QR codes:', error);
    Utils.showError('Не удалось скачать QR коды');
  }
}

/**
 * Переключить вид (столы/брони)
 */
function switchView(view) {
  currentView = view;

  // Обновляем активную вкладку
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
    btn.style.color = '#666';
    btn.style.borderBottomColor = 'transparent';
    if (btn.dataset.view === view) {
      btn.classList.add('active');
      btn.style.color = 'var(--primary-color, #ff6b35)';
      btn.style.borderBottomColor = 'var(--primary-color, #ff6b35)';
    }
  });

  // Показываем соответствующий контейнер
  document.getElementById('tables-list').style.display = view === 'tables' ? 'block' : 'none';
  document.getElementById('reservations-list').style.display = view === 'reservations' ? 'block' : 'none';

  // Загружаем данные
  if (view === 'reservations') {
    loadReservations();
  }
}

/**
 * Загрузить брони
 */
async function loadReservations() {
  const container = document.getElementById('reservations-list');
  const restaurantId = document.getElementById('restaurant-filter')?.value || null;

  try {
    container.innerHTML = '<div class="loading">Загрузка...</div>';

    const filters = {};
    if (restaurantId) {
      filters.restaurantId = restaurantId;
    }

    console.log('Loading reservations with filters:', filters);
    const response = await AdminAPI.getReservations(filters);
    console.log('Reservations API response:', response);
    
    // Обрабатываем ответ - может быть массив или объект с data
    const reservations = Array.isArray(response) ? response : (response?.data || []);
    console.log('Processed reservations:', reservations);

    if (!reservations || reservations.length === 0) {
      container.innerHTML = '<div class="empty-state">Нет броней</div>';
      return;
    }

    // Группируем по статусу
    const grouped = {
      PENDING: reservations.filter(r => r.status === 'PENDING'),
      CONFIRMED: reservations.filter(r => r.status === 'CONFIRMED'),
      CANCELLED: reservations.filter(r => r.status === 'CANCELLED'),
      COMPLETED: reservations.filter(r => r.status === 'COMPLETED'),
    };

    const statusLabels = {
      PENDING: 'Ожидают подтверждения',
      CONFIRMED: 'Подтверждены',
      CANCELLED: 'Отменены',
      COMPLETED: 'Завершены',
    };

    let html = '';

    for (const [status, items] of Object.entries(grouped)) {
      if (items.length === 0) continue;

      html += `
        <h3 style="margin: 20px 0 12px 0; color: #333;">
          ${statusLabels[status]} (${items.length})
        </h3>
      `;

      items.forEach(reservation => {
        const restaurant = restaurants.find(r => r.id === reservation.restaurant_id);
        const restaurantName = restaurant?.name || 'Не найден';
        const tableNumber = reservation.table?.number || 'N/A';
        const guestName = Utils.escapeHtml(reservation.guest_name);
        const guestPhone = Utils.escapeHtml(reservation.guest_phone);
        const reservationDate = new Date(reservation.reservation_date).toLocaleString('ru-RU');
        const createdAt = new Date(reservation.created_at).toLocaleString('ru-RU');

        const statusClass = {
          PENDING: 'status-pending',
          CONFIRMED: 'status-confirmed',
          CANCELLED: 'status-cancelled',
          COMPLETED: 'status-completed',
        }[status] || '';

        const actions = status === 'PENDING' 
          ? `<button class="btn btn-sm btn-success" onclick="confirmReservation('${reservation.id}')">Подтвердить</button>`
          : status === 'CONFIRMED'
          ? `<button class="btn btn-sm btn-primary" onclick="completeReservation('${reservation.id}')">Завершить</button>`
          : '';

        const cancelBtn = (status === 'PENDING' || status === 'CONFIRMED')
          ? `<button class="btn btn-sm btn-danger" onclick="cancelReservationAdmin('${reservation.id}')">Отменить</button>`
          : '';

        html += `
          <div class="list-item">
            <div class="list-item-info">
              <h4>Бронь стола №${tableNumber}</h4>
              <p><strong>Ресторан:</strong> ${restaurantName}</p>
              <p><strong>Гость:</strong> ${guestName} (${guestPhone})</p>
              <p><strong>Дата брони:</strong> ${reservationDate}</p>
              <p><strong>Гостей:</strong> ${reservation.guests_count}</p>
              ${reservation.comment ? `<p><strong>Комментарий:</strong> ${Utils.escapeHtml(reservation.comment)}</p>` : ''}
              <p style="font-size: 12px; color: #999;">Создано: ${createdAt}</p>
            </div>
            <div class="list-item-actions">
              <span class="status-badge ${statusClass}">${statusLabels[status]}</span>
              ${actions}
              ${cancelBtn}
            </div>
          </div>
        `;
      });
    }

    container.innerHTML = html;
  } catch (error) {
    console.error('Failed to load reservations:', error);
    const errorMessage = error?.message || 'Неизвестная ошибка';
    container.innerHTML = `
      <div class="error" style="padding: 20px; background: #fee; border: 1px solid #fcc; border-radius: 8px; color: #c33;">
        <strong>Не удалось загрузить брони</strong>
        <p style="margin-top: 8px; font-size: 14px;">${errorMessage}</p>
        <button onclick="loadReservations()" class="btn btn-secondary" style="margin-top: 12px; padding: 8px 16px;">
          <i class="fas fa-redo"></i> Попробовать снова
        </button>
      </div>
    `;
  }
}

async function refreshAfterReservationChange() {
  if (currentView === 'tables') {
    await loadTables(document.getElementById('restaurant-filter')?.value || null);
  } else {
    await loadReservations();
  }
}

/**
 * Подтвердить бронь
 */
async function confirmReservation(id) {
  if (!confirm('Подтвердить эту бронь?')) return;

  try {
    await AdminAPI.confirmReservation(id);
    Utils.showSuccess('Бронь подтверждена');
    await refreshAfterReservationChange();
  } catch (error) {
    console.error('Failed to confirm reservation:', error);
    Utils.showError('Не удалось подтвердить бронь: ' + error.message);
  }
}

/**
 * Завершить бронь
 */
async function completeReservation(id) {
  if (!confirm('Завершить эту бронь? Стол будет освобожден.')) return;

  try {
    await AdminAPI.completeReservation(id);
    Utils.showSuccess('Бронь завершена');
    await refreshAfterReservationChange();
  } catch (error) {
    console.error('Failed to complete reservation:', error);
    Utils.showError('Не удалось завершить бронь: ' + error.message);
  }
}

/**
 * Отменить бронь
 */
async function cancelReservationAdmin(id) {
  const reason = prompt('Укажите причину отмены (необязательно):');
  if (reason === null) return; // Пользователь отменил

  try {
    await AdminAPI.cancelReservation(id, reason || undefined);
    Utils.showSuccess('Бронь отменена');
    await refreshAfterReservationChange();
  } catch (error) {
    console.error('Failed to cancel reservation:', error);
    Utils.showError('Не удалось отменить бронь: ' + error.message);
  }
}

/**
 * Форматировать телефон (добавить +7 если начинается с 7 или 8)
 */
function formatPhone(phone) {
  if (!phone) return '+7';
  
  // Удаляем все нецифровые символы кроме +
  let cleaned = phone.replace(/[^\d+]/g, '');
  
  // Если начинается с 8, заменяем на +7
  if (cleaned.startsWith('8')) {
    cleaned = '+7' + cleaned.substring(1);
  }
  // Если начинается с 7, добавляем +
  else if (cleaned.startsWith('7') && !cleaned.startsWith('+7')) {
    cleaned = '+' + cleaned;
  }
  // Если не начинается с +7, добавляем +7
  else if (!cleaned.startsWith('+7')) {
    cleaned = '+7' + cleaned;
  }
  
  // Ограничиваем до 12 символов (+7 + 10 цифр)
  if (cleaned.length > 12) {
    cleaned = cleaned.substring(0, 12);
  }
  
  return cleaned;
}

/**
 * Валидация телефона
 */
function validatePhone(phone) {
  const phoneRegex = /^\+7\d{10}$/;
  return phoneRegex.test(phone);
}

/**
 * Инициализировать маску ввода телефона
 */
function initPhoneMask() {
  const phoneInput = document.getElementById('reservation-guest-phone');
  if (!phoneInput) return;

  // Удаляем старые обработчики, создавая новый элемент
  const oldValue = phoneInput.value;
  const newPhoneInput = phoneInput.cloneNode(true);
  phoneInput.parentNode.replaceChild(newPhoneInput, phoneInput);
  newPhoneInput.value = oldValue;

  // Обработчик ввода
  newPhoneInput.addEventListener('input', (e) => {
    let value = e.target.value;
    // Удаляем все кроме цифр и +
    value = value.replace(/[^\d+]/g, '');
    
    // Если начинается с 8, заменяем на +7
    if (value.startsWith('8')) {
      value = '+7' + value.substring(1);
    }
    // Если начинается с 7 без +, добавляем +
    else if (value.startsWith('7') && !value.startsWith('+7')) {
      value = '+' + value;
    }
    // Если не начинается с +7, добавляем +7
    else if (!value.startsWith('+7') && value.length > 0) {
      const digits = value.replace(/\D/g, '');
      if (digits.startsWith('7')) {
        value = '+7' + digits.substring(1);
      } else if (digits.startsWith('8')) {
        value = '+7' + digits.substring(1);
      } else {
        value = '+7' + digits;
      }
    }
    
    // Ограничиваем до 12 символов (+7 + 10 цифр)
    if (value.length > 12) {
      value = value.substring(0, 12);
    }
    
    e.target.value = value;
  });

  // Обработчик потери фокуса
  newPhoneInput.addEventListener('blur', (e) => {
    // При потере фокуса форматируем телефон
    let value = e.target.value;
    if (value && !value.startsWith('+7')) {
      // Форматируем только если не пусто и не начинается с +7
      value = formatPhone(value);
      e.target.value = value;
    }
  });
}

/**
 * Открыть модальное окно создания брони
 */
function openCreateReservationModal(tableId, restaurantId) {
  const modal = document.getElementById('reservation-modal');
  const form = document.getElementById('reservation-form');
  const title = document.getElementById('reservation-modal-title');
  const submitBtn = document.getElementById('reservation-submit-btn');
  
  // Устанавливаем значения
  document.getElementById('reservation-id').value = '';
  document.getElementById('reservation-table-id').value = tableId;
  document.getElementById('reservation-restaurant-id').value = restaurantId;
  
  // Устанавливаем минимальную дату (текущая + 15 минут)
  const datetimeInput = document.getElementById('reservation-datetime');
  const minDate = new Date(Date.now() + 15 * 60 * 1000);
  datetimeInput.min = minDate.toISOString().slice(0, 16);
  
  // Сбрасываем форму
  form.reset();
  document.getElementById('reservation-table-id').value = tableId;
  document.getElementById('reservation-restaurant-id').value = restaurantId;
  document.getElementById('reservation-guests-count').value = 2;
  
  title.textContent = 'Добавить бронь';
  submitBtn.textContent = 'Создать бронь';
  
  // Инициализируем маску телефона
  initPhoneMask();
  
  modal.classList.add('active');
}

/**
 * Закрыть модальное окно создания брони
 */
function closeReservationModal() {
  const modal = document.getElementById('reservation-modal');
  modal.classList.remove('active');
  document.getElementById('reservation-form').reset();
}

/**
 * Открыть модальное окно с информацией о брони
 */
async function openReservationDetailsModal(reservationId) {
  const modal = document.getElementById('reservation-details-modal');
  const content = document.getElementById('reservation-details-content');
  
  modal.classList.add('active');
  content.innerHTML = '<div class="loading">Загрузка...</div>';

  try {
    const reservation = await AdminAPI.getReservation(reservationId);
    const res = reservation.data || reservation;
    
    const restaurant = restaurants.find(r => r.id === res.restaurant_id);
    const tableNumber = res.table?.number || 'N/A';
    const reservationDate = new Date(res.reservation_date).toLocaleString('ru-RU');
    const createdAt = new Date(res.created_at).toLocaleString('ru-RU');
    
    const statusLabels = {
      PENDING: { text: 'Ожидает подтверждения', class: 'status-pending' },
      CONFIRMED: { text: 'Подтверждена', class: 'status-confirmed' },
      CANCELLED: { text: 'Отменена', class: 'status-cancelled' },
      COMPLETED: { text: 'Завершена', class: 'status-completed' },
    };
    const status = statusLabels[res.status] || statusLabels.PENDING;

    content.innerHTML = `
      <div style="margin-bottom: 24px;">
        <button class="btn btn-primary" onclick="openEditReservationModal('${res.id}')" style="margin-bottom: 20px;">
          <i class="fas fa-edit"></i> Редактировать бронь
        </button>
      </div>
      
      <div style="display: grid; gap: 16px;">
        <div>
          <strong style="color: var(--admin-text-secondary); font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Статус</strong>
          <div style="margin-top: 8px;">
            <span class="status-badge ${status.class}">${status.text}</span>
          </div>
        </div>
        
        <div>
          <strong style="color: var(--admin-text-secondary); font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Ресторан</strong>
          <p style="margin-top: 8px; font-size: 16px; color: var(--admin-text);">${Utils.escapeHtml(restaurant?.name || 'Не найден')}</p>
        </div>
        
        <div>
          <strong style="color: var(--admin-text-secondary); font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Стол</strong>
          <p style="margin-top: 8px; font-size: 16px; color: var(--admin-text);">Стол №${tableNumber}</p>
        </div>
        
        <div>
          <strong style="color: var(--admin-text-secondary); font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Дата и время брони</strong>
          <p style="margin-top: 8px; font-size: 16px; color: var(--admin-text);">${reservationDate}</p>
        </div>
        
        <div>
          <strong style="color: var(--admin-text-secondary); font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Гость</strong>
          <p style="margin-top: 8px; font-size: 16px; color: var(--admin-text);">${Utils.escapeHtml(res.guest_name)}</p>
        </div>
        
        <div>
          <strong style="color: var(--admin-text-secondary); font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Телефон</strong>
          <p style="margin-top: 8px; font-size: 16px; color: var(--admin-text);">${Utils.escapeHtml(res.guest_phone)}</p>
        </div>
        
        <div>
          <strong style="color: var(--admin-text-secondary); font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Количество гостей</strong>
          <p style="margin-top: 8px; font-size: 16px; color: var(--admin-text);">${res.guests_count}</p>
        </div>
        
        ${res.comment ? `
        <div>
          <strong style="color: var(--admin-text-secondary); font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Комментарий</strong>
          <p style="margin-top: 8px; font-size: 16px; color: var(--admin-text);">${Utils.escapeHtml(res.comment)}</p>
        </div>
        ` : ''}
        
        <div>
          <strong style="color: var(--admin-text-secondary); font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Создано</strong>
          <p style="margin-top: 8px; font-size: 14px; color: var(--admin-text-secondary);">${createdAt}</p>
        </div>
        
        ${res.created_by_staff ? `
        <div>
          <strong style="color: var(--admin-text-secondary); font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Создано персоналом</strong>
          <p style="margin-top: 8px; font-size: 14px; color: var(--admin-text-secondary);">${Utils.escapeHtml(res.created_by_staff?.name || res.created_by_staff?.username || 'Персонал')}</p>
        </div>
        ` : ''}
        
        ${res.cancelled_at ? `
        <div>
          <strong style="color: var(--admin-text-secondary); font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Отменено</strong>
          <p style="margin-top: 8px; font-size: 14px; color: var(--admin-text-secondary);">${new Date(res.cancelled_at).toLocaleString('ru-RU')}</p>
          ${res.cancelled_reason ? `<p style="margin-top: 4px; font-size: 14px; color: var(--admin-text-secondary);">Причина: ${Utils.escapeHtml(res.cancelled_reason)}</p>` : ''}
        </div>
        ` : ''}
        
        ${res.completed_at ? `
        <div>
          <strong style="color: var(--admin-text-secondary); font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Завершено</strong>
          <p style="margin-top: 8px; font-size: 14px; color: var(--admin-text-secondary);">${new Date(res.completed_at).toLocaleString('ru-RU')}</p>
        </div>
        ` : ''}
      </div>
      
      <div style="margin-top: 24px; padding-top: 24px; border-top: 1px solid var(--admin-border); display: flex; gap: 12px;">
        ${res.status === 'PENDING' ? `
          <button class="btn btn-success" onclick="confirmReservationFromDetails('${res.id}')">
            <i class="fas fa-check"></i> Подтвердить
          </button>
        ` : ''}
        ${res.status === 'CONFIRMED' ? `
          <button class="btn btn-primary" onclick="completeReservationFromDetails('${res.id}')">
            <i class="fas fa-check-circle"></i> Завершить
          </button>
        ` : ''}
        ${(res.status === 'PENDING' || res.status === 'CONFIRMED') ? `
          <button class="btn btn-danger" onclick="cancelReservationFromDetails('${res.id}')">
            <i class="fas fa-times"></i> Отменить
          </button>
        ` : ''}
      </div>
    `;
  } catch (error) {
    console.error('Failed to load reservation details:', error);
    content.innerHTML = `
      <div class="error-state">
        <p>Не удалось загрузить информацию о брони</p>
        <p style="font-size: 14px; margin-top: 8px;">${error.message || 'Неизвестная ошибка'}</p>
        <button class="btn btn-secondary" onclick="closeReservationDetailsModal()" style="margin-top: 16px;">Закрыть</button>
      </div>
    `;
  }
}

function openTableReservationsModal(tableId, tableNumber) {
  const modal = document.getElementById('table-reservations-modal');
  const title = document.getElementById('table-reservations-title');
  const content = document.getElementById('table-reservations-content');
  const reservations = (tableReservationsMap[tableId] || [])
    .slice()
    .sort((a, b) => new Date(a.reservation_date) - new Date(b.reservation_date));

  title.textContent = `Брони стола №${tableNumber}`;
  content.innerHTML = '';

  if (reservations.length === 0) {
    content.innerHTML = '<div class="empty-state">Брони для этого стола не найдены.</div>';
    modal.classList.add('active');
    return;
  }

  const statusLabels = {
    PENDING: { text: 'Ожидает подтверждения', class: 'status-pending' },
    CONFIRMED: { text: 'Подтверждена', class: 'status-confirmed' },
    CANCELLED: { text: 'Отменена', class: 'status-cancelled' },
    COMPLETED: { text: 'Завершена', class: 'status-completed' },
  };

  const items = reservations.map((res) => {
    const reservationDate = new Date(res.reservation_date).toLocaleString('ru-RU');
    const status = statusLabels[res.status] || statusLabels.PENDING;
    const guestName = Utils.escapeHtml(res.guest_name);
    const guestPhone = Utils.escapeHtml(res.guest_phone);

    const actions = res.status === 'PENDING'
      ? `<button class="btn btn-sm btn-success" onclick="confirmReservation('${res.id}')">Подтвердить</button>`
      : res.status === 'CONFIRMED'
      ? `<button class="btn btn-sm btn-primary" onclick="completeReservation('${res.id}')">Завершить</button>`
      : '';

    const cancelBtn = (res.status === 'PENDING' || res.status === 'CONFIRMED')
      ? `<button class="btn btn-sm btn-danger" onclick="cancelReservationAdmin('${res.id}')">Отменить</button>`
      : '';

    return `
      <div class="list-item">
        <div class="list-item-info">
          <h4>Бронь на ${reservationDate}</h4>
          <p><strong>Гость:</strong> ${guestName} (${guestPhone})</p>
          <p><strong>Гостей:</strong> ${res.guests_count}</p>
          ${res.comment ? `<p><strong>Комментарий:</strong> ${Utils.escapeHtml(res.comment)}</p>` : ''}
        </div>
        <div class="list-item-actions">
          <span class="status-badge ${status.class}">${status.text}</span>
          <button class="btn btn-sm btn-secondary" onclick="openReservationDetailsModal('${res.id}')">Открыть</button>
          ${actions}
          ${cancelBtn}
        </div>
      </div>
    `;
  }).join('');

  content.innerHTML = items;
  modal.classList.add('active');
}

function closeTableReservationsModal() {
  const modal = document.getElementById('table-reservations-modal');
  modal.classList.remove('active');
}

/**
 * Закрыть модальное окно с информацией о брони
 */
function closeReservationDetailsModal() {
  const modal = document.getElementById('reservation-details-modal');
  modal.classList.remove('active');
}

/**
 * Открыть модальное окно редактирования брони
 */
async function openEditReservationModal(reservationId) {
  try {
    const reservation = await AdminAPI.getReservation(reservationId);
    const res = reservation.data || reservation;
    
    // Закрываем модальное окно просмотра
    closeReservationDetailsModal();
    
    // Открываем модальное окно редактирования
    const modal = document.getElementById('reservation-modal');
    const form = document.getElementById('reservation-form');
    const title = document.getElementById('reservation-modal-title');
    const submitBtn = document.getElementById('reservation-submit-btn');
    
    // Устанавливаем значения
    document.getElementById('reservation-id').value = res.id;
    document.getElementById('reservation-table-id').value = res.table_id;
    document.getElementById('reservation-restaurant-id').value = res.restaurant_id;
    
    // Форматируем дату для input datetime-local
    const reservationDate = new Date(res.reservation_date);
    const year = reservationDate.getFullYear();
    const month = String(reservationDate.getMonth() + 1).padStart(2, '0');
    const day = String(reservationDate.getDate()).padStart(2, '0');
    const hours = String(reservationDate.getHours()).padStart(2, '0');
    const minutes = String(reservationDate.getMinutes()).padStart(2, '0');
    const datetimeLocal = `${year}-${month}-${day}T${hours}:${minutes}`;
    
    document.getElementById('reservation-datetime').value = datetimeLocal;
    document.getElementById('reservation-guest-name').value = res.guest_name;
    document.getElementById('reservation-guest-phone').value = res.guest_phone;
    document.getElementById('reservation-guests-count').value = res.guests_count;
    document.getElementById('reservation-comment').value = res.comment || '';
    
    title.textContent = 'Редактировать бронь';
    submitBtn.textContent = 'Сохранить изменения';
    
    // Инициализируем маску телефона
    initPhoneMask();
    
    modal.classList.add('active');
  } catch (error) {
    console.error('Failed to load reservation for editing:', error);
    Utils.showError('Не удалось загрузить данные брони: ' + (error.message || 'Неизвестная ошибка'));
  }
}


/**
 * Сохранить бронь (создание или редактирование)
 */
async function saveReservation() {
  const form = document.getElementById('reservation-form');
  const reservationId = document.getElementById('reservation-id').value;
  const tableId = document.getElementById('reservation-table-id').value;
  const restaurantId = document.getElementById('reservation-restaurant-id').value;
  const datetime = document.getElementById('reservation-datetime').value;
  const guestName = document.getElementById('reservation-guest-name').value.trim();
  let guestPhone = document.getElementById('reservation-guest-phone').value.trim();
  const guestsCount = parseInt(document.getElementById('reservation-guests-count').value);
  const comment = document.getElementById('reservation-comment').value.trim();

  if (!tableId || !restaurantId || !datetime || !guestName || !guestPhone || !guestsCount) {
    Utils.showError('Заполните все обязательные поля');
    return;
  }

  // Форматируем телефон
  guestPhone = formatPhone(guestPhone);

  // Валидация телефона
  if (!validatePhone(guestPhone)) {
    Utils.showError('Телефон должен быть в формате +77001234567');
    document.getElementById('reservation-guest-phone').focus();
    return;
  }

  try {
    if (reservationId) {
      // Редактирование существующей брони
      await AdminAPI.updateReservation(reservationId, {
        reservationDate: datetime,
        guestsCount: guestsCount,
        comment: comment || undefined,
      });
      Utils.showSuccess('Бронь успешно обновлена');
    } else {
      // Создание новой брони
      await AdminAPI.createReservation({
        tableId: tableId,
        guestName: guestName,
        guestPhone: guestPhone,
        guestsCount: guestsCount,
        reservationDate: datetime,
        comment: comment || undefined,
      });
      Utils.showSuccess('Бронь успешно создана');
    }

    closeReservationModal();
    
    // Перезагружаем столы и брони
    await loadTables(document.getElementById('restaurant-filter')?.value || null);
    if (currentView === 'reservations') {
      await loadReservations();
    }
  } catch (error) {
    console.error('Failed to save reservation:', error);
    Utils.showError('Не удалось сохранить бронь: ' + (error.message || 'Неизвестная ошибка'));
  }
}

/**
 * Подтвердить бронь из модального окна просмотра
 */
async function confirmReservationFromDetails(id) {
  await confirmReservation(id);
  await openReservationDetailsModal(id); // Перезагружаем информацию
}

/**
 * Завершить бронь из модального окна просмотра
 */
async function completeReservationFromDetails(id) {
  await completeReservation(id);
  closeReservationDetailsModal();
  // Перезагружаем столы
  await loadTables(document.getElementById('restaurant-filter')?.value || null);
}

/**
 * Отменить бронь из модального окна просмотра
 */
async function cancelReservationFromDetails(id) {
  await cancelReservationAdmin(id);
  closeReservationDetailsModal();
  // Перезагружаем столы
  await loadTables(document.getElementById('restaurant-filter')?.value || null);
}

// Экспорт
window.openTableModal = openTableModal;
window.closeTableModal = closeTableModal;
window.editTable = editTable;
window.deleteTable = deleteTable;
window.showQR = showQR;
window.closeQRModal = closeQRModal;
window.downloadQR = downloadQR;
window.downloadAllQR = downloadAllQR;
window.rotateQRToken = rotateQRToken;
window.updateTableStatus = updateTableStatus;
window.openQRLink = openQRLink;
window.switchView = switchView;
window.loadReservations = loadReservations;
window.confirmReservation = confirmReservation;
window.completeReservation = completeReservation;
window.cancelReservationAdmin = cancelReservationAdmin;
window.openCreateReservationModal = openCreateReservationModal;
window.closeReservationModal = closeReservationModal;
window.toggleStatusSelect = toggleStatusSelect;
window.openReservationDetailsModal = openReservationDetailsModal;
window.openTableReservationsModal = openTableReservationsModal;
window.closeTableReservationsModal = closeTableReservationsModal;
window.closeReservationDetailsModal = closeReservationDetailsModal;
window.openEditReservationModal = openEditReservationModal;
window.confirmReservationFromDetails = confirmReservationFromDetails;
window.completeReservationFromDetails = completeReservationFromDetails;
window.cancelReservationFromDetails = cancelReservationFromDetails;

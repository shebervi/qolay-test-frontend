/**
 * Логика страницы столов
 */

let currentTableId = null;
let currentQRTableId = null;
let currentQRImageUrl = null; // Для хранения blob URL QR-кода
let currentQRTokenHash = null; // Для хранения QR токена стола
let restaurants = [];
let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
  // Получаем текущего пользователя
  if (typeof Auth !== 'undefined') {
    currentUser = Auth.getAuthUser();
  }

  // Загружаем рестораны для фильтра и формы
  await loadRestaurants();
  
  // Обработка фильтра
  document.getElementById('restaurant-filter').addEventListener('change', async (e) => {
    await loadTables(e.target.value);
  });

  // Обработка формы
  document.getElementById('table-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveTable();
  });

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

    // Проверяем права доступа
    const canEditTable = currentUser?.role !== 'WAITER';
    const canDeleteTable = currentUser?.role !== 'WAITER';

    container.innerHTML = tables.map(table => {
      const restaurant = restaurants.find(r => r.id === table.restaurant_id);
      const statusLabels = {
        'FREE': { text: 'Свободен', class: 'status-free' },
        'OCCUPIED': { text: 'Занят', class: 'status-occupied' },
        'RESERVED': { text: 'Зарезервирован', class: 'status-reserved' }
      };
      const status = statusLabels[table.status] || statusLabels['FREE'];
      
      return `
        <div class="list-item">
          <div class="list-item-info">
            <h4>Стол №${table.number}</h4>
            <p>${restaurant?.name || 'Ресторан не найден'}</p>
            <div class="table-status">
              <span class="status-badge ${status.class}">${status.text}</span>
              <select class="status-select" onchange="updateTableStatus('${table.id}', this.value)" title="Изменить статус">
                <option value="FREE" ${table.status === 'FREE' ? 'selected' : ''}>Свободен</option>
                <option value="OCCUPIED" ${table.status === 'OCCUPIED' ? 'selected' : ''}>Занят</option>
                <option value="RESERVED" ${table.status === 'RESERVED' ? 'selected' : ''}>Зарезервирован</option>
              </select>
            </div>
          </div>
          <div class="list-item-actions">
            <button class="btn-icon" onclick="showQR('${table.id}')" title="Показать QR">
              <i class="fas fa-qrcode"></i>
            </button>
            ${canEditTable ? `
            <button class="btn-icon" onclick="editTable('${table.id}')" title="Редактировать">
              <i class="fas fa-edit"></i>
            </button>
            ` : ''}
            ${canDeleteTable ? `
            <button class="btn-icon" onclick="deleteTable('${table.id}')" title="Удалить">
              <i class="fas fa-trash"></i>
            </button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
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
  // URL имеет формат: /guests.html?table={qrTokenHash}
  // Используем тот же origin, что и текущая страница, но заменяем путь
  const currentOrigin = window.location.origin;
  const qrUrl = `${currentOrigin}/guests.html?table=${currentQRTokenHash}`;
  
  // Открываем в новой вкладке
  window.open(qrUrl, '_blank');
}

async function editTable(id) {
  await loadTable(id);
  openTableModal();
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


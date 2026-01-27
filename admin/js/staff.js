/**
 * Логика страницы персонала
 */

let currentManagerId = null;
let currentWaiterId = null;
let restaurants = [];
let currentUser = null;
let currentWaiterAssignId = null;
let cachedTablesByRestaurant = {};
let cachedWaiters = [];

document.addEventListener('DOMContentLoaded', async () => {
  // Получаем текущего пользователя
  if (typeof Auth !== 'undefined') {
    currentUser = Auth.getAuthUser();
  }

  // Загружаем рестораны
  await loadRestaurants();
  
  // Инициализация табов
  initTabs();
  
  // Обработка фильтров
  document.getElementById('restaurant-filter').addEventListener('change', async (e) => {
    await loadCurrentTab();
  });

  // Обработка форм
  document.getElementById('manager-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveManager();
  });

  document.getElementById('waiter-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveWaiter();
  });

  // Загружаем данные
  await loadManagers();
  await loadWaiters();
});

function initTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  const contents = document.querySelectorAll('.tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.getAttribute('data-tab');
      
      // Убираем активные классы
      tabs.forEach(t => t.classList.remove('active'));
      contents.forEach(c => c.classList.remove('active'));
      
      // Добавляем активные классы
      tab.classList.add('active');
      document.getElementById(`content-${targetTab}`).classList.add('active');
      
      // Загружаем данные для активного таба
      loadCurrentTab();
    });
  });
}

async function loadCurrentTab() {
  const activeTab = document.querySelector('.tab-btn.active');
  if (!activeTab) return;
  
  const tabName = activeTab.getAttribute('data-tab');
  if (tabName === 'managers') {
    await loadManagers();
  } else if (tabName === 'managers') {
    await loadWaiters();
  }
}

async function loadRestaurants() {
  try {
    const response = await AdminAPI.getRestaurants();
    restaurants = response.data?.data || response.data || [];
    
    // Заполняем фильтр
    const filter = document.getElementById('restaurant-filter');
    filter.innerHTML = '<option value="">Все рестораны</option>' + 
      restaurants.map(r => `<option value="${r.id}">${r.name}</option>`).join('');

    // Заполняем формы
    const managerFormSelect = document.getElementById('manager-restaurant');
    const waiterFormSelect = document.getElementById('waiter-restaurant');
    const kitchenFormSelect = document.getElementById('kitchen-restaurant');
    
    const options = restaurants.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
    
    if (managerFormSelect) {
      managerFormSelect.innerHTML = '<option value="">Выберите ресторан</option>' + options;
    }
    if (waiterFormSelect) {
      waiterFormSelect.innerHTML = '<option value="">Выберите ресторан</option>' + options;
    }
    if (kitchenFormSelect) {
      kitchenFormSelect.innerHTML = '<option value="">Выберите ресторан</option>' + options;
    }
  } catch (error) {
    console.error('Failed to load restaurants:', error);
    Utils.showError('Не удалось загрузить рестораны');
  }
}

async function loadManagers() {
  try {
    const restaurantId = document.getElementById('restaurant-filter').value;
    const response = await AdminAPI.getManagers(restaurantId);
    const result = response.data || response;
    const managers = result.data || result || [];
    
    const container = document.getElementById('managers-list');
    
    // Проверяем доступ для MANAGER
    const canManageManagers = currentUser?.role === 'ADMIN' || currentUser?.role === 'OWNER';
    const btnAddManager = document.getElementById('btn-add-manager');
    if (btnAddManager) {
      btnAddManager.style.display = canManageManagers ? 'block' : 'none';
    }
    
    if (managers.length === 0) {
      container.innerHTML = '<div class="empty-state">Нет менеджеров. Добавьте первого менеджера.</div>';
      return;
    }

    container.innerHTML = managers.map(manager => {
      const restaurant = restaurants.find(r => r.id === manager.restaurant?.id);
      const canEdit = canManageManagers;
      
      return `
        <div class="list-item">
          <div class="list-item-info">
            <h4>${manager.name || manager.phone || 'Без имени'}</h4>
            <p>${manager.phone}</p>
            <p style="color: #666; font-size: 0.9em;">${restaurant?.name || 'Ресторан не найден'}</p>
          </div>
          <div class="list-item-actions">
            ${canEdit ? `
              <button class="btn-icon" onclick="editManager('${manager.id}')" title="Редактировать">
                <i class="fas fa-edit"></i>
              </button>
              <button class="btn-icon" onclick="deleteManager('${manager.id}')" title="Удалить">
                <i class="fas fa-trash"></i>
              </button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('Failed to load managers:', error);
    Utils.showError('Не удалось загрузить менеджеров');
  }
}

async function loadWaiters() {
  try {
    const restaurantId = document.getElementById('restaurant-filter').value;
    const response = await AdminAPI.getWaiters(restaurantId);
    const result = response.data || response;
    const waiters = result.data || result || [];
    cachedWaiters = waiters;

    const restaurantIds = Array.from(
      new Set(
        waiters
          .map((waiter) => waiter.restaurant?.id)
          .filter((id) => !!id),
      ),
    );
    const tablesByRestaurant = {};
    for (const id of restaurantIds) {
      tablesByRestaurant[id] = await loadTablesForRestaurant(id);
    }
    
    const container = document.getElementById('waiters-list');
    
    if (waiters.length === 0) {
      container.innerHTML = '<div class="empty-state">Нет официантов. Добавьте первого официанта.</div>';
      return;
    }

    container.innerHTML = waiters.map(waiter => {
      const restaurant = restaurants.find(r => r.id === waiter.restaurant?.id);
      const tables = waiter.restaurant?.id
        ? tablesByRestaurant[waiter.restaurant.id] || []
        : [];
      const assignedTables = tables
        .filter((table) => table.current_waiter?.id === waiter.id)
        .map((table) => table.number)
        .sort((a, b) => a - b);
      const assignedTablesText = assignedTables.length > 0
        ? assignedTables.map((num) => `№${num}`).join(', ')
        : 'Не назначены';
      
      return `
        <div class="list-item">
          <div class="list-item-info">
            <h4>${waiter.name || waiter.username || 'Без имени'}</h4>
            <p>${waiter.username || waiter.phone}</p>
            <p style="color: #666; font-size: 0.9em;">${restaurant?.name || 'Ресторан не найден'}</p>
            <p style="color: #666; font-size: 0.9em;">Столы: ${assignedTablesText}</p>
          </div>
          <div class="list-item-actions">
            <button class="btn btn-sm btn-secondary" onclick="openAssignTablesModal('${waiter.id}')" title="Назначить столы">
              Назначить столы
            </button>
            <button class="btn-icon" onclick="editWaiter('${waiter.id}')" title="Редактировать">
              <i class="fas fa-edit"></i>
            </button>
            <button class="btn-icon" onclick="deleteWaiter('${waiter.id}')" title="Удалить">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('Failed to load waiters:', error);
    Utils.showError('Не удалось загрузить официантов');
  }
}

async function openAssignTablesModal(waiterId) {
  currentWaiterAssignId = waiterId;
  const modal = document.getElementById('waiter-assign-tables-modal');
  const content = document.getElementById('waiter-assign-tables-content');
  const waiter = cachedWaiters.find((item) => item.id === waiterId);
  const restaurantId = waiter?.restaurant?.id || document.getElementById('restaurant-filter')?.value || '';

  modal.classList.add('active');
  content.innerHTML = '<div class="loading">Загрузка...</div>';

  try {
    const tables = await loadTablesForRestaurant(restaurantId);

    if (!tables || tables.length === 0) {
      content.innerHTML = '<div class="empty-state">Нет столов для назначения.</div>';
      return;
    }

    content.innerHTML = `
      <div class="form-group">
        <label>Выберите столы</label>
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 12px;">
          ${tables.map(table => `
            <label style="display: flex; align-items: center; gap: 8px; padding: 8px 10px; border: 1px solid #e5e7eb; border-radius: 8px; cursor: pointer;">
              <input type="checkbox" value="${table.id}">
              <span>Стол №${table.number}</span>
            </label>
          `).join('')}
        </div>
      </div>
      <div class="form-actions" style="margin-top: 16px;">
        <button class="btn btn-primary" onclick="saveAssignedTables()">Назначить</button>
        <button class="btn btn-secondary" onclick="closeAssignTablesModal()">Отмена</button>
      </div>
    `;
  } catch (error) {
    console.error('Failed to load tables for assignment:', error);
    content.innerHTML = '<div class="empty-state">Не удалось загрузить столы.</div>';
  }
}

function closeAssignTablesModal() {
  const modal = document.getElementById('waiter-assign-tables-modal');
  modal.classList.remove('active');
  currentWaiterAssignId = null;
}

async function loadTablesForRestaurant(restaurantId) {
  const cacheKey = restaurantId || 'all';
  if (cachedTablesByRestaurant[cacheKey]) {
    return cachedTablesByRestaurant[cacheKey];
  }

  const response = await AdminAPI.getTables(restaurantId || null);
  const tables = response.data?.data || response.data || [];
  cachedTablesByRestaurant[cacheKey] = tables;
  return tables;
}

async function saveAssignedTables() {
  const content = document.getElementById('waiter-assign-tables-content');
  const selected = Array.from(content.querySelectorAll('input[type="checkbox"]:checked'))
    .map((input) => input.value);

  if (!currentWaiterAssignId) {
    Utils.showError('Официант не выбран');
    return;
  }

  if (selected.length === 0) {
    Utils.showError('Выберите хотя бы один стол');
    return;
  }

  try {
    await Promise.all(
      selected.map((tableId) => AdminAPI.assignTableWaiter(tableId, currentWaiterAssignId)),
    );
    Utils.showSuccess('Столы назначены');
    closeAssignTablesModal();
  } catch (error) {
    console.error('Failed to assign tables:', error);
    Utils.showError('Не удалось назначить столы: ' + (error.message || 'Неизвестная ошибка'));
  }
}

function openManagerModal(id = null) {
  currentManagerId = id;
  const modal = document.getElementById('manager-modal');
  const form = document.getElementById('manager-form');
  const title = document.getElementById('manager-modal-title');
  
  form.reset();
  document.getElementById('manager-id').value = '';
  
  if (id) {
    title.textContent = 'Редактировать менеджера';
    loadManager(id);
  } else {
    title.textContent = 'Добавить менеджера';
  }
  
  modal.classList.add('active');
}

function closeManagerModal() {
  document.getElementById('manager-modal').classList.remove('active');
  currentManagerId = null;
}

async function loadManager(id) {
  try {
    const response = await AdminAPI.getManager(id);
    const manager = response.data?.data || response.data || response;
    
    document.getElementById('manager-id').value = id;
    document.getElementById('manager-restaurant').value = manager.restaurant?.id || '';
    document.getElementById('manager-phone').value = manager.phone || '';
    document.getElementById('manager-name').value = manager.name || '';
    // Пароль не загружаем для безопасности
    document.getElementById('manager-password').required = false;
    document.getElementById('manager-password').placeholder = 'Оставьте пустым, чтобы не менять';
  } catch (error) {
    console.error('Failed to load manager:', error);
    Utils.showError('Не удалось загрузить менеджера');
  }
}

async function saveManager() {
  try {
    const id = document.getElementById('manager-id').value;
    const data = {
      restaurantId: document.getElementById('manager-restaurant').value,
      phone: document.getElementById('manager-phone').value,
      name: document.getElementById('manager-name').value,
    };
    
    const password = document.getElementById('manager-password').value;
    if (password) {
      data.password = password;
    }
    
    if (id) {
      await AdminAPI.updateManager(id, data);
      Utils.showSuccess('Менеджер обновлен');
    } else {
      if (!password) {
        Utils.showError('Пароль обязателен при создании');
        return;
      }
      await AdminAPI.createManager(data);
      Utils.showSuccess('Менеджер создан');
    }
    
    closeManagerModal();
    await loadManagers();
  } catch (error) {
    console.error('Failed to save manager:', error);
    Utils.showError(error.message || 'Не удалось сохранить менеджера');
  }
}

async function editManager(id) {
  openManagerModal(id);
}

async function deleteManager(id) {
  if (!confirm('Вы уверены, что хотите удалить этого менеджера?')) {
    return;
  }
  
  try {
    await AdminAPI.deleteManager(id);
    Utils.showSuccess('Менеджер удален');
    await loadManagers();
  } catch (error) {
    console.error('Failed to delete manager:', error);
    Utils.showError(error.message || 'Не удалось удалить менеджера');
  }
}

function openWaiterModal(id = null) {
  currentWaiterId = id;
  const modal = document.getElementById('waiter-modal');
  const form = document.getElementById('waiter-form');
  const title = document.getElementById('waiter-modal-title');
  
  form.reset();
  document.getElementById('waiter-id').value = '';
  
  if (id) {
    title.textContent = 'Редактировать официанта';
    loadWaiter(id);
  } else {
    title.textContent = 'Добавить официанта';
  }
  
  modal.classList.add('active');
}

function closeWaiterModal() {
  document.getElementById('waiter-modal').classList.remove('active');
  currentWaiterId = null;
}

async function loadWaiter(id) {
  try {
    const response = await AdminAPI.getWaiter(id);
    const waiter = response.data?.data || response.data || response;
    
    document.getElementById('waiter-id').value = id;
    document.getElementById('waiter-restaurant').value = waiter.restaurant?.id || '';
    document.getElementById('waiter-username').value = waiter.username || '';
    document.getElementById('waiter-phone').value = waiter.phone || '';
    document.getElementById('waiter-name').value = waiter.name || '';
    // Пароль не загружаем для безопасности
    document.getElementById('waiter-password').required = false;
    document.getElementById('waiter-password').placeholder = 'Оставьте пустым, чтобы не менять';
  } catch (error) {
    console.error('Failed to load waiter:', error);
    Utils.showError('Не удалось загрузить официанта');
  }
}

async function saveWaiter() {
  try {
    const id = document.getElementById('waiter-id').value;
    const data = {
      restaurantId: document.getElementById('waiter-restaurant').value,
      username: document.getElementById('waiter-username').value,
      phone: document.getElementById('waiter-phone').value,
      name: document.getElementById('waiter-name').value,
    };
    
    const password = document.getElementById('waiter-password').value;
    if (password) {
      data.password = password;
    }
    
    if (id) {
      await AdminAPI.updateWaiter(id, data);
      Utils.showSuccess('Официант обновлен');
    } else {
      if (!password) {
        Utils.showError('Пароль обязателен при создании');
        return;
      }
      await AdminAPI.createWaiter(data);
      Utils.showSuccess('Официант создан');
    }
    
    closeWaiterModal();
    await loadWaiters();
  } catch (error) {
    console.error('Failed to save waiter:', error);
    Utils.showError(error.message || 'Не удалось сохранить официанта');
  }
}

async function editWaiter(id) {
  openWaiterModal(id);
}

async function deleteWaiter(id) {
  if (!confirm('Вы уверены, что хотите удалить этого официанта?')) {
    return;
  }
  
  try {
    await AdminAPI.deleteWaiter(id);
    Utils.showSuccess('Официант удален');
    await loadWaiters();
  } catch (error) {
    console.error('Failed to delete waiter:', error);
    Utils.showError(error.message || 'Не удалось удалить официанта');
  }
}

async function saveKitchenPassword() {
  try {
    const restaurantId = document.getElementById('kitchen-restaurant').value;
    const password = document.getElementById('kitchen-password').value;
    const passwordConfirm = document.getElementById('kitchen-password-confirm').value;
    
    if (!restaurantId) {
      Utils.showError('Выберите ресторан');
      return;
    }
    
    if (!password || password.length < 6) {
      Utils.showError('Пароль должен быть не менее 6 символов');
      return;
    }
    
    if (password !== passwordConfirm) {
      Utils.showError('Пароли не совпадают');
      return;
    }
    
    await AdminAPI.setKitchenPassword(restaurantId, password);
    Utils.showSuccess('Пароль кухни установлен');
    
    // Очищаем форму
    document.getElementById('kitchen-restaurant').value = '';
    document.getElementById('kitchen-password').value = '';
    document.getElementById('kitchen-password-confirm').value = '';
  } catch (error) {
    console.error('Failed to set kitchen password:', error);
    Utils.showError(error.message || 'Не удалось установить пароль кухни');
  }
}

window.openAssignTablesModal = openAssignTablesModal;
window.closeAssignTablesModal = closeAssignTablesModal;
window.saveAssignedTables = saveAssignedTables;

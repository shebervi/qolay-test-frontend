/**
 * Логика страницы ресторанов
 */

let currentRestaurantId = null;
let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
  // Получаем текущего пользователя
  if (typeof Auth !== 'undefined') {
    currentUser = Auth.getAuthUser();
  }

  // Проверяем наличие ID в URL для редактирования
  const urlParams = new URLSearchParams(window.location.search);
  const id = urlParams.get('id');
  
  // Скрываем кнопку добавления для WAITER, KITCHEN, MANAGER
  const btnAddRestaurant = document.querySelector('button[onclick="openRestaurantModal()"]');
  if (btnAddRestaurant) {
    const canCreateRestaurant = currentUser?.role !== 'WAITER' && currentUser?.role !== 'KITCHEN' && currentUser?.role !== 'MANAGER';
    btnAddRestaurant.style.display = canCreateRestaurant ? 'block' : 'none';
  }
  
  if (id) {
    await loadRestaurant(id);
    openRestaurantModal();
  } else {
    await loadRestaurants();
  }

  // Обработка формы
  document.getElementById('restaurant-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveRestaurant();
  });

  // Предпросмотр логотипа при выборе файла
  document.getElementById('restaurant-logo').addEventListener('change', function(e) {
    const file = e.target.files[0];
    const preview = document.getElementById('logo-preview');
    
    if (file) {
      const reader = new FileReader();
      reader.onload = function(e) {
        preview.innerHTML = `
          <div style="display: flex; align-items: center; gap: 10px; padding: 10px; background: #f5f5f5; border-radius: 4px;">
            <img src="${e.target.result}" alt="Preview" style="max-width: 100px; max-height: 100px; border-radius: 4px;">
            <span>Выбран файл: ${file.name}</span>
          </div>
        `;
      };
      reader.readAsDataURL(file);
    } else {
      preview.innerHTML = '';
    }
  });
});

async function loadRestaurants() {
  try {
    const response = await AdminAPI.getRestaurants();
    const restaurants = response.data?.data || response.data || [];
    
    const container = document.getElementById('restaurants-list');
    
    if (restaurants.length === 0) {
      container.innerHTML = '<div class="empty-state">Нет ресторанов. Добавьте первый ресторан.</div>';
      return;
    }

    // Проверяем права доступа
    const canEditRestaurant = currentUser?.role !== 'WAITER' && currentUser?.role !== 'KITCHEN';
    const canDeleteRestaurant = currentUser?.role !== 'WAITER' && currentUser?.role !== 'KITCHEN' && currentUser?.role !== 'MANAGER';

    container.innerHTML = restaurants.map(restaurant => {
      const logoUrl = restaurant.logo_key 
        ? `${CONFIG.API_BASE_URL}/admin/restaurants/${restaurant.id}/logo`
        : null;
      
      return `
      <div class="list-item">
        <div class="list-item-info" style="display: flex; align-items: center; gap: 15px;">
          ${logoUrl ? `
            <img src="${logoUrl}" 
                 alt="${restaurant.name}" 
                 style="width: 60px; height: 60px; object-fit: contain; border-radius: 8px; background: #f5f5f5; padding: 5px;"
                 onerror="this.style.display='none'">
          ` : ''}
          <div>
            <h4>${restaurant.name}</h4>
            <p>${restaurant.city} • Владелец: ${restaurant.owner?.full_name || 'N/A'} • Столов: ${restaurant._count?.tables || 0} • Блюд: ${restaurant._count?.products || 0} ${restaurant.logo_key ? '• Логотип загружен' : ''}</p>
          </div>
        </div>
        <div class="list-item-actions">
          ${canEditRestaurant ? `
          <button class="btn-icon" onclick="editRestaurant('${restaurant.id}')" title="Редактировать">
            <i class="fas fa-edit"></i>
          </button>
          ` : ''}
          ${canDeleteRestaurant ? `
          <button class="btn-icon" onclick="deleteRestaurant('${restaurant.id}')" title="Удалить">
            <i class="fas fa-trash"></i>
          </button>
          ` : ''}
        </div>
      </div>
    `;
    }).join('');
  } catch (error) {
    console.error('Failed to load restaurants:', error);
    Utils.showError('Не удалось загрузить рестораны');
  }
}

async function loadRestaurant(id) {
  try {
    const response = await AdminAPI.getRestaurant(id);
    const restaurant = response.data?.data || response.data;
    
    currentRestaurantId = id;
    document.getElementById('restaurant-id').value = id;
    document.getElementById('restaurant-name').value = restaurant.name || '';
    document.getElementById('restaurant-city').value = restaurant.city || '';
    document.getElementById('restaurant-owner-name').value = restaurant.owner?.full_name || '';
    document.getElementById('restaurant-owner-phone').value = restaurant.owner?.phone || '';
    document.getElementById('restaurant-owner-email').value = restaurant.owner?.email || '';
    document.getElementById('restaurant-timezone').value = restaurant.timezone || 'Asia/Almaty';
    document.getElementById('restaurant-currency').value = restaurant.currency || 'KZT';
    document.getElementById('restaurant-logo').value = '';
    
    const logoPreview = document.getElementById('logo-preview');
    if (restaurant.logo_key) {
      logoPreview.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px; padding: 10px; background: #f5f5f5; border-radius: 4px;">
          <span>✓ Логотип загружен</span>
          <button type="button" onclick="removeLogo('${id}')" style="background: #dc3545; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 12px;">
            Удалить
          </button>
        </div>
      `;
    } else {
      logoPreview.innerHTML = '';
    }
    
    document.getElementById('modal-title').textContent = 'Редактировать ресторан';
  } catch (error) {
    console.error('Failed to load restaurant:', error);
    Utils.showError('Не удалось загрузить ресторан');
  }
}

async function saveRestaurant() {
  try {
    const data = {
      name: document.getElementById('restaurant-name').value,
      city: document.getElementById('restaurant-city').value,
      ownerFullName: document.getElementById('restaurant-owner-name').value,
      ownerPhone: document.getElementById('restaurant-owner-phone').value,
      ownerEmail: document.getElementById('restaurant-owner-email').value || undefined,
      timezone: document.getElementById('restaurant-timezone').value,
      currency: document.getElementById('restaurant-currency').value,
    };

    let restaurantId = currentRestaurantId;

    if (restaurantId) {
      await AdminAPI.updateRestaurant(restaurantId, data);
      Utils.showSuccess('Ресторан обновлен');
    } else {
      const createResponse = await AdminAPI.createRestaurant(data);
      restaurantId = createResponse.data?.data?.id || createResponse.data?.id;
      Utils.showSuccess('Ресторан создан');
    }

    const logoFile = document.getElementById('restaurant-logo').files[0];
    if (logoFile && restaurantId) {
      try {
        await AdminAPI.uploadRestaurantLogo(restaurantId, logoFile);
        Utils.showSuccess('Логотип загружен');
      } catch (error) {
        console.error('Failed to upload logo:', error);
        Utils.showError('Не удалось загрузить логотип');
      }
    }

    closeRestaurantModal();
    await loadRestaurants();
    
    // Очищаем URL если редактировали
    if (currentRestaurantId) {
      window.history.replaceState({}, '', 'restaurants.html');
    }
  } catch (error) {
    console.error('Failed to save restaurant:', error);
    Utils.showError(error.message || 'Не удалось сохранить ресторан');
  }
}

async function removeLogo(restaurantId) {
  if (!confirm('Вы уверены, что хотите удалить логотип? QR-коды будут генерироваться без логотипа.')) {
    return;
  }

  try {
    await AdminAPI.updateRestaurant(restaurantId, { logoKey: null });
    Utils.showSuccess('Логотип удален');
    await loadRestaurant(restaurantId);
  } catch (error) {
    console.error('Failed to remove logo:', error);
    Utils.showError('Не удалось удалить логотип');
  }
}

async function deleteRestaurant(id) {
  if (!confirm('Вы уверены, что хотите удалить этот ресторан?')) {
    return;
  }

  try {
    await AdminAPI.deleteRestaurant(id);
    Utils.showSuccess('Ресторан удален');
    await loadRestaurants();
  } catch (error) {
    console.error('Failed to delete restaurant:', error);
    Utils.showError('Не удалось удалить ресторан');
  }
}

function openRestaurantModal() {
  document.getElementById('restaurant-modal').classList.add('active');
}

function closeRestaurantModal() {
  document.getElementById('restaurant-modal').classList.remove('active');
  currentRestaurantId = null;
  document.getElementById('restaurant-form').reset();
  document.getElementById('restaurant-id').value = '';
  document.getElementById('logo-preview').innerHTML = '';
  document.getElementById('modal-title').textContent = 'Добавить ресторан';
}

async function editRestaurant(id) {
  await loadRestaurant(id);
  openRestaurantModal();
}

// Экспорт для использования в HTML
window.openRestaurantModal = openRestaurantModal;
window.closeRestaurantModal = closeRestaurantModal;
window.editRestaurant = editRestaurant;
window.deleteRestaurant = deleteRestaurant;
window.removeLogo = removeLogo;


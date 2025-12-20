/**
 * Логика страницы баннеров
 */

let currentBannerId = null;
let restaurants = [];
let categories = [];
let products = [];
let currentUser = null;

const Utils = window.Utils || {
  showError: (msg) => {
    console.error(msg);
    alert('Ошибка: ' + msg);
  },
  showSuccess: (msg) => {
    console.log(msg);
    alert('Успешно: ' + msg);
  },
};

document.addEventListener('DOMContentLoaded', async () => {
  // Получаем текущего пользователя
  if (typeof Auth !== 'undefined') {
    currentUser = Auth.getAuthUser();
  }

  // Загружаем рестораны
  await loadRestaurants();
  
  // Скрываем кнопку добавления для WAITER и KITCHEN
  const btnAddBanner = document.querySelector('button[onclick="openBannerModal()"]');
  if (btnAddBanner) {
    const canCreateBanner = currentUser?.role !== 'WAITER' && currentUser?.role !== 'KITCHEN';
    btnAddBanner.style.display = canCreateBanner ? 'block' : 'none';
  }
  
  // Обработка фильтров
  document.getElementById('restaurant-filter').addEventListener('change', async (e) => {
    await loadBanners(e.target.value, document.getElementById('status-filter').value);
  });

  document.getElementById('status-filter').addEventListener('change', async (e) => {
    await loadBanners(document.getElementById('restaurant-filter').value, e.target.value);
  });

  // Обработка изменения типа действия
  document.getElementById('banner-action-type').addEventListener('change', (e) => {
    updateActionFields(e.target.value);
  });

  // Обработка изменения ресторана в форме
  document.getElementById('banner-restaurant').addEventListener('change', async (e) => {
    const restaurantId = e.target.value || null;
    if (restaurantId) {
      await loadCategoriesForForm(restaurantId);
      await loadProductsForForm(restaurantId);
    } else {
      // Для глобального баннера очищаем списки
      document.getElementById('banner-target-category').innerHTML = '<option value="">Выберите категорию</option>';
      document.getElementById('banner-target-product').innerHTML = '<option value="">Выберите продукт</option>';
    }
  });

  // Обработка формы
  document.getElementById('banner-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveBanner();
  });

  // Обработка загрузки изображения
  document.getElementById('banner-image').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const preview = document.getElementById('banner-image-preview');
        const previewImg = document.getElementById('banner-image-preview-img');
        previewImg.src = event.target.result;
        preview.style.display = 'block';
      };
      reader.readAsDataURL(file);
    }
  });

  await loadBanners();
});

function updateActionFields(actionType) {
  document.getElementById('banner-action-category').style.display = actionType === 'CATEGORY' ? 'block' : 'none';
  document.getElementById('banner-action-product').style.display = actionType === 'PRODUCT' ? 'block' : 'none';
  document.getElementById('banner-action-url').style.display = actionType === 'URL' ? 'block' : 'none';

  // Очистить поля при смене типа
  if (actionType !== 'CATEGORY') {
    document.getElementById('banner-target-category').value = '';
  }
  if (actionType !== 'PRODUCT') {
    document.getElementById('banner-target-product').value = '';
  }
  if (actionType !== 'URL') {
    document.getElementById('banner-target-url').value = '';
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

    // Заполняем форму
    const formSelect = document.getElementById('banner-restaurant');
    formSelect.innerHTML = '<option value="">Глобальный баннер (для всех ресторанов)</option>' +
      restaurants.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
  } catch (error) {
    console.error('Failed to load restaurants:', error);
    Utils.showError('Не удалось загрузить рестораны');
  }
}

async function loadCategoriesForForm(restaurantId) {
  try {
    const response = await AdminAPI.getCategories(restaurantId);
    const cats = response.data?.data || response.data || [];
    categories = cats;
    
    const select = document.getElementById('banner-target-category');
    select.innerHTML = '<option value="">Выберите категорию</option>' +
      cats.map(c => {
        const name = c.name_ru || c.name_kk || c.name_en || 'Без названия';
        return `<option value="${c.id}">${name}</option>`;
      }).join('');
  } catch (error) {
    console.error('Failed to load categories:', error);
  }
}

async function loadProductsForForm(restaurantId) {
  try {
    const response = await AdminAPI.getProducts(restaurantId);
    const prods = response.data?.data || response.data || [];
    products = prods;
    
    const select = document.getElementById('banner-target-product');
    select.innerHTML = '<option value="">Выберите продукт</option>' +
      prods.map(p => {
        const name = p.name_ru || p.name_kk || p.name_en || 'Без названия';
        return `<option value="${p.id}">${name}</option>`;
      }).join('');
  } catch (error) {
    console.error('Failed to load products:', error);
  }
}

async function loadBanners(restaurantId = '', status = '') {
  const listContainer = document.getElementById('banners-list');
  if (!listContainer) return;

  try {
    listContainer.innerHTML = '<div class="loading">Загрузка...</div>';

    const response = await AdminAPI.getBanners(restaurantId, status);
    const banners = response.data?.data || response.data || [];

    if (banners.length === 0) {
      listContainer.innerHTML = '<div class="empty-state">Баннеры не найдены</div>';
      return;
    }

    // Проверяем права доступа
    const canEditBanner = currentUser?.role !== 'WAITER' && currentUser?.role !== 'KITCHEN';
    const canDeleteBanner = currentUser?.role !== 'WAITER' && currentUser?.role !== 'KITCHEN';

    listContainer.innerHTML = banners.map(banner => {
      const restaurantName = banner.restaurantId 
        ? (restaurants.find(r => r.id === banner.restaurantId)?.name || 'Неизвестный ресторан')
        : 'Глобальный';
      
      const actionText = getActionText(banner);
      const statusBadge = banner.isActive 
        ? '<span style="color: var(--success-color); font-weight: 600;">Активен</span>'
        : '<span style="color: #999;">Неактивен</span>';

      const dateRange = getDateRange(banner);

      return `
        <div class="list-item">
          <div class="list-item-info" style="flex: 1;">
            <h4>${banner.titleRu || banner.titleKk || banner.titleEn || 'Без заголовка'}</h4>
            <p style="margin: 4px 0;">${banner.subtitleRu || banner.subtitleKk || banner.subtitleEn || ''}</p>
            <p style="margin: 4px 0; font-size: 12px; color: #888;">
              Ресторан: ${restaurantName} • ${actionText} • Приоритет: ${banner.priority} • ${statusBadge}
            </p>
            ${dateRange ? `<p style="margin: 4px 0; font-size: 12px; color: #666;">${dateRange}</p>` : ''}
          </div>
          <div class="list-item-actions">
            ${canEditBanner ? `
            <button class="btn-icon" onclick="editBanner('${banner.id}')" title="Редактировать">
              <i class="fas fa-edit"></i>
            </button>
            ` : ''}
            ${canDeleteBanner ? `
            <button class="btn-icon" onclick="deleteBanner('${banner.id}')" title="Удалить">
              <i class="fas fa-trash"></i>
            </button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('Failed to load banners:', error);
    Utils.showError('Не удалось загрузить баннеры');
    listContainer.innerHTML = '<div class="empty-state">Ошибка загрузки</div>';
  }
}

function getActionText(banner) {
  switch (banner.actionType) {
    case 'CATEGORY':
      const category = categories.find(c => c.id === banner.targetCategoryId);
      const categoryName = category 
        ? (category.name_ru || category.name_kk || category.name_en || 'Категория')
        : 'Категория';
      return `→ Категория: ${categoryName}`;
    case 'PRODUCT':
      const product = products.find(p => p.id === banner.targetProductId);
      const productName = product
        ? (product.name_ru || product.name_kk || product.name_en || 'Продукт')
        : 'Продукт';
      return `→ Продукт: ${productName}`;
    case 'URL':
      return `→ URL: ${banner.targetUrl || ''}`;
    case 'NONE':
    default:
      return 'Без действия';
  }
}

function getDateRange(banner) {
  const parts = [];
  if (banner.startsAt) {
    const start = new Date(banner.startsAt);
    parts.push(`Начало: ${start.toLocaleString('ru-RU')}`);
  }
  if (banner.endsAt) {
    const end = new Date(banner.endsAt);
    parts.push(`Конец: ${end.toLocaleString('ru-RU')}`);
  }
  return parts.length > 0 ? parts.join(' • ') : null;
}

async function loadBanner(id) {
  try {
    const response = await AdminAPI.getBanner(id);
    const banner = response.data?.data || response.data;
    
    currentBannerId = id;
    document.getElementById('banner-id').value = id;
    document.getElementById('banner-restaurant').value = banner.restaurantId || '';
    document.getElementById('banner-title-ru').value = banner.titleRu || '';
    document.getElementById('banner-title-kk').value = banner.titleKk || '';
    document.getElementById('banner-title-en').value = banner.titleEn || '';
    document.getElementById('banner-subtitle-ru').value = banner.subtitleRu || '';
    document.getElementById('banner-subtitle-kk').value = banner.subtitleKk || '';
    document.getElementById('banner-subtitle-en').value = banner.subtitleEn || '';
    document.getElementById('banner-action-type').value = banner.actionType || 'NONE';
    document.getElementById('banner-target-category').value = banner.targetCategoryId || '';
    document.getElementById('banner-target-product').value = banner.targetProductId || '';
    document.getElementById('banner-target-url').value = banner.targetUrl || '';
    document.getElementById('banner-priority').value = banner.priority || 100;
    document.getElementById('banner-is-active').value = banner.isActive ? 'true' : 'false';
    
    // Сначала очищаем поля дат, чтобы избежать остатков старых значений
    document.getElementById('banner-starts-at').value = '';
    document.getElementById('banner-ends-at').value = '';
    
    // Даты - форматируем в локальном времени для input datetime-local
    if (banner.startsAt) {
      const startsAt = new Date(banner.startsAt);
      // Используем локальное время, а не UTC
      const year = startsAt.getFullYear();
      const month = String(startsAt.getMonth() + 1).padStart(2, '0');
      const day = String(startsAt.getDate()).padStart(2, '0');
      const hours = String(startsAt.getHours()).padStart(2, '0');
      const minutes = String(startsAt.getMinutes()).padStart(2, '0');
      document.getElementById('banner-starts-at').value = `${year}-${month}-${day}T${hours}:${minutes}`;
    }
    
    if (banner.endsAt) {
      const endsAt = new Date(banner.endsAt);
      // Используем локальное время, а не UTC
      const year = endsAt.getFullYear();
      const month = String(endsAt.getMonth() + 1).padStart(2, '0');
      const day = String(endsAt.getDate()).padStart(2, '0');
      const hours = String(endsAt.getHours()).padStart(2, '0');
      const minutes = String(endsAt.getMinutes()).padStart(2, '0');
      document.getElementById('banner-ends-at').value = `${year}-${month}-${day}T${hours}:${minutes}`;
    }

    // Загружаем категории и продукты для выбранного ресторана
    if (banner.restaurantId) {
      await loadCategoriesForForm(banner.restaurantId);
      await loadProductsForForm(banner.restaurantId);
    }

    // Обновить поля действия
    updateActionFields(banner.actionType || 'NONE');

    // Показать текущее изображение
    if (banner.imageKey) {
      const imageUrl = `${CONFIG.API_BASE_URL}/public/banners/${id}/image`;
      const preview = document.getElementById('banner-image-preview');
      const previewImg = document.getElementById('banner-image-preview-img');
      previewImg.src = imageUrl;
      preview.style.display = 'block';
    }

    document.getElementById('banner-modal-title').textContent = 'Редактировать баннер';
  } catch (error) {
    console.error('Failed to load banner:', error);
    Utils.showError('Не удалось загрузить баннер');
  }
}

function openBannerModal() {
  currentBannerId = null;
  document.getElementById('banner-form').reset();
  document.getElementById('banner-id').value = '';
  document.getElementById('banner-priority').value = '100';
  document.getElementById('banner-is-active').value = 'true';
  document.getElementById('banner-action-type').value = 'NONE';
  document.getElementById('banner-image-preview').style.display = 'none';
  updateActionFields('NONE');
  document.getElementById('banner-modal-title').textContent = 'Добавить баннер';
  document.getElementById('banner-modal').classList.add('active');
}

async function saveBanner() {
  try {
    const actionType = document.getElementById('banner-action-type').value;
    const restaurantId = document.getElementById('banner-restaurant').value || null;
    
    // Для обновления нужно явно отправлять null для удаления дат, undefined - не обновлять
    const startsAtValue = document.getElementById('banner-starts-at').value;
    const endsAtValue = document.getElementById('banner-ends-at').value;
    
    const data = {
      restaurantId: restaurantId,
      titleRu: document.getElementById('banner-title-ru').value || undefined,
      titleKk: document.getElementById('banner-title-kk').value || undefined,
      titleEn: document.getElementById('banner-title-en').value || undefined,
      subtitleRu: document.getElementById('banner-subtitle-ru').value || undefined,
      subtitleKk: document.getElementById('banner-subtitle-kk').value || undefined,
      subtitleEn: document.getElementById('banner-subtitle-en').value || undefined,
      actionType: actionType,
      targetCategoryId: actionType === 'CATEGORY' ? document.getElementById('banner-target-category').value || undefined : undefined,
      targetProductId: actionType === 'PRODUCT' ? document.getElementById('banner-target-product').value || undefined : undefined,
      targetUrl: actionType === 'URL' ? document.getElementById('banner-target-url').value || undefined : undefined,
      // При редактировании: если поле пустое - отправляем null (удалить), если заполнено - дату
      // При создании: если пустое - undefined (необязательное поле)
      startsAt: currentBannerId 
        ? (startsAtValue ? new Date(startsAtValue).toISOString() : null)
        : (startsAtValue ? new Date(startsAtValue).toISOString() : undefined),
      endsAt: currentBannerId 
        ? (endsAtValue ? new Date(endsAtValue).toISOString() : null)
        : (endsAtValue ? new Date(endsAtValue).toISOString() : undefined),
      priority: parseInt(document.getElementById('banner-priority').value, 10) || 100,
      isActive: document.getElementById('banner-is-active').value === 'true',
    };

    let bannerId = currentBannerId;

    // Загружаем изображение, если выбрано
    const imageFile = document.getElementById('banner-image').files[0];
    if (imageFile) {
      if (currentBannerId) {
        // Обновление существующего баннера с новым изображением
        await AdminAPI.updateBanner(currentBannerId, data);
        await AdminAPI.uploadBannerImage(currentBannerId, imageFile);
        Utils.showSuccess('Баннер обновлен');
        bannerId = currentBannerId;
      } else {
        // Создание нового баннера - сначала создаем баннер с временным imageKey,
        // потом загружаем изображение, которое заменит временный ключ
        // Временный ключ нужен, так как image_key обязателен в схеме Prisma
        const tempImageKey = `temp-banner-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const tempData = { ...data, imageKey: tempImageKey };
        const response = await AdminAPI.createBanner(tempData);
        bannerId = response.data?.id || response.data?.data?.id;
        if (bannerId) {
          // Загружаем изображение, которое обновит imageKey
          await AdminAPI.uploadBannerImage(bannerId, imageFile);
        }
        Utils.showSuccess('Баннер создан');
      }
    } else {
      // Без нового изображения
      if (currentBannerId) {
        // Обновление существующего баннера без изменения изображения
        await AdminAPI.updateBanner(currentBannerId, data);
        Utils.showSuccess('Баннер обновлен');
        bannerId = currentBannerId;
      } else {
        // Для нового баннера изображение обязательно
        Utils.showError('Необходимо загрузить изображение баннера');
        return;
      }
    }

    closeBannerModal();
    await loadBanners(
      document.getElementById('restaurant-filter').value,
      document.getElementById('status-filter').value
    );
  } catch (error) {
    console.error('Failed to save banner:', error);
    Utils.showError(error.message || 'Не удалось сохранить баннер');
  }
}

function closeBannerModal() {
  document.getElementById('banner-modal').classList.remove('active');
}

async function editBanner(id) {
  await loadBanner(id);
  document.getElementById('banner-modal').classList.add('active');
}

async function deleteBanner(id) {
  if (!confirm('Вы уверены, что хотите удалить этот баннер?')) {
    return;
  }

  try {
    await AdminAPI.deleteBanner(id);
    Utils.showSuccess('Баннер удален');
    await loadBanners(
      document.getElementById('restaurant-filter').value,
      document.getElementById('status-filter').value
    );
  } catch (error) {
    console.error('Failed to delete banner:', error);
    Utils.showError('Не удалось удалить баннер');
  }
}


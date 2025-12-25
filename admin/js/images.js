/**
 * Логика страницы изображений
 */

let restaurants = [];
let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
  // Получаем текущего пользователя
  if (typeof Auth !== 'undefined') {
    currentUser = Auth.getAuthUser();
  }

  // Загружаем рестораны для фильтра
  await loadRestaurants();
  
  // Обработка фильтра
  document.getElementById('restaurant-filter').addEventListener('change', async (e) => {
    await loadImages(e.target.value);
  });

  await loadImages();
});

async function loadRestaurants() {
  try {
    const response = await AdminAPI.getRestaurants();
    restaurants = response.data?.data || response.data || [];
    
    // Заполняем фильтр
    const filter = document.getElementById('restaurant-filter');
    filter.innerHTML = '<option value="">Все рестораны</option>' + 
      restaurants.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
  } catch (error) {
    console.error('Failed to load restaurants:', error);
    Utils.showError('Не удалось загрузить рестораны');
  }
}

async function loadImages(restaurantId = null) {
  try {
    const container = document.getElementById('images-container');
    container.innerHTML = '<div class="loading">Загрузка...</div>';

    const response = await AdminAPI.getAllImages(restaurantId);
    const images = response.data?.data || response.data || [];
    
    if (images.length === 0) {
      container.innerHTML = '<div class="empty-state">Нет изображений. Добавьте изображения к продуктам.</div>';
      return;
    }

    container.innerHTML = `
      <div class="images-grid">
        ${images.map(image => {
          const imageUrl = `${CONFIG.API_BASE_URL}/products/${image.product.id}/images/${image.id}`;
          const productName = image.product.name?.ru || image.product.name?.kk || image.product.name?.en || 'Без названия';
          const restaurantName = image.product.restaurant?.name || 'Ресторан не найден';
          
          return `
            <div class="image-card">
              <img src="${imageUrl}" 
                   alt="${productName}" 
                   onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'250\' height=\'200\'%3E%3Crect fill=\'%23f0f0f0\' width=\'250\' height=\'200\'/%3E%3Ctext x=\'50%25\' y=\'50%25\' text-anchor=\'middle\' fill=\'%23999\' font-size=\'14\'%3EИзображение не найдено%3C/text%3E%3C/svg%3E'">
              <div class="image-card-info">
                <h4>${productName}</h4>
                <p><i class="fas fa-building"></i> ${restaurantName}</p>
                <p><i class="fas fa-sort-numeric-up"></i> Порядок: ${image.sortOrder || 0}</p>
                <p style="font-size: 11px; color: #999; margin-top: 4px;">
                  <i class="fas fa-key"></i> ${image.imageKey}
                </p>
                <div class="image-actions">
                  <button class="btn btn-secondary" onclick="viewImage('${image.product.id}', '${image.id}')" title="Открыть в новом окне">
                    <i class="fas fa-external-link-alt"></i>
                  </button>
                  <button class="btn btn-secondary" onclick="copyImageUrl('${imageUrl}')" title="Копировать URL">
                    <i class="fas fa-copy"></i>
                  </button>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
      <div style="margin-top: 20px; padding: 12px; background: #f5f5f5; border-radius: 4px; text-align: center; color: #666;">
        Всего изображений: ${images.length}
      </div>
    `;
  } catch (error) {
    console.error('Failed to load images:', error);
    const container = document.getElementById('images-container');
    container.innerHTML = '<div class="empty-state">Ошибка загрузки изображений</div>';
    Utils.showError('Не удалось загрузить изображения');
  }
}

function viewImage(productId, imageId) {
  const imageUrl = `${CONFIG.API_BASE_URL}/products/${productId}/images/${imageId}`;
  window.open(imageUrl, '_blank');
}

function copyImageUrl(url) {
  navigator.clipboard.writeText(url).then(() => {
    Utils.showSuccess('URL изображения скопирован в буфер обмена');
  }).catch(() => {
    Utils.showError('Не удалось скопировать URL');
  });
}

// Экспорт для использования в HTML
window.loadImages = loadImages;
window.viewImage = viewImage;
window.copyImageUrl = copyImageUrl;


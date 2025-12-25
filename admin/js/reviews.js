/**
 * Логика страницы модерации отзывов в админке
 */

let restaurants = [];
let reviews = [];
let currentReviewId = null;
let currentUser = null;

const STATUS_LABELS = {
  PENDING: { text: 'Ожидает модерации', color: '#f39c12', icon: '⏳' },
  APPROVED: { text: 'Одобрен', color: '#27ae60', icon: '✓' },
  REJECTED: { text: 'Отклонен', color: '#e74c3c', icon: '✗' },
};

document.addEventListener('DOMContentLoaded', async () => {
  try {
    currentUser = AdminAuth.getCurrentUser();
    if (!currentUser || !currentUser.role) {
      console.error('User not authenticated or missing role:', currentUser);
      window.location.href = 'login.html';
      return;
    }

    const userInfoElement = document.getElementById('user-info');
    if (userInfoElement) {
      userInfoElement.textContent = `${currentUser.username || currentUser.phone || 'Пользователь'}`;
    }

    await loadRestaurants();
    await loadReviews();
  } catch (error) {
    console.error('Failed to initialize reviews page:', error);
    const reviewsList = document.getElementById('reviews-list');
    if (reviewsList) {
      reviewsList.innerHTML = `<div class="error-state">Ошибка инициализации: ${error.message}</div>`;
    }
  }
});

/**
 * Загрузить список ресторанов
 */
async function loadRestaurants() {
  try {
    const response = await AdminAPI.getRestaurants();
    restaurants = response.data || [];
    
    const restaurantFilter = document.getElementById('restaurant-filter');
    if (!restaurantFilter) return;
    
    // Очистить опции кроме "Все рестораны"
    restaurantFilter.innerHTML = '<option value="">Все рестораны</option>';
    
    // Для ADMIN показываем все рестораны
    // Для OWNER показываем только свои рестораны
    // Для MANAGER показываем только свой ресторан
    let filteredRestaurants = restaurants;
    if (currentUser && currentUser.role === 'OWNER' && currentUser.ownerId) {
      filteredRestaurants = restaurants.filter(r => r.owner_id === currentUser.ownerId);
    } else if (currentUser && currentUser.role === 'MANAGER' && currentUser.restaurantId) {
      filteredRestaurants = restaurants.filter(r => r.id === currentUser.restaurantId);
    }
    // Для ADMIN filteredRestaurants уже содержит все рестораны
    
    filteredRestaurants.forEach(restaurant => {
      const option = document.createElement('option');
      option.value = restaurant.id;
      // Для ADMIN показываем название и город для удобства
      if (currentUser && currentUser.role === 'ADMIN') {
        option.textContent = restaurant.city ? `${restaurant.name}, ${restaurant.city}` : restaurant.name;
      } else {
        option.textContent = restaurant.name;
      }
      restaurantFilter.appendChild(option);
    });
  } catch (error) {
    console.error('Failed to load restaurants:', error);
  }
}

/**
 * Загрузить отзывы
 */
async function loadReviews() {
  const reviewsList = document.getElementById('reviews-list');
  if (!reviewsList) return;
  
  reviewsList.innerHTML = '<div class="loading">Загрузка отзывов...</div>';
  
  try {
    const statusFilter = document.getElementById('status-filter')?.value || '';
    const restaurantFilter = document.getElementById('restaurant-filter')?.value || '';
    
    const filters = {};
    if (statusFilter) {
      filters.status = statusFilter;
    }
    
    // Для ADMIN фильтр по ресторану работает напрямую - если выбран ресторан, фильтруем по нему
    // Для OWNER и MANAGER применяются ограничения
    if (currentUser && currentUser.role === 'ADMIN') {
      // ADMIN может фильтровать по любому ресторану или видеть все
      if (restaurantFilter) {
        filters.restaurantId = restaurantFilter;
      }
      // Если ресторан не выбран, показываем все отзывы всех ресторанов
    } else if (currentUser && currentUser.role === 'OWNER' && currentUser.ownerId) {
      // Для OWNER фильтруем только свои рестораны
      const ownerRestaurants = restaurants.filter(r => r.owner_id === currentUser.ownerId);
      if (ownerRestaurants.length > 0) {
        // Если выбран конкретный ресторан, используем его
        if (restaurantFilter) {
          filters.restaurantId = restaurantFilter;
        }
        // Если ресторан не выбран, показываем все отзывы всех ресторанов владельца
        // (бэкенд не будет фильтровать, так как restaurantId не передан)
      } else {
        reviewsList.innerHTML = '<div class="empty-state">У вас нет ресторанов</div>';
        return;
      }
    } else if (currentUser && currentUser.role === 'MANAGER' && currentUser.restaurantId) {
      // Для MANAGER всегда фильтруем только свой ресторан
      filters.restaurantId = currentUser.restaurantId;
    } else if (restaurantFilter) {
      // Для других ролей (если есть) применяем фильтр, если выбран
      filters.restaurantId = restaurantFilter;
    }
    
    const response = await AdminAPI.getReviews(filters);
    reviews = response.data || [];
    
    if (reviews.length === 0) {
      reviewsList.innerHTML = '<div class="empty-state">Нет отзывов</div>';
      return;
    }
    
    renderReviews(reviews);
  } catch (error) {
    console.error('Failed to load reviews:', error);
    reviewsList.innerHTML = `<div class="error-state">Ошибка загрузки: ${error.message}</div>`;
  }
}

/**
 * Отобразить отзывы
 */
function renderReviews(reviewsList) {
  const reviewsContainer = document.getElementById('reviews-list');
  if (!reviewsContainer) return;
  
  reviewsContainer.innerHTML = reviewsList.map(review => {
    const status = STATUS_LABELS[review.status] || STATUS_LABELS.PENDING;
    const stars = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating);
    const date = new Date(review.created_at).toLocaleDateString('ru-RU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    const userName = review.account?.name || review.account?.phone || 'Анонимный пользователь';
    const productName = review.product?.name_ru || review.product?.name_kk || review.product?.name_en || 'Неизвестное блюдо';
    const restaurantName = review.product?.restaurant?.name || review.order?.restaurant?.name || 'Неизвестный ресторан';
    const restaurantCity = review.product?.restaurant?.city || review.order?.restaurant?.city || '';
    
    return `
      <div class="list-item" style="padding: 16px; border: 1px solid #e0e0e0; border-radius: 8px; margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
          <div style="flex: 1;">
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
              <h4 style="margin: 0; font-size: 16px;">${escapeHtml(productName)}</h4>
              <span style="padding: 4px 8px; border-radius: 4px; font-size: 12px; background: ${status.color}20; color: ${status.color};">
                ${status.icon} ${status.text}
              </span>
            </div>
            <div style="color: #888; font-size: 13px; margin-bottom: 8px;">
              📍 ${escapeHtml(restaurantName)}${restaurantCity ? `, ${escapeHtml(restaurantCity)}` : ''}
            </div>
            <div style="color: #ffa500; font-size: 18px; margin-bottom: 8px;">${stars}</div>
            <div style="color: #666; font-size: 14px; margin-bottom: 8px;">
              <strong>${escapeHtml(userName)}</strong> • ${date}
            </div>
            ${review.comment ? `
              <div style="background: #f9f9f9; padding: 12px; border-radius: 4px; margin-bottom: 8px;">
                <p style="margin: 0; color: #333; line-height: 1.5;">${escapeHtml(review.comment)}</p>
              </div>
            ` : ''}
            ${review.moderation_comment ? `
              <div style="background: #fff3cd; padding: 8px; border-radius: 4px; margin-top: 8px; font-size: 12px; color: #856404;">
                <strong>Комментарий модератора:</strong> ${escapeHtml(review.moderation_comment)}
              </div>
            ` : ''}
          </div>
          <div style="display: flex; gap: 8px;">
            ${review.status === 'PENDING' ? `
              <button class="btn btn-primary" onclick="openModerateModal('${review.id}')" style="padding: 8px 16px;">
                Модерировать
              </button>
            ` : `
              <button class="btn btn-secondary" onclick="openModerateModal('${review.id}')" style="padding: 8px 16px;">
                Просмотр
              </button>
            `}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Открыть модальное окно модерации
 */
async function openModerateModal(reviewId) {
  currentReviewId = reviewId;
  const review = reviews.find(r => r.id === reviewId);
  if (!review) {
    try {
      const response = await AdminAPI.getReview(reviewId);
      const reviewDetails = document.getElementById('review-details');
      if (reviewDetails) {
        reviewDetails.innerHTML = renderReviewDetails(response.data);
      }
    } catch (error) {
      console.error('Failed to load review details:', error);
      Utils.showError('Не удалось загрузить детали отзыва');
      return;
    }
  } else {
    const reviewDetails = document.getElementById('review-details');
    if (reviewDetails) {
      reviewDetails.innerHTML = renderReviewDetails(review);
    }
  }
  
  const modal = document.getElementById('moderate-modal');
  if (modal) {
    modal.style.display = 'flex';
    document.getElementById('moderation-comment').value = '';
  }
}

/**
 * Отобразить детали отзыва
 */
function renderReviewDetails(review) {
  const status = STATUS_LABELS[review.status] || STATUS_LABELS.PENDING;
  const stars = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating);
  const date = new Date(review.created_at).toLocaleDateString('ru-RU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  const userName = review.account?.name || review.account?.phone || 'Анонимный пользователь';
  const productName = review.product?.name_ru || review.product?.name_kk || review.product?.name_en || 'Неизвестное блюдо';
  const restaurantName = review.product?.restaurant?.name || review.order?.restaurant?.name || 'Неизвестный ресторан';
  const restaurantCity = review.product?.restaurant?.city || review.order?.restaurant?.city || '';
  
  return `
    <div>
      <div style="margin-bottom: 16px;">
        <h4 style="margin: 0 0 8px 0;">${escapeHtml(productName)}</h4>
        <div style="color: #888; font-size: 13px; margin-bottom: 8px;">
          📍 ${escapeHtml(restaurantName)}${restaurantCity ? `, ${escapeHtml(restaurantCity)}` : ''}
        </div>
        <div style="color: #ffa500; font-size: 20px; margin-bottom: 8px;">${stars}</div>
        <div style="color: #666; font-size: 14px; margin-bottom: 12px;">
          <strong>${escapeHtml(userName)}</strong> • ${date}
        </div>
        <div style="padding: 4px 8px; border-radius: 4px; font-size: 12px; background: ${status.color}20; color: ${status.color}; display: inline-block;">
          ${status.icon} ${status.text}
        </div>
      </div>
      ${review.comment ? `
        <div style="background: #f9f9f9; padding: 12px; border-radius: 4px; margin-bottom: 12px;">
          <strong>Комментарий:</strong>
          <p style="margin: 8px 0 0 0; color: #333; line-height: 1.5;">${escapeHtml(review.comment)}</p>
        </div>
      ` : ''}
      ${review.moderation_comment ? `
        <div style="background: #fff3cd; padding: 12px; border-radius: 4px; margin-bottom: 12px; font-size: 14px; color: #856404;">
          <strong>Комментарий модератора:</strong>
          <p style="margin: 8px 0 0 0;">${escapeHtml(review.moderation_comment)}</p>
        </div>
      ` : ''}
      ${review.moderated_at ? `
        <div style="font-size: 12px; color: #888; margin-top: 8px;">
          Модерировано: ${new Date(review.moderated_at).toLocaleDateString('ru-RU')}
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Закрыть модальное окно
 */
function closeModerateModal() {
  const modal = document.getElementById('moderate-modal');
  if (modal) {
    modal.style.display = 'none';
  }
  currentReviewId = null;
}

/**
 * Модерировать отзыв
 */
async function moderateReview(status) {
  if (!currentReviewId) return;
  
  const moderationComment = document.getElementById('moderation-comment')?.value || '';
  
  try {
    await AdminAPI.moderateReview(currentReviewId, status, moderationComment);
    Utils.showSuccess(`Отзыв ${status === 'APPROVED' ? 'одобрен' : 'отклонен'}`);
    closeModerateModal();
    await loadReviews();
  } catch (error) {
    console.error('Failed to moderate review:', error);
    Utils.showError(error.message || 'Не удалось модерировать отзыв');
  }
}

/**
 * Экранировать HTML
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}


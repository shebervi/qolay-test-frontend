/**
 * Логика страницы профиля пользователя
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Проверяем авторизацию
  if (typeof Auth === 'undefined' || !Auth.isAuthenticated() || !Auth.isUser()) {
    window.location.href = 'user-login.html?redirect=' + encodeURIComponent(window.location.href);
    return;
  }

  const loadingIndicator = document.getElementById('loading');
  const errorMessage = document.getElementById('error-message');
  const profileContent = document.getElementById('profile-content');

  try {
    loadingIndicator.style.display = 'block';

    // Загружаем данные пользователя
    const user = Auth.getAuthUser();
    if (!user) {
      throw new Error('Данные пользователя не найдены');
    }

    // Отображаем информацию о пользователе
    renderProfileInfo(user);

    // Загружаем заказы, брони и отзывы
    await loadOrders();
    await loadReservations();
    await loadReviews();

    loadingIndicator.style.display = 'none';
    profileContent.style.display = 'block';
  } catch (error) {
    loadingIndicator.style.display = 'none';
    errorMessage.textContent = 'Ошибка загрузки профиля: ' + error.message;
    errorMessage.style.display = 'block';
    console.error('Failed to load profile:', error);
  }
});

/**
 * Отобразить информацию о пользователе
 */
function renderProfileInfo(user) {
  const profileInfo = document.getElementById('profile-info');
  profileInfo.innerHTML = `
    <div class="profile-info-item">
      <strong>Телефон:</strong>
      <span>${Utils.escapeHtml(user.phone || 'Не указан')}</span>
    </div>
    <div class="profile-info-item">
      <strong>Имя:</strong>
      <span>${Utils.escapeHtml(user.name || 'Не указано')}</span>
    </div>
    <div class="profile-info-item">
      <strong>Роль:</strong>
      <span>Пользователь</span>
    </div>
  `;
}

/**
 * Переключить вкладку
 */
function switchTab(tabName) {
  // Обновляем активную вкладку
  document.querySelectorAll('.profile-tab').forEach(tab => {
    tab.classList.remove('active');
    if (tab.dataset.tab === tabName) {
      tab.classList.add('active');
    }
  });

  // Показываем соответствующий контент
  document.getElementById('orders-tab').style.display = tabName === 'orders' ? 'block' : 'none';
  document.getElementById('reservations-tab').style.display = tabName === 'reservations' ? 'block' : 'none';
  document.getElementById('reviews-tab').style.display = tabName === 'reviews' ? 'block' : 'none';
}

/**
 * Загрузить заказы пользователя
 */
async function loadOrders() {
  const ordersList = document.getElementById('orders-list');
  
  try {
    const orders = await API.getUserOrders();
    
    if (!orders || orders.length === 0) {
      ordersList.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-shopping-bag"></i>
          <p>У вас пока нет заказов</p>
        </div>
      `;
      return;
    }

    ordersList.innerHTML = orders.map(order => renderOrderCard(order)).join('');
  } catch (error) {
    console.error('Failed to load orders:', error);
    ordersList.innerHTML = `
      <div class="error-message">
        Не удалось загрузить заказы: ${error.message}
      </div>
    `;
  }
}

/**
 * Отобразить карточку заказа
 */
function renderOrderCard(order) {
  const statusLabels = {
    'DRAFT': 'Черновик',
    'PAYMENT_PENDING': 'Ожидает оплаты',
    'PAID': 'Оплачен',
    'ACCEPTED': 'Принят',
    'COOKING': 'Готовится',
    'READY': 'Готов',
    'SERVED': 'Подано',
    'CLOSED': 'Закрыт',
    'CANCELED': 'Отменен',
    'REFUNDED': 'Возвращен',
  };

  const statusLabel = statusLabels[order.status] || order.status;
  const total = parseFloat(order.total_kzt || 0);
  const createdAt = new Date(order.created_at).toLocaleString('ru-RU');
  const restaurantName = order.restaurant?.name || 'Не указан';
  const tableNumber = order.table?.number || order.snapshot_table_number || 'Не указан';

  const itemsHtml = order.items && order.items.length > 0
    ? order.items.map(item => {
        const itemName = item.snapshot_name_ru || item.snapshot_name_kk || item.snapshot_name_en || 'Товар';
        const qty = item.qty || 1;
        const lineTotal = parseFloat(item.line_total_kzt || 0);
        return `
          <div class="order-item">
            <span>${qty}× ${Utils.escapeHtml(itemName)}</span>
            <span>${Utils.formatPrice(lineTotal)} ₸</span>
          </div>
        `;
      }).join('')
    : '<p style="color: #999;">Позиции не найдены</p>';

  return `
    <div class="order-card">
      <div class="order-header">
        <div class="order-number">Заказ №${order.order_number}</div>
        <span class="order-status ${order.status}">${statusLabel}</span>
      </div>
      <div class="order-details">
        <div><strong>Ресторан:</strong> ${Utils.escapeHtml(restaurantName)}</div>
        <div><strong>Стол:</strong> №${tableNumber}</div>
        <div><strong>Дата:</strong> ${createdAt}</div>
        <div><strong>Сумма:</strong> ${Utils.formatPrice(total)} ₸</div>
      </div>
      <div class="order-items">
        <strong style="display: block; margin-bottom: 8px;">Позиции:</strong>
        ${itemsHtml}
      </div>
      <div style="margin-top: 12px;">
        <a href="order-success.html?order=${order.id}" class="btn btn-secondary" style="padding: 8px 16px; font-size: 14px;">
          <i class="fas fa-eye"></i> Подробнее
        </a>
      </div>
    </div>
  `;
}

/**
 * Загрузить отзывы пользователя
 */
async function loadReviews() {
  const reviewsList = document.getElementById('reviews-list');
  
  try {
    const reviews = await API.getUserReviews();
    
    if (!reviews || reviews.length === 0) {
      reviewsList.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-star"></i>
          <p>У вас пока нет отзывов</p>
        </div>
      `;
      return;
    }

    reviewsList.innerHTML = reviews.map(review => renderReviewCard(review)).join('');
  } catch (error) {
    console.error('Failed to load reviews:', error);
    reviewsList.innerHTML = `
      <div class="error-message">
        Не удалось загрузить отзывы: ${error.message}
      </div>
    `;
  }
}

/**
 * Отобразить карточку отзыва
 */
function renderReviewCard(review) {
  const statusLabels = {
    'PENDING': 'На модерации',
    'APPROVED': 'Одобрен',
    'REJECTED': 'Отклонен',
  };

  const statusLabel = statusLabels[review.status] || review.status;
  const productName = review.product?.name_ru || review.product?.name_kk || review.product?.name_en || 'Блюдо';
  const createdAt = new Date(review.created_at).toLocaleString('ru-RU');
  const orderNumber = review.order?.order_number || 'N/A';

  // Рейтинг звездами
  const starsHtml = Array.from({ length: 5 }, (_, i) => {
    const isFilled = i < review.rating;
    return `<span class="star ${isFilled ? '' : 'empty'}">${isFilled ? '★' : '☆'}</span>`;
  }).join('');

  return `
    <div class="review-card">
      <div class="review-header">
        <div>
          <strong>${Utils.escapeHtml(productName)}</strong>
          <div style="font-size: 12px; color: #999; margin-top: 4px;">
            Заказ №${orderNumber} • ${createdAt}
          </div>
        </div>
        <span class="review-status ${review.status}">${statusLabel}</span>
      </div>
      <div class="review-rating">
        ${starsHtml}
      </div>
      ${review.comment ? `
        <div class="review-comment">
          ${Utils.escapeHtml(review.comment)}
        </div>
      ` : ''}
      ${review.moderation_comment ? `
        <div style="margin-top: 8px; padding: 8px; background: #fff3cd; border-radius: 4px; font-size: 12px; color: #856404;">
          <strong>Комментарий модератора:</strong> ${Utils.escapeHtml(review.moderation_comment)}
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Загрузить брони пользователя
 */
async function loadReservations() {
  const reservationsList = document.getElementById('reservations-list');
  
  try {
    const reservations = await API.getMyReservations();
    
    if (!reservations || reservations.length === 0) {
      reservationsList.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-calendar-check"></i>
          <p>У вас пока нет броней</p>
          <a href="restaurants.html" class="btn btn-primary" style="margin-top: 16px; padding: 12px 24px;">
            <i class="fas fa-search"></i> Найти ресторан
          </a>
        </div>
      `;
      return;
    }

    reservationsList.innerHTML = reservations.map(reservation => renderReservationCard(reservation)).join('');
  } catch (error) {
    console.error('Failed to load reservations:', error);
    reservationsList.innerHTML = `
      <div class="error-message">
        Не удалось загрузить брони: ${error.message}
      </div>
    `;
  }
}

/**
 * Отобразить карточку брони
 */
function renderReservationCard(reservation) {
  const statusLabels = {
    'PENDING': 'Ожидает подтверждения',
    'CONFIRMED': 'Подтверждена',
    'CANCELLED': 'Отменена',
    'COMPLETED': 'Завершена',
  };

  const statusLabel = statusLabels[reservation.status] || reservation.status;
  const restaurantName = reservation.restaurant?.name || 'Не указан';
  const tableNumber = reservation.table?.number || 'Не указан';
  const reservationDate = new Date(reservation.reservation_date).toLocaleString('ru-RU');
  const guestsCount = reservation.guests_count || 1;
  const createdAt = new Date(reservation.created_at).toLocaleString('ru-RU');

  // Показываем кнопку отмены только для активных броней
  const canCancel = reservation.status === 'PENDING' || reservation.status === 'CONFIRMED';

  const cancelButton = canCancel ? `
    <div class="reservation-actions">
      <button class="btn-cancel" onclick="handleCancelReservation('${reservation.id}')">
        <i class="fas fa-times"></i> Отменить бронь
      </button>
    </div>
  ` : '';

  const cancelInfo = reservation.cancelled_at ? `
    <div style="margin-top: 8px; padding: 8px; background: #f8d7da; border-radius: 4px; font-size: 12px; color: #721c24;">
      <strong>Отменено:</strong> ${new Date(reservation.cancelled_at).toLocaleString('ru-RU')}
      ${reservation.cancelled_reason ? `<br/><strong>Причина:</strong> ${Utils.escapeHtml(reservation.cancelled_reason)}` : ''}
    </div>
  ` : '';

  const completedInfo = reservation.completed_at ? `
    <div style="margin-top: 8px; padding: 8px; background: #d1ecf1; border-radius: 4px; font-size: 12px; color: #0c5460;">
      <strong>Завершено:</strong> ${new Date(reservation.completed_at).toLocaleString('ru-RU')}
    </div>
  ` : '';

  return `
    <div class="reservation-card">
      <div class="order-header">
        <div>
          <div style="font-size: 18px; font-weight: 600; color: var(--primary-color, #ff6b35);">
            <i class="fas fa-calendar-check"></i> Бронь стола №${tableNumber}
          </div>
          <div style="font-size: 12px; color: #999; margin-top: 4px;">
            Создано: ${createdAt}
          </div>
        </div>
        <span class="order-status reservation-status ${reservation.status}">${statusLabel}</span>
      </div>
      <div class="order-details">
        <div><strong>Ресторан:</strong> ${Utils.escapeHtml(restaurantName)}</div>
        <div><strong>Стол:</strong> №${tableNumber}</div>
        <div><strong>Дата и время:</strong> ${reservationDate}</div>
        <div><strong>Количество гостей:</strong> ${guestsCount}</div>
        ${reservation.comment ? `<div><strong>Комментарий:</strong> ${Utils.escapeHtml(reservation.comment)}</div>` : ''}
      </div>
      ${cancelInfo}
      ${completedInfo}
      ${cancelButton}
    </div>
  `;
}

/**
 * Обработать отмену брони
 */
async function handleCancelReservation(reservationId) {
  if (!confirm('Вы уверены, что хотите отменить эту бронь?')) {
    return;
  }

  const reason = prompt('Укажите причину отмены (необязательно):');

  try {
    await API.cancelReservation(reservationId, reason);
    Utils.showSuccess('Бронь успешно отменена');
    
    // Перезагружаем брони
    await loadReservations();
  } catch (error) {
    console.error('Failed to cancel reservation:', error);
    Utils.showError('Не удалось отменить бронь: ' + error.message);
  }
}

// Экспорт функций для использования в HTML
window.switchTab = switchTab;
window.handleCancelReservation = handleCancelReservation;


/**
 * API клиент для работы с бэкендом
 * 
 * Зачем:
 * - Единая точка для всех API запросов
 * - Обработка ошибок в одном месте
 * - Форматирование ответов
 */

/**
 * Выполнить HTTP запрос
 */
async function apiRequest(endpoint, options = {}) {
  const url = `${CONFIG.API_BASE_URL}${endpoint}`;
  
  const defaultOptions = {
    headers: {},
  };

  // Добавляем Content-Type только если есть body
  if (options.body) {
    defaultOptions.headers['Content-Type'] = 'application/json';
  }

  // Добавляем токен авторизации если он есть (только если Auth доступен)
  // Для публичных страниц Auth может быть не определен, это нормально
  let token = null;
  if (typeof Auth !== 'undefined' && Auth && typeof Auth.getAuthToken === 'function') {
    token = Auth.getAuthToken();
  }
  if (token) {
    defaultOptions.headers['Authorization'] = `Bearer ${token}`;
  }

  const config = {
    ...defaultOptions,
    ...options,
    headers: {
      ...defaultOptions.headers,
      ...(options.headers || {}),
    },
  };

  try {
    const response = await fetch(url, config);
    const data = await response.json();

    if (!response.ok) {
      // Если 401 (Unauthorized), перенаправляем на страницу входа
      if (response.status === 401) {
        if (typeof Auth !== 'undefined') {
          Auth.clearAuth();
          Auth.redirectToLogin();
        }
        throw new Error('Сессия истекла. Пожалуйста, войдите снова.');
      }
      throw new Error(data.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    return data;
  } catch (error) {
    console.error('API request failed:', error);
    throw error;
  }
}

/**
 * Создать корзину
 * @param {string} tableToken - QR токен стола
 * @returns {Promise<{sessionId: string, cart: object}>}
 */
async function createCart(tableToken) {
  const response = await apiRequest('/public/cart', {
    method: 'POST',
    body: JSON.stringify({ tableToken }),
  });
  
  return response.data;
}

/**
 * Установить количество гостей
 * @param {string} sessionId - ID сессии корзины
 * @param {number} guests - Количество гостей
 * @returns {Promise<object>}
 */
async function setGuests(sessionId, guests) {
  const response = await apiRequest(`/public/cart/${sessionId}/guests`, {
    method: 'POST',
    body: JSON.stringify({ guests }),
  });
  
  return response.data;
}

/**
 * Получить меню по QR токену стола
 * @param {string} tableToken - QR токен стола
 * @returns {Promise<object>}
 */
async function getMenu(tableToken) {
  // Проверяем, было ли уже сканирование этого QR за последний час
  const now = new Date();
  const currentHour = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}`;
  const scanKey = `qr_scan_${tableToken}_${currentHour}`;
  const hasScannedThisHour = localStorage.getItem(scanKey) === 'true';
  
  // Отправляем параметр isFirstScan только если это первое сканирование за этот час
  const params = new URLSearchParams({
    table: tableToken,
  });
  
  if (!hasScannedThisHour) {
    params.append('isFirstScan', 'true');
  }
  
  const response = await apiRequest(`/public/menu?${params.toString()}`);
  
  // Если это было первое сканирование, сохраняем в localStorage
  if (!hasScannedThisHour && response.data) {
    localStorage.setItem(scanKey, 'true');
    // Удаляем старые записи (старше 2 часов для безопасности)
    cleanupOldScanRecords(tableToken);
  }
  
  return response.data;
}

/**
 * Очистка старых записей о сканированиях из localStorage
 * @param {string} tableToken - QR токен стола
 */
function cleanupOldScanRecords(tableToken) {
  const now = new Date();
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  
  // Удаляем записи старше 2 часов
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(`qr_scan_${tableToken}_`)) {
      // Извлекаем дату и час из ключа
      const match = key.match(/qr_scan_.+_(\d{4}-\d{2}-\d{2}_\d{2})/);
      if (match) {
        const [year, month, day, hour] = match[1].split(/[-_]/);
        const recordDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour));
        
        if (recordDate < twoHoursAgo) {
          localStorage.removeItem(key);
        }
      }
    }
  }
}

/**
 * Получить корзину
 * @param {string} sessionId - ID сессии корзины
 * @returns {Promise<object>}
 */
async function getCart(sessionId) {
  const response = await apiRequest(`/public/cart/${sessionId}`);
  return response.data;
}

/**
 * Добавить товар в корзину
 * @param {string} sessionId - ID сессии корзины
 * @param {string} productId - ID продукта
 * @param {number} quantity - Количество
 * @param {Array} modifiers - Выбранные модификаторы [{groupId: string, optionIds: string[]}]
 * @param {string} productVariantId - ID варианта продукта (опционально)
 * @returns {Promise<object>}
 */
async function addToCart(
  sessionId,
  productId,
  quantity = 1,
  modifiers = [],
  productVariantId,
) {
  const response = await apiRequest(`/public/cart/${sessionId}/items`, {
    method: 'POST',
    body: JSON.stringify({ 
      productId, 
      productVariantId,
      quantity,
      modifiers: modifiers.length > 0 ? modifiers : undefined,
    }),
  });
  
  return response.data;
}

/**
 * Обновить количество товара в корзине
 * @param {string} sessionId - ID сессии корзины
 * @param {string} itemId - ID элемента корзины
 * @param {number} quantity - Новое количество
 * @returns {Promise<object>}
 */
async function updateCartItem(sessionId, itemId, quantity) {
  const response = await apiRequest(`/public/cart/${sessionId}/items/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify({ quantity }),
  });
  
  return response.data;
}

/**
 * Удалить товар из корзины
 * @param {string} sessionId - ID сессии корзины
 * @param {string} itemId - ID элемента корзины
 * @returns {Promise<object>}
 */
async function removeCartItem(sessionId, itemId) {
  const response = await apiRequest(`/public/cart/${sessionId}/items/${itemId}`, {
    method: 'DELETE',
  });
  
  return response.data;
}

/**
 * Получить список всех ресторанов (публичный доступ без QR)
 * @returns {Promise<Array>}
 */
async function getAllRestaurants() {
  const response = await apiRequest('/public/restaurants');
  return response.data;
}

/**
 * Получить меню ресторана по ID (публичный доступ без QR)
 * @param {string} restaurantId - ID ресторана
 * @returns {Promise<object>}
 */
async function getRestaurantMenu(restaurantId) {
  const response = await apiRequest(`/public/restaurants/${restaurantId}/menu`);
  return response.data;
}

async function getRestaurantSocialLinks(restaurantId) {
  const response = await apiRequest(`/public/restaurants/${restaurantId}/social-links`);
  return response.data;
}

function getSocialIconUrl(iconKey) {
  if (!iconKey) return null;
  // URL-кодируем iconKey, чтобы правильно обработать пути с слешами (например, default/instagram.svg)
  const encodedIconKey = encodeURIComponent(iconKey).replace(/%2F/g, '/');
  return `${CONFIG.API_BASE_URL}/admin/social-links/icons/${encodedIconKey}`;
}

/**
 * Получить активные баннеры ресторана с полными данными (публичный доступ)
 * @param {string} restaurantId - ID ресторана
 * @returns {Promise<Array>}
 */
async function getBanners(restaurantId) {
  const response = await apiRequest(`/public/banners?restaurantId=${encodeURIComponent(restaurantId)}`);
  return response.data;
}

/**
 * Создать заказ из корзины
 * @param {string} sessionId - ID сессии корзины
 * @param {string} guestName - Имя гостя
 * @param {string} paymentMethod - Способ оплаты (CASH, CARD, QR, ONLINE)
 * @param {string} note - Заметка к заказу (опционально)
 * @returns {Promise<object>}
 */
async function createOrder(sessionId, guestName, paymentMethod, note) {
  const response = await apiRequest('/public/orders', {
    method: 'POST',
    body: JSON.stringify({
      sessionId,
      guestName,
      paymentMethod,
      note: note || undefined,
    }),
  });
  
  return response.data;
}

/**
 * Получить заказ по ID
 * @param {string} orderId - ID заказа
 * @returns {Promise<object>}
 */
async function getOrder(orderId) {
  const response = await apiRequest(`/public/orders/${orderId}`);
  return response.data;
}

/**
 * Получить публичные отзывы на продукт
 * @param {string} productId - ID продукта
 * @returns {Promise<Array>}
 */
async function getProductReviews(productId) {
  const response = await apiRequest(`/public/products/${productId}/reviews`);
  return response.data;
}

/**
 * Привязать заказ к аккаунту
 * Привязка происходит автоматически на бэкенде при авторизации для недавних заказов.
 * Этот метод используется для ручной привязки, если автоматическая не сработала.
 * @param {string} orderId - ID заказа
 * @param {string|null} claimToken - Токен для привязки заказа (опционально, обычно не требуется - заказ привязывается автоматически)
 * @returns {Promise<object>}
 */
async function claimOrder(orderId, claimToken) {
  const body = claimToken 
    ? JSON.stringify({ claim_token: claimToken })
    : JSON.stringify({});
  const response = await apiRequest(`/public/orders/${orderId}/claim`, {
    method: 'POST',
    body: body,
  });
  return response.data;
}

/**
 * Создать отзыв на блюдо
 * @param {string} orderId - ID заказа
 * @param {string} orderItemId - ID элемента заказа
 * @param {string} productId - ID продукта
 * @param {number} rating - Оценка от 1 до 5
 * @param {string} comment - Комментарий (опционально)
 * @returns {Promise<object>}
 */
async function createReview(orderId, orderItemId, productId, rating, comment) {
  const body = {
    order_id: orderId,
    order_item_id: orderItemId,
    rating,
    comment: comment || undefined,
  };
  
  // product_id опциональный - может быть null, если продукт был удален
  if (productId) {
    body.product_id = productId;
  }
  
  const response = await apiRequest('/reviews', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return response.data;
}

/**
 * Получить заказы пользователя
 * @param {object} filters - Фильтры (status, dateFrom, dateTo и т.д.)
 * @returns {Promise<Array>}
 */
async function getUserOrders(filters = {}) {
  let url = '/public/orders';
  const params = [];
  if (filters.status) {
    if (Array.isArray(filters.status)) {
      filters.status.forEach(s => params.push(`status=${encodeURIComponent(s)}`));
    } else {
      params.push(`status=${encodeURIComponent(filters.status)}`);
    }
  }
  if (filters.dateFrom) params.push(`dateFrom=${encodeURIComponent(filters.dateFrom)}`);
  if (filters.dateTo) params.push(`dateTo=${encodeURIComponent(filters.dateTo)}`);
  if (params.length > 0) url += '?' + params.join('&');
  const response = await apiRequest(url);
  return response.data;
}

/**
 * Получить отзывы пользователя
 * @param {object} filters - Фильтры (status и т.д.)
 * @returns {Promise<Array>}
 */
async function getUserReviews(filters = {}) {
  let url = '/reviews';
  const params = [];
  if (filters.status) {
    if (Array.isArray(filters.status)) {
      filters.status.forEach(s => params.push(`status=${encodeURIComponent(s)}`));
    } else {
      params.push(`status=${encodeURIComponent(filters.status)}`);
    }
  }
  if (params.length > 0) url += '?' + params.join('&');
  const response = await apiRequest(url);
  return response.data;
}

// Экспорт функций
if (typeof window !== 'undefined') {
  window.API = {
    createCart,
    setGuests,
    getMenu,
    getCart,
    addToCart,
    updateCartItem,
    removeCartItem,
    getAllRestaurants,
    getRestaurantMenu,
  getRestaurantSocialLinks,
  getSocialIconUrl,
    getBanners,
    createOrder,
    getOrder,
    getProductReviews,
    claimOrder,
    createReview,
    getUserOrders,
    getUserReviews,
    // Reservations
    createReservation,
    getMyReservations,
    cancelReservation,
    getTableAvailability,
  };
}

/**
 * Создать бронь
 * @param {object} data - Данные брони
 * @returns {Promise<object>}
 */
async function createReservation(data) {
  const response = await apiRequest('/public/reservations', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  
  return response.data;
}

/**
 * Получить свои брони
 * @returns {Promise<Array>}
 */
async function getMyReservations() {
  const response = await apiRequest('/public/reservations/my', {
    method: 'GET',
  });
  
  return response.data;
}

/**
 * Отменить бронь
 * @param {string} id - ID брони
 * @param {string} reason - Причина отмены (опционально)
 * @returns {Promise<object>}
 */
async function cancelReservation(id, reason = null) {
  const body = {};
  if (reason) {
    body.reason = reason;
  }
  
  const response = await apiRequest(`/public/reservations/${id}/cancel`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  
  return response.data;
}

/**
 * Получить доступность столов
 * @param {string} restaurantId - ID ресторана
 * @param {string} date - Дата (ISO строка, опционально)
 * @returns {Promise<Array>}
 */
async function getTableAvailability(restaurantId, date = null) {
  let endpoint = `/public/reservations/tables/${restaurantId}/availability`;
  if (date) {
    endpoint += `?date=${encodeURIComponent(date)}`;
  }
  
  const response = await apiRequest(endpoint, {
    method: 'GET',
  });
  
  return response.data;
}

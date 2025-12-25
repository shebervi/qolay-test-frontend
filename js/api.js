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
  const response = await apiRequest(`/public/menu?table=${encodeURIComponent(tableToken)}`);
  return response.data;
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
 * @returns {Promise<object>}
 */
async function addToCart(sessionId, productId, quantity = 1, modifiers = []) {
  const response = await apiRequest(`/public/cart/${sessionId}/items`, {
    method: 'POST',
    body: JSON.stringify({ 
      productId, 
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
 * @param {string} orderId - ID заказа
 * @param {string} claimToken - Токен для привязки заказа (опционально, если не указан, заказ будет привязан автоматически)
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
  const response = await apiRequest('/reviews', {
    method: 'POST',
    body: JSON.stringify({
      order_id: orderId,
      order_item_id: orderItemId,
      product_id: productId,
      rating,
      comment: comment || undefined,
    }),
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
    createOrder,
    getOrder,
    getProductReviews,
    claimOrder,
    createReview,
    getUserOrders,
    getUserReviews,
  };
}


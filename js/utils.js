/**
 * Утилиты для навигации и работы с localStorage
 * 
 * Зачем:
 * - Централизованная работа с состоянием приложения
 * - Упрощение навигации между страницами
 * - Работа с URL параметрами
 */

/**
 * Получить QR токен из URL параметра
 * @returns {string|null}
 */
function getTableToken() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('table');
}

/**
 * Сохранить сессию в localStorage
 * @param {string} sessionId - ID сессии корзины
 * @param {string} tableToken - QR токен стола
 */
function saveSession(sessionId, tableToken) {
  localStorage.setItem(CONFIG.STORAGE_KEYS.SESSION_ID, sessionId);
  localStorage.setItem(CONFIG.STORAGE_KEYS.TABLE_TOKEN, tableToken);
}

/**
 * Получить sessionId из localStorage
 * @returns {string|null}
 */
function getSession() {
  return localStorage.getItem(CONFIG.STORAGE_KEYS.SESSION_ID);
}

/**
 * Получить tableToken из localStorage
 * @returns {string|null}
 */
function getTableTokenFromStorage() {
  return localStorage.getItem(CONFIG.STORAGE_KEYS.TABLE_TOKEN);
}

/**
 * Сохранить информацию о столе и ресторане
 * @param {object} tableInfo - Информация о столе
 * @param {object} restaurantInfo - Информация о ресторане
 */
function saveTableInfo(tableInfo, restaurantInfo) {
  if (tableInfo?.number) {
    localStorage.setItem(CONFIG.STORAGE_KEYS.TABLE_NUMBER, tableInfo.number.toString());
  }
  if (restaurantInfo?.name) {
    localStorage.setItem(CONFIG.STORAGE_KEYS.RESTAURANT_NAME, restaurantInfo.name);
  }
}

/**
 * Получить номер стола из localStorage
 * @returns {string|null}
 */
function getTableNumber() {
  return localStorage.getItem(CONFIG.STORAGE_KEYS.TABLE_NUMBER);
}

/**
 * Переход на экран меню
 */
function navigateToMenu() {
  window.location.href = 'menu.html';
}

/**
 * Переход на детальную страницу продукта
 * @param {string} productId - ID продукта
 */
function navigateToProduct(productId) {
  window.location.href = `product-detail.html?product=${productId}`;
}

/**
 * Переход на экран выбора гостей
 * @param {string} tableToken - QR токен стола (опционально)
 */
function navigateToGuests(tableToken = null) {
  if (tableToken) {
    window.location.href = `guests.html?table=${tableToken}`;
  } else {
    window.location.href = 'guests.html';
  }
}

/**
 * Переход на экран оформления заказа
 */
function navigateToCheckout() {
  window.location.href = 'checkout.html';
}

/**
 * Переход на страницу успешного заказа
 * @param {string} orderId - ID заказа
 */
function navigateToOrderSuccess(orderId) {
  window.location.href = `order-success.html?order=${orderId}`;
}

/**
 * Показать сообщение об ошибке
 * @param {string} message - Текст ошибки
 */
function showError(message) {
  alert(`Ошибка: ${message}`);
}

/**
 * Показать сообщение об успехе
 * @param {string} message - Текст сообщения
 */
function showSuccess(message) {
  // Простой alert для MVP, можно заменить на toast notification
  alert(`✅ ${message}`);
}

/**
 * Форматировать цену
 * @param {string|number} price - Цена
 * @returns {string}
 */
function formatPrice(price) {
  const numPrice = typeof price === 'string' ? parseFloat(price) : price;
  return new Intl.NumberFormat('ru-RU').format(numPrice);
}

/**
 * Получить название продукта на русском языке
 * @param {object} name - Объект с названиями (ru, kk, en)
 * @returns {string}
 */
function getProductName(name) {
  if (typeof name === 'string') return name;
  return name?.ru || name?.kk || name?.en || 'Без названия';
}

/**
 * Получить описание продукта на русском языке
 * @param {object} description - Объект с описаниями (ru, kk, en)
 * @returns {string}
 */
function getProductDescription(description) {
  if (!description) return '';
  if (typeof description === 'string') return description;
  return description?.ru || description?.kk || description?.en || '';
}

/**
 * Получить URL изображения продукта
 * @param {string|string[]|object[]} imageData - Ключ изображения, массив ключей или массив объектов images
 * @param {string} productId - ID продукта (опционально, используется для получения изображения через API)
 * @param {number} index - Индекс изображения в массиве (по умолчанию 0 - первое изображение)
 * @returns {string}
 */
function getProductImageUrl(imageData, productId = null, index = 0) {
  const fallbackImage = 'https://openlab.citytech.cuny.edu/chenry-eportfolio/wp-content/themes/koji/assets/images/default-fallback-image.png';
  
  if (!productId) {
    return fallbackImage;
  }
  
  // Если передан массив объектов images с id
  if (Array.isArray(imageData) && imageData.length > 0) {
    const imageItem = imageData[index] || imageData[0];
    
    // Если это объект с id (из images массива)
    if (imageItem && typeof imageItem === 'object' && imageItem.id) {
      return `${CONFIG.API_BASE_URL}/products/${productId}/images/${imageItem.id}`;
    }
    
    // Если это просто строка (imageKey)
    if (imageItem && typeof imageItem === 'string') {
      // Для первого изображения используем /image, для остальных нужен id
      if (index === 0) {
        return `${CONFIG.API_BASE_URL}/products/${productId}/image`;
      }
      // Для остальных без id используем первое изображение (fallback)
      return `${CONFIG.API_BASE_URL}/products/${productId}/image`;
    }
  }
  
  // Если передана строка imageKey
  if (imageData && typeof imageData === 'string') {
    return `${CONFIG.API_BASE_URL}/products/${productId}/image`;
  }
  
  return fallbackImage;
}

/**
 * Экранировать HTML для безопасности
 * @param {string} text - Текст для экранирования
 * @returns {string}
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Обновить счетчик корзины в header
 */
async function updateCartBadge() {
  const cartCountElement = document.getElementById('cart-count');
  if (!cartCountElement) return;

  const sessionId = getSession();
  if (!sessionId) {
    cartCountElement.style.display = 'none';
    return;
  }

  try {
    const cart = await API.getCart(sessionId);
    const totalItems = cart?.items?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;
    
    if (totalItems > 0) {
      cartCountElement.textContent = totalItems > 99 ? '99+' : totalItems.toString();
      cartCountElement.style.display = 'flex';
    } else {
      cartCountElement.style.display = 'none';
    }
  } catch (error) {
    console.error('Failed to update cart badge:', error);
    cartCountElement.style.display = 'none';
  }
}

// Экспорт функций
if (typeof window !== 'undefined') {
  window.Utils = {
    getTableToken,
    saveSession,
    getSession,
    getTableTokenFromStorage,
    saveTableInfo,
    getTableNumber,
    navigateToMenu,
    navigateToProduct,
    navigateToGuests,
    navigateToCheckout,
    navigateToOrderSuccess,
    showError,
    showSuccess,
    formatPrice,
    getProductName,
    getProductDescription,
    getProductImageUrl,
    escapeHtml,
    updateCartBadge,
  };
}


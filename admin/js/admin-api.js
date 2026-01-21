/**
 * API клиент для админ панели
 * 
 * Зачем:
 * - Отдельные методы для админских операций
 * - Упрощение работы с API
 */

/**
 * Рестораны
 */
async function adminGetRestaurants() {
  return apiRequest('/admin/restaurants');
}

async function adminGetRestaurant(id) {
  return apiRequest(`/admin/restaurants/${id}`);
}

async function adminCreateRestaurant(data) {
  return apiRequest('/admin/restaurants', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

async function adminUpdateRestaurant(id, data) {
  return apiRequest(`/admin/restaurants/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

async function adminUploadRestaurantLogo(id, file) {
  const formData = new FormData();
  formData.append('file', file);
  
  const headers = {};
  const token = Auth?.getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  return fetch(`${CONFIG.API_BASE_URL}/admin/restaurants/${id}/logo`, {
    method: 'POST',
    headers,
    body: formData,
  }).then(async (response) => {
    if (response.status === 401) {
      if (typeof Auth !== 'undefined') {
        Auth.clearAuth();
        Auth.redirectToLogin();
      }
      throw new Error('Сессия истекла. Пожалуйста, войдите снова.');
    }
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to upload logo' }));
      throw new Error(error.message || 'Failed to upload logo');
    }
    return response.json();
  });
}

async function adminDeleteRestaurant(id) {
  return apiRequest(`/admin/restaurants/${id}`, {
    method: 'DELETE',
  });
}

/**
 * Столы
 */
async function adminGetTables(restaurantId) {
  const url = restaurantId 
    ? `/admin/tables?restaurantId=${restaurantId}`
    : '/admin/tables';
  return apiRequest(url);
}

async function adminGetTable(id) {
  return apiRequest(`/admin/tables/${id}`);
}

async function adminCreateTable(data) {
  return apiRequest('/admin/tables', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

async function adminUpdateTable(id, data) {
  return apiRequest(`/admin/tables/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

async function adminDeleteTable(id) {
  return apiRequest(`/admin/tables/${id}`, {
    method: 'DELETE',
  });
}

async function adminDownloadQR(id, format = 'png') {
  const headers = {};
  const token = Auth?.getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const validFormats = ['png', 'svg', 'pdf'];
  const qrFormat = validFormats.includes(format?.toLowerCase()) 
    ? format.toLowerCase() 
    : 'png';
  
  const response = await fetch(`${CONFIG.API_BASE_URL}/admin/tables/${id}/qr?format=${qrFormat}`, {
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
    throw new Error('Failed to download QR code');
  }
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  
  const filenameMap = {
    png: `table-${id}-qr.png`,
    svg: `table-${id}-qr.svg`,
    pdf: `table-${id}-qr.pdf`,
  };
  a.download = filenameMap[qrFormat] || `table-${id}-qr.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

async function adminDownloadAllQR(restaurantId) {
  const headers = {};
  const token = Auth?.getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const url = restaurantId 
    ? `${CONFIG.API_BASE_URL}/admin/tables/all/qr-pdf?restaurantId=${restaurantId}`
    : `${CONFIG.API_BASE_URL}/admin/tables/all/qr-pdf`;
  
  const response = await fetch(url, {
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
    throw new Error('Failed to download all QR codes');
  }
  const blob = await response.blob();
  const urlObj = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = urlObj;
  a.download = 'all-tables-qr.pdf';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(urlObj);
}

async function adminRotateQRToken(id) {
  return apiRequest(`/admin/tables/${id}/rotate-token`, {
    method: 'POST',
    body: JSON.stringify({}), // Пустое тело для POST без данных
  });
}

async function adminUpdateTableStatus(id, status) {
  return apiRequest(`/admin/tables/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

/**
 * Категории
 */
async function adminGetCategories(restaurantId) {
  // Используем максимальный limit (100) согласно валидации
  const url = restaurantId 
    ? `/categories?restaurantId=${restaurantId}&page=1&limit=100`
    : '/categories?page=1&limit=100';
  const response = await apiRequest(url);
  return response;
}

async function adminGetCategory(id) {
  return apiRequest(`/categories/${id}`);
}

async function adminCreateCategory(data) {
  return apiRequest('/categories', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

async function adminUpdateCategory(id, data) {
  return apiRequest(`/categories/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

async function adminDeleteCategory(id) {
  return apiRequest(`/categories/${id}`, {
    method: 'DELETE',
  });
}

/**
 * Продукты
 */
async function adminGetProducts(restaurantId, categoryId) {
  // Используем максимальный limit (100) согласно валидации
  let url = '/products?page=1&limit=100';
  const params = [];
  if (restaurantId) params.push(`restaurantId=${restaurantId}`);
  if (categoryId) params.push(`categoryId=${categoryId}`);
  if (params.length > 0) url += '&' + params.join('&');
  const response = await apiRequest(url);
  return response;
}

async function adminGetProduct(id) {
  return apiRequest(`/products/${id}`);
}

async function adminCreateProduct(data, imageFiles = []) {
  // Если есть файлы, используем FormData
  if (imageFiles && imageFiles.length > 0) {
    const formData = new FormData();
    
    // Добавляем все поля данных
    Object.keys(data).forEach(key => {
      if (data[key] !== undefined && data[key] !== null) {
        if (key === 'composition' && Array.isArray(data[key])) {
          // composition отправляем как JSON строку
          formData.append(key, JSON.stringify(data[key]));
        } else {
          formData.append(key, data[key]);
        }
      }
    });
    
    // Добавляем файлы
    imageFiles.forEach((file, index) => {
      formData.append('images', file);
    });
    
    const headers = {};
    const token = Auth?.getAuthToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    return fetch(`${CONFIG.API_BASE_URL}/products`, {
      method: 'POST',
      headers,
      body: formData,
    }).then(async (response) => {
      if (response.status === 401) {
        if (typeof Auth !== 'undefined') {
          Auth.clearAuth();
          Auth.redirectToLogin();
        }
        throw new Error('Сессия истекла. Пожалуйста, войдите снова.');
      }
      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to create product' }));
        throw new Error(error.message || 'Failed to create product');
      }
      return response.json();
    });
  } else {
    // Если нет файлов, используем обычный JSON запрос
    return apiRequest('/products', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
}

async function adminUpdateProduct(id, data) {
  return apiRequest(`/products/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

async function adminDeleteProduct(id) {
  return apiRequest(`/products/${id}`, {
    method: 'DELETE',
  });
}

async function adminDeleteProductImage(productId, imageId) {
  return apiRequest(`/products/${productId}/images/${imageId}`, {
    method: 'DELETE',
  });
}

async function adminUploadProductImage(id, file) {
  const formData = new FormData();
  formData.append('file', file);
  
  const headers = {};
  const token = Auth?.getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  return fetch(`${CONFIG.API_BASE_URL}/products/${id}/images`, {
    method: 'POST',
    headers,
    body: formData,
  }).then(async (response) => {
    if (response.status === 401) {
      if (typeof Auth !== 'undefined') {
        Auth.clearAuth();
        Auth.redirectToLogin();
      }
      throw new Error('Сессия истекла. Пожалуйста, войдите снова.');
    }
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to upload image' }));
      throw new Error(error.message || 'Failed to upload image');
    }
    return response.json();
  });
}

/**
 * Ингредиенты
 */
async function adminSearchIngredients(query, restaurantId) {
  const params = new URLSearchParams();
  if (query) params.append('query', query);
  if (restaurantId) params.append('restaurantId', restaurantId);
  return apiRequest(`/ingredients/search?${params.toString()}`);
}

async function adminGetIngredients(restaurantId, query) {
  const params = [];
  if (restaurantId) params.push(`restaurantId=${encodeURIComponent(restaurantId)}`);
  if (query) params.push(`query=${encodeURIComponent(query)}`);
  params.push('page=1');
  params.push('limit=100');
  const url = `/ingredients?${params.join('&')}`;
  return apiRequest(url);
}

async function adminCreateIngredient(data) {
  return apiRequest('/ingredients', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

async function adminUpdateIngredient(id, data) {
  return apiRequest(`/ingredients/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

async function adminDeleteIngredient(id) {
  return apiRequest(`/ingredients/${id}`, {
    method: 'DELETE',
  });
}

async function adminSetProductIngredients(productId, ingredients) {
  return apiRequest(`/products/${productId}/ingredients`, {
    method: 'POST',
    body: JSON.stringify({ ingredients }),
  });
}

/**
 * Модификаторы
 */
async function adminGetModifierGroups(productId) {
  return apiRequest(`/products/${productId}/modifiers`);
}

async function adminCreateModifierGroup(productId, data) {
  return apiRequest(`/products/${productId}/modifiers`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

async function adminUpdateModifierGroup(productId, groupId, data) {
  return apiRequest(`/products/${productId}/modifiers/${groupId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

async function adminDeleteModifierGroup(productId, groupId) {
  return apiRequest(`/products/${productId}/modifiers/${groupId}`, {
    method: 'DELETE',
  });
}

async function adminCreateModifierOption(groupId, data) {
  return apiRequest(`/modifiers/${groupId}/options`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

async function adminUpdateModifierOption(groupId, optionId, data) {
  return apiRequest(`/modifiers/${groupId}/options/${optionId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

async function adminDeleteModifierOption(groupId, optionId) {
  return apiRequest(`/modifiers/${groupId}/options/${optionId}`, {
    method: 'DELETE',
  });
}

/**
 * Баннеры
 */
async function adminGetBanners(restaurantId, status) {
  let url = '/admin/banners';
  const params = [];
  if (restaurantId) params.push(`restaurantId=${restaurantId}`);
  if (status === 'active') params.push(`isActive=true`);
  if (status === 'inactive') params.push(`isActive=false`);
  if (params.length > 0) url += '?' + params.join('&');
  return apiRequest(url);
}

async function adminGetBanner(id) {
  return apiRequest(`/admin/banners/${id}`);
}

async function adminCreateBanner(data) {
  return apiRequest('/admin/banners', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

async function adminUpdateBanner(id, data) {
  return apiRequest(`/admin/banners/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

async function adminDeleteBanner(id) {
  return apiRequest(`/admin/banners/${id}`, {
    method: 'DELETE',
  });
}

async function adminUploadBannerImage(id, file) {
  const formData = new FormData();
  formData.append('file', file);
  
  const headers = {};
  const token = Auth?.getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  return fetch(`${CONFIG.API_BASE_URL}/admin/banners/${id}/image`, {
    method: 'POST',
    headers,
    body: formData,
  }).then(async (response) => {
    if (response.status === 401) {
      if (typeof Auth !== 'undefined') {
        Auth.clearAuth();
        Auth.redirectToLogin();
      }
      throw new Error('Сессия истекла. Пожалуйста, войдите снова.');
    }
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to upload image' }));
      throw new Error(error.message || 'Failed to upload image');
    }
    return response.json();
  });
}

/**
 * Социальные ссылки
 */
async function adminGetSocialLinks(restaurantId) {
  return apiRequest(`/admin/restaurants/${restaurantId}/social-links`);
}

async function adminGetSocialLink(id) {
  return apiRequest(`/admin/social-links/${id}`);
}

async function adminCreateSocialLink(restaurantId, data, iconFile = null) {
  // Если есть файл иконки, используем FormData
  if (iconFile) {
    const formData = new FormData();
    
    // Добавляем все поля данных
    Object.keys(data).forEach(key => {
      if (data[key] !== undefined && data[key] !== null) {
        if (key === 'isActive' || key === 'order') {
          formData.append(key, String(data[key]));
        } else {
          formData.append(key, data[key]);
        }
      }
    });
    
    // Добавляем файл иконки
    formData.append('iconFile', iconFile);
    
    const headers = {};
    const token = Auth?.getAuthToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    return fetch(`${CONFIG.API_BASE_URL}/admin/restaurants/${restaurantId}/social-links`, {
      method: 'POST',
      headers,
      body: formData,
    }).then(async (response) => {
      if (response.status === 401) {
        if (typeof Auth !== 'undefined') {
          Auth.clearAuth();
          Auth.redirectToLogin();
        }
        throw new Error('Сессия истекла. Пожалуйста, войдите снова.');
      }
      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to create social link' }));
        throw new Error(error.message || 'Failed to create social link');
      }
      return response.json();
    });
  } else {
    // Если нет файла, используем обычный JSON запрос
    return apiRequest(`/admin/restaurants/${restaurantId}/social-links`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
}

async function adminUpdateSocialLink(id, data, iconFile = null) {
  // Если есть файл иконки, используем FormData
  if (iconFile) {
    const formData = new FormData();
    
    // Добавляем все поля данных
    Object.keys(data).forEach(key => {
      if (data[key] !== undefined && data[key] !== null) {
        if (key === 'isActive' || key === 'order') {
          formData.append(key, String(data[key]));
        } else {
          formData.append(key, data[key]);
        }
      }
    });
    
    // Добавляем файл иконки
    formData.append('iconFile', iconFile);
    
    const headers = {};
    const token = Auth?.getAuthToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    return fetch(`${CONFIG.API_BASE_URL}/admin/social-links/${id}`, {
      method: 'PATCH',
      headers,
      body: formData,
    }).then(async (response) => {
      if (response.status === 401) {
        if (typeof Auth !== 'undefined') {
          Auth.clearAuth();
          Auth.redirectToLogin();
        }
        throw new Error('Сессия истекла. Пожалуйста, войдите снова.');
      }
      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to update social link' }));
        throw new Error(error.message || 'Failed to update social link');
      }
      return response.json();
    });
  } else {
    // Если нет файла, используем обычный JSON запрос
    return apiRequest(`/admin/social-links/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }
}

async function adminDeleteSocialLink(id) {
  return apiRequest(`/admin/social-links/${id}`, {
    method: 'DELETE',
  });
}

async function adminReorderSocialLinks(ids) {
  return apiRequest(`/admin/social-links/reorder`, {
    method: 'PATCH',
    body: JSON.stringify({ ids }),
  });
}

// Функция удалена - загрузка иконки теперь происходит прямо при создании/обновлении социальной ссылки

function getSocialIconUrl(iconKey) {
  if (!iconKey) return null;
  return `${CONFIG.API_BASE_URL}/admin/social-links/icons/${iconKey}`;
}

/**
 * Заказы
 */
async function adminGetOrders(filters = {}) {
  // Пока используем публичный эндпоинт, так как админских нет
  // В будущем можно добавить /admin/orders
  let url = '/public/orders';
  const params = [];
  
  if (filters.restaurantId) params.push(`restaurantId=${encodeURIComponent(filters.restaurantId)}`);
  
  // Поддержка множественного выбора статусов
  if (filters.status) {
    if (Array.isArray(filters.status)) {
      filters.status.forEach(s => params.push(`status=${encodeURIComponent(s)}`));
    } else {
      params.push(`status=${encodeURIComponent(filters.status)}`);
    }
  }
  
  // Поддержка множественного выбора способов оплаты
  if (filters.paymentMethod) {
    if (Array.isArray(filters.paymentMethod)) {
      filters.paymentMethod.forEach(m => params.push(`paymentMethod=${encodeURIComponent(m)}`));
    } else {
      params.push(`paymentMethod=${encodeURIComponent(filters.paymentMethod)}`);
    }
  }
  
  // Поддержка множественного выбора номеров столов
  if (filters.tableNumber !== undefined && filters.tableNumber !== '') {
    if (Array.isArray(filters.tableNumber)) {
      filters.tableNumber.forEach(t => params.push(`tableNumber=${t}`));
    } else {
      params.push(`tableNumber=${filters.tableNumber}`);
    }
  }
  
  if (filters.minAmount !== undefined && filters.minAmount !== '') params.push(`minAmount=${filters.minAmount}`);
  if (filters.maxAmount !== undefined && filters.maxAmount !== '') params.push(`maxAmount=${filters.maxAmount}`);
  if (filters.dateFrom) params.push(`dateFrom=${encodeURIComponent(filters.dateFrom)}`);
  if (filters.dateTo) params.push(`dateTo=${encodeURIComponent(filters.dateTo)}`);
  
  if (params.length > 0) url += '?' + params.join('&');
  return apiRequest(url);
}

async function adminGetOrder(id) {
  return apiRequest(`/public/orders/${id}`);
}

async function adminUpdateOrderStatus(id, status) {
  return apiRequest(`/public/orders/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

async function adminUpdateItemReadinessStatus(orderId, itemId, readinessStatus) {
  return apiRequest(`/public/orders/${orderId}/items/${itemId}/readiness-status`, {
    method: 'PATCH',
    body: JSON.stringify({ readiness_status: readinessStatus }),
  });
}

/**
 * Владельцы
 */
async function adminGetOwners() {
  return apiRequest('/admin/users/owners');
}

async function adminCreateOwner(data) {
  return apiRequest('/admin/users/owner', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

async function adminSetOwnerPassword(ownerId, password) {
  return apiRequest('/admin/users/owner-password', {
    method: 'POST',
    body: JSON.stringify({ ownerId, password }),
  });
}

/**
 * Персонал (Staff)
 */
async function adminGetManagers(restaurantId) {
  const url = restaurantId 
    ? `/admin/staff/managers?restaurantId=${restaurantId}`
    : '/admin/staff/managers';
  return apiRequest(url);
}

async function adminGetManager(id) {
  return apiRequest(`/admin/staff/managers/${id}`);
}

async function adminCreateManager(data) {
  return apiRequest('/admin/staff/managers', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

async function adminUpdateManager(id, data) {
  return apiRequest(`/admin/staff/managers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

async function adminDeleteManager(id) {
  return apiRequest(`/admin/staff/managers/${id}`, {
    method: 'DELETE',
  });
}

async function adminGetWaiters(restaurantId) {
  const url = restaurantId 
    ? `/admin/staff/waiters?restaurantId=${restaurantId}`
    : '/admin/staff/waiters';
  return apiRequest(url);
}

async function adminGetWaiter(id) {
  return apiRequest(`/admin/staff/waiters/${id}`);
}

async function adminCreateWaiter(data) {
  return apiRequest('/admin/staff/waiters', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

async function adminUpdateWaiter(id, data) {
  return apiRequest(`/admin/staff/waiters/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

async function adminDeleteWaiter(id) {
  return apiRequest(`/admin/staff/waiters/${id}`, {
    method: 'DELETE',
  });
}

async function adminSetKitchenPassword(restaurantId, password) {
  return apiRequest('/admin/staff/kitchen/password', {
    method: 'POST',
    body: JSON.stringify({ restaurantId, password }),
  });
}

/**
 * Изображения продуктов
 */
async function adminGetAllImages(restaurantId) {
  const url = restaurantId 
    ? `/products/images/all?restaurantId=${restaurantId}`
    : '/products/images/all';
  return apiRequest(url);
}

/**
 * Отзывы
 */
async function adminGetReviews(filters = {}) {
  let url = '/reviews';
  const params = [];
  
  if (filters.productId) params.push(`productId=${encodeURIComponent(filters.productId)}`);
  if (filters.orderId) params.push(`orderId=${encodeURIComponent(filters.orderId)}`);
  if (filters.accountId) params.push(`accountId=${encodeURIComponent(filters.accountId)}`);
  if (filters.restaurantId) params.push(`restaurantId=${encodeURIComponent(filters.restaurantId)}`);
  
  if (filters.status) {
    if (Array.isArray(filters.status)) {
      filters.status.forEach(s => params.push(`status=${encodeURIComponent(s)}`));
    } else {
      params.push(`status=${encodeURIComponent(filters.status)}`);
    }
  }
  
  if (params.length > 0) url += '?' + params.join('&');
  return apiRequest(url);
}

async function adminGetReview(id) {
  return apiRequest(`/reviews/${id}`);
}

async function adminModerateReview(id, status, moderationComment) {
  return apiRequest(`/reviews/${id}/moderate`, {
    method: 'PATCH',
    body: JSON.stringify({ status, moderation_comment: moderationComment }),
  });
}

/**
 * Получить аналитику дашборда
 * @param {string} restaurantId - ID ресторана (опционально)
 * @param {string} dateFrom - Начальная дата (YYYY-MM-DD, опционально)
 * @param {string} dateTo - Конечная дата (YYYY-MM-DD, опционально)
 * @returns {Promise<object>}
 */
async function adminGetDashboardAnalytics(restaurantId, dateFrom, dateTo) {
  const params = [];
  if (restaurantId) params.push(`restaurantId=${encodeURIComponent(restaurantId)}`);
  if (dateFrom) params.push(`dateFrom=${encodeURIComponent(dateFrom)}`);
  if (dateTo) params.push(`dateTo=${encodeURIComponent(dateTo)}`);
  
  const url = '/admin/analytics/dashboard' + (params.length > 0 ? '?' + params.join('&') : '');
  return apiRequest(url);
}

// Экспорт функций
if (typeof window !== 'undefined') {
  window.AdminAPI = {
    // Restaurants
    getRestaurants: adminGetRestaurants,
    getRestaurant: adminGetRestaurant,
    createRestaurant: adminCreateRestaurant,
    updateRestaurant: adminUpdateRestaurant,
    deleteRestaurant: adminDeleteRestaurant,
    uploadRestaurantLogo: adminUploadRestaurantLogo,
    // Tables
    getTables: adminGetTables,
    getTable: adminGetTable,
    createTable: adminCreateTable,
    updateTable: adminUpdateTable,
    deleteTable: adminDeleteTable,
    downloadQR: adminDownloadQR,
    downloadAllQR: adminDownloadAllQR,
    rotateQRToken: adminRotateQRToken,
    updateTableStatus: adminUpdateTableStatus,
    // Categories
    getCategories: adminGetCategories,
    getCategory: adminGetCategory,
    createCategory: adminCreateCategory,
    updateCategory: adminUpdateCategory,
    deleteCategory: adminDeleteCategory,
    // Products
    getProducts: adminGetProducts,
    getProduct: adminGetProduct,
    createProduct: adminCreateProduct,
    updateProduct: adminUpdateProduct,
    deleteProduct: adminDeleteProduct,
    uploadProductImage: adminUploadProductImage,
    deleteProductImage: adminDeleteProductImage,
    // Ingredients
    searchIngredients: adminSearchIngredients,
    getIngredients: adminGetIngredients,
    createIngredient: adminCreateIngredient,
    updateIngredient: adminUpdateIngredient,
    deleteIngredient: adminDeleteIngredient,
    setProductIngredients: adminSetProductIngredients,
    // Modifiers
    getModifierGroups: adminGetModifierGroups,
    createModifierGroup: adminCreateModifierGroup,
    updateModifierGroup: adminUpdateModifierGroup,
    deleteModifierGroup: adminDeleteModifierGroup,
    createModifierOption: adminCreateModifierOption,
    updateModifierOption: adminUpdateModifierOption,
    deleteModifierOption: adminDeleteModifierOption,
    // Banners
    getBanners: adminGetBanners,
    getBanner: adminGetBanner,
    createBanner: adminCreateBanner,
    updateBanner: adminUpdateBanner,
    deleteBanner: adminDeleteBanner,
    uploadBannerImage: adminUploadBannerImage,
    // Orders
    getOrders: adminGetOrders,
    getOrder: adminGetOrder,
    updateOrderStatus: adminUpdateOrderStatus,
    updateItemReadinessStatus: adminUpdateItemReadinessStatus,
    // Owners
    getOwners: adminGetOwners,
    createOwner: adminCreateOwner,
    setOwnerPassword: adminSetOwnerPassword,
    // Staff
    getManagers: adminGetManagers,
    getManager: adminGetManager,
    createManager: adminCreateManager,
    updateManager: adminUpdateManager,
    deleteManager: adminDeleteManager,
    getWaiters: adminGetWaiters,
    getWaiter: adminGetWaiter,
    createWaiter: adminCreateWaiter,
    updateWaiter: adminUpdateWaiter,
    deleteWaiter: adminDeleteWaiter,
    setKitchenPassword: adminSetKitchenPassword,
    // Images
    getAllImages: adminGetAllImages,
    // Reviews
    getReviews: adminGetReviews,
    getReview: adminGetReview,
    moderateReview: adminModerateReview,
    // Analytics
    getDashboardAnalytics: adminGetDashboardAnalytics,
    // Социальные ссылки
    getSocialLinks: adminGetSocialLinks,
    getSocialLink: adminGetSocialLink,
    createSocialLink: adminCreateSocialLink,
    updateSocialLink: adminUpdateSocialLink,
    deleteSocialLink: adminDeleteSocialLink,
    reorderSocialLinks: adminReorderSocialLinks,
    getSocialIconUrl: getSocialIconUrl,
    // Reservations
    getReservations: adminGetReservations,
    getReservation: adminGetReservation,
    createReservation: adminCreateReservation,
    updateReservation: adminUpdateReservation,
    confirmReservation: adminConfirmReservation,
    completeReservation: adminCompleteReservation,
    cancelReservation: adminCancelReservation,
  };
}

/**
 * Получить список броней
 * @param {object} filters - Фильтры (restaurantId, tableId, status, date)
 * @returns {Promise<Array>}
 */
async function adminGetReservations(filters = {}) {
  const params = new URLSearchParams();
  if (filters.restaurantId) params.append('restaurantId', filters.restaurantId);
  if (filters.tableId) params.append('tableId', filters.tableId);
  if (filters.status) params.append('status', filters.status);
  if (filters.date) params.append('date', filters.date);
  
  const query = params.toString();
  const endpoint = query ? `/admin/reservations?${query}` : '/admin/reservations';
  
  try {
    const response = await apiRequest(endpoint, {
      method: 'GET',
    });
    
    // Обрабатываем ответ - может быть массив или объект с data
    if (Array.isArray(response)) {
      return response;
    }
    
    if (response?.data) {
      return Array.isArray(response.data) ? response.data : [];
    }
    
    return [];
  } catch (error) {
    console.error('adminGetReservations error:', error);
    throw error;
  }
}

/**
 * Получить бронь по ID
 * @param {string} id - ID брони
 * @returns {Promise<object>}
 */
async function adminGetReservation(id) {
  const response = await apiRequest(`/admin/reservations/${id}`, {
    method: 'GET',
  });
  
  return response.data;
}

/**
 * Создать бронь
 * @param {object} data - Данные брони
 * @returns {Promise<object>}
 */
async function adminCreateReservation(data) {
  const response = await apiRequest('/admin/reservations', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  
  return response.data;
}

/**
 * Обновить бронь
 * @param {string} id - ID брони
 * @param {object} data - Данные для обновления
 * @returns {Promise<object>}
 */
async function adminUpdateReservation(id, data) {
  const response = await apiRequest(`/admin/reservations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  
  return response.data;
}

/**
 * Подтвердить бронь
 * @param {string} id - ID брони
 * @returns {Promise<object>}
 */
async function adminConfirmReservation(id) {
  const response = await apiRequest(`/admin/reservations/${id}/confirm`, {
    method: 'PATCH',
    body: JSON.stringify({}),
  });
  
  return response.data;
}

/**
 * Завершить бронь
 * @param {string} id - ID брони
 * @returns {Promise<object>}
 */
async function adminCompleteReservation(id) {
  const response = await apiRequest(`/admin/reservations/${id}/complete`, {
    method: 'PATCH',
    body: JSON.stringify({}),
  });
  
  return response.data;
}

/**
 * Отменить бронь
 * @param {string} id - ID брони
 * @param {string} reason - Причина отмены (опционально)
 * @returns {Promise<object>}
 */
async function adminCancelReservation(id, reason = null) {
  const body = {};
  if (reason) {
    body.reason = reason;
  }
  
  const response = await apiRequest(`/admin/reservations/${id}/cancel`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  
  return response.data;
}

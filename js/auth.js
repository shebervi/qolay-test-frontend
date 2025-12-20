/**
 * Модуль авторизации
 * 
 * Зачем:
 * - Управление JWT токенами
 * - Сохранение/загрузка токенов из localStorage
 * - Проверка авторизации
 * - Добавление токена в заголовки запросов
 */

const AUTH_STORAGE_KEY = 'auth_token';
const USER_STORAGE_KEY = 'auth_user';

/**
 * Сохранить токен и данные пользователя
 */
function saveAuth(token, userData) {
  localStorage.setItem(AUTH_STORAGE_KEY, token);
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(userData));
}

/**
 * Получить токен из localStorage
 */
function getAuthToken() {
  return localStorage.getItem(AUTH_STORAGE_KEY);
}

/**
 * Получить данные пользователя из localStorage
 */
function getAuthUser() {
  const userData = localStorage.getItem(USER_STORAGE_KEY);
  return userData ? JSON.parse(userData) : null;
}

/**
 * Удалить токен и данные пользователя
 */
function clearAuth() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  localStorage.removeItem(USER_STORAGE_KEY);
}

/**
 * Проверить, авторизован ли пользователь
 */
function isAuthenticated() {
  return !!getAuthToken();
}

/**
 * Получить роль пользователя
 */
function getUserRole() {
  const user = getAuthUser();
  return user ? user.role : null;
}

/**
 * Проверить, является ли пользователь админом/персоналом
 */
function isStaff() {
  const role = getUserRole();
  return role && ['ADMIN', 'OWNER', 'MANAGER', 'KITCHEN', 'WAITER'].includes(role);
}

/**
 * Проверить, является ли пользователь клиентом
 */
function isUser() {
  return getUserRole() === 'USER';
}

/**
 * Перенаправить на страницу авторизации
 */
function redirectToLogin() {
  if (isStaff()) {
    window.location.href = '/admin/login.html';
  } else {
    window.location.href = '/user-login.html';
  }
}

/**
 * Перенаправить на главную страницу в зависимости от роли
 */
function redirectToHome() {
  const role = getUserRole();
  
  if (role === 'ADMIN' || role === 'OWNER' || role === 'MANAGER' || role === 'KITCHEN' || role === 'WAITER') {
    window.location.href = '/admin/index.html';
  } else if (role === 'USER') {
    window.location.href = '/index.html';
  } else {
    window.location.href = '/index.html';
  }
}

/**
 * Проверить авторизацию и перенаправить если нужно
 */
function requireAuth() {
  if (!isAuthenticated()) {
    redirectToLogin();
    return false;
  }
  return true;
}

/**
 * Проверить роль и перенаправить если нужно
 */
function requireRole(allowedRoles) {
  if (!requireAuth()) {
    return false;
  }
  
  const userRole = getUserRole();
  const user = getAuthUser();
  
  // Отладочное логирование
  console.log('requireRole check:', {
    userRole,
    allowedRoles,
    user,
    isAllowed: allowedRoles.includes(userRole)
  });
  
  if (!allowedRoles.includes(userRole)) {
    console.warn('Access denied:', {
      userRole,
      allowedRoles,
      user
    });
    alert('У вас нет доступа к этой странице');
    redirectToHome();
    return false;
  }
  
  return true;
}

// Экспорт функций
if (typeof window !== 'undefined') {
  window.Auth = {
    saveAuth,
    getAuthToken,
    getAuthUser,
    clearAuth,
    isAuthenticated,
    getUserRole,
    isStaff,
    isUser,
    redirectToLogin,
    redirectToHome,
    requireAuth,
    requireRole,
  };
}

/**
 * Конфигурация приложения
 * 
 * Зачем:
 * - Централизованная настройка API URL
 * - Легко изменить для разных окружений
 * - Можно переопределить через localStorage
 */
const CONFIG = {
  // Базовый URL API (можно переопределить через localStorage)
  // Для локальной разработки используем localhost, для продакшна - api.qolay.kz
  API_BASE_URL: localStorage.getItem('API_BASE_URL') || (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? `http://${window.location.hostname}:3000` 
    : 'https://api.qolay.kz'),
  
  // Ключи для localStorage
  STORAGE_KEYS: {
    SESSION_ID: 'cart_session_id',
    TABLE_TOKEN: 'table_token',
    TABLE_NUMBER: 'table_number',
    RESTAURANT_NAME: 'restaurant_name',
  },
};

// Экспорт для использования в других модулях
if (typeof window !== 'undefined') {
  window.CONFIG = CONFIG;
}


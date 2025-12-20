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
  API_BASE_URL: localStorage.getItem('API_BASE_URL') || 'https://api.qolay.kz',
  
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


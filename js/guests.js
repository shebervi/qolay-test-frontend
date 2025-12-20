/**
 * Логика экрана выбора количества гостей
 * 
 * Зачем:
 * - Инициализация сессии корзины
 * - Сохранение количества гостей
 * - Переход на экран меню
 */

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', async () => {
  // Проверяем наличие QR токена в URL
  const tableToken = Utils.getTableToken();
  
  if (!tableToken) {
    Utils.showError('QR токен стола не найден. Пожалуйста, отсканируйте QR код заново.');
    return;
  }

  // Элементы DOM
  const guestsInput = document.getElementById('guests-input');
  const guestsDisplay = document.getElementById('guests-display');
  const decreaseBtn = document.getElementById('decrease-guests');
  const increaseBtn = document.getElementById('increase-guests');
  const continueBtn = document.getElementById('continue-btn');
  const loadingIndicator = document.getElementById('loading');

  let selectedGuests = 1;
  const minGuests = 1;
  const maxGuests = 20;

  // Обновить отображение количества гостей
  function updateGuestsDisplay() {
    guestsDisplay.textContent = selectedGuests;
    guestsInput.value = selectedGuests;
    
    // Обновить состояние кнопок
    decreaseBtn.disabled = selectedGuests <= minGuests;
    increaseBtn.disabled = selectedGuests >= maxGuests;
  }

  // Уменьшить количество гостей
  decreaseBtn.addEventListener('click', () => {
    if (selectedGuests > minGuests) {
      selectedGuests--;
      updateGuestsDisplay();
    }
  });

  // Увеличить количество гостей
  increaseBtn.addEventListener('click', () => {
    if (selectedGuests < maxGuests) {
      selectedGuests++;
      updateGuestsDisplay();
    }
  });

  // Прямой ввод в поле
  guestsInput.addEventListener('change', (e) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value) && value >= minGuests && value <= maxGuests) {
      selectedGuests = value;
      updateGuestsDisplay();
    } else {
      // Вернуть предыдущее значение если невалидное
      updateGuestsDisplay();
    }
  });

  // Обработка кнопки "Продолжить"
  continueBtn.addEventListener('click', async () => {
    try {
      // Показать индикатор загрузки
      loadingIndicator.style.display = 'block';
      continueBtn.disabled = true;

      // Создать корзину
      const cartResult = await API.createCart(tableToken);
      const sessionId = cartResult.sessionId;

      // Установить количество гостей
      await API.setGuests(sessionId, selectedGuests);

      // Сохранить сессию и количество гостей в localStorage
      Utils.saveSession(sessionId, tableToken);
      localStorage.setItem('guests_count', selectedGuests.toString());

      // Перейти на экран меню
      Utils.navigateToMenu();
    } catch (error) {
      Utils.showError(error.message || 'Не удалось создать корзину. Попробуйте еще раз.');
      loadingIndicator.style.display = 'none';
      continueBtn.disabled = false;
    }
  });

  // Инициализация
  updateGuestsDisplay();
});


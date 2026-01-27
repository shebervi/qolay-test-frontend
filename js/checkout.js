/**
 * Логика страницы оформления заказа
 * 
 * Зачем:
 * - Отображение информации о заказе
 * - Валидация формы
 * - Создание заказа
 * - Переход на страницу успеха
 */

let cartData = null;
let cartSocket = null;

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', async () => {
  const sessionId = Utils.getSession();

  if (!sessionId) {
    Utils.showError('Сессия не найдена. Пожалуйста, начните с выбора количества гостей.');
    setTimeout(() => {
      Utils.navigateToGuests();
    }, 2000);
    return;
  }

  // Элементы DOM
  const loadingIndicator = document.getElementById('loading');
  const checkoutContent = document.getElementById('checkout-content');
  const orderSummary = document.getElementById('order-summary');
  const checkoutTotal = document.getElementById('checkout-total');
  const checkoutForm = document.getElementById('checkout-form');
  const submitBtn = document.getElementById('submit-order-btn');
  const errorMessage = document.getElementById('error-message');

  // Загрузить корзину
  try {
    loadingIndicator.style.display = 'block';
    cartData = await API.getCart(sessionId);
    loadingIndicator.style.display = 'none';

    if (!cartData || !cartData.items || cartData.items.length === 0) {
      Utils.showError('Корзина пуста. Добавьте товары перед оформлением заказа.');
      setTimeout(() => {
        window.location.href = 'menu.html';
      }, 2000);
      return;
    }

    checkoutContent.style.display = 'flex';
    renderOrderSummary();
    setupFormHandler();
    setupCartWebSocket();
  } catch (error) {
    loadingIndicator.style.display = 'none';
    Utils.showError('Не удалось загрузить корзину: ' + error.message);
    console.error('Failed to load cart:', error);
  }

  function setupCartWebSocket() {
    if (cartSocket) {
      return;
    }

    const serverUrl = CONFIG.API_BASE_URL;
    cartSocket = new CartWebSocket(serverUrl, {
      sessionId,
      onCartUpdated: (payload) => {
        if (!payload || payload.sessionId !== sessionId) {
          return;
        }

        cartData = payload.cart;
        if (!cartData || !cartData.items || cartData.items.length === 0) {
          submitBtn.disabled = true;
          showError('Корзина была очищена. Пожалуйста, добавьте товары заново.');
          setTimeout(() => {
            window.location.href = 'menu.html';
          }, 2000);
          return;
        }

        renderOrderSummary();
      },
      onCartCleared: (payload) => {
        if (!payload || payload.sessionId !== sessionId) {
          return;
        }

        submitBtn.disabled = true;
        showError('Корзина была очищена. Пожалуйста, добавьте товары заново.');
        setTimeout(() => {
          window.location.href = 'menu.html';
        }, 2000);
      },
      onError: (error) => {
        console.error('Cart WebSocket error:', error);
      },
    });
  }

  /**
   * Отобразить информацию о заказе
   */
  function renderOrderSummary() {
    if (!cartData || !cartData.items) {
      return;
    }

    const itemsHtml = cartData.items.map(item => {
      const productName = item.name?.ru || item.name?.kk || item.name?.en || 'Товар';
      const price = parseFloat(item.totalPrice || item.basePrice || 0);
      const quantity = item.quantity || 1;
      const itemTotal = price * quantity;

      const variantName = item.variantName?.ru || item.variantName?.kk || item.variantName?.en;
      const variantLabel = variantName || '';
      const variantHtml = variantLabel
        ? `
          <div style="font-size: 12px; color: #666; margin-top: 4px;">
            Вариант: ${Utils.escapeHtml(variantLabel)}
          </div>
        `
        : '';

      let modifiersHtml = '';
      if (item.modifiers && item.modifiers.length > 0) {
        const modifiersList = item.modifiers.map(mod => {
          const optionName = mod.optionName?.ru || mod.optionName?.kk || mod.optionName?.en || '';
          return optionName;
        }).join(', ');
        
        modifiersHtml = `
          <div style="font-size: 12px; color: #666; margin-top: 4px;">
            ${modifiersList}
          </div>
        `;
      }

      return `
        <div style="display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #eee;">
          <div style="flex: 1;">
            <div style="font-weight: 500;">${Utils.escapeHtml(productName)}</div>
            ${variantHtml}
            ${modifiersHtml}
            <div style="font-size: 12px; color: #666; margin-top: 4px;">
              ${Utils.formatPrice(price)} ₸ × ${quantity}
            </div>
          </div>
          <div style="font-weight: 600; margin-left: 16px;">
            ${Utils.formatPrice(itemTotal)} ₸
          </div>
        </div>
      `;
    }).join('');

    orderSummary.innerHTML = `
      <div style="background: #f9f9f9; padding: 16px; border-radius: 8px;">
        <div style="margin-bottom: 12px;">
          <strong>Количество гостей:</strong> ${cartData.guests || 1}
        </div>
        <div style="margin-bottom: 12px;">
          <strong>Товаров в заказе:</strong> ${cartData.items.length}
        </div>
        <div style="border-top: 1px solid #ddd; padding-top: 12px; margin-top: 12px;">
          ${itemsHtml}
        </div>
      </div>
    `;

    // Обновить итоговую сумму
    const total = parseFloat(cartData.total || cartData.subtotal || 0);
    checkoutTotal.textContent = `${Utils.formatPrice(total)} ₸`;
  }

  /**
   * Настроить обработчик формы
   */
  function setupFormHandler() {
    checkoutForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const guestNameInput = document.getElementById('guest-name');
      const paymentMethodInput = document.getElementById('payment-method');
      const noteInput = document.getElementById('order-note');
      
      const guestName = guestNameInput.value.trim();
      const paymentMethod = paymentMethodInput.value;
      const note = noteInput.value.trim();

      // Валидация
      if (!guestName || guestName.length === 0) {
        showError('Пожалуйста, введите ваше имя');
        guestNameInput.focus();
        return;
      }

      if (guestName.length > 100) {
        showError('Имя слишком длинное (максимум 100 символов)');
        guestNameInput.focus();
        return;
      }

      if (!paymentMethod) {
        showError('Пожалуйста, выберите способ оплаты');
        paymentMethodInput.focus();
        return;
      }

      if (note.length > 500) {
        showError('Заметка слишком длинная (максимум 500 символов)');
        noteInput.focus();
        return;
      }

      // Отключить кнопку и показать загрузку
      submitBtn.disabled = true;
      submitBtn.textContent = 'Оформление...';
      loadingIndicator.style.display = 'block';
      errorMessage.style.display = 'none';

      try {
        // Создать заказ
        const order = await API.createOrder(sessionId, guestName, paymentMethod, note || undefined);
        
        // НЕ очищаем sessionId, так как корзина теперь только очищается, а не удаляется
        // Гости могут продолжать дозаказывать
        
        // Перейти на страницу успеха
        Utils.navigateToOrderSuccess(order.id);
      } catch (error) {
        loadingIndicator.style.display = 'none';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Оформить заказ';
        showError('Не удалось оформить заказ: ' + error.message);
        console.error('Failed to create order:', error);
      }
    });
  }

  /**
   * Показать ошибку
   */
  function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
    setTimeout(() => {
      errorMessage.style.display = 'none';
    }, 5000);
  }
});

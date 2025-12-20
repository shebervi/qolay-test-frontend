/**
 * Логика страницы корзины
 * 
 * Зачем:
 * - Отображение товаров в корзине
 * - Изменение количества товаров
 * - Удаление товаров
 * - Обновление количества гостей
 * - Подсчет итоговой суммы
 */

let cartData = null;

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', async () => {
  const sessionId = Utils.getSession();
  const tableToken = Utils.getTableTokenFromStorage();

  if (!sessionId || !tableToken) {
    Utils.showError('Сессия не найдена. Пожалуйста, начните с выбора количества гостей.');
    setTimeout(() => {
      Utils.navigateToGuests(tableToken);
    }, 2000);
    return;
  }

  // Элементы DOM
  const loadingIndicator = document.getElementById('loading');
  const cartEmpty = document.getElementById('cart-empty');
  const cartContent = document.getElementById('cart-content');
  const cartItems = document.getElementById('cart-items');
  const checkoutBtn = document.getElementById('checkout-btn');
  const decreaseGuestsBtn = document.getElementById('decrease-guests');
  const increaseGuestsBtn = document.getElementById('increase-guests');
  const guestsCount = document.getElementById('guests-count');
  const subtotalElement = document.getElementById('subtotal');
  const totalElement = document.getElementById('total');

  // Загрузить корзину
  try {
    loadingIndicator.style.display = 'block';
    cartData = await API.getCart(sessionId);
    loadingIndicator.style.display = 'none';

    if (!cartData || !cartData.items || cartData.items.length === 0) {
      cartEmpty.style.display = 'flex';
      cartContent.style.display = 'none';
      return;
    }

    cartEmpty.style.display = 'none';
    cartContent.style.display = 'flex';
    cartContent.style.flex = '1';
    
    renderCart();
    setupEventListeners();
  } catch (error) {
    loadingIndicator.style.display = 'none';
    Utils.showError('Не удалось загрузить корзину: ' + error.message);
    console.error('Failed to load cart:', error);
  }

  /**
   * Отобразить корзину
   */
  function renderCart() {
    if (!cartData || !cartData.items) {
      return;
    }

    // Обновить количество гостей
    guestsCount.textContent = cartData.guests || 1;

    // Очистить список товаров
    cartItems.innerHTML = '';

    // Отобразить товары
    cartData.items.forEach(item => {
      const itemElement = createCartItemElement(item);
      cartItems.appendChild(itemElement);
    });

    // Обновить итоги
    updateSummary();
  }

  /**
   * Создать элемент товара в корзине
   */
  function createCartItemElement(item) {
    const itemDiv = document.createElement('div');
    itemDiv.className = 'cart-item';
    itemDiv.dataset.itemId = item.itemId;

    const productName = item.name?.ru || item.name?.kk || item.name?.en || 'Товар';
    const description = Utils.getProductDescription(item.description);
    // Используем totalPrice, если есть, иначе basePrice, иначе старое поле price для обратной совместимости
    const price = parseFloat(item.totalPrice || item.basePrice || item.price || 0);
    const quantity = item.quantity || 1;
    const itemTotal = price * quantity;

    // Получаем URL изображения
    const images = item.images || [];
    const imageUrl = Utils.getProductImageUrl(images, item.productId, 0);

    // Формируем информацию о модификаторах
    let modifiersHtml = '';
    if (item.modifiers && item.modifiers.length > 0) {
      const modifiersList = item.modifiers.map(mod => {
        const optionName = mod.optionName?.ru || mod.optionName?.kk || mod.optionName?.en || '';
        const priceDelta = parseFloat(mod.priceDelta || 0);
        return optionName + (priceDelta > 0 ? ` (+${Utils.formatPrice(priceDelta)} ₸)` : '');
      }).join(', ');
      
      modifiersHtml = `
        <div class="cart-item-modifiers" style="font-size: 12px; color: #666; margin-top: 4px;">
          ${modifiersList}
        </div>
      `;
    }

    // Калории и вес убраны по запросу пользователя
    const nutritionInfoHtml = '';

    // Состав убран по запросу пользователя
    const compositionHtml = '';

    // HTML для изображения
    const imageHtml = `
      <div class="cart-item-image-container">
        <img src="${imageUrl}" alt="${Utils.escapeHtml(productName)}" class="cart-item-image" onerror="this.src='https://openlab.citytech.cuny.edu/chenry-eportfolio/wp-content/themes/koji/assets/images/default-fallback-image.png'" />
      </div>
    `;

    // Описание убрано по запросу пользователя
    const descriptionHtml = '';

    itemDiv.innerHTML = `
      <div class="cart-item-header">
      ${imageHtml}
      <div class="cart-item-info">
        <div class="cart-item-name">${Utils.escapeHtml(productName)}</div>
        ${modifiersHtml}
        ${nutritionInfoHtml}
        ${compositionHtml}
          <div class="cart-item-quantity-wrapper">
        <div class="quantity-selector">
          <button class="quantity-btn-small decrease-item" data-item-id="${item.itemId}">−</button>
          <span class="item-quantity">${quantity}</span>
          <button class="quantity-btn-small increase-item" data-item-id="${item.itemId}">+</button>
        </div>
        <button class="btn-remove-item" data-item-id="${item.itemId}" title="Удалить">
              <i class="fas fa-trash"></i>
        </button>
          </div>
        </div>
      </div>
      <div class="cart-item-footer">
        <div class="cart-item-price-section">
          <div class="cart-item-price-unit">${Utils.formatPrice(price)} ₸ × ${quantity}</div>
          <div class="cart-item-price-total">= ${Utils.formatPrice(itemTotal)} ₸</div>
        </div>
      </div>
    `;

    return itemDiv;
  }

  /**
   * Обновить итоговую сумму
   */
  function updateSummary() {
    if (!cartData) {
      return;
    }

    const subtotal = parseFloat(cartData.subtotal || 0);
    const total = parseFloat(cartData.total || 0);

    subtotalElement.textContent = `${subtotal.toFixed(0)} ₸`;
    totalElement.textContent = `${total.toFixed(0)} ₸`;
  }

  /**
   * Настроить обработчики событий
   */
  function setupEventListeners() {
    // Увеличение количества товара
    document.querySelectorAll('.increase-item').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const itemId = e.target.dataset.itemId;
        await updateItemQuantity(itemId, 1);
      });
    });

    // Уменьшение количества товара
    document.querySelectorAll('.decrease-item').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const itemId = e.target.dataset.itemId;
        const item = cartData.items.find(i => i.itemId === itemId);
        if (item && item.quantity > 1) {
          await updateItemQuantity(itemId, -1);
        }
      });
    });

    // Удаление товара
    document.querySelectorAll('.btn-remove-item').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const itemId = e.target.dataset.itemId;
        if (confirm('Удалить товар из корзины?')) {
          await removeItem(itemId);
        }
      });
    });

    // Изменение количества гостей
    decreaseGuestsBtn.addEventListener('click', async () => {
      const currentGuests = parseInt(guestsCount.textContent) || 1;
      if (currentGuests > 1) {
        await updateGuests(currentGuests - 1);
      }
    });

    increaseGuestsBtn.addEventListener('click', async () => {
      const currentGuests = parseInt(guestsCount.textContent) || 1;
      if (currentGuests < 20) {
        await updateGuests(currentGuests + 1);
      }
    });

    // Оформление заказа
    checkoutBtn.addEventListener('click', () => {
      Utils.navigateToCheckout();
    });
  }

  /**
   * Обновить количество товара
   */
  async function updateItemQuantity(itemId, delta) {
    const item = cartData.items.find(i => i.itemId === itemId);
    if (!item) {
      return;
    }

    const newQuantity = item.quantity + delta;
    if (newQuantity < 1) {
      return;
    }

    try {
      const updatedCart = await API.updateCartItem(sessionId, itemId, newQuantity);
      cartData = updatedCart;
      renderCart();
      setupEventListeners();
    } catch (error) {
      Utils.showError('Не удалось обновить количество: ' + error.message);
      console.error('Failed to update item quantity:', error);
    }
  }

  /**
   * Удалить товар из корзины
   */
  async function removeItem(itemId) {
    try {
      const updatedCart = await API.removeCartItem(sessionId, itemId);
      cartData = updatedCart;

      if (!cartData.items || cartData.items.length === 0) {
        cartEmpty.style.display = 'flex';
        cartContent.style.display = 'none';
      } else {
        renderCart();
        setupEventListeners();
      }
    } catch (error) {
      Utils.showError('Не удалось удалить товар: ' + error.message);
      console.error('Failed to remove item:', error);
    }
  }

  /**
   * Обновить количество гостей
   */
  async function updateGuests(newGuests) {
    try {
      const updatedCart = await API.setGuests(sessionId, newGuests);
      cartData = updatedCart;
      guestsCount.textContent = cartData.guests || 1;
    } catch (error) {
      Utils.showError('Не удалось обновить количество гостей: ' + error.message);
      console.error('Failed to update guests:', error);
    }
  }
});


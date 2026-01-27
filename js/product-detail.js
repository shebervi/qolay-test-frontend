/**
 * Логика детальной страницы продукта
 * 
 * Зачем:
 * - Отображение полной информации о блюде
 * - Добавление в корзину с выбором количества
 * - Навигация назад в меню
 */

let currentProduct = null;
let selectedModifiers = {}; // { groupId: [optionId1, optionId2, ...] }
let currentImageIndex = 0;

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', async () => {
  // Получить параметры из URL
  const urlParams = new URLSearchParams(window.location.search);
  const productId = urlParams.get('product');
  const restaurantId = urlParams.get('restaurantId');
  const isPublic = urlParams.get('public') === 'true';

  if (!productId) {
    Utils.showError('ID продукта не указан.');
    setTimeout(() => {
      if (isPublic && restaurantId) {
        window.location.href = `restaurant-menu.html?restaurantId=${restaurantId}`;
      } else {
      Utils.navigateToMenu();
      }
    }, 2000);
    return;
  }

  // Проверяем наличие сессии только если не публичный режим
  let sessionId = null;
  let tableToken = null;
  let cartSocket = null;
  
  if (!isPublic) {
    sessionId = Utils.getSession();
    tableToken = Utils.getTableTokenFromStorage();

    if (!sessionId || !tableToken) {
      Utils.showError('Сессия не найдена.');
      setTimeout(() => {
        Utils.navigateToGuests(tableToken);
      }, 2000);
      return;
    }
  }

  // Элементы DOM
  const productImage = document.getElementById('product-image');
  const productName = document.getElementById('product-name');
  const productDescription = document.getElementById('product-description');
  const productPrice = document.getElementById('product-price');
  const quantityInput = document.getElementById('quantity-input');
  const quantityDisplay = document.getElementById('quantity-display');
  const decreaseBtn = document.getElementById('decrease-quantity');
  const increaseBtn = document.getElementById('increase-quantity');
  const addToCartBtn = document.getElementById('add-to-cart-btn');
  const backBtn = document.getElementById('back-btn');
  const loadingIndicator = document.getElementById('loading');
  const modifiersContainer = document.getElementById('modifiers-container');
  const optionVariantsContainer = document.getElementById('product-option-variants');
  const optionVariantsList = document.getElementById('product-option-variants-list');

  let selectedQuantity = 1;
  const minQuantity = 1;
  const maxQuantity = 10;
  let selectedProductVariantId = null;
  let selectedProductVariant = null;

  function ensureCartBadgeWebSocket() {
    if (isPublic || !sessionId) {
      return;
    }

    if (!cartSocket) {
      const serverUrl = CONFIG.API_BASE_URL;
      cartSocket = new CartWebSocket(serverUrl, {
        sessionId,
        onCartUpdated: (payload) => {
          if (!payload || payload.sessionId !== sessionId) {
            return;
          }
          Utils.updateCartBadgeFromCart(payload.cart);
        },
        onCartCleared: (payload) => {
          if (!payload || payload.sessionId !== sessionId) {
            return;
          }
          Utils.updateCartBadgeFromCart({ items: [] });
        },
        onError: (error) => {
          console.error('Cart WebSocket error:', error);
        },
      });
    } else {
      if (cartSocket.sessionId && cartSocket.sessionId !== sessionId) {
        cartSocket.unsubscribeFromCart(cartSocket.sessionId);
      }
      cartSocket.subscribeToCart(sessionId);
    }
  }

  // Скрыть кнопку "Добавить в корзину" и корзину в публичном режиме
  if (isPublic) {
    if (addToCartBtn) {
      addToCartBtn.style.display = 'none';
    }
    const cartLink = document.getElementById('cart-link');
    if (cartLink) {
      cartLink.style.display = 'none';
    }
    // Скрыть селектор количества в публичном режиме
    const quantitySelector = document.querySelector('.quantity-selector');
    if (quantitySelector) {
      quantitySelector.style.display = 'none';
    }
    // Скрыть модификаторы в публичном режиме (они только для просмотра)
    if (modifiersContainer) {
      modifiersContainer.style.display = 'none';
    }
  }

  // Загрузить меню для получения информации о продукте
  try {
    loadingIndicator.style.display = 'block';

    let menu;
    if (isPublic && restaurantId) {
      // Публичный режим - загрузить меню ресторана
      const menuData = await API.getRestaurantMenu(restaurantId);
      menu = menuData;
    } else {
      // Обычный режим - загрузить меню через QR токен
      menu = await API.getMenu(tableToken);
    }
    
    // Найти продукт во всех категориях
    let foundProduct = null;
    for (const category of menu.categories) {
      foundProduct = category.products.find((p) => p.id === productId);
      if (foundProduct) break;
    }

    if (!foundProduct) {
      throw new Error('Продукт не найден');
    }

    currentProduct = foundProduct;

    // Отобразить информацию о продукте
    const currency = isPublic && menu.restaurant?.currency === 'KZT' 
      ? '₸' 
      : (menu.restaurant?.currency || '₸');
    renderProduct(foundProduct, currency);
    renderProductOptionVariants(foundProduct, currency);
    
    // Инициализировать модификаторы
    if (foundProduct.modifiers && foundProduct.modifiers.length > 0) {
      renderModifiers(foundProduct.modifiers, currency);
      validateModifiers();
    }

    // Загрузить отзывы
    await loadReviews(productId);

    loadingIndicator.style.display = 'none';
  } catch (error) {
    loadingIndicator.style.display = 'none';
    Utils.showError(error.message || 'Не удалось загрузить информацию о продукте.');
    setTimeout(() => {
      if (isPublic && restaurantId) {
        window.location.href = `restaurant-menu.html?restaurantId=${restaurantId}`;
      } else {
      Utils.navigateToMenu();
      }
    }, 2000);
    return;
  }

  // Обновить отображение количества
  function updateQuantityDisplay() {
    quantityDisplay.textContent = selectedQuantity;
    quantityInput.value = selectedQuantity;
    
    decreaseBtn.disabled = selectedQuantity <= minQuantity;
    increaseBtn.disabled = selectedQuantity >= maxQuantity;
  }

  // Уменьшить количество
  decreaseBtn.addEventListener('click', () => {
    if (selectedQuantity > minQuantity) {
      selectedQuantity--;
      updateQuantityDisplay();
    }
  });

  // Увеличить количество
  increaseBtn.addEventListener('click', () => {
    if (selectedQuantity < maxQuantity) {
      selectedQuantity++;
      updateQuantityDisplay();
    }
  });

  // Прямой ввод в поле
  quantityInput.addEventListener('change', (e) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value) && value >= minQuantity && value <= maxQuantity) {
      selectedQuantity = value;
      updateQuantityDisplay();
    } else {
      updateQuantityDisplay();
    }
  });

  // Добавить в корзину (только если не публичный режим)
  if (!isPublic && addToCartBtn) {
    addToCartBtn.addEventListener('click', async () => {
      try {
        if (!validateModifiers()) {
          Utils.showError('Пожалуйста, выберите все обязательные модификаторы');
          return;
        }

        addToCartBtn.disabled = true;
        addToCartBtn.textContent = 'Добавление...';

        // Подготовить модификаторы для отправки
        const modifiersToSend = Object.keys(selectedModifiers)
          .filter((groupId) => selectedModifiers[groupId].length > 0)
          .map((groupId) => ({
            groupId,
            optionIds: selectedModifiers[groupId],
          }));

        try {
          await API.addToCart(
            sessionId,
            productId,
            selectedQuantity,
            modifiersToSend,
            selectedProductVariantId,
          );
        } catch (error) {
          // Если корзина не найдена (истекла или была удалена после заказа), создаем новую
          if (error.message && error.message.includes('Cart not found')) {
            console.log('Корзина не найдена, создаем новую...');
            const cartResult = await API.createCart(tableToken);
            sessionId = cartResult.sessionId;
            Utils.saveSession(sessionId, tableToken);
            ensureCartBadgeWebSocket();
            
            // Восстанавливаем сохраненное количество гостей
            const savedGuestsCount = localStorage.getItem('guests_count');
            if (savedGuestsCount) {
              await API.setGuests(sessionId, parseInt(savedGuestsCount, 10));
            }
            
            // Пробуем добавить товар снова с новым sessionId
        await API.addToCart(
          sessionId,
          productId,
          selectedQuantity,
          modifiersToSend,
          selectedProductVariantId,
        );
          } else {
            throw error;
          }
        }
        
        // Обновить счетчик корзины
        await Utils.updateCartBadge();
        
        Utils.showSuccess('Товар добавлен в корзину');
        
        // Вернуться в меню через небольшую задержку
        setTimeout(() => {
          Utils.navigateToMenu();
        }, 1000);
      } catch (error) {
        Utils.showError(error.message || 'Не удалось добавить товар в корзину.');
        addToCartBtn.disabled = false;
        addToCartBtn.textContent = 'Добавить в корзину';
      }
    });
  }

  // Кнопка "Назад"
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      if (isPublic && restaurantId) {
        window.location.href = `restaurant-menu.html?restaurantId=${restaurantId}`;
      } else {
      Utils.navigateToMenu();
      }
    });
  }

  /**
   * Загрузить и отобразить отзывы
   */
  async function loadReviews(productId) {
    const reviewsContainer = document.getElementById('reviews-container');
    const noReviews = document.getElementById('no-reviews');
    
    if (!reviewsContainer) return;
    
    try {
      const reviews = await API.getProductReviews(productId);
      
      if (!reviews || reviews.length === 0) {
        reviewsContainer.style.display = 'none';
        if (noReviews) {
          noReviews.style.display = 'block';
        }
        return;
      }
      
      reviewsContainer.innerHTML = reviews.map(review => {
        const stars = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating);
        const date = new Date(review.created_at).toLocaleDateString('ru-RU', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
        const userName = review.account?.name || review.account?.phone || 'Анонимный пользователь';
        
        return `
          <div style="padding: 16px; border: 1px solid #e0e0e0; border-radius: 8px; background: #f9f9f9;">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
              <div>
                <div style="font-weight: 600; margin-bottom: 4px;">${userName}</div>
                <div style="color: #ffa500; font-size: 18px; margin-bottom: 4px;">${stars}</div>
              </div>
              <div style="color: #888; font-size: 12px;">${date}</div>
            </div>
            ${review.comment ? `<p style="margin-top: 8px; color: #333; line-height: 1.5;">${escapeHtml(review.comment)}</p>` : ''}
          </div>
        `;
      }).join('');
      
      reviewsContainer.style.display = 'flex';
      if (noReviews) {
        noReviews.style.display = 'none';
      }
    } catch (error) {
      console.error('Failed to load reviews:', error);
      reviewsContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">Не удалось загрузить отзывы</div>';
    }
  }

  /**
   * Экранировать HTML для безопасности
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Инициализация
  if (!isPublic) {
  updateQuantityDisplay();
    // Инициализировать счетчик корзины при загрузке (только в обычном режиме)
  Utils.updateCartBadge();
  ensureCartBadgeWebSocket();
  }

  /**
   * Отобразить информацию о продукте
   */
  function renderProduct(product, currency = '₸') {
    // Используем images если есть (массив объектов с id), иначе imageKeys
    const images = product.images || [];
    const imageData = images.length > 0 ? images : (product.imageKeys || []);
    const imageUrl = Utils.getProductImageUrl(imageData, product.id, 0);
    const name = Utils.getProductName(product.name);
    const description = Utils.getProductDescription(product.description);
    const basePrice = getBasePrice(product);
    const totalPrice = calculateTotalPrice(basePrice);

    if (productImage) {
      productImage.src = imageUrl;
      productImage.alt = name;
      productImage.onerror = function() {
        this.src = 'https://openlab.citytech.cuny.edu/chenry-eportfolio/wp-content/themes/koji/assets/images/default-fallback-image.png';
      };
      
      // Если есть несколько изображений, добавляем галерею
      if (imageData.length > 1) {
        renderImageGallery(product, imageData);
      } else {
        const gallery = document.getElementById('product-image-gallery');
        if (gallery) {
          gallery.style.display = 'none';
        }
      }
    }
    if (productName) {
      productName.textContent = name;
    }
    if (productDescription) {
      productDescription.textContent = description || 'Описание отсутствует';
    }
    
    // Отобразить калории и грамовку
    renderProductInfo(product);
    
    // Отобразить состав
    renderProductComposition(product);
    
    if (productPrice) {
      const formattedPrice = Utils.formatPrice(totalPrice);
      if (totalPrice !== basePrice) {
        productPrice.innerHTML = `
          <span style="text-decoration: line-through; color: var(--secondary-color); font-size: 0.9em;">
            ${Utils.formatPrice(basePrice)} ${currency}
          </span>
          <span style="margin-left: 8px; font-weight: 600;">
            ${formattedPrice} ${currency}
          </span>
        `;
      } else {
        productPrice.textContent = `${formattedPrice} ${currency}`;
      }
    }
  }

  function getBasePrice(product) {
    const variantPrice = selectedProductVariant?.price;
    if (variantPrice !== undefined && variantPrice !== null) {
      return parseFloat(variantPrice);
    }
    return parseFloat(product.price);
  }

  function getProductVariants(product) {
    const variants = product.variants || product.product_variants || [];
    return (variants || []).filter((variant) => variant && variant.isActive !== false);
  }

  function getVariantLabel(variant) {
    return Utils.getProductName(variant.name) || 'Вариант';
  }

  function renderProductOptionVariants(product, currency = '₸') {
    if (!optionVariantsContainer || !optionVariantsList) {
      return;
    }

    const variants = getProductVariants(product);
    if (variants.length === 0) {
      optionVariantsContainer.style.display = 'none';
      selectedProductVariantId = null;
      selectedProductVariant = null;
      return;
    }

    variants.sort((a, b) => {
      const aOrder = a.sortOrder ?? 0;
      const bOrder = b.sortOrder ?? 0;
      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }
      const aLabel = getVariantLabel(a);
      const bLabel = getVariantLabel(b);
      return aLabel.localeCompare(bLabel, 'ru');
    });

    if (!selectedProductVariantId || !variants.find((v) => v.id === selectedProductVariantId)) {
      selectedProductVariantId = variants[0].id;
    }
    selectedProductVariant = variants.find((v) => v.id === selectedProductVariantId) || variants[0];

    if (variants.length === 1) {
      const singleVariant = variants[0];
      const label = getVariantLabel(singleVariant);
      optionVariantsList.innerHTML = `
        <div style="display: inline-flex; align-items: center; gap: 8px; padding: 8px 12px; border: 1px solid #ddd; border-radius: 999px; font-size: 14px; color: #333; background: #fafafa;">
          ${escapeHtml(label)}${singleVariant.price ? ` • ${Utils.formatPrice(singleVariant.price)} ${currency}` : ''}
        </div>
      `;
      optionVariantsContainer.style.display = 'block';
      updatePrice();
      return;
    }

    optionVariantsList.innerHTML = variants
      .map((variant) => {
        const isActive = variant.id === selectedProductVariantId;
        const label = getVariantLabel(variant);
        return `
          <button
            type="button"
            class="variant-btn${isActive ? ' active' : ''}"
            data-variant-id="${variant.id}"
            ${isActive ? 'aria-current="true"' : ''}
            title="${escapeHtml(label)}"
          >
            ${escapeHtml(label)}${variant.price ? ` • ${Utils.formatPrice(variant.price)} ${currency}` : ''}
          </button>
        `;
      })
      .join('');

    optionVariantsContainer.style.display = 'block';

    optionVariantsList.querySelectorAll('.variant-btn').forEach((button) => {
      button.addEventListener('click', () => {
        const targetId = button.dataset.variantId;
        if (!targetId) return;
        selectedProductVariantId = targetId;
        selectedProductVariant = variants.find((v) => v.id === targetId) || variants[0];
        optionVariantsList.querySelectorAll('.variant-btn').forEach((btn) => {
          btn.classList.toggle('active', btn === button);
        });
        updatePrice();
      });
    });

    updatePrice();
  }

  function getVariantLabel(product) {
    const size = resolveProductSize(product);
    if (size) {
      return formatSizeLabel(size);
    }
    const name = Utils.getProductName(product.name);
    return name || 'Вариант';
  }

  function resolveProductSize(product) {
    const sizeUnit =
      product.sizeUnit ||
      product.size_unit ||
      (product.volumeMl || product.volume_ml ? 'ML' : undefined) ||
      (product.weightGrams || product.weight_grams ? 'GRAM' : null);
    const sizeValue =
      product.sizeValue ??
      (sizeUnit === 'ML'
        ? product.volumeMl || product.volume_ml
        : sizeUnit === 'GRAM'
          ? product.weightGrams || product.weight_grams
          : null);

    if (!sizeUnit || sizeValue === null || sizeValue === undefined) {
      return null;
    }

    return { unit: sizeUnit, value: sizeValue };
  }

  function formatSizeLabel(size) {
    if (!size) return '';
    if (size.unit === 'ML') {
      if (size.value >= 1000) {
        const liters = (size.value / 1000).toFixed(2).replace(/\.?0+$/, '');
        return `${liters} л`;
      }
      return `${size.value} мл`;
    }
    if (size.value >= 1000) {
      const kilos = (size.value / 1000).toFixed(2).replace(/\.?0+$/, '');
      return `${kilos} кг`;
    }
    return `${size.value} г`;
  }

  /**
   * Отобразить информацию о калориях и весе
   */
  function renderProductInfo(product) {
    const ratingEl = document.getElementById('product-rating');
    const ratingValueEl = document.getElementById('product-rating-value');
    const caloriesEl = document.getElementById('product-calories');
    const caloriesValueEl = document.getElementById('product-calories-value');
    const weightEl = document.getElementById('product-weight');
    const weightValueEl = document.getElementById('product-weight-value');

    const ratingAverage =
      product.ratingAverage !== null && product.ratingAverage !== undefined
        ? product.ratingAverage
        : null;
    const reviewsCount =
      product.reviewsCount !== null && product.reviewsCount !== undefined
        ? product.reviewsCount
        : null;

    if (ratingAverage !== null && ratingEl && ratingValueEl) {
      const value = ratingAverage.toFixed(1);
      ratingValueEl.textContent = reviewsCount ? `${value} (${reviewsCount})` : value;
      ratingEl.style.display = 'flex';
    } else if (ratingEl) {
      ratingEl.style.display = 'none';
    }
    
    if (product.calories && caloriesEl && caloriesValueEl) {
      caloriesValueEl.textContent = `${product.calories} Ккал`;
      caloriesEl.style.display = 'flex';
    } else if (caloriesEl) {
      caloriesEl.style.display = 'none';
    }
    
    const size = resolveProductSize(product);
    if (size && weightEl && weightValueEl) {
      weightValueEl.textContent = formatSizeLabel(size);
      weightEl.style.display = 'flex';
    } else if (weightEl) {
      weightEl.style.display = 'none';
    }
  }

  /**
   * Отобразить состав продукта
   */
  function renderProductComposition(product) {
    const compositionSection = document.getElementById('product-composition-section');
    const compositionTags = document.getElementById('product-composition-tags');
    
    if (!compositionSection || !compositionTags) return;
    
    const composition = product.composition || [];
    
    if (composition.length > 0) {
      compositionTags.innerHTML = composition.map(item => {
        return `<span style="padding: 6px 12px; background-color: #f5f5f5; border-radius: 20px; font-size: 14px; color: var(--primary-color);">${item}</span>`;
      }).join('');
      compositionSection.style.display = 'block';
    } else {
      compositionSection.style.display = 'none';
    }
  }

  /**
   * Отобразить галерею изображений
   */
  function renderImageGallery(product, imageData) {
    const gallery = document.getElementById('product-image-gallery');
    if (!gallery) return;
    
    gallery.style.display = 'flex';
    gallery.innerHTML = '';
    
    imageData.forEach((imageItem, index) => {
      const thumbnail = document.createElement('img');
      thumbnail.src = Utils.getProductImageUrl(imageData, product.id, index);
      thumbnail.alt = `${Utils.getProductName(product.name)} - изображение ${index + 1}`;
      thumbnail.className = 'product-image-thumbnail';
      thumbnail.style.cssText = 'width: 80px; height: 80px; object-fit: cover; border-radius: 8px; border: 2px solid transparent; cursor: pointer; transition: all 0.2s;';
      thumbnail.onerror = function() {
        this.src = 'https://openlab.citytech.cuny.edu/chenry-eportfolio/wp-content/themes/koji/assets/images/default-fallback-image.png';
      };
      
      // Выделяем первое изображение
      if (index === 0) {
        thumbnail.style.borderColor = 'var(--primary-color)';
      }
      
      // Клик на миниатюру - меняем основное изображение
      thumbnail.addEventListener('click', () => {
        if (productImage) {
          productImage.src = thumbnail.src;
        }
        
        // Обновляем выделение
        gallery.querySelectorAll('img').forEach((img, idx) => {
          if (idx === index) {
            img.style.borderColor = 'var(--primary-color)';
          } else {
            img.style.borderColor = 'transparent';
          }
        });
      });
      
      // Hover эффект
      thumbnail.addEventListener('mouseenter', () => {
        thumbnail.style.opacity = '0.8';
      });
      thumbnail.addEventListener('mouseleave', () => {
        thumbnail.style.opacity = '1';
      });
      
      gallery.appendChild(thumbnail);
    });
  }

  /**
   * Рассчитать итоговую цену с учетом модификаторов
   */
  function calculateTotalPrice(basePrice) {
    let total = basePrice;
    
    Object.values(selectedModifiers).forEach((optionIds) => {
      if (Array.isArray(optionIds)) {
        optionIds.forEach((optionId) => {
          const option = findModifierOption(optionId);
          if (option) {
            total += parseFloat(option.priceDelta || 0);
          }
        });
      }
    });
    
    return total;
  }

  /**
   * Найти опцию модификатора по ID
   */
  function findModifierOption(optionId) {
    if (!currentProduct || !currentProduct.modifiers) return null;
    
    for (const group of currentProduct.modifiers) {
      const option = group.options.find((opt) => opt.id === optionId);
      if (option) return option;
    }
    return null;
  }

  /**
   * Отобразить модификаторы
   */
  function renderModifiers(modifiers, currency) {
    if (!modifiersContainer) return;
    
    modifiersContainer.innerHTML = '';
    
    if (modifiers.length === 0) {
      return;
    }

    modifiers.forEach((group) => {
      const groupDiv = document.createElement('div');
      groupDiv.className = 'modifier-group';
      
      const groupName = Utils.getProductName(group.name);
      const isRequired = group.required;
      const isSingle = group.type === 'SINGLE';
      
      groupDiv.innerHTML = `
        <label class="modifier-group-label">
          ${groupName}${isRequired ? ' <span style="color: var(--error-color);">*</span>' : ''}
        </label>
        <div class="modifier-options" data-group-id="${group.id}" data-type="${group.type}">
          ${group.options.map((option) => {
            const optionName = Utils.getProductName(option.name);
            const priceDelta = parseFloat(option.priceDelta || 0);
            const priceText = priceDelta > 0 ? `+${Utils.formatPrice(priceDelta)} ${currency}` : '';
            const inputType = isSingle ? 'radio' : 'checkbox';
            const inputName = `modifier-${group.id}`;
            
            return `
              <label class="modifier-option">
                <input 
                  type="${inputType}" 
                  name="${inputName}" 
                  value="${option.id}" 
                  data-group-id="${group.id}"
                  data-option-id="${option.id}"
                  ${isRequired && isSingle && group.options.indexOf(option) === 0 ? 'checked' : ''}
                />
                <span class="modifier-option-label">
                  ${optionName}
                  ${priceText ? `<span class="modifier-price">${priceText}</span>` : ''}
                </span>
              </label>
            `;
          }).join('')}
        </div>
      `;
      
      modifiersContainer.appendChild(groupDiv);
    });

    // Обработчики изменения модификаторов
    modifiersContainer.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach((input) => {
      input.addEventListener('change', () => {
        handleModifierChange(input);
        updatePrice();
        validateModifiers();
      });
    });

    // Инициализировать выбранные модификаторы
    modifiers.forEach((group) => {
      if (group.required && group.type === 'SINGLE' && group.options.length > 0) {
        selectedModifiers[group.id] = [group.options[0].id];
      } else {
        selectedModifiers[group.id] = [];
      }
    });

    updatePrice();
  }

  /**
   * Обработка изменения модификатора
   */
  function handleModifierChange(input) {
    const groupId = input.dataset.groupId;
    const optionId = input.dataset.optionId;
    const group = currentProduct.modifiers.find((g) => g.id === groupId);
    
    if (!group) return;
    
    if (group.type === 'SINGLE') {
      // Для SINGLE - только одна опция может быть выбрана
      selectedModifiers[groupId] = input.checked ? [optionId] : [];
      
      // Снять выбор с других опций в группе
      modifiersContainer.querySelectorAll(`input[name="modifier-${groupId}"]`).forEach((otherInput) => {
        if (otherInput !== input) {
          otherInput.checked = false;
        }
      });
    } else {
      // Для MULTIPLE - можно выбрать несколько
      if (!selectedModifiers[groupId]) {
        selectedModifiers[groupId] = [];
      }
      
      if (input.checked) {
        if (!selectedModifiers[groupId].includes(optionId)) {
          selectedModifiers[groupId].push(optionId);
        }
      } else {
        selectedModifiers[groupId] = selectedModifiers[groupId].filter((id) => id !== optionId);
      }
    }
  }

  /**
   * Обновить отображение цены
   */
  function updatePrice() {
    if (!currentProduct || !productPrice) return;
    
    const basePrice = getBasePrice(currentProduct);
    const totalPrice = calculateTotalPrice(basePrice);
    const currency = isPublic && currentProduct.restaurant?.currency === 'KZT' 
      ? '₸' 
      : '₸';
    
    const formattedPrice = Utils.formatPrice(totalPrice);
    if (totalPrice !== basePrice) {
      productPrice.innerHTML = `
        <span style="text-decoration: line-through; color: var(--secondary-color); font-size: 0.9em;">
          ${Utils.formatPrice(basePrice)} ${currency}
        </span>
        <span style="margin-left: 8px; font-weight: 600;">
          ${formattedPrice} ${currency}
        </span>
      `;
    } else {
      productPrice.textContent = `${formattedPrice} ${currency}`;
    }
  }

  /**
   * Валидация модификаторов
   */
  function validateModifiers() {
    if (!currentProduct || !currentProduct.modifiers) return true;
    
    let isValid = true;
    
    currentProduct.modifiers.forEach((group) => {
      const selected = selectedModifiers[group.id] || [];
      const count = selected.length;
      
      if (group.required && count === 0) {
        isValid = false;
      }
      
      if (count < group.minSelect || count > group.maxSelect) {
        isValid = false;
      }
    });
    
    if (addToCartBtn) {
      addToCartBtn.disabled = !isValid;
    }
    
    return isValid;
  }

});

/**
 * Логика экрана меню
 * 
 * Зачем:
 * - Загрузка и отображение меню
 * - Фильтрация по категориям
 * - Поиск по названию блюда
 * - Добавление товаров в корзину
 */

let menuData = null;
let currentCategoryId = null;
let searchQuery = '';

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', async () => {
  // Получаем токен из URL или из localStorage
  const urlParams = new URLSearchParams(window.location.search);
  const tableTokenFromUrl = urlParams.get('table');
  const tableTokenFromStorage = Utils.getTableTokenFromStorage();
  
  // Если токен есть в URL, но не сохранен в localStorage, сохраняем его
  if (tableTokenFromUrl && !tableTokenFromStorage) {
    localStorage.setItem(CONFIG.STORAGE_KEYS.TABLE_TOKEN, tableTokenFromUrl);
  }
  
  const tableToken = tableTokenFromUrl || tableTokenFromStorage;
  let sessionId = Utils.getSession();
  let cartSocket = null;

  // Если нет сессии или токена - редиректим на guests.html
  if (!sessionId || !tableToken) {
    if (tableToken) {
      window.location.href = `guests.html?table=${tableToken}`;
    } else {
      Utils.showError('Сессия не найдена. Пожалуйста, начните с выбора количества гостей.');
      setTimeout(() => {
        window.location.href = 'index.html';
      }, 2000);
    }
    return;
  }

  // Элементы DOM
  const tableNumberElement = document.getElementById('table-number');
  const searchInput = document.getElementById('search-input');
  const categoriesList = document.getElementById('categories-list');
  const productsList = document.getElementById('products-list');
  const loadingIndicator = document.getElementById('loading');
  const hideCategoriesBtn = document.getElementById('hide-categories');
  const profileLink = document.getElementById('profile-link');

  // Показываем ссылку на профиль, если пользователь авторизован
  if (profileLink && typeof Auth !== 'undefined' && Auth.isAuthenticated() && Auth.isUser()) {
    profileLink.style.display = 'block';
  }

  function ensureCartBadgeWebSocket() {
    if (!sessionId) {
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

  // Загрузить меню
  try {
    loadingIndicator.style.display = 'block';
    
    const menu = await API.getMenu(tableToken);
    menuData = menu;

    // Сохранить информацию о столе и ресторане
    Utils.saveTableInfo(menu.table, menu.restaurant);

    // Отобразить номер стола
    if (tableNumberElement && menu.table) {
      tableNumberElement.textContent = `Стол №${menu.table.number}`;
    }

    // Загрузить и отобразить баннеры через отдельный эндпоинт
    try {
      const restaurantId = menu.restaurant.id;
      // Определяем язык из браузера или используем 'ru' по умолчанию
      const browserLang = navigator.language || navigator.userLanguage || 'ru';
      const lang = browserLang.toLowerCase().startsWith('kk') ? 'kk' : 
                   browserLang.toLowerCase().startsWith('en') ? 'en' : 'ru';
      const bannersFull = await API.getBanners(restaurantId);
      if (bannersFull && bannersFull.length > 0) {
        const banners = adaptBannersForDisplay(bannersFull, lang);
        renderBanners(banners);
      }
    } catch (bannerError) {
      console.warn('Failed to load banners:', bannerError);
      // Если не удалось загрузить баннеры через новый эндпоинт, используем старый способ (для обратной совместимости)
      if (menu.banners && menu.banners.length > 0) {
        renderBanners(menu.banners);
      }
    }

    // Отобразить категории
    renderCategories(menu.categories);

    // Отобразить продукты первой категории
    if (menu.categories.length > 0) {
      selectCategory(menu.categories[0].id);
    }

    // Загрузить социальные ссылки
    if (menu.restaurant && menu.restaurant.id) {
      await loadSocialLinks(menu.restaurant.id);
    }

    loadingIndicator.style.display = 'none';
  } catch (error) {
    loadingIndicator.style.display = 'none';
    Utils.showError(error.message || 'Не удалось загрузить меню.');
  }

  // Обработка поиска
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase().trim();
    
    // Обновить заголовок при поиске
    const categoryTitle = document.getElementById('category-title');
    if (categoryTitle) {
      if (searchQuery) {
        categoryTitle.textContent = 'Результаты поиска';
      } else {
        // Вернуть название выбранной категории
        if (menuData && currentCategoryId) {
          const category = menuData.categories.find((cat) => cat.id === currentCategoryId);
          if (category) {
            categoryTitle.textContent = Utils.getProductName(category.name);
          }
        }
      }
    }
    
    renderProducts();
  });

  // Кнопка скрытия категорий больше не нужна в мобильной версии

  /**
   * Отобразить категории
   */
  function renderCategories(categories) {
    if (!categoriesList) return;

    categoriesList.innerHTML = '';

    categories.forEach((category) => {
      const categoryItem = document.createElement('div');
      categoryItem.className = 'category-item';
      categoryItem.dataset.categoryId = category.id;

      if (currentCategoryId === category.id) {
        categoryItem.classList.add('active');
      }

      categoryItem.textContent = Utils.getProductName(category.name);
      categoryItem.addEventListener('click', () => {
        selectCategory(category.id);
      });

      categoriesList.appendChild(categoryItem);
    });
  }

  /**
   * Выбрать категорию
   */
  function selectCategory(categoryId) {
    currentCategoryId = categoryId;

    // Обновить активное состояние категорий
    document.querySelectorAll('.category-item').forEach((item) => {
      if (item.dataset.categoryId === categoryId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // Обновить заголовок категории
    const categoryTitle = document.getElementById('category-title');
    if (categoryTitle && menuData) {
      const category = menuData.categories.find((cat) => cat.id === categoryId);
      if (category) {
        categoryTitle.textContent = Utils.getProductName(category.name);
      }
    }

    // Отобразить продукты
    renderProducts();
  }

  /**
   * Отобразить продукты
   */
  function renderProducts() {
    if (!productsList || !menuData) return;

    let products = [];

    // Если есть поисковый запрос - показать результаты из всех категорий
    if (searchQuery) {
      menuData.categories.forEach((category) => {
        category.products.forEach((product) => {
          const name = Utils.getProductName(product.name).toLowerCase();
          const description = Utils.getProductDescription(product.description).toLowerCase();
          if (name.includes(searchQuery) || description.includes(searchQuery)) {
            products.push(product);
          }
        });
      });
    } else {
      // Иначе показать продукты только из выбранной категории
      const category = menuData.categories.find((cat) => cat.id === currentCategoryId);
      if (category) {
        products = category.products;
      }
    }

    productsList.innerHTML = '';

    if (products.length === 0) {
      productsList.innerHTML = '<div class="empty-state">Блюда не найдены</div>';
      return;
    }

    products.forEach((product) => {
      const productCard = createProductCard(product);
      productsList.appendChild(productCard);
    });
  }

  /**
   * Создать карточку продукта
   */
  function createProductCard(product) {
    const card = document.createElement('div');
    card.className = 'product-card';

    // Используем imageUrls если есть, иначе images/imageKeys
    const imageData = (product.imageUrls && product.imageUrls.length > 0)
      ? product.imageUrls
      : ((product.images && product.images.length > 0) ? product.images : (product.imageKeys || []));
    const imageUrl = Utils.getProductImageUrl(imageData, product.id, 0);
    const name = Utils.getProductName(product.name);
    const description = Utils.getProductDescription(product.description);
    const variants = product.variants || [];
    const hasVariants = variants.length > 0;
    const minVariantPrice = hasVariants
      ? Math.min(...variants.map((variant) => parseFloat(variant.price || 0)))
      : null;
    const priceValue = hasVariants && Number.isFinite(minVariantPrice)
      ? minVariantPrice
      : parseFloat(product.price || 0);
    const price = Utils.formatPrice(priceValue);
    const pricePrefix = hasVariants ? 'от ' : '';
    const ratingAverage =
      product.ratingAverage !== null && product.ratingAverage !== undefined
        ? product.ratingAverage
        : null;
    const reviewsCount =
      product.reviewsCount !== null && product.reviewsCount !== undefined
        ? product.reviewsCount
        : null;
    const ratingLabel =
      ratingAverage !== null
        ? reviewsCount
          ? `${ratingAverage.toFixed(1)} (${reviewsCount})`
          : ratingAverage.toFixed(1)
        : null;

    card.innerHTML = `
      <div class="product-image-container">
        <img src="${imageUrl}" alt="${name}" class="product-image" onerror="this.src='https://openlab.citytech.cuny.edu/chenry-eportfolio/wp-content/themes/koji/assets/images/default-fallback-image.png'" />
        ${ratingLabel ? `<div class="product-rating">${ratingLabel}</div>` : ''}
      </div>
      <div class="product-info">
        <h3 class="product-name">${name}</h3>
        <p class="product-description">${description || 'Описание отсутствует'}</p>
        <div class="product-footer">
          <span class="product-price">${pricePrefix}${price} ₸</span>
          <button class="btn-add-to-cart" data-product-id="${product.id}">
            ${hasVariants ? 'Выбрать' : 'Добавить'}
          </button>
        </div>
      </div>
    `;

    // Клик на карточку - переход на детальную страницу
    card.addEventListener('click', (e) => {
      // Не переходить если клик на кнопку
      if (e.target.closest('.btn-add-to-cart')) {
        return;
      }
      Utils.navigateToProduct(product.id);
    });

    // Кнопка "Добавить в корзину"
    const addBtn = card.querySelector('.btn-add-to-cart');
    addBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (hasVariants) {
        Utils.navigateToProduct(product.id);
        return;
      }
      await handleAddToCart(product.id, 1);
    });

    return card;
  }

  /**
   * Обработка добавления в корзину
   */
  async function handleAddToCart(productId, quantity) {
    try {
      try {
        await API.addToCart(sessionId, productId, quantity);
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
      await API.addToCart(sessionId, productId, quantity);
        } else {
          throw error;
        }
      }
      
      Utils.showSuccess('Товар добавлен в корзину');
      
      // Обновить счетчик корзины
      await Utils.updateCartBadge();
    } catch (error) {
      Utils.showError(error.message || 'Не удалось добавить товар в корзину.');
    }
  }

  /**
   * Адаптировать полные данные баннеров для отображения
   * Преобразует BannerResponseDto в формат для renderBanners
   * Сохраняет все языки для возможности переключения без дополнительных запросов
   */
  function adaptBannersForDisplay(bannersFull, lang = 'ru') {
    return bannersFull.map(banner => {
      // Выбираем текст на нужном языке для текущего отображения
      const title = banner[`title${lang.charAt(0).toUpperCase() + lang.slice(1)}`] || banner.titleRu || null;
      const subtitle = banner[`subtitle${lang.charAt(0).toUpperCase() + lang.slice(1)}`] || banner.subtitleRu || null;
      
      // Используем imageUrl из ответа, если есть, иначе формируем сами (для обратной совместимости)
      const imageUrl = banner.imageUrl || `${CONFIG.API_BASE_URL}/public/banners/${banner.id}/image`;
      
      // Формируем объект action
      const action = {
        type: banner.actionType,
        categoryId: banner.targetCategoryId || undefined,
        productId: banner.targetProductId || undefined,
        url: banner.targetUrl || undefined,
      };
      
      return {
        id: banner.id,
        // Текущий язык для отображения
        title,
        subtitle,
        // Все языки для возможности переключения
        titleRu: banner.titleRu || null,
        titleKk: banner.titleKk || null,
        titleEn: banner.titleEn || null,
        subtitleRu: banner.subtitleRu || null,
        subtitleKk: banner.subtitleKk || null,
        subtitleEn: banner.subtitleEn || null,
        // Изображение
        imageUrl,
        imageKey: banner.imageKey,
        // Действие
        action,
        // Метаданные (если нужны)
        priority: banner.priority,
        isActive: banner.isActive,
        startsAt: banner.startsAt,
        endsAt: banner.endsAt,
      };
    });
  }

  /**
   * Отобразить баннеры
   */
  function renderBanners(banners) {
    const bannersContainer = document.getElementById('banners-container');
    const bannersSlider = document.getElementById('banners-slider');
    const bannersDots = document.getElementById('banners-dots');

    if (!bannersContainer || !bannersSlider || !bannersDots) return;

    if (banners.length === 0) {
      bannersContainer.style.display = 'none';
      return;
    }

    bannersContainer.style.display = 'block';
    bannersSlider.innerHTML = '';
    bannersDots.innerHTML = '';

    banners.forEach((banner, index) => {
      // Создать элемент баннера
      const bannerItem = document.createElement('div');
      bannerItem.className = 'banner-item';
      bannerItem.dataset.index = index;

      const hasContent = banner.title || banner.subtitle;
      const contentHtml = hasContent
        ? `
          <div class="banner-content">
            ${banner.title ? `<div class="banner-title">${banner.title}</div>` : ''}
            ${banner.subtitle ? `<div class="banner-subtitle">${banner.subtitle}</div>` : ''}
          </div>
        `
        : '';

      bannerItem.innerHTML = `
        <img src="${banner.imageUrl}" alt="${banner.title || 'Баннер'}" class="banner-image" />
        ${contentHtml}
      `;

      // Обработчик клика
      bannerItem.addEventListener('click', () => {
        handleBannerClick(banner);
      });

      bannersSlider.appendChild(bannerItem);

      // Создать индикатор
      const dot = document.createElement('div');
      dot.className = 'banner-dot';
      if (index === 0) dot.classList.add('active');
      dot.addEventListener('click', () => {
        scrollToBanner(index);
      });
      bannersDots.appendChild(dot);
    });

    // Добавить поддержку свайпа
    let currentBannerIndex = 0;
    addSwipeSupport(bannersSlider, banners.length, (newIndex) => {
      currentBannerIndex = newIndex;
    });

    // Автопрокрутка баннеров
    let autoScrollInterval = null;
    let scrollTimeout = null;
    
    function startAutoScroll() {
      if (banners.length <= 1) return;
      
      autoScrollInterval = setInterval(() => {
        currentBannerIndex = (currentBannerIndex + 1) % banners.length;
        scrollToBanner(currentBannerIndex);
      }, 5000);
    }
    
    function stopAutoScroll() {
      if (autoScrollInterval) {
        clearInterval(autoScrollInterval);
        autoScrollInterval = null;
      }
    }
    
    function restartAutoScroll() {
      stopAutoScroll();
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        startAutoScroll();
    }, 5000);
    }
    
    // Начать автопрокрутку
    startAutoScroll();

    // Остановить автопрокрутку при взаимодействии
    bannersSlider.addEventListener('scroll', () => {
      restartAutoScroll();
    }, { passive: true });
  }

  /**
   * Добавить поддержку свайпа для баннеров
   */
  function addSwipeSupport(slider, bannerCount, onIndexChange) {
    if (bannerCount <= 1) return;

    let touchStartX = 0;
    let touchEndX = 0;
    let isDragging = false;
    let startScrollLeft = 0;

    // Touch события для мобильных устройств
    slider.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
      startScrollLeft = slider.scrollLeft;
      isDragging = true;
      slider.style.scrollBehavior = 'auto'; // Отключить плавную прокрутку во время драга
    }, { passive: true });

    slider.addEventListener('touchmove', (e) => {
      if (!isDragging) return;
      const currentX = e.touches[0].clientX;
      const diff = touchStartX - currentX;
      slider.scrollLeft = startScrollLeft + diff;
    }, { passive: true });

    slider.addEventListener('touchend', (e) => {
      if (!isDragging) return;
      isDragging = false;
      touchEndX = e.changedTouches[0].clientX;
      slider.style.scrollBehavior = 'smooth'; // Включить плавную прокрутку обратно

      const swipeDistance = touchStartX - touchEndX;
      const swipeThreshold = 50; // Минимальное расстояние для свайпа
      const sliderWidth = slider.offsetWidth;
      const currentIndex = Math.round(slider.scrollLeft / sliderWidth);

      if (Math.abs(swipeDistance) > swipeThreshold) {
        let newIndex;
        if (swipeDistance > 0) {
          // Свайп влево - следующий баннер
          newIndex = Math.min(currentIndex + 1, bannerCount - 1);
        } else {
          // Свайп вправо - предыдущий баннер
          newIndex = Math.max(currentIndex - 1, 0);
        }
        scrollToBanner(newIndex);
        if (onIndexChange) onIndexChange(newIndex);
      } else {
        // Если свайп был слишком коротким, вернуться к текущему баннеру
        scrollToBanner(currentIndex);
        if (onIndexChange) onIndexChange(currentIndex);
      }
    }, { passive: true });

    // Mouse события для десктопа (опционально)
    let mouseDown = false;
    let mouseStartX = 0;
    let mouseStartScrollLeft = 0;

    slider.addEventListener('mousedown', (e) => {
      mouseDown = true;
      mouseStartX = e.clientX;
      mouseStartScrollLeft = slider.scrollLeft;
      slider.style.scrollBehavior = 'auto';
      slider.style.cursor = 'grabbing';
      e.preventDefault();
    });

    slider.addEventListener('mousemove', (e) => {
      if (!mouseDown) return;
      const diff = mouseStartX - e.clientX;
      slider.scrollLeft = mouseStartScrollLeft + diff;
    });

    slider.addEventListener('mouseup', () => {
      if (!mouseDown) return;
      mouseDown = false;
      slider.style.scrollBehavior = 'smooth';
      slider.style.cursor = 'grab';
      
      const sliderWidth = slider.offsetWidth;
      const currentIndex = Math.round(slider.scrollLeft / sliderWidth);
      scrollToBanner(currentIndex);
      if (onIndexChange) onIndexChange(currentIndex);
    });

    slider.addEventListener('mouseleave', () => {
      if (mouseDown) {
        mouseDown = false;
        slider.style.scrollBehavior = 'smooth';
        slider.style.cursor = 'grab';
        
        const sliderWidth = slider.offsetWidth;
        const currentIndex = Math.round(slider.scrollLeft / sliderWidth);
        scrollToBanner(currentIndex);
        if (onIndexChange) onIndexChange(currentIndex);
      }
    });

    // Установить курсор grab
    slider.style.cursor = 'grab';
  }

  /**
   * Прокрутить к баннеру
   */
  function scrollToBanner(index) {
    const bannersSlider = document.getElementById('banners-slider');
    if (!bannersSlider) return;
    
    const bannerItem = bannersSlider.querySelector(`[data-index="${index}"]`);
    if (bannerItem) {
      const sliderWidth = bannersSlider.offsetWidth;
      const targetScroll = index * sliderWidth;
      bannersSlider.scrollTo({
        left: targetScroll,
        behavior: 'smooth'
      });
    }

    // Обновить активные индикаторы
    document.querySelectorAll('.banner-dot').forEach((dot, i) => {
      if (i === index) {
        dot.classList.add('active');
      } else {
        dot.classList.remove('active');
      }
    });
  }

  /**
   * Обработать клик на баннер
   */
  function handleBannerClick(banner) {
    if (!banner.action) return;

    switch (banner.action.type) {
      case 'CATEGORY':
        if (banner.action.categoryId) {
          selectCategory(banner.action.categoryId);
          // Прокрутить к категориям
          document.querySelector('.categories-container')?.scrollIntoView({ behavior: 'smooth' });
        }
        break;
      case 'PRODUCT':
        if (banner.action.productId) {
          Utils.navigateToProduct(banner.action.productId);
        }
        break;
      case 'URL':
        if (banner.action.url) {
          window.open(banner.action.url, '_blank');
        }
        break;
      case 'NONE':
      default:
        // Ничего не делать
        break;
    }
  }

  /**
   * Загрузить социальные ссылки ресторана
   */
  async function loadSocialLinks(restaurantId) {
    try {
      // getRestaurantSocialLinks уже возвращает массив ссылок (response.data из API)
      const links = await API.getRestaurantSocialLinks(restaurantId);
      
      // Убеждаемся, что это массив
      const linksArray = Array.isArray(links) ? links : [];
      
      const container = document.getElementById('social-links-container');
      const list = document.getElementById('social-links-list');
      
      if (!container || !list) {
        console.warn('Social links container not found in DOM');
        return;
      }
      
      if (linksArray.length === 0) {
        container.style.display = 'none';
        return;
      }

      container.style.display = 'block';
      
      list.innerHTML = linksArray.map(link => {
        const iconUrl = link.icon ? API.getSocialIconUrl(link.icon) : null;
        const iconHtml = iconUrl 
          ? `<img src="${iconUrl}" alt="${link.label}" style="width: 24px; height: 24px; object-fit: contain;" onerror="this.style.display='none'">`
          : '';
        
        return `
          <a href="${link.url}" target="_blank" rel="noopener noreferrer" 
             style="display: flex; align-items: center; gap: 8px; padding: 10px 16px; background: #f5f5f5; border-radius: 8px; text-decoration: none; color: var(--primary-color); font-weight: 500; font-size: 14px; transition: all 0.2s;"
             onmouseover="this.style.background='#e8e8e8'; this.style.transform='translateY(-2px)'"
             onmouseout="this.style.background='#f5f5f5'; this.style.transform='translateY(0)'">
            ${iconHtml}
            <span>${link.label}</span>
          </a>
        `;
      }).join('');
    } catch (error) {
      console.error('Failed to load social links:', error);
      // Не показываем ошибку пользователю, просто скрываем контейнер
      const container = document.getElementById('social-links-container');
      if (container) {
        container.style.display = 'none';
      }
    }
  }

  // Инициализировать счетчик корзины при загрузке
  Utils.updateCartBadge();
  ensureCartBadgeWebSocket();
});

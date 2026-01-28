/**
 * Логика страницы публичного меню ресторана
 * 
 * Назначение:
 * - Загрузка и отображение меню ресторана по ID
 * - Фильтрация по категориям
 * - Поиск по названию блюда
 * - Режим только просмотра (без корзины и заказов)
 */

let menuData = null;
let currentCategoryId = null;
let searchQuery = '';
let restaurantId = null; // Глобальная переменная для использования в функциях бронирования

document.addEventListener('DOMContentLoaded', async () => {
  // Получить restaurantId из URL
  const urlParams = new URLSearchParams(window.location.search);
  restaurantId = urlParams.get('restaurantId');

  if (!restaurantId) {
    Utils.showError('ID ресторана не указан');
    setTimeout(() => {
      window.location.href = 'restaurants.html';
    }, 2000);
    return;
  }

  // Элементы DOM
  const restaurantNameElement = document.getElementById('restaurant-name');
  const restaurantCityElement = document.getElementById('restaurant-city');
  const searchInput = document.getElementById('search-input');
  const categoriesList = document.getElementById('categories-list');
  const productsList = document.getElementById('products-list');
  const loadingIndicator = document.getElementById('loading');
  const errorMessage = document.getElementById('error-message');
  const hideCategoriesBtn = document.getElementById('hide-categories');

  /**
   * Загрузить меню ресторана
   */
  async function loadMenu() {
    try {
      loadingIndicator.style.display = 'block';
      errorMessage.style.display = 'none';

      const data = await API.getRestaurantMenu(restaurantId);
      menuData = data;

      // Отобразить информацию о ресторане
      if (restaurantNameElement) {
        restaurantNameElement.textContent = data.restaurant.name;
      }
      if (restaurantCityElement) {
        restaurantCityElement.textContent = ` ${data.restaurant.city}`;
      }

      // Загрузить и отобразить баннеры через отдельный эндпоинт
      try {
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
        if (data.banners && data.banners.length > 0) {
          renderBanners(data.banners);
        }
      }

      // Отобразить категории
      renderCategories(data.categories);

      // Отобразить продукты первой категории
      if (data.categories.length > 0) {
        selectCategory(data.categories[0].id);
      } else {
        productsList.innerHTML = '<div class="empty-state">Меню пусто</div>';
      }

      // Загрузить социальные ссылки
      await loadSocialLinks();

      loadingIndicator.style.display = 'none';
    } catch (error) {
      loadingIndicator.style.display = 'none';
      errorMessage.textContent = error.message || 'Не удалось загрузить меню ресторана';
      errorMessage.style.display = 'block';
      console.error('Failed to load menu:', error);
    }
  }

  /**
   * Отобразить категории
   */
  function renderCategories(categories) {
    if (!categoriesList) return;

    categoriesList.innerHTML = '';

    if (categories.length === 0) {
      return;
    }

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
   * Создать карточку продукта (режим только просмотра)
   */
  function createProductCard(product) {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.style.cursor = 'pointer';

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
    const currency = menuData?.restaurant?.currency === 'KZT' ? '₸' : menuData?.restaurant?.currency || '₸';
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
          <span class="product-price">${pricePrefix}${price} ${currency}</span>
        </div>
      </div>
    `;

    // Обработчик клика для открытия детальной страницы
    card.addEventListener('click', () => {
      navigateToProduct(product.id);
    });

    return card;
  }

  /**
   * Перейти к детальной странице продукта
   */
  function navigateToProduct(productId) {
    window.location.href = `product-detail.html?product=${productId}&restaurantId=${restaurantId}&public=true`;
  }

  // Обработка поиска
  if (searchInput) {
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
  }

  // Кнопка скрытия категорий не нужна в мобильной версии

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
      slider.style.scrollBehavior = 'auto';
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
      slider.style.scrollBehavior = 'smooth';

      const swipeDistance = touchStartX - touchEndX;
      const swipeThreshold = 50;
      const sliderWidth = slider.offsetWidth;
      const currentIndex = Math.round(slider.scrollLeft / sliderWidth);

      if (Math.abs(swipeDistance) > swipeThreshold) {
        let newIndex;
        if (swipeDistance > 0) {
          newIndex = Math.min(currentIndex + 1, bannerCount - 1);
        } else {
          newIndex = Math.max(currentIndex - 1, 0);
        }
        scrollToBanner(newIndex);
        if (onIndexChange) onIndexChange(newIndex);
      } else {
        scrollToBanner(currentIndex);
        if (onIndexChange) onIndexChange(currentIndex);
      }
    }, { passive: true });

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
          navigateToProduct(banner.action.productId);
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
  async function loadSocialLinks() {
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

  // Загрузить меню при инициализации
  await loadMenu();
});

// ===== Функции для бронирования столов =====

let selectedTableId = null;
let availableTables = [];

/**
 * Открыть модальное окно бронирования
 */
function openReservationModal() {
  const modal = document.getElementById('reservation-modal');
  const authCheck = document.getElementById('reservation-auth-check');
  const form = document.getElementById('reservation-form');
  const success = document.getElementById('reservation-success');

  modal.classList.add('active');

  // Закрытие при клике вне модального окна
  modal.addEventListener('click', function(e) {
    if (e.target === modal) {
      closeReservationModal();
    }
  });

  // Проверяем авторизацию
  if (typeof Auth === 'undefined' || !Auth.isAuthenticated()) {
    // Показываем сообщение об авторизации
    authCheck.style.display = 'block';
    form.style.display = 'none';
    success.style.display = 'none';

    // Обновляем ссылку для редиректа
    const loginLink = document.getElementById('reservation-login-link');
    if (loginLink && restaurantId) {
      const currentUrl = `restaurant-menu.html?restaurantId=${restaurantId}`;
      loginLink.href = `user-login.html?redirect=${encodeURIComponent(currentUrl)}`;
    }
    return;
  }

  // Пользователь авторизован - показываем форму
  authCheck.style.display = 'none';
  form.style.display = 'block';
  success.style.display = 'none';

  // Устанавливаем минимальную дату (текущая + 15 минут)
  const datetimeInput = document.getElementById('reservation-datetime');
  const minDate = new Date(Date.now() + 15 * 60 * 1000);
  datetimeInput.min = minDate.toISOString().slice(0, 16);

  // Сбрасываем форму
  selectedTableId = null;
  document.getElementById('reservation-form').reset();
  document.getElementById('reservation-submit-btn').disabled = true;
  document.getElementById('reservation-tables-grid').innerHTML = '';

  // Обработчики событий
  datetimeInput.addEventListener('change', handleReservationDateTimeChange);
}

/**
 * Закрыть модальное окно бронирования
 */
function closeReservationModal() {
  const modal = document.getElementById('reservation-modal');
  modal.classList.remove('active');
  
  // Сбрасываем состояние
  selectedTableId = null;
  document.getElementById('reservation-form').reset();
  document.getElementById('reservation-submit-btn').disabled = true;
}

/**
 * Обработать изменение даты/времени брони
 */
async function handleReservationDateTimeChange(event) {
  const datetime = event.target.value;
  
  if (!datetime || !restaurantId) {
    return;
  }

  await loadReservationTables(datetime);
}

/**
 * Загрузить доступные столы для бронирования
 */
async function loadReservationTables(datetime) {
  const tablesLoading = document.getElementById('reservation-tables-loading');
  const tablesGrid = document.getElementById('reservation-tables-grid');
  const submitBtn = document.getElementById('reservation-submit-btn');
  
  tablesLoading.style.display = 'block';
  tablesGrid.innerHTML = '';
  selectedTableId = null;
  submitBtn.disabled = true;

  try {
    availableTables = await API.getTableAvailability(restaurantId, datetime);
    
    if (!availableTables || availableTables.length === 0) {
      tablesGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #999; padding: 20px;">Нет доступных столов</p>';
      return;
    }

    tablesGrid.innerHTML = availableTables.map(table => {
      const isAvailable = table.is_available;
      const statusText = isAvailable ? 'Доступен' : 'Занят';
      const tableClass = isAvailable ? '' : 'table-unavailable';
      
      return `
        <div class="reservation-table-item ${tableClass}" 
             data-table-id="${table.id}" 
             ${isAvailable ? `onclick="selectReservationTable('${table.id}')"` : ''}>
          <div class="reservation-table-number">№${table.number}</div>
          <div class="reservation-table-status">${statusText}</div>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('Failed to load tables:', error);
    tablesGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #c33; padding: 20px;">Ошибка загрузки столов</p>';
    Utils.showError('Не удалось загрузить столы: ' + error.message);
  } finally {
    tablesLoading.style.display = 'none';
  }
}

/**
 * Выбрать стол для бронирования
 */
function selectReservationTable(tableId) {
  selectedTableId = tableId;

  // Обновляем визуальное отображение
  document.querySelectorAll('.reservation-table-item').forEach(item => {
    item.classList.remove('table-selected');
    if (item.dataset.tableId === tableId) {
      item.classList.add('table-selected');
    }
  });

  // Активируем кнопку отправки
  document.getElementById('reservation-submit-btn').disabled = false;
}

/**
 * Обработать отправку формы бронирования
 */
document.addEventListener('DOMContentLoaded', () => {
  const reservationForm = document.getElementById('reservation-form');
  if (reservationForm) {
    reservationForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      if (!selectedTableId) {
        Utils.showError('Пожалуйста, выберите стол');
        return;
      }

      const datetime = document.getElementById('reservation-datetime').value;
      const guestsCount = parseInt(document.getElementById('reservation-guests').value);
      const comment = document.getElementById('reservation-comment').value;

      const submitBtn = document.getElementById('reservation-submit-btn');
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Отправка...';

      try {
        await API.createReservation({
          tableId: selectedTableId,
          guestsCount: guestsCount,
          reservationDate: datetime,
          comment: comment || undefined,
        });

        // Показываем успех
        document.getElementById('reservation-form').style.display = 'none';
        document.getElementById('reservation-success').style.display = 'block';

        // Автоматически закрываем через 3 секунды
        setTimeout(() => {
          closeReservationModal();
          // Перенаправляем в профиль
          window.location.href = 'profile.html';
        }, 3000);
      } catch (error) {
        console.error('Failed to create reservation:', error);
        Utils.showError('Не удалось создать бронь: ' + error.message);
        
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-check"></i> Забронировать';
      }
    });
  }
});

// Экспорт функций для использования в HTML
window.openReservationModal = openReservationModal;
window.closeReservationModal = closeReservationModal;
window.selectReservationTable = selectReservationTable;

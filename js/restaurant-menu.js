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
let restaurantId = null;

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
        const banners = await API.getBanners(restaurantId, lang);
        if (banners && banners.length > 0) {
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

    // Используем images если есть, иначе imageKeys
    const images = product.images || [];
    const imageData = images.length > 0 ? images : (product.imageKeys || []);
    const imageUrl = Utils.getProductImageUrl(imageData, product.id, 0);
    const name = Utils.getProductName(product.name);
    const description = Utils.getProductDescription(product.description);
    const price = Utils.formatPrice(product.price);
    const currency = menuData?.restaurant?.currency === 'KZT' ? '₸' : menuData?.restaurant?.currency || '₸';

    card.innerHTML = `
      <div class="product-image-container">
        <img src="${imageUrl}" alt="${name}" class="product-image" onerror="this.src='https://openlab.citytech.cuny.edu/chenry-eportfolio/wp-content/themes/koji/assets/images/default-fallback-image.png'" />
      </div>
      <div class="product-info">
        <h3 class="product-name">${name}</h3>
        <p class="product-description">${description || 'Описание отсутствует'}</p>
        <div class="product-footer">
          <span class="product-price">${price} ${currency}</span>
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

  // Загрузить меню при инициализации
  await loadMenu();
});


/**
 * Логика страницы списка ресторанов
 * 
 * Назначение:
 * - Загрузка и отображение списка всех доступных ресторанов
 * - Переход к просмотру меню выбранного ресторана
 * - Публичный доступ без QR кода
 */

document.addEventListener('DOMContentLoaded', async () => {
  const restaurantsList = document.getElementById('restaurants-list');
  const loadingIndicator = document.getElementById('loading');
  const errorMessage = document.getElementById('error-message');

  /**
   * Загрузить и отобразить список ресторанов
   */
  async function loadRestaurants() {
    try {
      loadingIndicator.style.display = 'block';
      restaurantsList.innerHTML = '';
      errorMessage.style.display = 'none';

      const restaurants = await API.getAllRestaurants();

      loadingIndicator.style.display = 'none';

      if (!restaurants || restaurants.length === 0) {
        restaurantsList.innerHTML = '<div class="empty-state">Рестораны не найдены</div>';
        return;
      }

      restaurants.forEach((restaurant) => {
        const card = createRestaurantCard(restaurant);
        restaurantsList.appendChild(card);
      });
    } catch (error) {
      loadingIndicator.style.display = 'none';
      errorMessage.textContent = error.message || 'Не удалось загрузить список ресторанов';
      errorMessage.style.display = 'block';
      console.error('Failed to load restaurants:', error);
    }
  }

  /**
   * Создать карточку ресторана
   */
  function createRestaurantCard(restaurant) {
    const card = document.createElement('div');
    card.className = 'restaurant-card';
    card.dataset.restaurantId = restaurant.id;

    const hasMenu = restaurant.categoriesCount && restaurant.categoriesCount > 0;
    const menuInfo = hasMenu
      ? `<span><i class="fas fa-folder"></i> ${restaurant.categoriesCount} категорий</span><span><i class="fas fa-utensils"></i> ${restaurant.productsCount || 0} блюд</span>`
      : '<span class="no-menu">Меню не добавлено</span>';

    card.innerHTML = `
      <div class="restaurant-card-content">
        <div class="restaurant-info">
          <h2 class="restaurant-name">${Utils.escapeHtml(restaurant.name)}</h2>
          <p class="restaurant-city">${Utils.escapeHtml(restaurant.city)}</p>
          <div class="restaurant-menu-info ${hasMenu ? 'has-menu' : 'no-menu'}">
            ${menuInfo}
          </div>
        </div>
        <div class="restaurant-arrow">
          <i class="fas fa-chevron-right"></i>
        </div>
      </div>
    `;

    card.addEventListener('click', () => {
      if (hasMenu) {
      navigateToRestaurantMenu(restaurant.id);
      } else {
        Utils.showError('Меню для этого ресторана еще не добавлено');
      }
    });

    return card;
  }

  /**
   * Перейти к меню ресторана
   */
  function navigateToRestaurantMenu(restaurantId) {
    window.location.href = `restaurant-menu.html?restaurantId=${restaurantId}`;
  }

  // Загрузить рестораны при инициализации
  await loadRestaurants();
});


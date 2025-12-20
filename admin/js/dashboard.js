/**
 * Логика главной страницы админки
 */

document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Загружаем статистику
    const [restaurantsRes, tablesRes, categoriesRes, productsRes] = await Promise.all([
      AdminAPI.getRestaurants(),
      AdminAPI.getTables(),
      AdminAPI.getCategories(),
      AdminAPI.getProducts(),
    ]);

    // Обновляем счетчики
    document.getElementById('restaurants-count').textContent = 
      restaurantsRes.data?.data?.length || restaurantsRes.data?.length || 0;
    
    document.getElementById('tables-count').textContent = 
      tablesRes.data?.data?.length || tablesRes.data?.length || 0;
    
    document.getElementById('categories-count').textContent = 
      categoriesRes.meta?.total || categoriesRes.data?.length || 0;
    
    document.getElementById('products-count').textContent = 
      productsRes.meta?.total || productsRes.data?.length || 0;

    // Отображаем последние рестораны
    const restaurants = restaurantsRes.data?.data || restaurantsRes.data || [];
    const recentRestaurants = restaurants.slice(0, 5);
    
    const container = document.getElementById('recent-restaurants');
    if (recentRestaurants.length === 0) {
      container.innerHTML = '<div class="empty-state">Нет ресторанов</div>';
    } else {
      container.innerHTML = recentRestaurants.map(restaurant => `
        <div class="list-item">
          <div class="list-item-info">
            <h4>${restaurant.name}</h4>
            <p>${restaurant.city} • Столов: ${restaurant._count?.tables || 0}</p>
          </div>
          <div class="list-item-actions">
            <button class="btn-icon" onclick="window.location.href='restaurants.html?id=${restaurant.id}'" title="Редактировать">
              <i class="fas fa-edit"></i>
            </button>
          </div>
        </div>
      `).join('');
    }
  } catch (error) {
    console.error('Failed to load dashboard data:', error);
    Utils.showError('Не удалось загрузить данные');
  }
});


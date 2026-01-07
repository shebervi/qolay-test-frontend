/**
 * Логика главной страницы админки
 */

// Форматирование числа с пробелами
function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

// Форматирование даты для input type="date"
function formatDateForInput(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Загрузка аналитики
async function loadAnalytics(restaurantId, dateFrom, dateTo) {
  try {
    const analyticsRes = await AdminAPI.getDashboardAnalytics(restaurantId, dateFrom, dateTo);
    
    // Логируем ответ для отладки
    console.log('Analytics response:', analyticsRes);
    
    // Проверяем структуру ответа
    if (!analyticsRes) {
      throw new Error('Пустой ответ от сервера');
    }
    
    // API возвращает { success: true, data: {...} }
    if (!analyticsRes.success) {
      throw new Error(analyticsRes.message || 'Ошибка при получении аналитики');
    }
    
    // Данные находятся в analyticsRes.data (не analyticsRes.data.data)
    const analytics = analyticsRes.data;
    
    if (!analytics) {
      console.error('Analytics data is missing:', analyticsRes);
      throw new Error('Не удалось получить данные аналитики');
    }

    // Обновляем статистику
    document.getElementById('orders-count').textContent = formatNumber(analytics.ordersCount || 0);
    document.getElementById('revenue').textContent = formatNumber(parseFloat(analytics.revenue || 0).toFixed(0));
    document.getElementById('average-check').textContent = formatNumber(parseFloat(analytics.averageCheck || 0).toFixed(0));
    document.getElementById('tips').textContent = formatNumber(parseFloat(analytics.tips || 0).toFixed(0));

    // Обновляем QR сканирования
    const qrScansContainer = document.getElementById('qr-scans-stats');
    if (analytics.qrScans) {
      qrScansContainer.innerHTML = `
        <div class="qr-scan-item">
          <div class="qr-scan-label">За сегодня</div>
          <div class="qr-scan-value">${formatNumber(analytics.qrScans.today || 0)}</div>
        </div>
        <div class="qr-scan-item">
          <div class="qr-scan-label">За неделю</div>
          <div class="qr-scan-value">${formatNumber(analytics.qrScans.week || 0)}</div>
        </div>
        <div class="qr-scan-item">
          <div class="qr-scan-label">За месяц</div>
          <div class="qr-scan-value">${formatNumber(analytics.qrScans.month || 0)}</div>
        </div>
      `;
    } else {
      qrScansContainer.innerHTML = '<div class="empty-state">Нет данных</div>';
    }

    // Обновляем популярные блюда
    const popularDishesContainer = document.getElementById('popular-dishes');
    if (analytics.popularDishes && analytics.popularDishes.length > 0) {
      popularDishesContainer.innerHTML = analytics.popularDishes.map(dish => `
        <div class="list-item">
          <div class="list-item-info">
            <h4>${dish.nameRu}</h4>
            <p>${dish.quantity} шт. • ${formatNumber(parseFloat(dish.revenue || 0).toFixed(0))} 〒</p>
          </div>
        </div>
      `).join('');
    } else {
      popularDishesContainer.innerHTML = '<div class="empty-state">Нет данных</div>';
    }

    // Обновляем последние заказы
    const recentOrdersContainer = document.getElementById('recent-orders');
    if (analytics.recentOrders && analytics.recentOrders.length > 0) {
      recentOrdersContainer.innerHTML = analytics.recentOrders.map(order => {
        const date = new Date(order.createdAt);
        const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
        
        let statusClass = 'status-badge';
        let statusText = order.status;
        if (order.status === 'PAID' || order.status === 'CLOSED') {
          statusClass += ' status-success';
          statusText = order.status === 'PAID' ? 'Оплачен' : 'Закрыт';
        } else if (order.status === 'COOKING' || order.status === 'ACCEPTED') {
          statusClass += ' status-warning';
          statusText = order.status === 'COOKING' ? 'Готовится' : 'Принят';
        } else if (order.status === 'READY') {
          statusClass += ' status-info';
          statusText = 'Готово';
        } else if (order.status === 'CANCELED') {
          statusClass += ' status-error';
          statusText = 'Отменен';
        } else {
          statusText = order.status;
        }

        return `
          <div class="list-item">
            <div class="list-item-info">
              <h4>Заказ №${order.orderNumber}</h4>
              <p>Стол №${order.tableNumber} • ${formatNumber(parseFloat(order.totalKzt || 0).toFixed(0))} 〒 • <span class="${statusClass}">${statusText}</span> • ${time}</p>
            </div>
          </div>
        `;
      }).join('');
    } else {
      recentOrdersContainer.innerHTML = '<div class="empty-state">Нет заказов</div>';
    }
  } catch (error) {
    console.error('Failed to load analytics:', error);
    const errorMessage = error.message || 'Не удалось загрузить аналитику';
    Utils.showError(errorMessage);
    
    // Показываем состояние загрузки в UI
    document.getElementById('orders-count').textContent = '-';
    document.getElementById('revenue').textContent = '-';
    document.getElementById('average-check').textContent = '-';
    document.getElementById('tips').textContent = '-';
    document.getElementById('qr-scans-stats').innerHTML = '<div class="empty-state">Ошибка загрузки</div>';
    document.getElementById('popular-dishes').innerHTML = '<div class="empty-state">Ошибка загрузки</div>';
    document.getElementById('recent-orders').innerHTML = '<div class="empty-state">Ошибка загрузки</div>';
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Устанавливаем дату по умолчанию (сегодня)
    const dateFilter = document.getElementById('date-filter');
    if (dateFilter) {
      dateFilter.value = formatDateForInput(new Date());
    }

    // Обработчик кнопки применения фильтра
    const applyFilterBtn = document.getElementById('apply-filter-btn');
    if (applyFilterBtn) {
      applyFilterBtn.addEventListener('click', () => {
        const selectedDate = dateFilter.value;
        if (selectedDate) {
          loadAnalytics(undefined, selectedDate, selectedDate);
        } else {
          loadAnalytics();
        }
      });
    }

    // Загружаем аналитику при загрузке страницы
    const selectedDate = dateFilter?.value;
    if (selectedDate) {
      await loadAnalytics(undefined, selectedDate, selectedDate);
    } else {
      await loadAnalytics();
    }

    // Загружаем базовую статистику
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


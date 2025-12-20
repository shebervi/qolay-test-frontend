/**
 * Логика страницы категорий
 */

let currentCategoryId = null;
let restaurants = [];
let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
  // Получаем текущего пользователя
  if (typeof Auth !== 'undefined') {
    currentUser = Auth.getAuthUser();
  }

  // Загружаем рестораны для фильтра и формы
  await loadRestaurants();
  
  // Скрываем кнопку добавления для WAITER и KITCHEN
  const btnAddCategory = document.querySelector('button[onclick="openCategoryModal()"]');
  if (btnAddCategory) {
    const canCreateCategory = currentUser?.role !== 'WAITER' && currentUser?.role !== 'KITCHEN';
    btnAddCategory.style.display = canCreateCategory ? 'block' : 'none';
  }
  
  // Обработка фильтра
  document.getElementById('restaurant-filter').addEventListener('change', async (e) => {
    await loadCategories(e.target.value);
  });

  // Обработка формы
  document.getElementById('category-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveCategory();
  });

  await loadCategories();
});

async function loadRestaurants() {
  try {
    const response = await AdminAPI.getRestaurants();
    restaurants = response.data?.data || response.data || [];
    
    // Заполняем фильтр
    const filter = document.getElementById('restaurant-filter');
    filter.innerHTML = '<option value="">Все рестораны</option>' + 
      restaurants.map(r => `<option value="${r.id}">${r.name}</option>`).join('');

    // Заполняем форму
    const formSelect = document.getElementById('category-restaurant');
    formSelect.innerHTML = '<option value="">Выберите ресторан</option>' +
      restaurants.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
  } catch (error) {
    console.error('Failed to load restaurants:', error);
    Utils.showError('Не удалось загрузить рестораны');
  }
}

async function loadCategories(restaurantId = null) {
  try {
    const response = await AdminAPI.getCategories(restaurantId);
    const categories = response.data || [];
    
    const container = document.getElementById('categories-list');
    
    if (categories.length === 0) {
      container.innerHTML = '<div class="empty-state">Нет категорий. Добавьте первую категорию.</div>';
      return;
    }

    // Проверяем права доступа
    const canEditCategory = currentUser?.role !== 'WAITER' && currentUser?.role !== 'KITCHEN';
    const canDeleteCategory = currentUser?.role !== 'WAITER' && currentUser?.role !== 'KITCHEN';

    container.innerHTML = categories.map(category => {
      const restaurant = restaurants.find(r => r.id === category.restaurant_id);
      return `
        <div class="list-item">
          <div class="list-item-info">
            <h4>${category.name_ru || category.name_kk || category.name_en}</h4>
            <p>${restaurant?.name || 'Ресторан не найден'} • Порядок: ${category.sort_order || 0}</p>
          </div>
          <div class="list-item-actions">
            ${canEditCategory ? `
            <button class="btn-icon" onclick="editCategory('${category.id}')" title="Редактировать">
              <i class="fas fa-edit"></i>
            </button>
            ` : ''}
            ${canDeleteCategory ? `
            <button class="btn-icon" onclick="deleteCategory('${category.id}')" title="Удалить">
              <i class="fas fa-trash"></i>
            </button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('Failed to load categories:', error);
    Utils.showError('Не удалось загрузить категории');
  }
}

async function loadCategory(id) {
  try {
    const response = await AdminAPI.getCategory(id);
    const category = response.data?.data || response.data;
    
    currentCategoryId = id;
    document.getElementById('category-id').value = id;
    document.getElementById('category-restaurant').value = category.restaurant_id;
    document.getElementById('category-name-ru').value = category.name_ru || '';
    document.getElementById('category-name-kk').value = category.name_kk || '';
    document.getElementById('category-name-en').value = category.name_en || '';
    document.getElementById('category-sort-order').value = category.sort_order || 0;
    document.getElementById('category-modal-title').textContent = 'Редактировать категорию';
  } catch (error) {
    console.error('Failed to load category:', error);
    Utils.showError('Не удалось загрузить категорию');
  }
}

async function saveCategory() {
  try {
    const data = {
      restaurantId: document.getElementById('category-restaurant').value,
      nameRu: document.getElementById('category-name-ru').value,
      nameKk: document.getElementById('category-name-kk').value,
      nameEn: document.getElementById('category-name-en').value,
      sortOrder: parseInt(document.getElementById('category-sort-order').value) || 0,
      isActive: true,
    };

    if (currentCategoryId) {
      await AdminAPI.updateCategory(currentCategoryId, data);
      Utils.showSuccess('Категория обновлена');
    } else {
      await AdminAPI.createCategory(data);
      Utils.showSuccess('Категория создана');
    }

    closeCategoryModal();
    await loadCategories(document.getElementById('restaurant-filter').value);
  } catch (error) {
    console.error('Failed to save category:', error);
    Utils.showError(error.message || 'Не удалось сохранить категорию');
  }
}

async function deleteCategory(id) {
  if (!confirm('Вы уверены, что хотите удалить эту категорию?')) {
    return;
  }

  try {
    await AdminAPI.deleteCategory(id);
    Utils.showSuccess('Категория удалена');
    await loadCategories(document.getElementById('restaurant-filter').value);
  } catch (error) {
    console.error('Failed to delete category:', error);
    Utils.showError('Не удалось удалить категорию');
  }
}

function openCategoryModal() {
  document.getElementById('category-modal').classList.add('active');
}

function closeCategoryModal() {
  document.getElementById('category-modal').classList.remove('active');
  currentCategoryId = null;
  document.getElementById('category-form').reset();
  document.getElementById('category-id').value = '';
  document.getElementById('category-modal-title').textContent = 'Добавить категорию';
}

async function editCategory(id) {
  await loadCategory(id);
  openCategoryModal();
}

// Экспорт
window.openCategoryModal = openCategoryModal;
window.closeCategoryModal = closeCategoryModal;
window.editCategory = editCategory;
window.deleteCategory = deleteCategory;


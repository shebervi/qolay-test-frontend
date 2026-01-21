/**
 * Логика страницы ингредиентов
 */

let currentIngredientId = null;
let restaurants = [];
let currentUser = null;
let ingredientSearchTimeout = null;
let ingredientResults = [];

document.addEventListener('DOMContentLoaded', async () => {
  if (typeof Auth !== 'undefined') {
    currentUser = Auth.getAuthUser();
  }

  await loadRestaurants();

  const btnAddIngredient = document.querySelector('button[onclick="openIngredientModal()"]');
  const btnTranslateMissing = document.querySelector('button[onclick="translateMissingIngredients()"]');
  if (btnAddIngredient) {
    const canCreateIngredient = currentUser?.role !== 'WAITER' && currentUser?.role !== 'KITCHEN';
    btnAddIngredient.style.display = canCreateIngredient ? 'block' : 'none';
  }
  if (btnTranslateMissing) {
    const canTranslate = currentUser?.role !== 'WAITER' && currentUser?.role !== 'KITCHEN';
    btnTranslateMissing.style.display = canTranslate ? 'block' : 'none';
  }

  document.getElementById('restaurant-filter').addEventListener('change', async () => {
    triggerIngredientSearch();
  });

  document.getElementById('ingredient-search').addEventListener('input', () => {
    triggerIngredientSearch();
  });

  document.getElementById('ingredient-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveIngredient();
  });

  const listContainer = document.getElementById('ingredients-list');
  listContainer.addEventListener('click', async (event) => {
    const translateBtn = event.target.closest('[data-translate-ingredient]');
    if (translateBtn) {
      const ingredientId = translateBtn.getAttribute('data-translate-ingredient');
      await translateIngredientCard(ingredientId);
      return;
    }

    const deleteBtn = event.target.closest('[data-delete-ingredient]');
    if (deleteBtn) {
      const ingredientId = deleteBtn.getAttribute('data-delete-ingredient');
      await deleteIngredient(ingredientId);
      return;
    }
  });

  listContainer.addEventListener('change', async (event) => {
    const allergenToggle = event.target.closest('[data-allergen-toggle]');
    if (!allergenToggle) return;
    const ingredientId = allergenToggle.getAttribute('data-allergen-toggle');
    await toggleIngredientAllergen(ingredientId, allergenToggle.checked);
  });

  await loadIngredients();
});

function triggerIngredientSearch() {
  clearTimeout(ingredientSearchTimeout);
  ingredientSearchTimeout = setTimeout(() => loadIngredients(), 300);
}

function getSelectedRestaurantId() {
  return document.getElementById('restaurant-filter').value || null;
}

function getSearchQuery() {
  return document.getElementById('ingredient-search').value.trim();
}

async function loadRestaurants() {
  try {
    const response = await AdminAPI.getRestaurants();
    restaurants = response.data?.data || response.data || [];

    const filter = document.getElementById('restaurant-filter');
    filter.innerHTML = '<option value="">Все рестораны</option>' +
      restaurants.map((r) => `<option value="${r.id}">${r.name}</option>`).join('');

    const formSelect = document.getElementById('ingredient-restaurant');
    formSelect.innerHTML = '<option value="">Выберите ресторан</option>' +
      restaurants.map((r) => `<option value="${r.id}">${r.name}</option>`).join('');
  } catch (error) {
    console.error('Failed to load restaurants:', error);
    Utils.showError('Не удалось загрузить рестораны');
  }
}

async function loadIngredients() {
  const query = getSearchQuery();
  const restaurantId = getSelectedRestaurantId();

  try {
    const response = await AdminAPI.getIngredients(restaurantId, query.length >= 2 ? query : undefined);
    const items = response.data?.data || response.data || [];
    ingredientResults = items;
    renderIngredients(items);
  } catch (error) {
    console.error('Failed to load ingredients:', error);
    Utils.showError('Не удалось загрузить ингредиенты');
  }
}

function renderEmptyState(message) {
  const container = document.getElementById('ingredients-list');
  container.innerHTML = `
    <tr>
      <td colspan="6">
        <div class="empty-state">${message}</div>
      </td>
    </tr>
  `;
}

function renderIngredients(items) {
  const container = document.getElementById('ingredients-list');

  if (!items.length) {
    renderEmptyState('Ничего не найдено.');
    return;
  }

  const canEditIngredient = currentUser?.role !== 'WAITER' && currentUser?.role !== 'KITCHEN';
  const canDeleteIngredient = currentUser?.role !== 'WAITER' && currentUser?.role !== 'KITCHEN';

  container.innerHTML = items.map((ingredient) => {
    const restaurant = restaurants.find((r) => r.id === ingredient.restaurant_id);
    const nameRu = ingredient.name_ru || '';
    const nameKk = ingredient.name_kk || '—';
    const nameEn = ingredient.name_en || '—';
    const allergenBadge = ingredient.is_allergen
      ? '<span class="ingredient-allergen">Аллерген</span>'
      : '';

    return `
      <tr>
        <td>${Utils.escapeHtml(nameRu)}</td>
        <td>${Utils.escapeHtml(nameKk)}</td>
        <td>${Utils.escapeHtml(nameEn)}</td>
        <td>
          ${allergenBadge}
          <label class="ingredient-allergen-toggle">
            <input type="checkbox" data-allergen-toggle="${ingredient.id}" ${ingredient.is_allergen ? 'checked' : ''}>
            Аллерген
          </label>
        </td>
        <td>${Utils.escapeHtml(restaurant?.name || 'Ресторан не найден')}</td>
        <td class="ingredient-table-actions">
          <button class="btn btn-secondary ingredient-translate-btn" data-translate-ingredient="${ingredient.id}">
            Перевести
          </button>
          ${canEditIngredient ? `
          <button class="btn-icon" onclick="editIngredient('${ingredient.id}')" title="Редактировать">
            <i class="fas fa-edit"></i>
          </button>
          ` : ''}
          ${canDeleteIngredient ? `
          <button class="btn-icon" data-delete-ingredient="${ingredient.id}" title="Удалить">
            <i class="fas fa-trash"></i>
          </button>
          ` : ''}
        </td>
      </tr>
    `;
  }).join('');
}

function openIngredientModal() {
  document.getElementById('ingredient-modal').classList.add('active');
}

function closeIngredientModal() {
  document.getElementById('ingredient-modal').classList.remove('active');
  currentIngredientId = null;
  document.getElementById('ingredient-form').reset();
  document.getElementById('ingredient-id').value = '';
  document.getElementById('ingredient-modal-title').textContent = 'Добавить ингредиент';
}

function fillIngredientForm(ingredient) {
  if (!ingredient) return;
  currentIngredientId = ingredient.id;
  document.getElementById('ingredient-id').value = ingredient.id;
  document.getElementById('ingredient-restaurant').value = ingredient.restaurant_id;
  document.getElementById('ingredient-name-ru').value = ingredient.name_ru || '';
  document.getElementById('ingredient-name-kk').value = ingredient.name_kk || '';
  document.getElementById('ingredient-name-en').value = ingredient.name_en || '';
  document.getElementById('ingredient-is-allergen').checked = Boolean(ingredient.is_allergen);
  document.getElementById('ingredient-modal-title').textContent = 'Редактировать ингредиент';
}

async function editIngredient(id) {
  const ingredient = ingredientResults.find((item) => item.id === id);
  if (!ingredient) {
    Utils.showError('Не удалось найти ингредиент');
    return;
  }
  fillIngredientForm(ingredient);
  openIngredientModal();
}

async function saveIngredient() {
  try {
    const data = {
      restaurantId: document.getElementById('ingredient-restaurant').value,
      nameRu: document.getElementById('ingredient-name-ru').value,
      nameKk: document.getElementById('ingredient-name-kk').value || undefined,
      nameEn: document.getElementById('ingredient-name-en').value || undefined,
      isAllergen: document.getElementById('ingredient-is-allergen').checked,
    };

    if (currentIngredientId) {
      await AdminAPI.updateIngredient(currentIngredientId, data);
      Utils.showSuccess('Ингредиент обновлен');
    } else {
      await AdminAPI.createIngredient(data);
      Utils.showSuccess('Ингредиент создан');
    }

    closeIngredientModal();
    await loadIngredients();
  } catch (error) {
    console.error('Failed to save ingredient:', error);
    Utils.showError(error.message || 'Не удалось сохранить ингредиент');
  }
}

async function deleteIngredient(id) {
  if (!confirm('Удалить этот ингредиент?')) {
    return;
  }

  try {
    await AdminAPI.deleteIngredient(id);
    Utils.showSuccess('Ингредиент удален');
    await loadIngredients();
  } catch (error) {
    console.error('Failed to delete ingredient:', error);
    Utils.showError('Не удалось удалить ингредиент');
  }
}

async function translateIngredientCard(id) {
  const ingredient = ingredientResults.find((item) => item.id === id);
  if (!ingredient) {
    Utils.showError('Не удалось найти ингредиент');
    return;
  }

  try {
    await AdminAPI.updateIngredient(id, {
      restaurantId: ingredient.restaurant_id,
      nameRu: ingredient.name_ru,
      nameKk: ingredient.name_kk || ingredient.name_ru,
      nameEn: ingredient.name_en || ingredient.name_ru,
      isAllergen: ingredient.is_allergen,
    });
    Utils.showSuccess('Перевод обновлен');
    await loadIngredients();
  } catch (error) {
    console.error('Failed to translate ingredient:', error);
    Utils.showError('Не удалось перевести ингредиент');
  }
}

async function toggleIngredientAllergen(id, isAllergen) {
  const ingredient = ingredientResults.find((item) => item.id === id);
  if (!ingredient) {
    Utils.showError('Не удалось найти ингредиент');
    return;
  }

  try {
    await AdminAPI.updateIngredient(id, {
      restaurantId: ingredient.restaurant_id,
      nameRu: ingredient.name_ru,
      nameKk: ingredient.name_kk || undefined,
      nameEn: ingredient.name_en || undefined,
      isAllergen,
    });
    ingredient.is_allergen = isAllergen;
    Utils.showSuccess('Аллерген обновлен');
  } catch (error) {
    console.error('Failed to update allergen:', error);
    Utils.showError('Не удалось обновить аллерген');
    await loadIngredients();
  }
}

function translateIngredientFromRu() {
  const ruValue = document.getElementById('ingredient-name-ru').value.trim();
  if (!ruValue) return;

  const kkInput = document.getElementById('ingredient-name-kk');
  const enInput = document.getElementById('ingredient-name-en');

  if (!kkInput.value.trim()) {
    kkInput.value = ruValue;
  }
  if (!enInput.value.trim()) {
    enInput.value = ruValue;
  }
}

async function translateMissingIngredients() {
  if (!ingredientResults.length) {
    Utils.showError('Нет ингредиентов для перевода');
    return;
  }

  const shouldProceed = confirm('Заполнить пустые переводы из RU для найденных ингредиентов?');
  if (!shouldProceed) return;

  const updates = ingredientResults.filter((item) => !item.name_kk || !item.name_en);
  if (!updates.length) {
    Utils.showSuccess('Пустых переводов нет');
    return;
  }

  try {
    for (const item of updates) {
      await AdminAPI.updateIngredient(item.id, {
        restaurantId: item.restaurant_id,
        nameRu: item.name_ru,
        nameKk: item.name_kk || item.name_ru,
        nameEn: item.name_en || item.name_ru,
        isAllergen: item.is_allergen,
      });
    }
    Utils.showSuccess('Переводы заполнены');
    await loadIngredients();
  } catch (error) {
    console.error('Failed to translate ingredients:', error);
    Utils.showError('Не удалось заполнить переводы');
  }
}

window.openIngredientModal = openIngredientModal;
window.closeIngredientModal = closeIngredientModal;
window.editIngredient = editIngredient;
window.deleteIngredient = deleteIngredient;
window.translateIngredientFromRu = translateIngredientFromRu;
window.translateMissingIngredients = translateMissingIngredients;

/**
 * Логика страницы продуктов
 */

let currentProductId = null;
let restaurants = [];
let categories = [];
let currentUser = null;
let selectedIngredients = [];
let ingredientSearchTimeout = null;
let activeIngredientQuery = '';
let ingredientSuggestions = [];
let ingredientsDirty = false;
let initialComposition = [];

// Безопасный доступ к Utils
const Utils = window.Utils || {
  formatPrice: (price) => {
    const numPrice = typeof price === 'string' ? parseFloat(price) : price;
    return new Intl.NumberFormat('ru-RU').format(numPrice);
  },
  escapeHtml: (text) =>
    String(text ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;'),
  showError: (msg) => {
    console.error(msg);
    alert('Ошибка: ' + msg);
  },
  showSuccess: (msg) => {
    console.log(msg);
    alert('Успешно: ' + msg);
  },
};

document.addEventListener('DOMContentLoaded', async () => {
  // Получаем текущего пользователя
  if (typeof Auth !== 'undefined') {
    currentUser = Auth.getAuthUser();
  }

  // Загружаем рестораны и категории
  await loadRestaurants();
  await loadAllCategories();
  
  // Скрываем кнопку добавления для WAITER и KITCHEN
  const btnAddProduct = document.querySelector('button[onclick="openProductModal()"]');
  if (btnAddProduct) {
    const canCreateProduct = currentUser?.role !== 'WAITER' && currentUser?.role !== 'KITCHEN';
    btnAddProduct.style.display = canCreateProduct ? 'block' : 'none';
  }
  
  // Обработка фильтров
  document.getElementById('restaurant-filter').addEventListener('change', async (e) => {
    await loadCategoriesForFilter(e.target.value);
    await loadProducts(e.target.value, document.getElementById('category-filter').value);
  });

  document.getElementById('category-filter').addEventListener('change', async (e) => {
    await loadProducts(document.getElementById('restaurant-filter').value, e.target.value);
  });

  // Обработка изменения ресторана в форме
  document.getElementById('product-restaurant').addEventListener('change', async (e) => {
    await loadCategoriesForForm(e.target.value);
    ingredientsDirty = true;
    initialComposition = [];
    resetSelectedIngredients();
    updateIngredientInputState();
  });

  // Обработка формы
  document.getElementById('product-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveProduct();
  });

  setupIngredientControls();
  updateIngredientInputState();

  // Обработка загрузки изображений
  document.getElementById('product-image').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const previewList = document.getElementById('product-images-preview-list');
    previewList.innerHTML = '';

    files.forEach((file, index) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const previewItem = document.createElement('div');
        previewItem.style.position = 'relative';
        previewItem.innerHTML = `
          <img src="${event.target.result}" alt="Предпросмотр ${index + 1}" style="max-width: 150px; max-height: 150px; border-radius: 8px; border: 1px solid #ddd; object-fit: cover;">
          <button type="button" class="btn-remove-preview" data-index="${index}" style="position: absolute; top: 4px; right: 4px; background: rgba(255,0,0,0.7); color: white; border: none; border-radius: 50%; width: 24px; height: 24px; cursor: pointer; font-size: 14px;">×</button>
        `;
        previewList.appendChild(previewItem);

        // Обработчик удаления из превью
        previewItem.querySelector('.btn-remove-preview').addEventListener('click', () => {
          const dt = new DataTransfer();
          files.forEach((f, i) => {
            if (i !== index) dt.items.add(f);
          });
          e.target.files = dt.files;
          previewItem.remove();
          if (previewList.children.length === 0) {
            document.getElementById('product-images-preview').style.display = 'none';
          }
        });
      };
      reader.readAsDataURL(file);
    });

    document.getElementById('product-images-preview').style.display = 'block';
  });

  await loadProducts();
});

/**
 * Ингредиенты: автокомплит и выбранные элементы
 */
function updateIngredientInputState() {
  const input = document.getElementById('product-ingredient-input');
  const restaurantId = document.getElementById('product-restaurant')?.value;
  if (!input) return;

  const enabled = Boolean(restaurantId);
  input.disabled = !enabled;
  input.placeholder = enabled ? 'Начните вводить ингредиент' : 'Сначала выберите ресторан';
}

function resetSelectedIngredients() {
  selectedIngredients = [];
  ingredientSuggestions = [];
  renderSelectedIngredients();
  clearIngredientInput();
}

function clearIngredientInput() {
  const input = document.getElementById('product-ingredient-input');
  if (input) input.value = '';
  hideIngredientSuggestions();
}

function hideIngredientSuggestions() {
  const suggestions = document.getElementById('product-ingredient-suggestions');
  if (!suggestions) return;
  suggestions.style.display = 'none';
  suggestions.innerHTML = '';
}

function normalizeIngredientName(name) {
  return String(name || '').trim().toLowerCase();
}

function mapIngredientFromApi(item) {
  if (!item) return null;
  return {
    id: item.id,
    nameRu: item.nameRu || item.name_ru || item.name?.ru || '',
    nameKk: item.nameKk || item.name_kk || item.name?.kk || null,
    nameEn: item.nameEn || item.name_en || item.name?.en || null,
    isAllergen: item.isAllergen ?? item.is_allergen ?? false,
    sortOrder: item.sortOrder ?? item.sort_order ?? 0,
  };
}

function getIngredientDisplayName(ingredient) {
  return ingredient.nameRu || ingredient.nameKk || ingredient.nameEn || '';
}

function renderSelectedIngredients() {
  const container = document.getElementById('product-ingredient-selected');
  if (!container) return;

  if (!selectedIngredients.length) {
    container.innerHTML = '<div class="ingredient-empty">Нет ингредиентов</div>';
    return;
  }

  container.innerHTML = selectedIngredients
    .map((ingredient) => {
      const name = Utils.escapeHtml(getIngredientDisplayName(ingredient));
      return `
        <span class="ingredient-chip">
          ${name}
          <button type="button" data-remove-ingredient="${ingredient.id}" aria-label="Удалить">&times;</button>
        </span>
      `;
    })
    .join('');
}

function renderIngredientSuggestions(items, query) {
  const suggestions = document.getElementById('product-ingredient-suggestions');
  if (!suggestions) return;

  const filtered = items.filter(
    (item) => !selectedIngredients.some((selected) => selected.id === item.id),
  );

  ingredientSuggestions = filtered;

  const normalizedQuery = normalizeIngredientName(query);
  const hasExactMatch =
    normalizedQuery &&
    (filtered.some((item) => normalizeIngredientName(item.nameRu) === normalizedQuery) ||
      selectedIngredients.some((item) => normalizeIngredientName(item.nameRu) === normalizedQuery));

  let html = filtered
    .map((item) => {
      const name = Utils.escapeHtml(getIngredientDisplayName(item));
      return `<div class="ingredient-suggestion-item" data-ingredient-id="${item.id}">${name}</div>`;
    })
    .join('');

  if (normalizedQuery && !hasExactMatch) {
    const trimmedQuery = query.trim();
    const escapedQuery = Utils.escapeHtml(trimmedQuery);
    const encodedQuery = encodeURIComponent(trimmedQuery);
    html += `<div class="ingredient-suggestion-item ingredient-suggestion-create" data-create-ingredient="${encodedQuery}">Создать "${escapedQuery}"</div>`;
  }

  if (!html) {
    html = '<div class="ingredient-suggestion-empty">Ничего не найдено</div>';
  }

  suggestions.innerHTML = html;
  suggestions.style.display = 'block';
}

async function searchIngredients(query) {
  const restaurantId = document.getElementById('product-restaurant')?.value;
  if (!restaurantId) {
    hideIngredientSuggestions();
    return;
  }

  activeIngredientQuery = query;
  try {
    const response = await AdminAPI.searchIngredients(query, restaurantId);
    const items = response?.data?.data || response?.data || [];
    if (activeIngredientQuery !== query) return;
    const mapped = items.map(mapIngredientFromApi).filter(Boolean);
    renderIngredientSuggestions(mapped, query);
  } catch (error) {
    console.error('Failed to search ingredients:', error);
    hideIngredientSuggestions();
  }
}

async function createIngredientFromQuery(nameRu) {
  const restaurantId = document.getElementById('product-restaurant')?.value;
  if (!restaurantId) {
    Utils.showError('Сначала выберите ресторан');
    return;
  }

  const trimmedName = nameRu.trim();
  if (!trimmedName) return;

  try {
    const response = await AdminAPI.createIngredient({
      restaurantId,
      nameRu: trimmedName,
    });
    const ingredient = mapIngredientFromApi(response?.data?.data || response?.data);
    if (ingredient) {
      addIngredientToSelected(ingredient);
    }
    clearIngredientInput();
  } catch (error) {
    console.error('Failed to create ingredient:', error);
    Utils.showError('Не удалось создать ингредиент');
  }
}

function addIngredientToSelected(ingredient) {
  if (!ingredient?.id) return;
  const exists = selectedIngredients.some((item) => item.id === ingredient.id);
  if (exists) return;
  selectedIngredients.push(ingredient);
  ingredientsDirty = true;
  renderSelectedIngredients();
}

function setupIngredientControls() {
  const input = document.getElementById('product-ingredient-input');
  const suggestions = document.getElementById('product-ingredient-suggestions');
  const selected = document.getElementById('product-ingredient-selected');
  if (!input || !suggestions || !selected) return;

  const inputWrap = input.closest('.ingredient-input-wrap');

  input.addEventListener('input', (event) => {
    const query = event.target.value.trim();
    clearTimeout(ingredientSearchTimeout);
    if (query.length < 2) {
      ingredientSuggestions = [];
      hideIngredientSuggestions();
      return;
    }
    ingredientSearchTimeout = setTimeout(() => searchIngredients(query), 250);
  });

  input.addEventListener('keydown', async (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const query = input.value.trim();
    const firstSuggestion = query.length >= 2 ? ingredientSuggestions[0] : null;
    if (firstSuggestion) {
      addIngredientToSelected(firstSuggestion);
      clearIngredientInput();
      return;
    }
    if (query.length >= 2) {
      await createIngredientFromQuery(query);
    }
  });

  suggestions.addEventListener('click', async (event) => {
    const suggestionItem = event.target.closest('[data-ingredient-id]');
    if (suggestionItem) {
      const ingredientId = suggestionItem.getAttribute('data-ingredient-id');
      const ingredient = ingredientSuggestions.find((item) => item.id === ingredientId);
      if (ingredient) {
        addIngredientToSelected(ingredient);
        clearIngredientInput();
      }
      return;
    }

    const createItem = event.target.closest('[data-create-ingredient]');
    if (createItem) {
      const encodedName = createItem.getAttribute('data-create-ingredient') || '';
      const nameRu = decodeURIComponent(encodedName);
      await createIngredientFromQuery(nameRu);
    }
  });

  selected.addEventListener('click', (event) => {
    const removeButton = event.target.closest('[data-remove-ingredient]');
    if (!removeButton) return;
    const ingredientId = removeButton.getAttribute('data-remove-ingredient');
    selectedIngredients = selectedIngredients.filter((item) => item.id !== ingredientId);
    ingredientsDirty = true;
    renderSelectedIngredients();
  });

  document.addEventListener('click', (event) => {
    if (!inputWrap) return;
    if (!inputWrap.contains(event.target) && !suggestions.contains(event.target)) {
      hideIngredientSuggestions();
    }
  });

  renderSelectedIngredients();
}

async function loadRestaurants() {
  try {
    const response = await AdminAPI.getRestaurants();
    restaurants = response.data?.data || response.data || [];
    
    // Заполняем фильтр
    const filter = document.getElementById('restaurant-filter');
    filter.innerHTML = '<option value="">Все рестораны</option>' + 
      restaurants.map(r => `<option value="${r.id}">${r.name}</option>`).join('');

    // Заполняем форму
    const formSelect = document.getElementById('product-restaurant');
    formSelect.innerHTML = '<option value="">Выберите ресторан</option>' +
      restaurants.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
  } catch (error) {
    console.error('Failed to load restaurants:', error);
    Utils.showError('Не удалось загрузить рестораны');
  }
}

async function loadAllCategories() {
  try {
    const response = await AdminAPI.getCategories();
    categories = response.data?.data || response.data || [];
  } catch (error) {
    console.error('Failed to load categories:', error);
  }
}

async function loadCategoriesForFilter(restaurantId) {
  try {
    const response = await AdminAPI.getCategories(restaurantId);
    const cats = response.data || [];
    
    const filter = document.getElementById('category-filter');
    filter.innerHTML = '<option value="">Все категории</option>' + 
      cats.map(c => `<option value="${c.id}">${c.name_ru || c.name_kk || c.name_en}</option>`).join('');
  } catch (error) {
    console.error('Failed to load categories for filter:', error);
  }
}

async function loadCategoriesForForm(restaurantId) {
  try {
    const response = await AdminAPI.getCategories(restaurantId);
    const cats = response.data || [];
    
    const formSelect = document.getElementById('product-category');
    formSelect.innerHTML = '<option value="">Выберите категорию</option>' +
      cats.map(c => `<option value="${c.id}">${c.name_ru || c.name_kk || c.name_en}</option>`).join('');
  } catch (error) {
    console.error('Failed to load categories for form:', error);
  }
}

async function loadProducts(restaurantId = null, categoryId = null) {
  try {
    const response = await AdminAPI.getProducts(restaurantId, categoryId);
    const products = response.data || [];
    
    const container = document.getElementById('products-list');
    
    if (products.length === 0) {
      container.innerHTML = '<div class="empty-state">Нет продуктов. Добавьте первый продукт.</div>';
      return;
    }

    // Проверяем права доступа
    const canEditProduct = currentUser?.role !== 'WAITER' && currentUser?.role !== 'KITCHEN';
    const canDeleteProduct = currentUser?.role !== 'WAITER' && currentUser?.role !== 'KITCHEN';
    const canManageModifiers = currentUser?.role !== 'WAITER' && currentUser?.role !== 'KITCHEN';

    container.innerHTML = products.map(product => {
      const restaurant = restaurants.find(r => r.id === product.restaurant_id);
      const category = categories.find(c => c.id === product.category_id);
      const name = product.name_ru || product.name_kk || product.name_en;
      
      const infoParts = [
        restaurant?.name || 'N/A',
        category?.name_ru || 'N/A',
        `${Utils.formatPrice(product.price_kzt)} ₸`
      ];
      
      const nutritionInfo = [];
      if (product.calories) {
        nutritionInfo.push(`🔥 ${product.calories} ккал`);
      }
      if (product.weight_grams) {
        nutritionInfo.push(`⚖️ ${product.weight_grams} г`);
      }
      if (product.composition && product.composition.length > 0) {
        nutritionInfo.push(`📋 ${product.composition.length} ингр.`);
      }
      
      return `
        <div class="list-item">
          <div class="list-item-info" style="flex: 1;">
            <h4>${name}</h4>
            <p style="margin: 4px 0;">${infoParts.join(' • ')}</p>
            ${nutritionInfo.length > 0 ? `<p style="margin: 4px 0; font-size: 12px; color: #888; display: flex; gap: 12px; flex-wrap: wrap;">${nutritionInfo.join(' • ')}</p>` : ''}
          </div>
          <div class="list-item-actions">
            ${canManageModifiers ? `
            <button class="btn-icon" onclick="openModifiersModal('${product.id}')" title="Модификаторы">
              <i class="fas fa-cog"></i>
            </button>
            ` : ''}
            ${canEditProduct ? `
            <button class="btn-icon" onclick="editProduct('${product.id}')" title="Редактировать">
              <i class="fas fa-edit"></i>
            </button>
            ` : ''}
            ${canDeleteProduct ? `
            <button class="btn-icon" onclick="deleteProduct('${product.id}')" title="Удалить">
              <i class="fas fa-trash"></i>
            </button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('Failed to load products:', error);
    Utils.showError('Не удалось загрузить продукты');
  }
}

async function loadProduct(id) {
  try {
    const response = await AdminAPI.getProduct(id);
    const product = response.data?.data || response.data;
    
    currentProductId = id;
    document.getElementById('product-id').value = id;
    document.getElementById('product-restaurant').value = product.restaurant_id;
    document.getElementById('product-category').value = product.category_id;
    document.getElementById('product-name-ru').value = product.name_ru || '';
    document.getElementById('product-name-kk').value = product.name_kk || '';
    document.getElementById('product-name-en').value = product.name_en || '';
    document.getElementById('product-description-ru').value = product.description_ru || '';
    document.getElementById('product-description-kk').value = product.description_kk || '';
    document.getElementById('product-description-en').value = product.description_en || '';
    document.getElementById('product-price').value = product.price_kzt?.toString() || '';
    document.getElementById('product-station').value = product.station || 'HOT';
    document.getElementById('product-calories').value = product.calories || '';
    document.getElementById('product-weight-grams').value = product.weight_grams || product.weightGrams || '';
    initialComposition = Array.isArray(product.composition) ? product.composition : [];
    ingredientsDirty = false;
    selectedIngredients = (product.ingredients || [])
      .map(mapIngredientFromApi)
      .filter(Boolean)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    renderSelectedIngredients();
    clearIngredientInput();
    updateIngredientInputState();
    document.getElementById('product-image').value = '';
    document.getElementById('product-images-preview').style.display = 'none';
    
    // Загружаем категории для выбранного ресторана
    await loadCategoriesForForm(product.restaurant_id);
    
    // Загружаем модификаторы продукта
    await loadProductModifiers(id);
    
    // Загружаем текущие изображения
    await loadProductImages(id, product);
    
    document.getElementById('product-modal-title').textContent = 'Редактировать продукт';
  } catch (error) {
    console.error('Failed to load product:', error);
    Utils.showError('Не удалось загрузить продукт');
  }
}

async function loadProductModifiers(productId) {
  const modifiersSection = document.getElementById('product-modifiers-section');
  const modifiersList = document.getElementById('product-modifiers-list');
  
  if (!modifiersSection || !modifiersList) return;
  
  try {
    const response = await AdminAPI.getModifierGroups(productId);
    const groups = response.data?.data || [];
    
    if (groups.length === 0) {
      modifiersSection.style.display = 'none';
      return;
    }
    
    modifiersSection.style.display = 'block';
    
    modifiersList.innerHTML = groups.map(group => {
      const groupName = group.name?.ru || group.name?.kk || group.name?.en || 'Без названия';
      const typeText = group.type === 'SINGLE' ? 'Один выбор' : 'Несколько выборов';
      const requiredText = group.required ? 'Обязательно' : 'Необязательно';
      
      return `
        <div style="border: 1px solid #ddd; padding: 12px; margin-bottom: 12px; border-radius: 8px; background-color: #f9f9f9;">
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
            <div>
              <strong style="font-size: 14px;">${groupName}</strong>
              <div style="font-size: 12px; color: #666; margin-top: 4px;">
                ${typeText} • ${requiredText} • Выбор: ${group.minSelect}-${group.maxSelect}
              </div>
            </div>
          </div>
          <div style="margin-top: 8px;">
            <div style="font-size: 12px; color: #666; margin-bottom: 4px;">Опции:</div>
            ${group.options && group.options.length > 0
              ? group.options.map(option => {
                  const optionName = option.name?.ru || option.name?.kk || option.name?.en || 'Без названия';
                  const priceDelta = parseFloat(option.priceDelta || 0);
                  return `
                    <div style="padding: 6px 8px; background-color: white; margin-bottom: 4px; border-radius: 4px; font-size: 12px;">
                      ${optionName}${priceDelta > 0 ? ` <span style="color: var(--primary-color); font-weight: 600;">+${Utils.formatPrice(priceDelta)} ₸</span>` : ''}
                    </div>
                  `;
                }).join('')
              : '<div style="font-size: 12px; color: #999; font-style: italic;">Нет опций</div>'
            }
          </div>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('Failed to load modifiers:', error);
    modifiersList.innerHTML = '<div style="color: #999; font-size: 12px;">Не удалось загрузить модификаторы</div>';
  }
}

function openProductModal() {
  currentProductId = null;
  document.getElementById('product-form').reset();
  document.getElementById('product-id').value = '';
  document.getElementById('product-modal-title').textContent = 'Добавить продукт';
  document.getElementById('product-modifiers-section').style.display = 'none';
  document.getElementById('product-images-preview').style.display = 'none';
  document.getElementById('product-images-current').style.display = 'none';
  ingredientsDirty = false;
  initialComposition = [];
  resetSelectedIngredients();
  updateIngredientInputState();
  document.getElementById('product-modal').classList.add('active');
}

async function saveProduct() {
  try {
    const shouldUpdateIngredients = !currentProductId || ingredientsDirty;
    const composition = shouldUpdateIngredients
      ? selectedIngredients
          .map((ingredient) => getIngredientDisplayName(ingredient))
          .filter((name) => name.length > 0)
      : initialComposition;
    
    const caloriesValue = document.getElementById('product-calories').value.trim();
    const weightGramsValue = document.getElementById('product-weight-grams').value.trim();
    
    const data = {
      restaurantId: document.getElementById('product-restaurant').value,
      categoryId: document.getElementById('product-category').value,
      nameRu: document.getElementById('product-name-ru').value,
      nameKk: document.getElementById('product-name-kk').value,
      nameEn: document.getElementById('product-name-en').value,
      descriptionRu: document.getElementById('product-description-ru').value || undefined,
      descriptionKk: document.getElementById('product-description-kk').value || undefined,
      descriptionEn: document.getElementById('product-description-en').value || undefined,
      priceKzt: document.getElementById('product-price').value,
      calories: caloriesValue ? parseInt(caloriesValue, 10) : undefined,
      weightGrams: weightGramsValue ? parseInt(weightGramsValue, 10) : undefined,
      composition: composition,
      station: document.getElementById('product-station').value,
      isActive: true,
    };

    // Получаем файлы изображений
    const imageFiles = Array.from(document.getElementById('product-image').files);

    let productId = currentProductId;

    if (currentProductId) {
      // При обновлении изображения загружаем отдельно (как раньше)
      await AdminAPI.updateProduct(currentProductId, data);
      Utils.showSuccess('Продукт обновлен');
      productId = currentProductId;

      // Загружаем новые изображения, если выбраны
      if (imageFiles.length > 0) {
        try {
          for (const imageFile of imageFiles) {
            await AdminAPI.uploadProductImage(productId, imageFile);
          }
          Utils.showSuccess(`Загружено изображений: ${imageFiles.length}`);
        } catch (error) {
          console.error('Failed to upload images:', error);
          Utils.showError('Не удалось загрузить изображения, но продукт сохранен');
        }
      }
    } else {
      // При создании передаем файлы сразу
      const response = await AdminAPI.createProduct(data, imageFiles);
      productId = response.data?.id || response.data?.data?.id;
      const imageCount = imageFiles.length > 0 ? ` с ${imageFiles.length} изображением(ями)` : '';
      Utils.showSuccess(`Продукт создан${imageCount}`);
    }

    if (!productId) {
      Utils.showError('Не удалось определить продукт после сохранения');
      return;
    }

    if (shouldUpdateIngredients) {
      const ingredientPayload = selectedIngredients.map((ingredient, index) => ({
        ingredientId: ingredient.id,
        sortOrder: index,
      }));

      try {
        await AdminAPI.setProductIngredients(productId, ingredientPayload);
      } catch (error) {
        console.error('Failed to update product ingredients:', error);
        Utils.showError('Продукт сохранен, но состав не обновлен');
        return;
      }
    }

    closeProductModal();
    await loadProducts(
      document.getElementById('restaurant-filter').value,
      document.getElementById('category-filter').value
    );
  } catch (error) {
    console.error('Failed to save product:', error);
    Utils.showError(error.message || 'Не удалось сохранить продукт');
  }
}

async function loadProductImages(productId, product) {
  const currentImagesList = document.getElementById('product-images-current-list');
  if (!currentImagesList) return;
  
  // Очищаем список изображений перед загрузкой новых
  currentImagesList.innerHTML = '';

  const images = product.images || [];
  const imageKeys = product.imageKeys || [];

  if (images.length > 0 || imageKeys.length > 0) {
    const imagesToShow = images.length > 0 ? images : imageKeys.map((key, index) => ({ id: `temp-${index}`, imageKey: key }));
    
    imagesToShow.forEach((img, index) => {
      const imageItem = document.createElement('div');
      imageItem.style.position = 'relative';
      imageItem.style.display = 'inline-block';
      imageItem.style.margin = '8px';
      const imageId = img.id || `temp-${index}`;
      const imageKey = img.imageKey || img;
      const imageUrl = images.length > 0 
        ? `${CONFIG.API_BASE_URL}/products/${productId}/images/${imageId}`
        : `${CONFIG.API_BASE_URL}/products/${productId}/image`;
      
      imageItem.innerHTML = `
        <img src="${imageUrl}" alt="Изображение ${index + 1}" style="max-width: 150px; max-height: 150px; border-radius: 8px; border: 1px solid #ddd; object-fit: cover; display: block;" onerror="this.src='https://openlab.citytech.cuny.edu/chenry-eportfolio/wp-content/themes/koji/assets/images/default-fallback-image.png'">
        ${images.length > 0 ? `<button type="button" class="btn-remove-image" data-image-id="${imageId}" style="position: absolute; top: 4px; right: 4px; background: rgba(255,0,0,0.7); color: white; border: none; border-radius: 50%; width: 24px; height: 24px; cursor: pointer; font-size: 14px;">×</button>` : ''}
      `;
      currentImagesList.appendChild(imageItem);

      // Обработчик удаления изображения
      const removeBtn = imageItem.querySelector('.btn-remove-image');
      if (removeBtn) {
        removeBtn.addEventListener('click', async () => {
          if (confirm('Удалить это изображение?')) {
            try {
              await AdminAPI.deleteProductImage(productId, imageId);
              Utils.showSuccess('Изображение удалено');
              await loadProduct(currentProductId);
            } catch (error) {
              console.error('Failed to delete image:', error);
              Utils.showError('Не удалось удалить изображение');
            }
          }
        });
      }
    });

    const currentImagesContainer = document.getElementById('product-images-current');
    if (currentImagesContainer) {
      currentImagesContainer.style.display = 'block';
    }
  } else {
    const currentImagesContainer = document.getElementById('product-images-current');
    if (currentImagesContainer) {
      currentImagesContainer.style.display = 'none';
    }
  }
}

function removeProductImage() {
  document.getElementById('product-image').value = '';
  document.getElementById('product-images-preview').style.display = 'none';
}

async function deleteProduct(id) {
  if (!confirm('Вы уверены, что хотите удалить этот продукт?')) {
    return;
  }

  try {
    await AdminAPI.deleteProduct(id);
    Utils.showSuccess('Продукт удален');
    await loadProducts(
      document.getElementById('restaurant-filter').value,
      document.getElementById('category-filter').value
    );
  } catch (error) {
    console.error('Failed to delete product:', error);
    Utils.showError('Не удалось удалить продукт');
  }
}

function closeProductModal() {
  document.getElementById('product-modal').classList.remove('active');
  currentProductId = null;
  document.getElementById('product-form').reset();
  document.getElementById('product-id').value = '';
  document.getElementById('product-modal-title').textContent = 'Добавить продукт';
  document.getElementById('product-modifiers-section').style.display = 'none';
  document.getElementById('product-images-preview').style.display = 'none';
  document.getElementById('product-images-current').style.display = 'none';
  ingredientsDirty = false;
  initialComposition = [];
  resetSelectedIngredients();
  updateIngredientInputState();
}

async function editProduct(id) {
  // Сначала открываем модальное окно и очищаем форму
  openProductModal();
  
  // Показываем индикатор загрузки
  const form = document.getElementById('product-form');
  const originalDisplay = form.style.display;
  form.style.display = 'none';
  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'loading';
  loadingDiv.textContent = 'Загрузка...';
  form.parentElement.insertBefore(loadingDiv, form);
  
  try {
    // Загружаем данные продукта
    await loadProduct(id);
    // Убираем индикатор загрузки и показываем форму
    loadingDiv.remove();
    form.style.display = originalDisplay || '';
  } catch (error) {
    // В случае ошибки закрываем модальное окно
    loadingDiv.remove();
    form.style.display = originalDisplay || '';
    closeProductModal();
    throw error;
  }
}

// Экспорт
window.openProductModal = openProductModal;
window.closeProductModal = closeProductModal;
window.editProduct = editProduct;
window.deleteProduct = deleteProduct;
window.loadProductModifiers = loadProductModifiers;
window.removeProductImage = removeProductImage;
// Делаем currentProductId доступным глобально для использования в onclick
Object.defineProperty(window, 'currentProductId', {
  get: function() { return currentProductId; },
  set: function(value) { currentProductId = value; }
});

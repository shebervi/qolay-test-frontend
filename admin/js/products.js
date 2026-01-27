/**
 * Логика страницы продуктов
 */

let currentProductId = null;
let currentVariantsProductId = null;
let currentProductVariants = [];
let restaurants = [];
let categories = [];
let currentUser = null;
let selectedIngredients = [];
let ingredientSearchTimeout = null;
let activeIngredientQuery = '';
let ingredientSuggestions = [];
let ingredientsDirty = false;
let initialComposition = [];
let productVariantsByProductId = {};
let draggingVariantId = null;
let draggingProductId = null;

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

function resolveProductSize(product) {
  const sizeUnit =
    product.size_unit ||
    product.sizeUnit ||
    (product.volume_ml || product.volumeMl ? 'ML' : undefined) ||
    (product.weight_grams || product.weightGrams ? 'GRAM' : null);
  const sizeValue =
    product.sizeValue ??
    (sizeUnit === 'ML'
      ? product.volume_ml || product.volumeMl
      : sizeUnit === 'GRAM'
        ? product.weight_grams || product.weightGrams
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

  const variantForm = document.getElementById('product-variant-form');
  if (variantForm) {
    variantForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await saveProductVariant();
    });
  }

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
    productVariantsByProductId = {};
    
    const container = document.getElementById('products-list');
    
    if (products.length === 0) {
      container.innerHTML = '<div class="empty-state">Нет продуктов. Добавьте первый продукт.</div>';
      return;
    }

    // Проверяем права доступа
    const canEditProduct = currentUser?.role !== 'WAITER' && currentUser?.role !== 'KITCHEN';
    const canDeleteProduct = currentUser?.role !== 'WAITER' && currentUser?.role !== 'KITCHEN';
    const canManageModifiers = currentUser?.role !== 'WAITER' && currentUser?.role !== 'KITCHEN';
    const canManageVariants = currentUser?.role !== 'WAITER' && currentUser?.role !== 'KITCHEN';

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
      const size = resolveProductSize(product);
      if (size) {
        nutritionInfo.push(`⚖️ ${formatSizeLabel(size)}`);
      }
      if (product.composition && product.composition.length > 0) {
        nutritionInfo.push(`📋 ${product.composition.length} ингр.`);
      }

      const variants = Array.isArray(product.variants) ? product.variants : [];
      productVariantsByProductId[product.id] = variants;
      const variantsPreview = variants.length > 0
        ? `
          <div style="margin-top: 6px;">
            <button
              type="button"
              class="btn-link"
              onclick="toggleProductVariantsPreview('${product.id}')"
              data-toggle-product-variants="${product.id}"
              style="padding: 0; background: none; border: none; color: var(--primary-color); font-size: 12px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;"
            >
              <span style="display: inline-block; transform: rotate(0deg);" data-toggle-icon="${product.id}">▾</span>
              Варианты (${variants.length})
            </button>
            <div id="product-variants-preview-${product.id}" data-variants-preview="${product.id}" style="margin-top: 8px; display: none;">
              ${variants
                .slice()
                .sort((a, b) => {
                  const aOrder = a.sort_order ?? a.sortOrder ?? 0;
                  const bOrder = b.sort_order ?? b.sortOrder ?? 0;
                  if (aOrder !== bOrder) return aOrder - bOrder;
                  const aName = (a.name_ru || a.name_kk || a.name_en || '').toString();
                  const bName = (b.name_ru || b.name_kk || b.name_en || '').toString();
                  return aName.localeCompare(bName, 'ru');
                })
                .map((variant) => {
                  const variantName = variant.name_ru || variant.name_kk || variant.name_en || 'Без названия';
                  const variantPrice = variant.price_kzt ?? variant.priceKzt ?? variant.price;
                  const label = variantName;
                  return `
                    <div class="variant-card" draggable="true" data-variant-id="${variant.id}" data-product-id="${product.id}" style="display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; border: 1px solid #eee; border-radius: 10px; background: #fafafa; margin-bottom: 8px; cursor: grab;">
                      <div style="font-size: 13px; color: #333;">
                        ${Utils.escapeHtml(label)}${variantPrice ? ` • ${Utils.formatPrice(variantPrice)} ₸` : ''}
                      </div>
                      <div style="display: flex; gap: 10px; align-items: center;">
                        <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: #555; cursor: pointer;">
                          <input type="checkbox" ${variant.is_active !== false ? 'checked' : ''} onchange="toggleProductVariantActive('${product.id}', '${variant.id}', ${variant.is_active !== false})" />
                          Активен
                        </label>
                        <button class="btn-icon" onclick="openProductVariantEditor('${product.id}', '${variant.id}', '${Utils.escapeHtml(name)}')" title="Редактировать вариант">
                          <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-icon" onclick="deleteProductVariantInline('${product.id}', '${variant.id}', '${Utils.escapeHtml(name)}')" title="Удалить вариант">
                          <i class="fas fa-trash"></i>
                        </button>
                      </div>
                    </div>
                  `;
                })
                .join('')}
              <button
                type="button"
                class="btn-link"
                onclick="openProductVariantsModal('${product.id}', '${Utils.escapeHtml(name)}')"
                style="padding: 0; background: none; border: none; color: var(--primary-color); font-size: 12px; cursor: pointer;"
              >
                Управлять вариантами
              </button>
            </div>
          </div>
        `
        : '';

      return `
        <div class="list-item">
          <div class="list-item-info" style="flex: 1;">
            <h4>${name}</h4>
            <p style="margin: 4px 0;">${infoParts.join(' • ')}</p>
            ${nutritionInfo.length > 0 ? `<p style="margin: 4px 0; font-size: 12px; color: #888; display: flex; gap: 12px; flex-wrap: wrap;">${nutritionInfo.join(' • ')}</p>` : ''}
            ${variantsPreview}
          </div>
          <div class="list-item-actions" style="align-self: flex-start;">
            ${canManageVariants ? `
            <button class="btn-icon" onclick="openProductVariantsModal('${product.id}', '${Utils.escapeHtml(name)}')" title="Варианты">
              <i class="fas fa-layer-group"></i>
            </button>
            ` : ''}
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
    bindVariantDragAndDrop(container);
  } catch (error) {
    console.error('Failed to load products:', error);
    Utils.showError('Не удалось загрузить продукты');
  }
}

function bindVariantDragAndDrop(container) {
  if (!container || container.__variantDragBound) return;
  container.__variantDragBound = true;

  container.addEventListener('dragstart', (event) => {
    const target = event.target.closest('.variant-card');
    if (!target) return;
    draggingVariantId = target.dataset.variantId || null;
    draggingProductId = target.dataset.productId || null;
    target.style.opacity = '0.6';
    event.dataTransfer.effectAllowed = 'move';
  });

  container.addEventListener('dragend', (event) => {
    const target = event.target.closest('.variant-card');
    if (target) {
      target.style.opacity = '';
    }
    draggingVariantId = null;
    draggingProductId = null;
  });

  container.addEventListener('dragover', (event) => {
    const target = event.target.closest('.variant-card');
    if (!target) return;
    if (!draggingVariantId || !draggingProductId) return;
    if (target.dataset.productId !== draggingProductId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  });

  container.addEventListener('drop', (event) => {
    const target = event.target.closest('.variant-card');
    if (!target) return;
    if (!draggingVariantId || !draggingProductId) return;
    if (target.dataset.productId !== draggingProductId) return;
    event.preventDefault();
    handleVariantDrop(container, draggingProductId, draggingVariantId, target.dataset.variantId);
  });
}

async function handleVariantDrop(container, productId, draggedId, targetId) {
  if (draggedId === targetId) return;
  const preview = container.querySelector(`[data-variants-preview="${productId}"]`);
  if (!preview) return;

  const draggedEl = preview.querySelector(`[data-variant-id="${draggedId}"]`);
  const targetEl = preview.querySelector(`[data-variant-id="${targetId}"]`);
  if (!draggedEl || !targetEl) return;

  preview.insertBefore(draggedEl, targetEl);

  const cards = Array.from(preview.querySelectorAll('.variant-card'));
  const updates = cards.map((el, index) => {
    const id = el.dataset.variantId;
    return {
      id,
      sortOrder: index + 1,
    };
  });

  try {
    await Promise.all(
      updates.map((update) =>
        AdminAPI.updateProductVariant(update.id, { sortOrder: update.sortOrder })
      )
    );

    const wasOpen = preview.style.display === 'block';
    await loadProducts(
      document.getElementById('restaurant-filter').value,
      document.getElementById('category-filter').value
    );
    if (wasOpen) {
      toggleProductVariantsPreview(productId);
    }
    if (currentVariantsProductId === productId) {
      await loadProductVariants();
    }
  } catch (error) {
    console.error('Failed to reorder variants:', error);
    Utils.showError(error.message || 'Не удалось изменить порядок вариантов');
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
    const size = resolveProductSize(product);
    document.getElementById('product-size-value').value = size ? size.value : '';
    document.getElementById('product-size-unit').value = size ? size.unit : 'GRAM';
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
  document.getElementById('product-size-value').value = '';
  document.getElementById('product-size-unit').value = 'GRAM';
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
    const sizeValueRaw = document.getElementById('product-size-value').value.trim();
    const sizeValue =
      sizeValueRaw === '' ? undefined : parseInt(sizeValueRaw, 10);
    const sizeUnit =
      sizeValue === undefined
        ? undefined
        : document.getElementById('product-size-unit').value;
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
      sizeValue,
      sizeUnit,
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

function openProductVariantsModal(productId, productName = '') {
  currentVariantsProductId = productId;
  const modal = document.getElementById('product-variants-modal');
  const title = document.getElementById('product-variants-title');
  if (title) {
    title.textContent = productName
      ? `Варианты: ${productName}`
      : 'Варианты продукта';
  }
  resetProductVariantForm();
  modal.classList.add('active');
  loadProductVariants();
}

function closeProductVariantsModal() {
  const modal = document.getElementById('product-variants-modal');
  modal.classList.remove('active');
  currentVariantsProductId = null;
  currentProductVariants = [];
}

function toggleProductVariantsPreview(productId) {
  const container = document.getElementById(`product-variants-preview-${productId}`);
  if (!container) return;
  const isOpen = container.style.display === 'block';
  container.style.display = isOpen ? 'none' : 'block';
  const toggleButton = document.querySelector(`[data-toggle-product-variants="${productId}"]`);
  if (toggleButton) {
    const baseText = toggleButton.textContent?.split(' • ')[0] || toggleButton.textContent;
    toggleButton.textContent = isOpen ? baseText : `${baseText} • Скрыть`;
  }
  const icon = document.querySelector(`[data-toggle-icon="${productId}"]`);
  if (icon) {
    icon.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
  }
}

async function openProductVariantEditor(productId, variantId, productName = '') {
  currentVariantsProductId = productId;
  const modal = document.getElementById('product-variants-modal');
  const title = document.getElementById('product-variants-title');
  if (title) {
    title.textContent = productName
      ? `Варианты: ${productName}`
      : 'Варианты продукта';
  }
  resetProductVariantForm();
  modal.classList.add('active');
  await loadProductVariants();
  editProductVariant(variantId);
}

async function deleteProductVariantInline(productId, variantId, productName = '') {
  if (!confirm('Удалить этот вариант?')) {
    return;
  }

  try {
    await AdminAPI.deleteProductVariant(variantId);
    Utils.showSuccess('Вариант удален');
    await loadProducts(
      document.getElementById('restaurant-filter').value,
      document.getElementById('category-filter').value
    );
    if (currentVariantsProductId === productId) {
      await loadProductVariants();
    }
  } catch (error) {
    console.error('Failed to delete product variant:', error);
    Utils.showError(error.message || 'Не удалось удалить вариант');
  }
}

async function toggleProductVariantActive(productId, variantId, isActive) {
  try {
    await AdminAPI.updateProductVariant(variantId, { isActive: !isActive });
    await loadProducts(
      document.getElementById('restaurant-filter').value,
      document.getElementById('category-filter').value
    );
    if (currentVariantsProductId === productId) {
      await loadProductVariants();
    }
  } catch (error) {
    console.error('Failed to toggle variant:', error);
    Utils.showError(error.message || 'Не удалось изменить доступность варианта');
  }
}

function resetProductVariantForm() {
  document.getElementById('product-variant-id').value = '';
  document.getElementById('product-variant-name-ru').value = '';
  document.getElementById('product-variant-name-kk').value = '';
  document.getElementById('product-variant-name-en').value = '';
  document.getElementById('product-variant-price').value = '';
  document.getElementById('product-variant-sort').value = '0';
  document.getElementById('product-variant-active').checked = true;
}

async function loadProductVariants() {
  const container = document.getElementById('product-variants-list-container');
  if (!currentVariantsProductId) {
    container.innerHTML = '<div class="empty-state">Продукт не выбран.</div>';
    return;
  }

  try {
    container.innerHTML = '<div class="loading">Загрузка...</div>';
    const response = await AdminAPI.getProductVariants(currentVariantsProductId);
    const variants = response.data?.data || response.data || [];
    currentProductVariants = variants;

    if (variants.length === 0) {
      container.innerHTML = '<div class="empty-state">Вариантов нет.</div>';
      return;
    }

    container.innerHTML = variants
      .map((variant) => {
        const name = variant.name_ru || variant.name_kk || variant.name_en || 'Вариант';
        const price = Utils.formatPrice(variant.price_kzt || 0);
        return `
          <div class="list-item" style="padding: 12px;">
            <div class="list-item-info">
              <h4>${Utils.escapeHtml(name)}</h4>
              <p style="margin: 4px 0; font-size: 12px; color: #666;">
                ${price} ₸
              </p>
              <p style="margin: 4px 0; font-size: 12px; color: #888;">
                ${variant.is_active ? 'Активен' : 'Неактивен'}
              </p>
            </div>
            <div class="list-item-actions" style="display: flex; gap: 10px; align-items: center;">
              <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: #555; cursor: pointer;">
                <input type="checkbox" ${variant.is_active !== false ? 'checked' : ''} onchange="toggleProductVariantActive('${currentVariantsProductId}', '${variant.id}', ${variant.is_active !== false})" />
                Активен
              </label>
              <button class="btn-icon" onclick="editProductVariant('${variant.id}')" title="Редактировать">
                <i class="fas fa-edit"></i>
              </button>
              <button class="btn-icon" onclick="deleteProductVariant('${variant.id}')" title="Удалить">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </div>
        `;
      })
      .join('');
  } catch (error) {
    console.error('Failed to load product variants:', error);
    container.innerHTML = '<div class="empty-state">Не удалось загрузить варианты.</div>';
  }
}

function editProductVariant(variantId) {
  const variant = currentProductVariants.find((item) => item.id === variantId);
  if (!variant) {
    Utils.showError('Вариант не найден');
    return;
  }

  document.getElementById('product-variant-id').value = variant.id;
  document.getElementById('product-variant-name-ru').value = variant.name_ru || '';
  document.getElementById('product-variant-name-kk').value = variant.name_kk || '';
  document.getElementById('product-variant-name-en').value = variant.name_en || '';
  document.getElementById('product-variant-price').value = variant.price_kzt || '';
  document.getElementById('product-variant-sort').value = variant.sort_order ?? 0;
  document.getElementById('product-variant-active').checked = variant.is_active !== false;
}

async function saveProductVariant() {
  if (!currentVariantsProductId) {
    Utils.showError('Продукт не выбран');
    return;
  }

  const variantId = document.getElementById('product-variant-id').value || null;
  const payload = {
    nameRu: document.getElementById('product-variant-name-ru').value.trim(),
    nameKk: document.getElementById('product-variant-name-kk').value.trim(),
    nameEn: document.getElementById('product-variant-name-en').value.trim(),
    priceKzt: document.getElementById('product-variant-price').value.trim(),
    sortOrder: parseInt(document.getElementById('product-variant-sort').value || '0', 10),
    isActive: document.getElementById('product-variant-active').checked,
  };

  if (!payload.nameRu || !payload.nameKk || !payload.nameEn || !payload.priceKzt) {
    Utils.showError('Заполните название и цену');
    return;
  }

  try {
    if (variantId) {
      await AdminAPI.updateProductVariant(variantId, payload);
      Utils.showSuccess('Вариант обновлен');
    } else {
      await AdminAPI.createProductVariant(currentVariantsProductId, payload);
      Utils.showSuccess('Вариант создан');
    }
    resetProductVariantForm();
    await loadProductVariants();
    await loadProducts(
      document.getElementById('restaurant-filter').value,
      document.getElementById('category-filter').value,
    );
  } catch (error) {
    console.error('Failed to save product variant:', error);
    Utils.showError(error.message || 'Не удалось сохранить вариант');
  }
}

async function deleteProductVariant(variantId) {
  if (!confirm('Вы уверены, что хотите удалить этот вариант?')) {
    return;
  }

  try {
    await AdminAPI.deleteProductVariant(variantId);
    Utils.showSuccess('Вариант удален');
    await loadProductVariants();
  } catch (error) {
    console.error('Failed to delete product variant:', error);
    Utils.showError(error.message || 'Не удалось удалить вариант');
  }
}

// Экспорт
window.openProductModal = openProductModal;
window.closeProductModal = closeProductModal;
window.editProduct = editProduct;
window.deleteProduct = deleteProduct;
window.loadProductModifiers = loadProductModifiers;
window.removeProductImage = removeProductImage;
window.openProductVariantsModal = openProductVariantsModal;
window.closeProductVariantsModal = closeProductVariantsModal;
window.toggleProductVariantsPreview = toggleProductVariantsPreview;
window.openProductVariantEditor = openProductVariantEditor;
window.deleteProductVariantInline = deleteProductVariantInline;
window.toggleProductVariantActive = toggleProductVariantActive;
window.resetProductVariantForm = resetProductVariantForm;
window.editProductVariant = editProductVariant;
window.deleteProductVariant = deleteProductVariant;
// Делаем currentProductId доступным глобально для использования в onclick
Object.defineProperty(window, 'currentProductId', {
  get: function() { return currentProductId; },
  set: function(value) { currentProductId = value; }
});

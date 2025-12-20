/**
 * Логика управления модификаторами
 */

let currentProductIdForModifiers = null;

async function openModifiersModal(productId) {
  currentProductIdForModifiers = productId;
  document.getElementById('modifiers-modal').style.display = 'block';
  await loadModifiers();
}

function closeModifiersModal() {
  document.getElementById('modifiers-modal').style.display = 'none';
  const productId = currentProductIdForModifiers;
  currentProductIdForModifiers = null;
  
  // Обновить список модификаторов в модальном окне продукта, если оно открыто
  if (productId && typeof loadProductModifiers === 'function') {
    loadProductModifiers(productId);
  }
}

async function loadModifiers() {
  const content = document.getElementById('modifiers-content');
  if (!content) return;
  
  try {
    content.innerHTML = '<div class="loading">Загрузка...</div>';
    
    const response = await AdminAPI.getModifierGroups(currentProductIdForModifiers);
    console.log('Modifiers API response:', response); // Debug
    
    // Проверяем разные возможные структуры ответа
    let groups = [];
    if (response.data?.data) {
      groups = Array.isArray(response.data.data) ? response.data.data : [];
    } else if (response.data) {
      groups = Array.isArray(response.data) ? response.data : [];
    } else if (Array.isArray(response)) {
      groups = response;
    }
    
    console.log('Parsed groups:', groups); // Debug
    
    // Сортируем опции по sortOrder
    groups.forEach(group => {
      if (group.options && Array.isArray(group.options)) {
        group.options.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      }
    });
    
    content.innerHTML = `
      <div style="margin-bottom: 20px;">
        <button class="btn btn-primary" onclick="openAddGroupModal()">+ Добавить группу модификаторов</button>
      </div>
      <div id="modifiers-groups-list">
        ${groups.length === 0 
          ? '<div class="empty-state">Нет групп модификаторов. Добавьте первую группу.</div>'
          : groups.map(group => renderModifierGroup(group)).join('')
        }
      </div>
    `;
    
    // Настроить обработчики событий для кнопок редактирования и удаления опций
    setTimeout(() => {
      document.querySelectorAll('.edit-option-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const button = e.target.closest('.edit-option-btn') || e.target;
          const groupId = button.dataset.groupId;
          const optionId = button.dataset.optionId;
          console.log('Edit option clicked - groupId:', groupId, 'optionId:', optionId);
          if (groupId && optionId) {
            editModifierOption(groupId, optionId);
          } else {
            console.error('Missing groupId or optionId', { groupId, optionId });
          }
        });
      });
      
      document.querySelectorAll('.delete-option-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const button = e.target.closest('.delete-option-btn') || e.target;
          const groupId = button.dataset.groupId;
          const optionId = button.dataset.optionId;
          console.log('Delete option clicked - groupId:', groupId, 'optionId:', optionId);
          if (groupId && optionId) {
            deleteModifierOption(groupId, optionId);
          } else {
            console.error('Missing groupId or optionId', { groupId, optionId });
          }
        });
      });
    }, 100);
  } catch (error) {
    console.error('Failed to load modifiers:', error);
    content.innerHTML = `
      <div style="margin-bottom: 20px;">
        <button class="btn btn-primary" onclick="openAddGroupModal()">+ Добавить группу модификаторов</button>
      </div>
      <div class="error-message" style="color: red; padding: 16px;">
        Не удалось загрузить модификаторы: ${error.message || 'Неизвестная ошибка'}
      </div>
    `;
  }
}

function renderModifierGroup(group) {
  const groupName = group.name?.ru || group.name?.kk || group.name?.en || 'Без названия';
  const isActive = group.isActive !== false;
  return `
    <div class="modifier-group-item" style="border: 1px solid #ddd; padding: 16px; margin-bottom: 16px; border-radius: 8px; background-color: ${isActive ? '#fff' : '#f9f9f9'}; opacity: ${isActive ? '1' : '0.8'};">
      <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
        <div>
          <h4>${groupName}${!isActive ? ' <span style="color: #999; font-size: 12px; font-weight: normal;">(неактивна)</span>' : ''}</h4>
          <p style="color: #666; font-size: 14px;">
            Тип: ${group.type === 'SINGLE' ? 'Один выбор' : 'Несколько выборов'} | 
            Обязательно: ${group.required ? 'Да' : 'Нет'} | 
            Выбор: ${group.minSelect}-${group.maxSelect}
          </p>
        </div>
        <div>
          <button class="btn-icon" onclick="editModifierGroup('${group.id}')" title="Редактировать"><i class="fas fa-edit"></i></button>
          <button class="btn-icon" onclick="deleteModifierGroup('${group.id}')" title="Удалить"><i class="fas fa-trash"></i></button>
        </div>
      </div>
      <div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
          <strong>Опции:</strong>
          <button class="btn btn-secondary" style="padding: 4px 12px; font-size: 12px;" onclick="openAddOptionModal('${group.id}')">
            + Добавить опцию
          </button>
        </div>
        <div id="options-${group.id}">
          ${group.options && group.options.length > 0
            ? group.options.map(option => renderModifierOption(group.id, option)).join('')
            : '<div style="color: #999; font-size: 14px;">Нет опций</div>'
          }
        </div>
      </div>
    </div>
  `;
}

function renderModifierOption(groupId, option) {
  const optionName = option.name?.ru || option.name?.kk || option.name?.en || 'Без названия';
  const priceDelta = parseFloat(option.priceDelta || 0);
  const sortOrder = option.sortOrder || 0;
  const isActive = option.isActive !== false;
  
  // Экранируем ID для использования в HTML
  const safeGroupId = String(groupId || '').replace(/'/g, "\\'");
  const safeOptionId = String(option.id || '').replace(/'/g, "\\'");
  
  return `
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: ${isActive ? '#f5f5f5' : '#f0f0f0'}; margin-bottom: 4px; border-radius: 4px; opacity: ${isActive ? '1' : '0.7'};">
      <span>
        ${!isActive ? '<span style="color: #999; text-decoration: line-through;">' : ''}
        ${Utils.escapeHtml(optionName)} 
        ${priceDelta > 0 ? `<span style="color: var(--primary-color); font-weight: 600;">(+${Utils.formatPrice(priceDelta)} ₸)</span>` : ''}
        ${sortOrder !== 0 ? `<span style="color: #999; font-size: 11px;">[${sortOrder}]</span>` : ''}
        ${!isActive ? '</span>' : ''}
        ${!isActive ? '<span style="color: #999; font-size: 11px; margin-left: 8px;">(неактивна)</span>' : ''}
      </span>
      <div>
        <button class="btn-icon edit-option-btn" data-group-id="${safeGroupId}" data-option-id="${safeOptionId}" title="Редактировать"><i class="fas fa-edit"></i></button>
        <button class="btn-icon delete-option-btn" data-group-id="${safeGroupId}" data-option-id="${safeOptionId}" title="Удалить"><i class="fas fa-trash"></i></button>
      </div>
    </div>
  `;
}

async function deleteModifierGroup(groupId) {
  if (!confirm('Вы уверены, что хотите удалить эту группу модификаторов? Все опции также будут удалены.')) {
    return;
  }
  try {
    await AdminAPI.deleteModifierGroup(currentProductIdForModifiers, groupId);
    Utils.showSuccess('Группа модификаторов удалена');
    await loadModifiers();
  } catch (error) {
    Utils.showError(error.message || 'Не удалось удалить группу модификаторов');
  }
}

async function deleteModifierOption(groupId, optionId) {
  if (!confirm('Вы уверены, что хотите удалить эту опцию?')) {
    return;
  }
  try {
    if (!groupId || !optionId) {
      Utils.showError('ID группы или опции не указан');
      return;
    }
    await AdminAPI.deleteModifierOption(groupId, optionId);
    Utils.showSuccess('Опция удалена');
    await loadModifiers();
  } catch (error) {
    console.error('Failed to delete option:', error);
    Utils.showError(error.message || 'Не удалось удалить опцию');
  }
}

function openAddGroupModal() {
  const content = document.getElementById('modifiers-content');
  content.innerHTML = `
    <h3>Добавить группу модификаторов</h3>
    <form id="add-group-form" style="margin-top: 20px;">
      <div class="form-group">
        <label>Название (RU)</label>
        <input type="text" id="group-name-ru" required>
      </div>
      <div class="form-group">
        <label>Название (KK)</label>
        <input type="text" id="group-name-kk" required>
      </div>
      <div class="form-group">
        <label>Название (EN)</label>
        <input type="text" id="group-name-en" required>
      </div>
      <div class="form-group">
        <label>Тип</label>
        <select id="group-type" required>
          <option value="SINGLE">Один выбор</option>
          <option value="MULTIPLE">Несколько выборов</option>
        </select>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <div class="form-group">
          <label>Минимум выборов</label>
          <input type="number" id="group-min-select" min="0" value="0" required>
        </div>
        <div class="form-group">
          <label>Максимум выборов</label>
          <input type="number" id="group-max-select" min="1" value="1" required>
        </div>
      </div>
      <div class="form-group">
        <label>
          <input type="checkbox" id="group-required"> Обязательная группа
        </label>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">Создать</button>
        <button type="button" class="btn btn-secondary" onclick="loadModifiers()">Отмена</button>
      </div>
    </form>
  `;
  
  document.getElementById('add-group-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await createModifierGroup();
  });
}

async function createModifierGroup() {
  try {
    const data = {
      productId: currentProductIdForModifiers,
      nameRu: document.getElementById('group-name-ru').value,
      nameKk: document.getElementById('group-name-kk').value,
      nameEn: document.getElementById('group-name-en').value,
      type: document.getElementById('group-type').value,
      minSelect: parseInt(document.getElementById('group-min-select').value),
      maxSelect: parseInt(document.getElementById('group-max-select').value),
      required: Boolean(document.getElementById('group-required').checked),
      isActive: true,
    };
    
    await AdminAPI.createModifierGroup(currentProductIdForModifiers, data);
    Utils.showSuccess('Группа модификаторов создана');
    await loadModifiers();
  } catch (error) {
    Utils.showError(error.message || 'Не удалось создать группу модификаторов');
  }
}

function openAddOptionModal(groupId) {
  const content = document.getElementById('modifiers-content');
  content.innerHTML = `
    <h3>Добавить опцию модификатора</h3>
    <form id="add-option-form" style="margin-top: 20px;">
      <input type="hidden" id="option-group-id" value="${groupId}">
      <div class="form-group">
        <label>Название (RU)</label>
        <input type="text" id="option-name-ru" required>
      </div>
      <div class="form-group">
        <label>Название (KK)</label>
        <input type="text" id="option-name-kk" required>
      </div>
      <div class="form-group">
        <label>Название (EN)</label>
        <input type="text" id="option-name-en" required>
      </div>
      <div class="form-group">
        <label>Доплата (KZT)</label>
        <input type="number" id="option-price-delta" step="0.01" min="0" value="0" required>
      </div>
      <div class="form-group">
        <label>Порядок сортировки</label>
        <input type="number" id="option-sort-order" value="0">
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">Создать</button>
        <button type="button" class="btn btn-secondary" onclick="loadModifiers()">Отмена</button>
      </div>
    </form>
  `;
  
  document.getElementById('add-option-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await createModifierOption();
  });
}

async function createModifierOption() {
  try {
    const groupId = document.getElementById('option-group-id').value;
    const data = {
      modifierGroupId: groupId,
      nameRu: document.getElementById('option-name-ru').value,
      nameKk: document.getElementById('option-name-kk').value,
      nameEn: document.getElementById('option-name-en').value,
      priceDeltaKzt: parseFloat(document.getElementById('option-price-delta').value),
      sortOrder: parseInt(document.getElementById('option-sort-order').value || 0),
      isActive: true,
    };
    
    await AdminAPI.createModifierOption(groupId, data);
    Utils.showSuccess('Опция создана');
    await loadModifiers();
  } catch (error) {
    Utils.showError(error.message || 'Не удалось создать опцию');
  }
}

async function editModifierGroup(groupId) {
  try {
    const response = await AdminAPI.getModifierGroups(currentProductIdForModifiers);
    const groups = response.data?.data || [];
    const group = groups.find(g => g.id === groupId);
    
    if (!group) {
      Utils.showError('Группа не найдена');
      return;
    }
    
    const content = document.getElementById('modifiers-content');
    const groupNameRu = group.name?.ru || '';
    const groupNameKk = group.name?.kk || '';
    const groupNameEn = group.name?.en || '';
    
    content.innerHTML = `
      <h3>Редактировать группу модификаторов</h3>
      <form id="edit-group-form" style="margin-top: 20px;">
        <input type="hidden" id="edit-group-id" value="${groupId}">
        <div class="form-group">
          <label>Название (RU)</label>
          <input type="text" id="edit-group-name-ru" value="${groupNameRu}" required>
        </div>
        <div class="form-group">
          <label>Название (KK)</label>
          <input type="text" id="edit-group-name-kk" value="${groupNameKk}" required>
        </div>
        <div class="form-group">
          <label>Название (EN)</label>
          <input type="text" id="edit-group-name-en" value="${groupNameEn}" required>
        </div>
        <div class="form-group">
          <label>Тип</label>
          <select id="edit-group-type" required>
            <option value="SINGLE" ${group.type === 'SINGLE' ? 'selected' : ''}>Один выбор</option>
            <option value="MULTIPLE" ${group.type === 'MULTIPLE' ? 'selected' : ''}>Несколько выборов</option>
          </select>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
          <div class="form-group">
            <label>Минимум выборов</label>
            <input type="number" id="edit-group-min-select" min="0" value="${group.minSelect}" required>
          </div>
          <div class="form-group">
            <label>Максимум выборов</label>
            <input type="number" id="edit-group-max-select" min="1" value="${group.maxSelect}" required>
          </div>
        </div>
        <div class="form-group">
          <label>
            <input type="checkbox" id="edit-group-required" ${group.required ? 'checked' : ''}> Обязательная группа
          </label>
        </div>
        <div class="form-group">
          <label>
            <input type="checkbox" id="edit-group-is-active" ${group.isActive !== false ? 'checked' : ''}> Активна
          </label>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">Сохранить</button>
          <button type="button" class="btn btn-secondary" onclick="loadModifiers()">Отмена</button>
        </div>
      </form>
    `;
    
    document.getElementById('edit-group-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      await updateModifierGroup();
    });
  } catch (error) {
    Utils.showError(error.message || 'Не удалось загрузить данные группы');
  }
}

async function updateModifierGroup() {
  try {
    const groupId = document.getElementById('edit-group-id').value;
    const data = {
      nameRu: document.getElementById('edit-group-name-ru').value,
      nameKk: document.getElementById('edit-group-name-kk').value,
      nameEn: document.getElementById('edit-group-name-en').value,
      type: document.getElementById('edit-group-type').value,
      minSelect: parseInt(document.getElementById('edit-group-min-select').value),
      maxSelect: parseInt(document.getElementById('edit-group-max-select').value),
      required: Boolean(document.getElementById('edit-group-required').checked),
      isActive: Boolean(document.getElementById('edit-group-is-active').checked),
    };
    
    await AdminAPI.updateModifierGroup(currentProductIdForModifiers, groupId, data);
    Utils.showSuccess('Группа модификаторов обновлена');
    await loadModifiers();
  } catch (error) {
    Utils.showError(error.message || 'Не удалось обновить группу модификаторов');
  }
}

async function editModifierOption(groupId, optionId) {
  try {
    if (!currentProductIdForModifiers) {
      Utils.showError('ID продукта не установлен');
      return;
    }
    
    if (!groupId || !optionId) {
      Utils.showError('ID группы или опции не указан');
      return;
    }
    
    const response = await AdminAPI.getModifierGroups(currentProductIdForModifiers);
    console.log('Edit option - API response:', response); // Debug
    
    // Проверяем разные возможные структуры ответа
    let groups = [];
    if (response.data?.data) {
      groups = Array.isArray(response.data.data) ? response.data.data : [];
    } else if (response.data) {
      groups = Array.isArray(response.data) ? response.data : [];
    } else if (Array.isArray(response)) {
      groups = response;
    }
    
    console.log('Edit option - Parsed groups:', groups); // Debug
    console.log('Edit option - Looking for groupId:', groupId); // Debug
    
    const group = groups.find(g => g.id === groupId);
    
    if (!group) {
      console.error('Group not found. Available groups:', groups.map(g => ({ id: g.id, name: g.name })));
      Utils.showError(`Группа не найдена. ID: ${groupId}`);
      return;
    }
    
    console.log('Edit option - Found group:', group); // Debug
    console.log('Edit option - Group options:', group.options); // Debug
    console.log('Edit option - Looking for optionId:', optionId); // Debug
    
    const option = group.options?.find(o => o.id === optionId);
    if (!option) {
      console.error('Option not found. Available options:', group.options?.map(o => ({ id: o.id, name: o.name })));
      Utils.showError(`Опция не найдена. ID: ${optionId}`);
      return;
    }
    
    const content = document.getElementById('modifiers-content');
    const optionNameRu = option.name?.ru || '';
    const optionNameKk = option.name?.kk || '';
    const optionNameEn = option.name?.en || '';
    const priceDelta = parseFloat(option.priceDelta || 0);
    const sortOrder = option.sortOrder || 0;
    
    content.innerHTML = `
      <h3>Редактировать опцию модификатора</h3>
      <form id="edit-option-form" style="margin-top: 20px;">
        <input type="hidden" id="edit-option-group-id" value="${groupId}">
        <input type="hidden" id="edit-option-id" value="${optionId}">
        <div class="form-group">
          <label>Название (RU)</label>
          <input type="text" id="edit-option-name-ru" value="${optionNameRu}" required>
        </div>
        <div class="form-group">
          <label>Название (KK)</label>
          <input type="text" id="edit-option-name-kk" value="${optionNameKk}" required>
        </div>
        <div class="form-group">
          <label>Название (EN)</label>
          <input type="text" id="edit-option-name-en" value="${optionNameEn}" required>
        </div>
        <div class="form-group">
          <label>Доплата (KZT)</label>
          <input type="number" id="edit-option-price-delta" step="0.01" min="0" value="${priceDelta}" required>
        </div>
        <div class="form-group">
          <label>Порядок сортировки</label>
          <input type="number" id="edit-option-sort-order" value="${sortOrder}">
        </div>
        <div class="form-group">
          <label>
            <input type="checkbox" id="edit-option-is-active" ${option.isActive !== false ? 'checked' : ''}> Активна
          </label>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">Сохранить</button>
          <button type="button" class="btn btn-secondary" onclick="loadModifiers()">Отмена</button>
        </div>
      </form>
    `;
    
    document.getElementById('edit-option-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      await updateModifierOption();
    });
  } catch (error) {
    Utils.showError(error.message || 'Не удалось загрузить данные опции');
  }
}

async function updateModifierOption() {
  try {
    const groupId = document.getElementById('edit-option-group-id').value;
    const optionId = document.getElementById('edit-option-id').value;
    const data = {
      nameRu: document.getElementById('edit-option-name-ru').value,
      nameKk: document.getElementById('edit-option-name-kk').value,
      nameEn: document.getElementById('edit-option-name-en').value,
      priceDeltaKzt: parseFloat(document.getElementById('edit-option-price-delta').value),
      sortOrder: parseInt(document.getElementById('edit-option-sort-order').value || 0),
      isActive: Boolean(document.getElementById('edit-option-is-active').checked),
    };
    
    await AdminAPI.updateModifierOption(groupId, optionId, data);
    Utils.showSuccess('Опция обновлена');
    await loadModifiers();
  } catch (error) {
    Utils.showError(error.message || 'Не удалось обновить опцию');
  }
}

// Экспорт функций
window.openModifiersModal = openModifiersModal;
window.closeModifiersModal = closeModifiersModal;
window.editModifierGroup = editModifierGroup;
window.editModifierOption = editModifierOption;
window.updateModifierGroup = updateModifierGroup;
window.updateModifierOption = updateModifierOption;

// Закрытие модального окна при клике вне его
document.addEventListener('click', function(event) {
  const modal = document.getElementById('modifiers-modal');
  if (modal && event.target === modal) {
    closeModifiersModal();
  }
});


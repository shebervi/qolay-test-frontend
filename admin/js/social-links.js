/**
 * Логика страницы социальных ссылок
 */

let currentSocialLinkId = null;
let restaurants = [];
let currentRestaurantId = null;
let currentUser = null;
let socialLinks = [];
let draggedElement = null;

const Utils = window.Utils || {
  showError: (msg) => {
    console.error(msg);
    alert('Ошибка: ' + msg);
  },
  showSuccess: (msg) => {
    console.log(msg);
    alert('Успешно: ' + msg);
  },
};

const AdminAPI = window.AdminAPI || {};

document.addEventListener('DOMContentLoaded', async () => {
  // Получаем текущего пользователя
  if (typeof Auth !== 'undefined') {
    currentUser = Auth.getAuthUser();
  }

  // Загружаем рестораны
  await loadRestaurants();
  
  // Скрываем кнопку добавления для WAITER и KITCHEN
  const btnAddLink = document.getElementById('btn-add-link');
  if (btnAddLink) {
    const canCreateLink = currentUser?.role !== 'WAITER' && currentUser?.role !== 'KITCHEN';
    btnAddLink.style.display = canCreateLink ? 'block' : 'none';
  }
  
  // Обработка фильтра ресторана
  const restaurantFilter = document.getElementById('restaurant-filter');
  restaurantFilter.addEventListener('change', async (e) => {
    currentRestaurantId = e.target.value;
    btnAddLink.disabled = !currentRestaurantId;
    if (currentRestaurantId) {
      await loadSocialLinks(currentRestaurantId);
    } else {
      document.getElementById('social-links-list').innerHTML = 
        '<div class="empty-state">Выберите ресторан для просмотра социальных ссылок</div>';
    }
  });

  // Обработка изменения типа ссылки
  document.getElementById('social-link-type').addEventListener('change', (e) => {
    const type = e.target.value;
    const iconGroup = document.getElementById('social-link-icon-group');
    const defaultIconPreview = document.getElementById('social-link-default-icon-preview');
    const defaultIconImg = document.getElementById('social-link-default-icon-preview-img');
    const iconFileInput = document.getElementById('social-link-icon-file');
    
    if (type === 'CUSTOM') {
      iconGroup.style.display = 'block';
      if (iconFileInput) {
        iconFileInput.required = !currentSocialLinkId; // Требуется только при создании
      }
      defaultIconPreview.style.display = 'none';
    } else if (type && type !== '') {
      // Показываем дефолтную иконку для predefined типов
      const defaultIconPaths = {
        INSTAGRAM: 'default/instagram.svg',
        TELEGRAM: 'default/telegram.svg',
        WHATSAPP: 'default/whatsapp.svg',
        TWO_GIS: 'default/2gis.svg',
      };
      
      const iconPath = defaultIconPaths[type];
      if (iconPath && AdminAPI.getSocialIconUrl) {
        const iconUrl = AdminAPI.getSocialIconUrl(iconPath);
        defaultIconImg.src = iconUrl;
        defaultIconPreview.style.display = 'block';
      }
      
      iconGroup.style.display = 'none';
      if (iconFileInput) {
        iconFileInput.required = false;
        iconFileInput.value = '';
      }
      document.getElementById('social-link-icon-preview').style.display = 'none';
    } else {
      defaultIconPreview.style.display = 'none';
      iconGroup.style.display = 'none';
      if (iconFileInput) {
        iconFileInput.required = false;
        iconFileInput.value = '';
      }
      document.getElementById('social-link-icon-preview').style.display = 'none';
    }
  });

  // Обработка выбора файла иконки
  const iconFileInput = document.getElementById('social-link-icon-file');
  if (iconFileInput) {
    iconFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        // Показываем предпросмотр выбранного файла
        const reader = new FileReader();
        reader.onload = (event) => {
          const preview = document.getElementById('social-link-icon-preview');
          const previewImg = document.getElementById('social-link-icon-preview-img');
          previewImg.src = event.target.result;
          preview.style.display = 'block';
        };
        reader.readAsDataURL(file);
      } else {
        document.getElementById('social-link-icon-preview').style.display = 'none';
      }
    });
  }

  // Обработка формы
  document.getElementById('social-link-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveSocialLink();
  });
});

async function loadRestaurants() {
  try {
    const response = await AdminAPI.getRestaurants();
    restaurants = response.data?.data || response.data || [];
    
    const select = document.getElementById('restaurant-filter');
    select.innerHTML = '<option value="">Выберите ресторан</option>';
    
    restaurants.forEach(restaurant => {
      const option = document.createElement('option');
      option.value = restaurant.id;
      option.textContent = restaurant.name;
      select.appendChild(option);
    });
  } catch (error) {
    console.error('Failed to load restaurants:', error);
    Utils.showError('Не удалось загрузить рестораны');
  }
}

async function loadSocialLinks(restaurantId) {
  try {
    const listContainer = document.getElementById('social-links-list');
    listContainer.innerHTML = '<div class="loading">Загрузка...</div>';

    const response = await AdminAPI.getSocialLinks(restaurantId);
    socialLinks = response.data?.data || response.data || [];

    if (socialLinks.length === 0) {
      listContainer.innerHTML = '<div class="empty-state">Нет социальных ссылок. Добавьте первую ссылку.</div>';
      return;
    }

    // Сортируем по order
    socialLinks.sort((a, b) => a.order - b.order);

    const canEdit = currentUser?.role !== 'WAITER' && currentUser?.role !== 'KITCHEN';
    const canDelete = canEdit;

    listContainer.innerHTML = `
      <ul class="sortable-list" id="sortable-links-list">
        ${socialLinks.map(link => {
          // Определяем iconKey для отображения
          let iconKey = link.icon;
          if (!iconKey && link.type !== 'CUSTOM') {
            // Для дефолтных типов используем стандартные пути
            const defaultIconPaths = {
              INSTAGRAM: 'default/instagram.svg',
              TELEGRAM: 'default/telegram.svg',
              WHATSAPP: 'default/whatsapp.svg',
              TWO_GIS: 'default/2gis.svg',
            };
            iconKey = defaultIconPaths[link.type];
          }
          
          return `
          <li class="sortable-item" data-id="${link.id}" draggable="${canEdit ? 'true' : 'false'}">
            ${canEdit ? '<i class="fas fa-grip-vertical drag-handle"></i>' : ''}
            ${iconKey ? `<img src="${AdminAPI.getSocialIconUrl(iconKey)}" alt="${link.label}" class="icon-preview" onerror="this.style.display='none'">` : '<div class="icon-preview" style="background: #f0f0f0; display: flex; align-items: center; justify-content: center; color: #999; font-size: 12px;">?</div>'}
            <div class="social-link-info">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                <strong>${link.label}</strong>
                ${link.type === 'CUSTOM' ? '<span style="color: #999; font-size: 12px; font-weight: normal; margin-left: 4px;">(кастомная)</span>' : '<span style="color: #666; font-size: 12px; font-weight: normal; margin-left: 4px;">(дефолтная)</span>'}
                ${link.isActive ? '<span style="color: var(--success-color); font-weight: 600; margin-left: auto;">Активна</span>' : '<span style="color: #999; margin-left: auto;">Неактивна</span>'}
              </div>
              <a href="${link.url}" target="_blank" style="color: #666; font-size: 12px; text-decoration: none;">
                ${link.url}
              </a>
            </div>
            <div class="list-item-actions">
              ${canEdit ? `
              <button class="btn-icon" onclick="editSocialLink('${link.id}')" title="Редактировать">
                <i class="fas fa-edit"></i>
              </button>
              ` : ''}
              ${canDelete ? `
              <button class="btn-icon" onclick="deleteSocialLink('${link.id}')" title="Удалить">
                <i class="fas fa-trash"></i>
              </button>
              ` : ''}
            </div>
          </li>
        `;
        }).join('')}
      </ul>
    `;

    // Инициализируем drag-and-drop
    if (canEdit) {
      initDragAndDrop();
    }
  } catch (error) {
    console.error('Failed to load social links:', error);
    Utils.showError('Не удалось загрузить социальные ссылки');
    document.getElementById('social-links-list').innerHTML = '<div class="empty-state">Ошибка загрузки</div>';
  }
}

function getTypeLabel(type) {
  const labels = {
    INSTAGRAM: 'Instagram',
    TELEGRAM: 'Telegram',
    WHATSAPP: 'WhatsApp',
    TWO_GIS: '2GIS',
    CUSTOM: 'Кастомная',
  };
  return labels[type] || type;
}

function initDragAndDrop() {
  const list = document.getElementById('sortable-links-list');
  if (!list) return;

  const items = list.querySelectorAll('.sortable-item');
  
  items.forEach(item => {
    item.addEventListener('dragstart', (e) => {
      draggedElement = item;
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      draggedElement = null;
    });

    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      
      const afterElement = getDragAfterElement(list, e.clientY);
      if (afterElement == null) {
        list.appendChild(item);
      } else {
        list.insertBefore(item, afterElement);
      }
    });

    item.addEventListener('drop', async (e) => {
      e.preventDefault();
      await saveOrder();
    });
  });
}

function getDragAfterElement(container, y) {
  const draggableElements = [...container.querySelectorAll('.sortable-item:not(.dragging)')];
  
  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    
    if (offset < 0 && offset > closest.offset) {
      return { offset: offset, element: child };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

async function saveOrder() {
  try {
    const list = document.getElementById('sortable-links-list');
    const items = list.querySelectorAll('.sortable-item');
    const ids = Array.from(items).map(item => item.dataset.id);
    
    await AdminAPI.reorderSocialLinks(ids);
    Utils.showSuccess('Порядок ссылок обновлен');
    await loadSocialLinks(currentRestaurantId);
  } catch (error) {
    console.error('Failed to save order:', error);
    Utils.showError('Не удалось сохранить порядок ссылок');
  }
}

function openSocialLinkModal() {
  if (!currentRestaurantId) {
    Utils.showError('Выберите ресторан');
    return;
  }
  
  currentSocialLinkId = null;
  document.getElementById('social-link-modal-title').textContent = 'Добавить социальную ссылку';
  document.getElementById('social-link-form').reset();
  document.getElementById('social-link-id').value = '';
  document.getElementById('social-link-icon-group').style.display = 'none';
  document.getElementById('social-link-icon-preview').style.display = 'none';
  document.getElementById('social-link-default-icon-preview').style.display = 'none';
  const iconFileInput = document.getElementById('social-link-icon-file');
  if (iconFileInput) {
    iconFileInput.value = '';
  }
  document.getElementById('social-link-modal').classList.add('active');
}

async function editSocialLink(id) {
  try {
    const response = await AdminAPI.getSocialLink(id);
    const link = response.data?.data || response.data;
    
    currentSocialLinkId = id;
    document.getElementById('social-link-modal-title').textContent = 'Редактировать социальную ссылку';
    document.getElementById('social-link-id').value = id;
    document.getElementById('social-link-type').value = link.type;
    document.getElementById('social-link-label').value = link.label;
    document.getElementById('social-link-url').value = link.url;
    document.getElementById('social-link-order').value = link.order || 0;
    document.getElementById('social-link-is-active').value = link.isActive ? 'true' : 'false';
    
    // Обработка иконки
    const defaultIconPreview = document.getElementById('social-link-default-icon-preview');
    const defaultIconImg = document.getElementById('social-link-default-icon-preview-img');
    const iconFileInput = document.getElementById('social-link-icon-file');
    
    if (link.type === 'CUSTOM') {
      document.getElementById('social-link-icon-group').style.display = 'block';
      defaultIconPreview.style.display = 'none';
      if (iconFileInput) {
        iconFileInput.required = false; // При редактировании файл не обязателен
        iconFileInput.value = '';
      }
      if (link.icon) {
        const iconUrl = AdminAPI.getSocialIconUrl(link.icon);
        if (iconUrl) {
          const preview = document.getElementById('social-link-icon-preview');
          const previewImg = document.getElementById('social-link-icon-preview-img');
          previewImg.src = iconUrl;
          preview.style.display = 'block';
        }
      }
    } else {
      document.getElementById('social-link-icon-group').style.display = 'none';
      document.getElementById('social-link-icon-preview').style.display = 'none';
      if (iconFileInput) {
        iconFileInput.value = '';
      }
      
      // Показываем дефолтную иконку для predefined типов
      const defaultIconPaths = {
        INSTAGRAM: 'default/instagram.svg',
        TELEGRAM: 'default/telegram.svg',
        WHATSAPP: 'default/whatsapp.svg',
        TWO_GIS: 'default/2gis.svg',
      };
      
      const iconPath = defaultIconPaths[link.type];
      if (iconPath && AdminAPI.getSocialIconUrl) {
        const iconUrl = AdminAPI.getSocialIconUrl(iconPath);
        defaultIconImg.src = iconUrl;
        defaultIconPreview.style.display = 'block';
      } else {
        defaultIconPreview.style.display = 'none';
      }
    }
    
    document.getElementById('social-link-modal').classList.add('active');
  } catch (error) {
    console.error('Failed to load social link:', error);
    Utils.showError('Не удалось загрузить ссылку');
  }
}

async function saveSocialLink() {
  try {
    if (!currentRestaurantId) {
      Utils.showError('Выберите ресторан');
      return;
    }

    const type = document.getElementById('social-link-type').value;
    const data = {
      type: type,
      label: document.getElementById('social-link-label').value,
      url: document.getElementById('social-link-url').value,
      order: parseInt(document.getElementById('social-link-order').value, 10) || 0,
      isActive: document.getElementById('social-link-is-active').value === 'true',
    };

    // Получаем файл иконки, если выбран
    const iconFileInput = document.getElementById('social-link-icon-file');
    let iconFile = null;
    if (iconFileInput && iconFileInput.files && iconFileInput.files.length > 0) {
      iconFile = iconFileInput.files[0];
    }

    // Для CUSTOM типа проверяем наличие иконки
    if (type === 'CUSTOM') {
      // При создании файл обязателен, при обновлении - опционален (можно оставить старую)
      if (!currentSocialLinkId && !iconFile) {
        Utils.showError('Для кастомного типа необходимо загрузить иконку');
        return;
      }
      // Если файл не выбран при обновлении, но есть старая иконка - оставляем её
      if (currentSocialLinkId && !iconFile) {
        // Старая иконка уже сохранена в базе, ничего не делаем
      }
    }

    if (currentSocialLinkId) {
      await AdminAPI.updateSocialLink(currentSocialLinkId, data, iconFile);
      Utils.showSuccess('Социальная ссылка обновлена');
    } else {
      await AdminAPI.createSocialLink(currentRestaurantId, data, iconFile);
      Utils.showSuccess('Социальная ссылка создана');
    }

    closeSocialLinkModal();
    await loadSocialLinks(currentRestaurantId);
  } catch (error) {
    console.error('Failed to save social link:', error);
    Utils.showError(error.message || 'Не удалось сохранить ссылку');
  }
}

async function deleteSocialLink(id) {
  if (!confirm('Вы уверены, что хотите удалить эту социальную ссылку?')) {
    return;
  }

  try {
    await AdminAPI.deleteSocialLink(id);
    Utils.showSuccess('Социальная ссылка удалена');
    await loadSocialLinks(currentRestaurantId);
  } catch (error) {
    console.error('Failed to delete social link:', error);
    Utils.showError('Не удалось удалить ссылку');
  }
}

function closeSocialLinkModal() {
  document.getElementById('social-link-modal').classList.remove('active');
}

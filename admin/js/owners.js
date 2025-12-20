/**
 * Логика страницы владельцев
 */

document.addEventListener('DOMContentLoaded', async () => {
  await loadOwners();

  // Обработка формы создания владельца
  document.getElementById('owner-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveOwner();
  });

  // Обработка формы установки пароля
  document.getElementById('owner-password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await setOwnerPassword();
  });
});

async function loadOwners() {
  try {
    const response = await AdminAPI.getOwners();
    // Эндпоинт возвращает массив напрямую
    const owners = Array.isArray(response) ? response : (response?.data || []);

    const listContainer = document.getElementById('owners-list');
    
    if (owners.length === 0) {
      listContainer.innerHTML = '<div class="empty-state">Владельцы не найдены</div>';
      return;
    }

    listContainer.innerHTML = owners.map(owner => `
      <div class="card" style="margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 16px;">
          <div>
            <h3 style="margin: 0 0 8px 0;">${escapeHtml(owner.fullName)}</h3>
            <div style="color: #666; font-size: 14px;">
              <div>📞 ${escapeHtml(owner.phone)}</div>
              ${owner.email ? `<div>✉️ ${escapeHtml(owner.email)}</div>` : ''}
              ${owner.hasPassword ? '<span style="color: var(--success-color);">🔐 Пароль установлен</span>' : '<span style="color: #999;">🔓 Пароль не установлен</span>'}
              ${!owner.hasPassword ? `<div style="margin-top: 8px;"><button class="btn btn-secondary" onclick="openOwnerPasswordModal('${owner.id}', '${escapeHtml(owner.fullName)}')" style="font-size: 12px; padding: 6px 12px;">Установить пароль</button></div>` : ''}
            </div>
          </div>
          <div style="text-align: right; color: #666; font-size: 14px;">
            <div>Ресторанов: <strong>${owner.restaurantsCount}</strong></div>
            <div style="font-size: 12px; margin-top: 4px;">Создан: ${new Date(owner.createdAt).toLocaleDateString('ru-RU')}</div>
          </div>
        </div>

        ${owner.notes ? `<div style="margin-bottom: 16px; padding: 12px; background: #f5f5f5; border-radius: 8px; font-size: 14px; color: #666;">${escapeHtml(owner.notes)}</div>` : ''}

        ${owner.restaurants.length > 0 ? `
          <div style="margin-top: 16px;">
            <h4 style="margin: 0 0 12px 0; font-size: 16px; font-weight: 600;">Рестораны:</h4>
            <div style="display: grid; gap: 12px;">
              ${owner.restaurants.map(restaurant => `
                <div style="padding: 12px; background: #f9f9f9; border-radius: 8px; border-left: 3px solid ${restaurant.isActive ? 'var(--success-color)' : '#ccc'};">
                  <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div>
                      <div style="font-weight: 600; margin-bottom: 4px;">
                        ${escapeHtml(restaurant.name)}
                        ${!restaurant.isActive ? '<span style="color: #999; font-size: 12px; margin-left: 8px;">(неактивен)</span>' : ''}
                      </div>
                      <div style="color: #666; font-size: 14px;">
                        📍 ${escapeHtml(restaurant.city)}
                      </div>
                    </div>
                    <div style="text-align: right; font-size: 12px; color: #666;">
                      <div><i class="fas fa-chair"></i> Столов: ${restaurant.tablesCount}</div>
                      <div><i class="fas fa-utensils"></i> Продуктов: ${restaurant.productsCount}</div>
                      <div><i class="fas fa-folder"></i> Категорий: ${restaurant.categoriesCount}</div>
                    </div>
                  </div>
                  <div style="margin-top: 8px;">
                    <a href="restaurants.html?id=${restaurant.id}" class="btn btn-secondary" style="font-size: 12px; padding: 6px 12px;">
                      Открыть ресторан
                    </a>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : `
          <div style="padding: 16px; text-align: center; color: #999; background: #f5f5f5; border-radius: 8px;">
            У владельца пока нет ресторанов
          </div>
        `}
      </div>
    `).join('');

  } catch (error) {
    console.error('Error loading owners:', error);
    document.getElementById('owners-list').innerHTML = `
      <div class="error-state">
        Ошибка загрузки: ${error.message}
      </div>
    `;
  }
}

function openOwnerModal() {
  document.getElementById('owner-modal').style.display = 'flex';
  document.getElementById('modal-title').textContent = 'Добавить владельца';
  document.getElementById('owner-form').reset();
}

function closeOwnerModal() {
  document.getElementById('owner-modal').style.display = 'none';
  document.getElementById('owner-form').reset();
}

async function saveOwner() {
  const fullName = document.getElementById('owner-full-name').value.trim();
  const phone = document.getElementById('owner-phone').value.trim();
  const email = document.getElementById('owner-email').value.trim();
  const password = document.getElementById('owner-password').value;
  const notes = document.getElementById('owner-notes').value.trim();

  if (!fullName || !phone || !password) {
    alert('Заполните все обязательные поля');
    return;
  }

  if (password.length < 6) {
    alert('Пароль должен содержать минимум 6 символов');
    return;
  }

  try {
    await AdminAPI.createOwner({
      fullName,
      phone,
      email: email || undefined,
      password,
      notes: notes || undefined,
    });

    closeOwnerModal();
    await loadOwners();
    
    alert('Владелец успешно создан');
  } catch (error) {
    console.error('Error creating owner:', error);
    alert(error.message || 'Ошибка при создании владельца');
  }
}

function openOwnerPasswordModal(ownerId, ownerName) {
  document.getElementById('password-modal-title').textContent = `Установить пароль для ${ownerName}`;
  document.getElementById('owner-password-modal').setAttribute('data-owner-id', ownerId);
  document.getElementById('owner-password-modal').style.display = 'flex';
  document.getElementById('owner-password-form').reset();
}

function closeOwnerPasswordModal() {
  document.getElementById('owner-password-modal').style.display = 'none';
  document.getElementById('owner-password-form').reset();
  document.getElementById('owner-password-modal').removeAttribute('data-owner-id');
}

async function setOwnerPassword() {
  const ownerId = document.getElementById('owner-password-modal').getAttribute('data-owner-id');
  const password = document.getElementById('owner-password-new').value;
  const passwordConfirm = document.getElementById('owner-password-confirm').value;

  if (!ownerId) {
    alert('Ошибка: ID владельца не найден');
    return;
  }

  if (!password || password.length < 6) {
    alert('Пароль должен содержать минимум 6 символов');
    return;
  }

  if (password !== passwordConfirm) {
    alert('Пароли не совпадают');
    return;
  }

  try {
    await AdminAPI.setOwnerPassword(ownerId, password);

    closeOwnerPasswordModal();
    await loadOwners();
    
    alert('Пароль успешно установлен');
  } catch (error) {
    console.error('Error setting owner password:', error);
    alert(error.message || 'Ошибка при установке пароля');
  }
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

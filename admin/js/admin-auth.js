/**
 * Общая логика авторизации для админ панели
 * Подключается на всех страницах админ панели
 */

// Проверка авторизации при загрузке страницы
if (typeof Auth !== 'undefined') {
  // Проверяем авторизацию
  if (!Auth.requireAuth() || !Auth.requireRole(['ADMIN', 'OWNER', 'MANAGER', 'KITCHEN', 'WAITER'])) {
    // requireAuth и requireRole уже перенаправляют
  }
  
  // Отображаем информацию о пользователе в хедере
  function updateUserInfo() {
    const user = Auth.getAuthUser();
    const userInfoEl = document.getElementById('user-info');
    
    if (user && userInfoEl) {
      const roleNames = {
        'ADMIN': 'Администратор',
        'OWNER': 'Владелец',
        'MANAGER': 'Менеджер',
        'KITCHEN': 'Кухня',
        'WAITER': 'Официант',
      };
      
      const userName = user.name || user.username || user.phone || 'Пользователь';
      const roleName = roleNames[user.role] || user.role;
      userInfoEl.textContent = `${userName} (${roleName})`;
    }
  }
  
  // Добавляем кнопку выхода в хедер если её нет
  function addLogoutButton() {
    const headerActions = document.querySelector('.admin-header .header-actions');
    if (!headerActions) return;
    
    // Проверяем, есть ли уже кнопка выхода
    if (headerActions.querySelector('.btn-logout')) return;
    
    // Добавляем информацию о пользователе
    let userInfoEl = document.getElementById('user-info');
    if (!userInfoEl) {
      userInfoEl = document.createElement('span');
      userInfoEl.id = 'user-info';
      userInfoEl.style.marginRight = '16px';
      userInfoEl.style.color = '#666';
      headerActions.insertBefore(userInfoEl, headerActions.firstChild);
    }
    
    // Добавляем кнопку выхода если её нет
    const existingLogoutBtn = headerActions.querySelector('.btn-logout');
    if (!existingLogoutBtn) {
      const logoutBtn = document.createElement('button');
      logoutBtn.className = 'btn btn-secondary btn-logout';
      logoutBtn.textContent = 'Выйти';
      logoutBtn.onclick = logout;
      headerActions.appendChild(logoutBtn);
    }
  }
  
  // Функция выхода
  function logout() {
    if (confirm('Вы уверены, что хотите выйти?')) {
      Auth.clearAuth();
      window.location.href = 'login.html';
    }
  }
  
  // Скрытие пунктов навигации по ролям
  function hideNavigationItems() {
    const user = Auth.getAuthUser();
    if (!user) return;

    const role = user.role;

    // Владельцы - только для ADMIN
    if (role !== 'ADMIN') {
      const ownersLink = document.querySelector('a[href="owners.html"]');
      if (ownersLink) {
        ownersLink.style.display = 'none';
      }
    }

    // Персонал - скрыть для WAITER и KITCHEN
    if (role === 'WAITER' || role === 'KITCHEN') {
      const staffLink = document.querySelector('a[href="staff.html"]');
      if (staffLink) {
        staffLink.style.display = 'none';
      }
    }

    // Главная - скрыть для WAITER и KITCHEN
    if (role === 'WAITER' || role === 'KITCHEN') {
      const dashboardLink = document.querySelector('a[href="index.html"]');
      if (dashboardLink) {
        dashboardLink.style.display = 'none';
      }
    }

    // Столы - скрыть для KITCHEN
    if (role === 'KITCHEN') {
      const tablesLink = document.querySelector('a[href="tables.html"]');
      if (tablesLink) {
        tablesLink.style.display = 'none';
      }
    }

    // Баннеры - скрыть для WAITER и KITCHEN
    if (role === 'WAITER' || role === 'KITCHEN') {
      const bannersLink = document.querySelector('a[href="banners.html"]');
      if (bannersLink) {
        bannersLink.style.display = 'none';
      }
    }
  }

  // Инициализация при загрузке DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      updateUserInfo();
      addLogoutButton();
      hideNavigationItems();
    });
  } else {
      updateUserInfo();
      addLogoutButton();
      hideNavigationItems();
  }
  
  // Экспортируем функцию logout
  window.logout = logout;
}

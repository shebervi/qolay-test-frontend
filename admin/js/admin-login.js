/**
 * Логика авторизации для админ панели
 */

let currentResetRole = null;

// Переключение между формами
document.querySelectorAll('.login-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const role = tab.dataset.role;
    
    // Обновляем активные табы
    document.querySelectorAll('.login-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    
    // Обновляем активные формы
    document.querySelectorAll('.login-form').forEach(f => f.classList.remove('active'));
    document.getElementById(`${role}-form`).classList.add('active');
    
    // Скрываем модалку сброса пароля
    hidePasswordReset();
  });
});

// Обработка формы Admin
document.getElementById('admin-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  await handleLogin('admin', {
    username: document.getElementById('admin-username').value,
    password: document.getElementById('admin-password').value,
  });
});

// Обработка формы Owner
document.getElementById('owner-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  await handleLogin('owner', {
    phone: document.getElementById('owner-phone').value,
    password: document.getElementById('owner-password').value,
  });
});

// Обработка формы Manager
document.getElementById('manager-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  await handleLogin('manager', {
    phone: document.getElementById('manager-phone').value,
    password: document.getElementById('manager-password').value,
  });
});

// Обработка формы Kitchen
document.getElementById('kitchen-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  await handleLogin('kitchen', {
    restaurantId: document.getElementById('kitchen-restaurant-id').value,
    password: document.getElementById('kitchen-password').value,
  });
});

// Обработка формы Waiter
document.getElementById('waiter-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  await handleLogin('waiter', {
    username: document.getElementById('waiter-username').value,
    password: document.getElementById('waiter-password').value,
  });
});

/**
 * Обработка авторизации
 */
async function handleLogin(role, credentials) {
  const form = document.getElementById(`${role}-form`);
  const submitBtn = form.querySelector('.btn-login');
  const errorElements = form.querySelectorAll('.error-message');
  
  // Очищаем ошибки
  errorElements.forEach(el => {
    el.classList.remove('show');
    el.textContent = '';
  });
  
  // Убираем класс error с инпутов
  form.querySelectorAll('input').forEach(input => {
    input.classList.remove('error');
  });
  
  submitBtn.disabled = true;
  submitBtn.textContent = 'Вход...';
  
  try {
    let endpoint = '';
    let body = {};
    
    switch (role) {
      case 'admin':
        endpoint = '/auth/admin/login';
        body = { username: credentials.username, password: credentials.password };
        break;
      case 'owner':
        endpoint = '/auth/owner/login';
        body = { phone: credentials.phone, password: credentials.password };
        break;
      case 'manager':
        endpoint = '/auth/manager/login';
        body = { phone: credentials.phone, password: credentials.password };
        break;
      case 'kitchen':
        endpoint = '/auth/kitchen/login';
        body = { restaurantId: credentials.restaurantId, password: credentials.password };
        break;
      case 'waiter':
        endpoint = '/auth/waiter/login';
        body = { username: credentials.username, password: credentials.password };
        break;
    }
    
    const response = await fetch(`${CONFIG.API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Ошибка авторизации');
    }
    
    // Сохраняем токен и данные пользователя
    // Определяем роль: сначала из data.user.role, затем из data.owner, затем из role параметра
    let userRole = null;
    
    // Приоритет 1: роль из data.user.role (для ADMIN, MANAGER, WAITER, KITCHEN)
    if (data.user?.role) {
      userRole = data.user.role;
    }
    // Приоритет 2: если есть data.owner, то это OWNER
    else if (data.owner) {
      userRole = 'OWNER';
    }
    // Приоритет 3: используем role из параметра функции
    else {
      userRole = role.toUpperCase();
    }
    
    const userData = {
      role: userRole,
      id: data.user?.id || data.owner?.id,
      username: data.user?.username,
      name: data.user?.name || data.owner?.fullName,
      phone: data.user?.phone || data.owner?.phone,
      restaurantId: data.restaurant?.id || data.restaurantId,
      restaurant: data.restaurant,
    };
    
    // Отладочное логирование
    console.log('=== LOGIN DEBUG ===');
    console.log('Login role parameter:', role);
    console.log('Login response data:', data);
    console.log('data.user:', data.user);
    console.log('data.user?.role:', data.user?.role);
    console.log('data.owner:', data.owner);
    console.log('Determined userRole:', userRole);
    console.log('Saving user data:', userData);
    console.log('==================');
    
    Auth.saveAuth(data.accessToken, userData);
    
    // Проверяем, что данные сохранились
    const savedUser = Auth.getAuthUser();
    console.log('Saved user from localStorage:', savedUser);
    console.log('Saved user role:', savedUser?.role);
    
    // Финальная проверка
    if (savedUser?.role !== userRole) {
      console.error('ERROR: Role mismatch! Expected:', userRole, 'Got:', savedUser?.role);
    }
    
    // Перенаправляем на главную админ панели
    window.location.href = 'index.html';
    
  } catch (error) {
    console.error('Login error:', error);
    
    // Показываем ошибку
    const errorMsg = error.message || 'Произошла ошибка при входе';
    const firstErrorEl = form.querySelector('.error-message');
    if (firstErrorEl) {
      firstErrorEl.textContent = errorMsg;
      firstErrorEl.classList.add('show');
    }
    
    // Подсвечиваем первое поле
    const firstInput = form.querySelector('input');
    if (firstInput) {
      firstInput.classList.add('error');
    }
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Войти';
  }
}

/**
 * Показать форму сброса пароля
 */
function showPasswordReset(role) {
  currentResetRole = role;
  const modal = document.getElementById('password-reset-modal');
  modal.classList.add('show');
  modal.style.display = 'block';
  document.getElementById('reset-phone').value = '';
  document.getElementById('reset-otp').value = '';
  document.getElementById('reset-new-password').value = '';
}

/**
 * Скрыть форму сброса пароля
 */
function hidePasswordReset() {
  const modal = document.getElementById('password-reset-modal');
  modal.classList.remove('show');
  modal.style.display = 'none';
  currentResetRole = null;
}

/**
 * Отправить OTP для сброса пароля
 */
async function sendResetOtp() {
  const phone = document.getElementById('reset-phone').value;
  
  if (!phone) {
    alert('Введите номер телефона');
    return;
  }
  
  try {
    const endpoint = currentResetRole === 'owner' 
      ? '/auth/owner/send-password-reset-otp'
      : '/auth/manager/send-password-reset-otp';
    
    const response = await fetch(`${CONFIG.API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ phone }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Ошибка отправки OTP');
    }
    
    alert('OTP код отправлен на ваш телефон');
    
  } catch (error) {
    console.error('Send OTP error:', error);
    alert(error.message || 'Ошибка отправки OTP');
  }
}

/**
 * Сбросить пароль
 */
async function resetPassword() {
  const phone = document.getElementById('reset-phone').value;
  const otp = document.getElementById('reset-otp').value;
  const newPassword = document.getElementById('reset-new-password').value;
  
  if (!phone || !otp || !newPassword) {
    alert('Заполните все поля');
    return;
  }
  
  if (newPassword.length < 6) {
    alert('Пароль должен содержать минимум 6 символов');
    return;
  }
  
  try {
    const endpoint = currentResetRole === 'owner'
      ? '/auth/owner/reset-password'
      : '/auth/manager/reset-password';
    
    const response = await fetch(`${CONFIG.API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ phone, otp, newPassword }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Ошибка сброса пароля');
    }
    
    alert('Пароль успешно изменен. Теперь вы можете войти.');
    hidePasswordReset();
    
    // Очищаем поля пароля в форме входа
    if (currentResetRole === 'owner') {
      document.getElementById('owner-password').value = '';
    } else if (currentResetRole === 'manager') {
      document.getElementById('manager-password').value = '';
    }
    
  } catch (error) {
    console.error('Reset password error:', error);
    alert(error.message || 'Ошибка сброса пароля');
  }
}

// Проверяем, не авторизован ли уже пользователь
if (Auth.isAuthenticated() && Auth.isStaff()) {
  window.location.href = 'index.html';
}

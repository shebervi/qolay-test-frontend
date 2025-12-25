/**
 * Логика авторизации для пользователей (клиентов) через OTP
 */

let otpTimer = null;
let otpTimerSeconds = 60;
let currentPhone = '';

// Обработка отправки OTP
document.getElementById('phone-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  await sendOtp();
});

// Обработка верификации OTP
document.getElementById('otp-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  await verifyOtp();
});

// Автоматическое перемещение между полями OTP
document.querySelectorAll('.otp-input').forEach((input, index) => {
  input.addEventListener('input', (e) => {
    const value = e.target.value;
    
    // Переход к следующему полю
    if (value && index < 5) {
      document.getElementById(`otp-${index + 2}`).focus();
    }
  });
  
  input.addEventListener('keydown', (e) => {
    // Удаление и переход к предыдущему полю
    if (e.key === 'Backspace' && !e.target.value && index > 0) {
      document.getElementById(`otp-${index}`).focus();
    }
  });
  
  // Вставка из буфера обмена
  input.addEventListener('paste', (e) => {
    e.preventDefault();
    const paste = e.clipboardData.getData('text');
    const digits = paste.replace(/\D/g, '').slice(0, 6);
    
    digits.split('').forEach((digit, i) => {
      if (i < 6) {
        document.getElementById(`otp-${i + 1}`).value = digit;
      }
    });
    
    // Фокус на последнее заполненное поле
    const lastIndex = Math.min(digits.length, 5);
    document.getElementById(`otp-${lastIndex + 1}`).focus();
  });
});

/**
 * Отправить OTP код
 */
async function sendOtp() {
  const phone = document.getElementById('user-phone').value.trim();
  const errorEl = document.getElementById('phone-error');
  const successEl = document.getElementById('phone-success');
  const sendBtn = document.getElementById('send-otp-btn');
  
  // Валидация телефона
  if (!phone) {
    errorEl.textContent = 'Введите номер телефона';
    errorEl.classList.add('show');
    return;
  }
  
  if (!phone.match(/^\+7\d{10}$/)) {
    errorEl.textContent = 'Номер телефона должен быть в формате +77001234567';
    errorEl.classList.add('show');
    return;
  }
  
  errorEl.classList.remove('show');
  sendBtn.disabled = true;
  sendBtn.textContent = 'Отправка...';
  
  try {
    const response = await fetch(`${CONFIG.API_BASE_URL}/auth/user/otp/send`, {
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
    
    // Сохраняем телефон
    currentPhone = phone;
    
    // Временно показываем OTP код на фронте (только для разработки)
    if (data.code) {
      const otpDisplay = document.getElementById('otp-code-display');
      const otpValue = document.getElementById('otp-code-value');
      if (otpDisplay && otpValue) {
        otpValue.textContent = data.code;
        otpDisplay.style.display = 'block';
      }
    }
    
    // Переходим к шагу ввода OTP
    document.getElementById('phone-step').classList.remove('active');
    document.getElementById('otp-step').classList.add('active');
    
    // Фокус на первое поле OTP
    document.getElementById('otp-1').focus();
    
    // Запускаем таймер
    startOtpTimer();
    
  } catch (error) {
    console.error('Send OTP error:', error);
    errorEl.textContent = error.message || 'Ошибка отправки OTP';
    errorEl.classList.add('show');
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = 'Отправить код';
  }
}

/**
 * Верифицировать OTP код
 */
async function verifyOtp() {
  const otpInputs = document.querySelectorAll('.otp-input');
  const otpCode = Array.from(otpInputs).map(input => input.value).join('');
  const errorEl = document.getElementById('otp-error');
  const verifyBtn = document.getElementById('verify-otp-btn');
  
  // Валидация OTP
  if (otpCode.length !== 6) {
    errorEl.textContent = 'Введите 6-значный код';
    errorEl.classList.add('show');
    return;
  }
  
  errorEl.classList.remove('show');
  verifyBtn.disabled = true;
  verifyBtn.textContent = 'Проверка...';
  
  try {
    const response = await fetch(`${CONFIG.API_BASE_URL}/auth/user/otp/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ phone: currentPhone, code: otpCode }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Неверный код');
    }
    
    // Сохраняем токен и данные пользователя
    const userData = {
      role: 'USER',
      id: data.user.id,
      phone: data.user.phone,
      name: data.user.name,
    };
    
    Auth.saveAuth(data.accessToken, userData);
    
    // Проверяем redirect параметр
    const urlParams = new URLSearchParams(window.location.search);
    const redirect = urlParams.get('redirect');
    
    // Если есть redirect, перенаправляем туда, иначе на главную
    if (redirect) {
      window.location.href = decodeURIComponent(redirect);
    } else {
      window.location.href = '/index.html';
    }
    
  } catch (error) {
    console.error('Verify OTP error:', error);
    errorEl.textContent = error.message || 'Неверный код. Попробуйте еще раз.';
    errorEl.classList.add('show');
    
    // Очищаем поля OTP
    otpInputs.forEach(input => input.value = '');
    document.getElementById('otp-1').focus();
    
  } finally {
    verifyBtn.disabled = false;
    verifyBtn.textContent = 'Войти';
  }
}

/**
 * Запустить таймер для повторной отправки OTP
 */
function startOtpTimer() {
  otpTimerSeconds = 60;
  const timerEl = document.getElementById('otp-timer');
  
  const updateTimer = () => {
    if (otpTimerSeconds > 0) {
      timerEl.textContent = `Отправить код повторно через ${otpTimerSeconds} сек.`;
      otpTimerSeconds--;
      otpTimer = setTimeout(updateTimer, 1000);
    } else {
      timerEl.innerHTML = '<a href="#" onclick="resendOtp(); return false;" style="color: #4a90e2; text-decoration: none;">Отправить код повторно</a>';
    }
  };
  
  updateTimer();
}

/**
 * Отправить OTP повторно
 */
async function resendOtp() {
  if (otpTimer) {
    clearTimeout(otpTimer);
    otpTimer = null;
  }
  
  // Возвращаемся к шагу ввода телефона
  backToPhoneStep();
  
  // Автоматически отправляем OTP
  document.getElementById('user-phone').value = currentPhone;
  await sendOtp();
}

/**
 * Вернуться к шагу ввода телефона
 */
function backToPhoneStep() {
  document.getElementById('otp-step').classList.remove('active');
  document.getElementById('phone-step').classList.add('active');
  
  // Очищаем поля OTP
  document.querySelectorAll('.otp-input').forEach(input => input.value = '');
  document.getElementById('otp-error').classList.remove('show');
  
  // Скрываем отображение OTP кода
  const otpDisplay = document.getElementById('otp-code-display');
  if (otpDisplay) {
    otpDisplay.style.display = 'none';
  }
  
  if (otpTimer) {
    clearTimeout(otpTimer);
    otpTimer = null;
  }
  
  document.getElementById('otp-timer').textContent = '';
}

// Проверяем, не авторизован ли уже пользователь
if (Auth.isAuthenticated() && Auth.isUser()) {
  window.location.href = '/index.html';
}

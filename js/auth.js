/* ============================================================
   ENOMY-FINANCES | auth.js
   MFA Authentication, Session Management, Login UI
   ============================================================ */
'use strict';

class AuthManager {
  constructor() {
    this.MAX_ATTEMPTS    = 3;
    this.LOCKOUT_MS      = 15 * 60 * 1000;  // 15 minutes
    this.SESSION_MS      = 15 * 60 * 1000;  // 15 minutes
    this.OTP_EXPIRY_MS   = 3 * 60 * 1000;   // 3 minutes
    this.WARNING_AT_MS   = 14 * 60 * 1000;  // warn at 14 min
    this.inactivityTimer = null;
    this.warningTimer    = null;
    this.sessionInterval = null;
    this.pendingUser     = null;
    this._sessionWarningActive = false;
  }

  // ── Step 1: Primary Credential Validation ─────────────────

  async login(email, password) {
    email = String(email).trim().toLowerCase();
    const user = db.findUserByEmail(email);

    if (!user) {
      db.log('ANONYMOUS', 'LOGIN_FAILED', `Email not found: ${email}`);
      return { success: false, message: 'Invalid email or password.' };
    }

    // Check lockout
    if (user.accountLocked) {
      const lockoutEnd = new Date(user.lockoutUntil);
      if (Date.now() < lockoutEnd) {
        const mins = Math.ceil((lockoutEnd - Date.now()) / 60000);
        return { success: false, message: `Account locked. Try again in ${mins} minute(s).`, locked: true };
      }
      // Lockout expired — reset
      db.updateUser(user.id, { accountLocked: false, failedLoginAttempts: 0, lockoutUntil: null });
      user.accountLocked = false; user.failedLoginAttempts = 0;
    }

    // Verify password
    const isValid = await verifyPassword(password, user.passwordHash, user.passwordSalt);
    if (!isValid) {
      const attempts = (user.failedLoginAttempts || 0) + 1;
      const updates  = { failedLoginAttempts: attempts };
      if (attempts >= this.MAX_ATTEMPTS) {
        updates.accountLocked = true;
        updates.lockoutUntil  = new Date(Date.now() + this.LOCKOUT_MS).toISOString();
        db.updateUser(user.id, updates);
        db.log(user.id, 'ACCOUNT_LOCKED', `Account locked after ${attempts} failed attempts`);
        return { success: false, message: `Too many failed attempts. Account locked for 15 minutes.`, locked: true };
      }
      db.updateUser(user.id, updates);
      db.log(user.id, 'LOGIN_FAILED', `Invalid password (attempt ${attempts}/${this.MAX_ATTEMPTS})`);
      return { success: false, message: `Invalid email or password. ${this.MAX_ATTEMPTS - attempts} attempt(s) remaining.` };
    }

    // Valid credentials — initiate MFA
    db.updateUser(user.id, { failedLoginAttempts: 0 });
    this.pendingUser = user;
    return { success: true, step: 2, user: { name: user.name, phone: user.phone } };
  }

  // ── Step 2: Generate & "Send" OTP ─────────────────────────

  generateAndSendOTP(user) {
    const otp = generateOTP();
    const expiry = Date.now() + this.OTP_EXPIRY_MS;
    sessionStorage.setItem('ef_pending_otp', JSON.stringify({ code: otp, userId: user.id || user.userID, expires: expiry, phone: user.phone }));

    // DEMO MODE: Display OTP in console
    console.log(`%c[DEMO MODE] Your verification code is: ${otp}`, 'background:#003D82;color:#D4AF37;padding:4px 8px;font-size:14px;font-weight:bold;border-radius:4px');
    console.log(`%cCode expires in 3 minutes`, 'color:#6C757D;font-style:italic');

    return { otpSent: true, phone: maskPhone(user.phone), expiresAt: expiry };
  }

  resendOTP() {
    if (this.pendingUser) return this.generateAndSendOTP(this.pendingUser);
    return { otpSent: false, message: 'Session expired. Please login again.' };
  }

  // ── Step 3: Validate OTP ──────────────────────────────────

  validateOTP(inputCode) {
    const raw = sessionStorage.getItem('ef_pending_otp');
    if (!raw) return { valid: false, reason: 'No verification code found. Please request a new one.' };

    const otpData = JSON.parse(raw);
    if (Date.now() > otpData.expires) {
      sessionStorage.removeItem('ef_pending_otp');
      return { valid: false, reason: 'Code has expired. Please click "Resend Code".' };
    }
    if (String(inputCode).trim() !== otpData.code) {
      return { valid: false, reason: 'Incorrect code. Please try again.' };
    }

    sessionStorage.removeItem('ef_pending_otp');
    return { valid: true, userId: otpData.userId };
  }

  /**
   * Complete the login flow: validate OTP → create session → return user
   * Called from index.html after the user enters their 6-digit code.
   * Returns { success, user, message, attemptsLeft }
   */
  async completeLogin(otpCode) {
    const result = this.validateOTP(otpCode);

    if (!result.valid) {
      return { success: false, message: result.reason || 'Invalid code.', attemptsLeft: null };
    }

    const user = this.pendingUser || db.findUserById(result.userId);
    if (!user) {
      return { success: false, message: 'Session error. Please sign in again.' };
    }

    this.createSession(user);
    this.pendingUser = null;
    return { success: true, user };
  }

  // ── Create Authenticated Session ──────────────────────────

  createSession(user) {
    const token = generateSessionToken();
    const userId = user.id || user.userID;

    // Invalidate previous sessions
    db.invalidateUserSessions(userId);

    // Create new session in DB
    db.createSession(userId, token, this.SESSION_MS);

    // Store current session in sessionStorage
    sessionStorage.setItem('ef_session', JSON.stringify({ token, userId, role: user.role, name: user.name, email: user.email }));
    sessionStorage.setItem('ef_session_start', Date.now().toString());

    // Update last login
    db.updateUser(userId, { lastLogin: new Date().toISOString() });
    db.log(userId, 'LOGIN_SUCCESS', 'Successful MFA authentication');

    // Start inactivity monitoring
    this._setupActivityTracking();
    this.resetInactivityTimer();

    return token;
  }

  // ── Auth Checks ────────────────────────────────────────────

  isAuthenticated() {
    try {
      const session = sessionGet('ef_session');
      if (!session || !session.token) return false;
      const dbSession = db.getSession(session.token);
      if (!dbSession) return false;
      return new Date(dbSession.expiresAt) > new Date();
    } catch { return false; }
  }

  getCurrentUser() {
    try {
      const session = sessionGet('ef_session');
      if (!session) return null;
      return db.findUserById(session.userId) || null;
    } catch { return null; }
  }

  getSessionInfo() {
    return sessionGet('ef_session');
  }

  requireAuth(allowedRoles = []) {
    if (!this.isAuthenticated()) {
      sessionStorage.clear();
      window.location.href = 'index.html';
      return false;
    }
    if (allowedRoles.length > 0) {
      const session = this.getSessionInfo();
      if (session && !allowedRoles.includes(session.role)) {
        // Redirect to appropriate portal
        const roleMap = { Customer: 'customer-portal.html', Advisor: 'advisor-portal.html', Admin: 'admin-portal.html' };
        window.location.href = roleMap[session.role] || 'index.html';
        return false;
      }
    }
    return true;
  }

  // ── Inactivity & Session Timer ────────────────────────────

  _setupActivityTracking() {
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    const handler = throttle(() => {
      if (this._sessionWarningActive) return;
      this.resetInactivityTimer();
      // Update DB session
      const session = this.getSessionInfo();
      if (session) db.updateSessionActivity(session.token);
    }, 30000); // throttle to every 30s
    events.forEach(e => document.addEventListener(e, handler, { passive: true }));
  }

  resetInactivityTimer() {
    clearTimeout(this.inactivityTimer);
    clearTimeout(this.warningTimer);
    clearInterval(this.sessionInterval);
    this._sessionWarningActive = false;

    // Close warning modal if open
    const modal = document.getElementById('sessionWarningModal');
    if (modal) modal.classList.add('d-none');

    // Update session timer display
    this._startSessionTimerDisplay();

    this.warningTimer = setTimeout(() => this.showSessionWarning(), this.WARNING_AT_MS);
    this.inactivityTimer = setTimeout(() => this.logout('timeout'), this.SESSION_MS);
  }

  _startSessionTimerDisplay() {
    clearInterval(this.sessionInterval);
    const start = Date.now();
    const updateTimer = () => {
      const elapsed  = Date.now() - start;
      const remaining = Math.max(0, Math.floor((this.SESSION_MS - elapsed) / 1000));
      const mm = Math.floor(remaining / 60), ss = remaining % 60;
      const timerEl = document.querySelector('#sessionTimer span, .session-timer span');
      if (timerEl) timerEl.textContent = `${mm}:${String(ss).padStart(2,'0')}`;
      // Colour warning
      const timerWrapper = document.getElementById('sessionTimer');
      if (timerWrapper) timerWrapper.className = `session-timer${remaining < 120 ? ' warning' : ''}`;
    };
    updateTimer();
    this.sessionInterval = setInterval(updateTimer, 1000);
  }

  showSessionWarning() {
    this._sessionWarningActive = true;
    const modal = document.getElementById('sessionWarningModal');
    if (!modal) { this.logout('timeout'); return; }
    modal.classList.remove('d-none');

    let countdown = 60;
    const countdownEl = document.getElementById('sessionCountdown');
    if (countdownEl) countdownEl.textContent = countdown;

    const timer = setInterval(() => {
      countdown--;
      if (countdownEl) countdownEl.textContent = countdown;
      if (countdown <= 0) { clearInterval(timer); this.logout('timeout'); }
    }, 1000);

    const extendBtn = document.getElementById('extendSessionBtn');
    if (extendBtn) {
      const newBtn = extendBtn.cloneNode(true);
      extendBtn.parentNode.replaceChild(newBtn, extendBtn);
      newBtn.addEventListener('click', () => { clearInterval(timer); this.resetInactivityTimer(); });
    }

    const logoutBtn = document.getElementById('logoutNowBtn');
    if (logoutBtn) {
      const newBtn = logoutBtn.cloneNode(true);
      logoutBtn.parentNode.replaceChild(newBtn, logoutBtn);
      newBtn.addEventListener('click', () => { clearInterval(timer); this.logout('user'); });
    }
  }

  // ── Logout ────────────────────────────────────────────────

  logout(reason = 'user') {
    clearTimeout(this.inactivityTimer);
    clearTimeout(this.warningTimer);
    clearInterval(this.sessionInterval);

    try {
      const session = this.getSessionInfo();
      if (session) {
        db.log(session.userId, 'LOGOUT', `Logged out: ${reason}`);
        db.invalidateSession(session.token);
      }
    } catch { /* silent */ }

    sessionStorage.clear();
    this.pendingUser = null;
    window.location.href = 'index.html' + (reason === 'timeout' ? '?reason=timeout' : '');
  }

  // ── Registration ───────────────────────────────────────────

  async register(userData) {
    const { firstName, lastName, email, phone, password, dateOfBirth } = userData;

    // Validate
    if (!validateEmail(email)) return { success: false, message: 'Invalid email address.' };
    if (!validatePhone(phone)) return { success: false, message: 'Invalid UK phone number.' };
    const pwCheck = validatePassword(password);
    if (!pwCheck.valid) return { success: false, message: pwCheck.message };

    // Check uniqueness
    if (db.findUserByEmail(email)) return { success: false, message: 'An account with this email already exists.' };

    // Hash password
    const { hash, salt } = await hashPassword(password);

    // Create user
    const newUser = db.create('users', {
      email: email.toLowerCase(), passwordHash: hash, passwordSalt: salt,
      role: 'Customer', phone, mfaEnabled: true,
      name: `${firstName} ${lastName}`, firstName, lastName,
      dateOfBirth: dateOfBirth || '', address: {}, registrationDate: new Date().toISOString(),
      lastLogin: null, failedLoginAttempts: 0, accountLocked: false, lockoutUntil: null,
      profileComplete: 30, marketingConsent: userData.marketingConsent || false, status: 'active'
    });

    db.log(newUser.id, 'USER_CREATED', `Self-registration: ${email}`);
    return { success: true, userId: newUser.id, message: 'Account created successfully.' };
  }

  // ── Change Password ────────────────────────────────────────

  async changePassword(userId, currentPassword, newPassword) {
    const user = db.findUserById(userId);
    if (!user) return { success: false, message: 'User not found.' };

    const isValid = await verifyPassword(currentPassword, user.passwordHash, user.passwordSalt);
    if (!isValid) return { success: false, message: 'Current password is incorrect.' };

    const pwCheck = validatePassword(newPassword);
    if (!pwCheck.valid) return { success: false, message: pwCheck.message };

    const { hash, salt } = await hashPassword(newPassword);
    db.updateUser(userId, { passwordHash: hash, passwordSalt: salt });
    db.log(userId, 'PASSWORD_CHANGED', 'Password changed successfully');
    return { success: true, message: 'Password updated successfully.' };
  }
}

// ── Login Page UI Controller ───────────────────────────────────

class LoginUI {
  constructor() {
    this.currentStep   = 1;
    this.otpTimer      = null;
    this.resendTimer   = null;
    this.otpCountdown  = 180;
    this.resendCooldown= 60;
  }

  init() {
    // If already logged in → redirect
    if (auth.isAuthenticated()) {
      const session = auth.getSessionInfo();
      const roleMap = { Customer: 'customer-portal.html', Advisor: 'advisor-portal.html', Admin: 'admin-portal.html' };
      if (session) window.location.href = roleMap[session.role] || 'customer-portal.html';
      return;
    }

    // Show timeout message
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('reason') === 'timeout') {
      showToast('Your session expired due to inactivity. Please log in again.', 'warning', 8000);
    }

    this._bindEvents();
    this._setupTabSwitching();
    this._setupNavbarLogin();
  }

  _bindEvents() {
    const loginForm  = document.getElementById('loginForm');
    const otpForm    = document.getElementById('otpForm');
    const regForm    = document.getElementById('registerForm');
    const pwInput    = document.getElementById('regPassword');

    if (loginForm)  loginForm.addEventListener('submit',  e => this.handleLoginSubmit(e));
    if (otpForm)    otpForm.addEventListener('submit',    e => this.handleOTPSubmit(e));
    if (regForm)    regForm.addEventListener('submit',    e => this.handleRegisterSubmit(e));
    if (pwInput)    pwInput.addEventListener('input',     e => this.showPasswordStrength(e.target.value));

    // Password visibility toggles
    document.querySelectorAll('.toggle-password').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = btn.closest('.password-field, .form-group').querySelector('input');
        if (!input) return;
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        btn.textContent = isPassword ? '🙈' : '👁';
      });
    });

    // OTP input handling
    document.querySelectorAll('.otp-input').forEach((input, i, inputs) => {
      input.addEventListener('input', e => this._handleOTPDigit(e, i, inputs));
      input.addEventListener('keydown', e => this._handleOTPKeydown(e, i, inputs));
      input.addEventListener('paste', e => this._handleOTPPaste(e, inputs));
    });

    // Buttons
    const resendBtn  = document.getElementById('resendOTPBtn');
    const backBtn    = document.getElementById('backToLoginBtn');
    const logoutBtns = document.querySelectorAll('#logoutBtn, #dropdownLogout');

    if (resendBtn) resendBtn.addEventListener('click', () => this.handleResendOTP());
    if (backBtn)   backBtn.addEventListener('click',   () => this.showStep(1));
    logoutBtns.forEach(btn => btn?.addEventListener('click', () => auth.logout()));
  }

  _setupNavbarLogin() {
    // Open modal on Login button clicks
    document.querySelectorAll('[data-action="openLogin"]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.preventDefault();
        const modal = document.getElementById('authModal');
        if (modal) modal.classList.remove('d-none');
      });
    });
    // Close modal
    document.querySelectorAll('[data-action="closeModal"], .modal-close').forEach(btn => {
      btn.addEventListener('click', () => {
        const modal = document.getElementById('authModal');
        if (modal) modal.classList.add('d-none');
      });
    });
    // Close on overlay click
    document.getElementById('authModal')?.addEventListener('click', e => {
      if (e.target === e.currentTarget) e.currentTarget.classList.add('d-none');
    });
  }

  _setupTabSwitching() {
    document.querySelectorAll('[data-tab-target]').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.tabTarget;
        document.querySelectorAll('.auth-tab').forEach(t => t.classList.add('d-none'));
        document.querySelectorAll('[data-tab-target]').forEach(b => b.classList.remove('active'));
        document.getElementById(target)?.classList.remove('d-none');
        btn.classList.add('active');
      });
    });
  }

  showStep(step) {
    this.currentStep = step;
    const step1 = document.getElementById('loginStep1');
    const step2 = document.getElementById('otpStep');
    if (step === 1) { showElement(step1); hideElement(step2); }
    else            { hideElement(step1); showElement(step2); }
  }

  async handleLoginSubmit(e) {
    e.preventDefault();
    const email    = document.getElementById('loginEmail')?.value || '';
    const password = document.getElementById('loginPassword')?.value || '';
    const loginBtn = document.getElementById('loginBtn');
    const errorEl  = document.getElementById('loginError');

    if (errorEl) errorEl.classList.add('d-none');
    setLoading(loginBtn, true);

    try {
      const result = await auth.login(email, password);
      if (result.success) {
        // Trigger MFA
        const otpResult = auth.generateAndSendOTP(auth.pendingUser);
        const maskedPhoneEl = document.getElementById('maskedPhone');
        if (maskedPhoneEl) maskedPhoneEl.textContent = otpResult.phone;
        this.showStep(2);
        this.startOTPCountdown();
        this.startResendCooldown();
        showToast('Verification code sent! Check your console for the demo code.', 'info', 5000);
      } else {
        if (errorEl) { errorEl.textContent = result.message; errorEl.classList.remove('d-none'); errorEl.className = 'alert alert-danger'; }
        else showToast(result.message, 'error');
      }
    } catch (err) {
      console.error('[Auth] Login error:', err);
      if (errorEl) { errorEl.textContent = 'An error occurred. Please try again.'; errorEl.classList.remove('d-none'); errorEl.className = 'alert alert-danger'; }
    } finally {
      setLoading(loginBtn, false);
    }
  }

  handleOTPSubmit(e) {
    e && e.preventDefault();
    const inputs  = document.querySelectorAll('.otp-input');
    const code    = Array.from(inputs).map(i => i.value).join('');
    const errorEl = document.getElementById('otpError');
    const verifyBtn = document.getElementById('verifyOTPBtn');

    if (code.length !== 6) {
      if (errorEl) { errorEl.textContent = 'Please enter the complete 6-digit code.'; errorEl.classList.remove('d-none'); }
      return;
    }

    setLoading(verifyBtn, true);
    if (errorEl) errorEl.classList.add('d-none');

    const result = auth.validateOTP(code);
    if (result.valid) {
      clearInterval(this.otpTimer);
      auth.createSession(auth.pendingUser);
      showToast('Login successful! Redirecting...', 'success', 2000);
      setTimeout(() => {
        const session = auth.getSessionInfo();
        const roleMap = { Customer: 'customer-portal.html', Advisor: 'advisor-portal.html', Admin: 'admin-portal.html' };
        window.location.href = roleMap[session?.role] || 'customer-portal.html';
      }, 1000);
    } else {
      inputs.forEach(i => i.classList.add('error'));
      if (errorEl) { errorEl.textContent = result.reason; errorEl.classList.remove('d-none'); errorEl.className = 'alert alert-danger'; }
      setLoading(verifyBtn, false);
    }
  }

  startOTPCountdown() {
    clearInterval(this.otpTimer);
    this.otpCountdown = 180;
    const el = document.getElementById('otpCountdown');
    const update = () => {
      if (el) el.textContent = formatCountdown(this.otpCountdown);
      if (this.otpCountdown <= 0) {
        clearInterval(this.otpTimer);
        if (el) el.textContent = 'Expired';
        const errorEl = document.getElementById('otpError');
        if (errorEl) { errorEl.textContent = 'Code has expired. Please click "Resend Code".'; errorEl.classList.remove('d-none'); errorEl.className = 'alert alert-warning'; }
      }
      this.otpCountdown--;
    };
    update();
    this.otpTimer = setInterval(update, 1000);
  }

  startResendCooldown() {
    clearInterval(this.resendTimer);
    this.resendCooldown = 60;
    const btn = document.getElementById('resendOTPBtn');
    const countdownEl = document.getElementById('resendCountdown');
    if (btn) btn.disabled = true;
    const update = () => {
      if (countdownEl) countdownEl.textContent = this.resendCooldown;
      if (this.resendCooldown <= 0) {
        clearInterval(this.resendTimer);
        if (btn) { btn.disabled = false; btn.textContent = 'Resend Code'; }
      }
      this.resendCooldown--;
    };
    update();
    this.resendTimer = setInterval(update, 1000);
  }

  handleResendOTP() {
    if (!auth.pendingUser) return;
    auth.generateAndSendOTP(auth.pendingUser);
    document.querySelectorAll('.otp-input').forEach(i => { i.value = ''; i.classList.remove('error'); });
    document.getElementById('otpError')?.classList.add('d-none');
    this.startOTPCountdown();
    this.startResendCooldown();
    showToast('New verification code sent! Check the console.', 'info');
  }

  _handleOTPDigit(e, index, inputs) {
    const val = e.target.value.replace(/\D/g, '');
    e.target.value = val.slice(-1);
    e.target.classList.toggle('filled', !!e.target.value);
    if (val && index < inputs.length - 1) inputs[index + 1].focus();
    // Auto-submit when all filled
    if (Array.from(inputs).every(i => i.value)) setTimeout(() => this.handleOTPSubmit(), 200);
  }

  _handleOTPKeydown(e, index, inputs) {
    if (e.key === 'Backspace' && !e.target.value && index > 0) {
      inputs[index - 1].focus(); inputs[index - 1].value = '';
    }
  }

  _handleOTPPaste(e, inputs) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    pasted.split('').forEach((digit, i) => {
      if (inputs[i]) { inputs[i].value = digit; inputs[i].classList.add('filled'); }
    });
    if (pasted.length === 6) setTimeout(() => this.handleOTPSubmit(), 200);
    else if (inputs[pasted.length]) inputs[pasted.length].focus();
  }

  showPasswordStrength(password) {
    const { score, label, suggestions } = analyzePasswordStrength(password);
    const segments = document.querySelectorAll('.strength-segment');
    const labelEl  = document.getElementById('strengthLabel');
    segments.forEach((seg, i) => {
      seg.className = 'strength-segment';
      if (i < score) seg.classList.add(['', 'weak', 'fair', 'good', 'strong'][score] || 'strong');
    });
    if (labelEl) {
      labelEl.textContent = password ? label + (suggestions[0] ? ` — ${suggestions[0]}` : '') : 'Enter a password';
      labelEl.style.color = ['', '#DC3545', '#FFC107', '#17A2B8', '#28A745'][score] || '#28A745';
    }
  }

  async handleRegisterSubmit(e) {
    e.preventDefault();
    const btn   = document.getElementById('registerBtn');
    const errorEl = document.getElementById('registerError');
    setLoading(btn, true);
    if (errorEl) errorEl.classList.add('d-none');

    const formData = {
      firstName:       document.getElementById('regFirstName')?.value,
      lastName:        document.getElementById('regLastName')?.value,
      email:           document.getElementById('regEmail')?.value,
      phone:           document.getElementById('regPhone')?.value,
      password:        document.getElementById('regPassword')?.value,
      confirmPassword: document.getElementById('regConfirmPassword')?.value,
      dateOfBirth:     document.getElementById('regDOB')?.value,
      marketingConsent: document.getElementById('regMarketing')?.checked || false
    };

    if (formData.password !== formData.confirmPassword) {
      if (errorEl) { errorEl.textContent = 'Passwords do not match.'; errorEl.classList.remove('d-none'); errorEl.className = 'alert alert-danger'; }
      setLoading(btn, false); return;
    }
    if (!document.getElementById('regTerms')?.checked) {
      if (errorEl) { errorEl.textContent = 'Please accept the Terms & Conditions.'; errorEl.classList.remove('d-none'); errorEl.className = 'alert alert-danger'; }
      setLoading(btn, false); return;
    }

    const result = await auth.register(formData);
    if (result.success) {
      showToast('Account created! Please log in.', 'success', 5000);
      // Switch to login tab
      document.querySelector('[data-tab-target="loginTab"]')?.click();
      document.getElementById('loginEmail')?.focus();
    } else {
      if (errorEl) { errorEl.textContent = result.message; errorEl.classList.remove('d-none'); errorEl.className = 'alert alert-danger'; }
    }
    setLoading(btn, false);
  }
}

// ── Global Auth Instance ───────────────────────────────────────
const auth = new AuthManager();

// ── Initialise on DOM ready (login page only) ─────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('loginForm') || document.getElementById('authModal')) {
    const loginUI = new LoginUI();
    loginUI.init();
  }

  // Session warning modal for portal pages
  document.getElementById('extendSessionBtn')?.addEventListener('click', () => auth.resetInactivityTimer());
  document.getElementById('logoutNowBtn')?.addEventListener('click', () => auth.logout('user'));
  document.getElementById('logoutBtn')?.addEventListener('click',    () => auth.logout('user'));
  document.getElementById('dropdownLogout')?.addEventListener('click', () => auth.logout('user'));
});

console.log('[Enomy-Finances] auth.js loaded');

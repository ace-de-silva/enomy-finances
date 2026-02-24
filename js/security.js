/* ============================================================
   ENOMY-FINANCES | security.js
   Password Hashing, XSS Prevention, Rate Limiting, CSRF
   ============================================================ */
'use strict';

// ── Password Hashing (Web Crypto API) ────────────────────────

/**
 * Hash a password with salt using SHA-256
 * @param {string} password
 * @param {string|null} salt - if null, generates new salt
 * @returns {Promise<{hash: string, salt: string}>}
 */
async function hashPassword(password, salt = null) {
  const useSalt = salt || generateSalt();
  const encoder = new TextEncoder();
  const data = encoder.encode(useSalt + password);
  try {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray  = Array.from(new Uint8Array(hashBuffer));
    const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return { hash, salt: useSalt };
  } catch {
    // Fallback for environments without crypto.subtle
    return { hash: simpleHash(useSalt + password), salt: useSalt };
  }
}

/**
 * Verify a password against stored hash
 */
async function verifyPassword(password, storedHash, salt) {
  // Demo mode: allow plain-text passwords (seed data)
  if (storedHash === password) return true;
  const { hash } = await hashPassword(password, salt);
  return hash === storedHash;
}

/**
 * Fallback simple hash (not cryptographically secure - demo only)
 */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

// ── Random Generation ────────────────────────────────────────

/**
 * Generate cryptographically secure random bytes as hex string
 */
function generateSecureRandom(length = 16) {
  const bytes = new Uint8Array(length);
  if (window.crypto && window.crypto.getRandomValues) {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i++) bytes[i] = Math.random() * 256 | 0;
  }
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateSalt() { return generateSecureRandom(16); }
function generateToken(length = 32) { return generateSecureRandom(length); }

/**
 * Generate a 6-digit OTP
 */
function generateOTP() {
  const bytes = new Uint8Array(4);
  (window.crypto || { getRandomValues: arr => { for (let i=0;i<arr.length;i++) arr[i]=Math.random()*256|0; return arr; } }).getRandomValues(bytes);
  const num = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  return String(100000 + (num % 900000));
}

// ── XSS Prevention ───────────────────────────────────────────

/**
 * Escape HTML entities to prevent XSS
 */
function escapeHTML(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

/**
 * Sanitize user input - remove script tags and event handlers
 */
function sanitizeInput(str) {
  return String(str)
    .replace(/<script[^>]*>.*?<\/script>/gis, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/data:/gi, '')
    .trim();
}

/**
 * Recursively sanitize all string values in an object
 */
function sanitizeObject(obj) {
  if (typeof obj === 'string') return sanitizeInput(obj);
  if (Array.isArray(obj)) return obj.map(sanitizeObject);
  if (obj !== null && typeof obj === 'object') {
    const result = {};
    Object.entries(obj).forEach(([k, v]) => { result[k] = sanitizeObject(v); });
    return result;
  }
  return obj;
}

// ── CSRF Token (Simulation) ──────────────────────────────────

let _csrfToken = null;

function generateCSRFToken() {
  _csrfToken = generateToken(24);
  sessionStorage.setItem('ef_csrf', _csrfToken);
  return _csrfToken;
}

function validateCSRFToken(token) {
  const stored = sessionStorage.getItem('ef_csrf');
  return stored && stored === token;
}

function getCSRFToken() {
  if (!_csrfToken) _csrfToken = sessionStorage.getItem('ef_csrf') || generateCSRFToken();
  return _csrfToken;
}

// ── Rate Limiter ─────────────────────────────────────────────

class RateLimiter {
  /**
   * @param {number} maxAttempts - max failures before blocking
   * @param {number} windowMs - time window in milliseconds
   */
  constructor(maxAttempts = 3, windowMs = 15 * 60 * 1000) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
    this.attempts = {}; // key → { count, firstAttempt, resetAt }
  }

  /**
   * Check if key is allowed to proceed
   * @returns {{allowed: boolean, remaining: number, resetAt: number|null}}
   */
  check(key) {
    const now = Date.now();
    const entry = this.attempts[key];
    if (!entry) return { allowed: true, remaining: this.maxAttempts, resetAt: null };
    if (now > entry.resetAt) {
      delete this.attempts[key];
      return { allowed: true, remaining: this.maxAttempts, resetAt: null };
    }
    const allowed = entry.count < this.maxAttempts;
    return { allowed, remaining: Math.max(0, this.maxAttempts - entry.count), resetAt: entry.resetAt };
  }

  /**
   * Record a failed attempt
   */
  record(key) {
    const now = Date.now();
    if (!this.attempts[key] || now > this.attempts[key].resetAt) {
      this.attempts[key] = { count: 1, firstAttempt: now, resetAt: now + this.windowMs };
    } else {
      this.attempts[key].count++;
    }
    return this.check(key);
  }

  /**
   * Reset attempts for a key (on successful auth)
   */
  reset(key) { delete this.attempts[key]; }

  /**
   * Check if key is currently blocked
   */
  isBlocked(key) { return !this.check(key).allowed; }

  /**
   * Get remaining lockout time in seconds
   */
  getRemainingLockout(key) {
    const entry = this.attempts[key];
    if (!entry || Date.now() > entry.resetAt) return 0;
    return Math.ceil((entry.resetAt - Date.now()) / 1000);
  }
}

// Global rate limiter for login
const loginRateLimiter = new RateLimiter(3, 15 * 60 * 1000);

// ── Password Strength Analyzer ───────────────────────────────

/**
 * Analyze password strength
 * @returns {{ score: 0-4, label: string, color: string, suggestions: string[] }}
 */
function analyzePasswordStrength(password) {
  const suggestions = [];
  let score = 0;

  if (password.length >= 8)  score++; else suggestions.push('Use at least 8 characters');
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++; else suggestions.push('Add uppercase letters');
  if (/[0-9]/.test(password)) score++; else suggestions.push('Add numbers');
  if (/[^A-Za-z0-9]/.test(password)) score++; else suggestions.push('Add special characters (!@#$%^&*)');
  if (/(.)\1{2,}/.test(password)) { score--; suggestions.push('Avoid repeated characters'); }

  score = Math.max(0, Math.min(4, score));
  const labels = ['Weak', 'Fair', 'Good', 'Strong', 'Very Strong'];
  const colors = ['#DC3545', '#FFC107', '#17A2B8', '#28A745', '#20c997'];

  return { score, label: labels[score], color: colors[score], suggestions };
}

// ── Input Validators ─────────────────────────────────────────

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
}

function isValidUKPhone(phone) {
  const cleaned = String(phone).replace(/[\s\-()]/g, '');
  return /^(\+44|0044|0)(7\d{9}|1\d{8,9}|2\d{9}|3\d{9})$/.test(cleaned);
}

function isValidPassword(password) {
  return validatePassword(password).valid;
}

function isValidAmount(amount, min = 300, max = 5000) {
  return validateAmount(amount, min, max).valid;
}

// ── Session Security ─────────────────────────────────────────

/**
 * Generate a session token
 */
function generateSessionToken() {
  return 'ef_' + generateToken(32);
}

/**
 * Check if a session object is still valid
 */
function isSessionValid(session) {
  if (!session) return false;
  if (!session.token || !session.expiresAt) return false;
  return Date.now() < new Date(session.expiresAt).getTime();
}

/**
 * Refresh session expiry
 */
function refreshSession(session, durationMs = 15 * 60 * 1000) {
  if (!session) return null;
  const now = new Date();
  session.lastActivity = now.toISOString();
  session.expiresAt = new Date(now.getTime() + durationMs).toISOString();
  return session;
}

console.log('[Enomy-Finances] security.js loaded');

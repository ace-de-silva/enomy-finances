/* ============================================================
   ENOMY-FINANCES | utils.js
   Utility Functions: Formatters, Validators, DOM, Storage, Export
   ============================================================ */
'use strict';

// ── Currency & Number Formatters ─────────────────────────────

/**
 * Format a number as currency string
 * @param {number} amount
 * @param {string} currency - ISO currency code
 * @param {number} decimals
 * @returns {string}
 */
function formatCurrency(amount, currency = 'GBP', decimals = 2) {
  const symbols = { GBP: '£', USD: '$', EUR: '€', BRL: 'R$', JPY: '¥', TRY: '₺' };
  const sym = symbols[currency] || currency + ' ';
  const d = currency === 'JPY' ? 0 : decimals;
  return sym + formatNumber(amount, d);
}

/**
 * Format number with thousand separators
 */
function formatNumber(num, decimals = 2) {
  const n = bankersRound(parseFloat(num) || 0, decimals);
  return n.toLocaleString('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/**
 * Banker's rounding (round half to even)
 */
function bankersRound(num, decimals = 2) {
  const factor = Math.pow(10, decimals);
  const shifted = num * factor;
  const floor = Math.floor(shifted);
  const diff = shifted - floor;
  if (Math.abs(diff - 0.5) < Number.EPSILON) {
    return (floor % 2 === 0 ? floor : floor + 1) / factor;
  }
  return Math.round(shifted) / factor;
}

/**
 * Parse currency string to float
 */
function parseCurrency(str) {
  if (typeof str === 'number') return str;
  return parseFloat(String(str).replace(/[^0-9.\-]/g, '')) || 0;
}

/**
 * Get fee tier label and rate for a given amount
 */
function getFeeTier(amount) {
  if (amount <= 500)  return { rate: 0.035, label: '3.5%', tier: 'Up to 500' };
  if (amount <= 1500) return { rate: 0.027, label: '2.7%', tier: '501–1,500' };
  if (amount <= 2500) return { rate: 0.020, label: '2.0%', tier: '1,501–2,500' };
  return { rate: 0.015, label: '1.5%', tier: 'Over 2,500' };
}

/**
 * Format fee as "£27.00 (2.7%)"
 */
function formatFee(amount, rate, currency = 'GBP') {
  return `${formatCurrency(amount, currency)} (${(rate * 100).toFixed(1)}%)`;
}

// ── Date Utilities ───────────────────────────────────────────

/**
 * Format date to DD/MM/YYYY or other format
 */
function formatDate(date, format = 'DD/MM/YYYY') {
  const d = new Date(date);
  if (isNaN(d)) return '—';
  const dd  = String(d.getDate()).padStart(2, '0');
  const mm  = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return format.replace('DD', dd).replace('MM', mm).replace('YYYY', yyyy);
}

/**
 * Format date + time
 */
function formatDateTime(date) {
  const d = new Date(date);
  if (isNaN(d)) return '—';
  return formatDate(d) + ' ' + d.toTimeString().slice(0, 5);
}

/**
 * Get relative time string: "2 hours ago"
 */
function timeAgo(date) {
  const d = new Date(date);
  if (isNaN(d)) return '—';
  const secs = Math.floor((Date.now() - d) / 1000);
  if (secs < 60)    return 'Just now';
  if (secs < 3600)  return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  if (secs < 604800)return `${Math.floor(secs / 86400)}d ago`;
  return formatDate(d);
}

/**
 * Check if timestamp is past (expired)
 */
function isExpired(timestamp) {
  return Date.now() > parseInt(timestamp);
}

// ── Validation Helpers ───────────────────────────────────────

/**
 * Validate email (RFC 5322 simplified)
 */
function validateEmail(email) {
  const re = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
  return re.test(String(email).toLowerCase());
}

/**
 * Validate UK phone number (+44...)
 */
function validatePhone(phone) {
  const cleaned = String(phone).replace(/\s/g, '');
  return /^(\+44|0044|0)[0-9]{9,10}$/.test(cleaned);
}

/**
 * Validate and measure password strength
 * Returns { valid, strength, score, message }
 */
function validatePassword(password) {
  const checks = {
    length:    password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number:    /[0-9]/.test(password),
    special:   /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
  };
  const score = Object.values(checks).filter(Boolean).length;
  const valid = Object.values(checks).every(Boolean);
  let strength = 'weak', message = '';
  if (score <= 2) { strength = 'weak'; message = 'Too weak — add uppercase, numbers, and special characters'; }
  else if (score === 3) { strength = 'fair'; message = 'Fair — add more variety for a stronger password'; }
  else if (score === 4) { strength = 'good'; message = 'Good — almost there, add a special character'; }
  else { strength = 'strong'; message = 'Strong password'; }
  if (!checks.length) message = 'Must be at least 8 characters';
  return { valid, strength, score, message, checks };
}

/**
 * Validate transaction amount (300–5000)
 */
function validateAmount(amount, min = 300, max = 5000) {
  const n = parseFloat(amount);
  if (isNaN(n) || n <= 0)  return { valid: false, message: 'Please enter a valid amount' };
  if (n < min) return { valid: false, message: `Minimum transaction is ${formatNumber(min)} units` };
  if (n > max) return { valid: false, message: `Maximum transaction is ${formatNumber(max)} units` };
  return { valid: true, message: '' };
}

/**
 * Sanitize HTML to prevent XSS
 */
function sanitizeHTML(str) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;', '/': '&#x2F;' };
  return String(str).replace(/[&<>"'/]/g, s => map[s]);
}

// ── DOM Utilities ────────────────────────────────────────────

const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];

function createElement(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'class') el.className = v;
    else if (k === 'html')  el.innerHTML = v;
    else if (k === 'text')  el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  });
  children.forEach(c => {
    if (typeof c === 'string') el.appendChild(document.createTextNode(c));
    else if (c) el.appendChild(c);
  });
  return el;
}

function showElement(el) { if (el) el.classList.remove('d-none'); }
function hideElement(el) { if (el) el.classList.add('d-none'); }
function toggleElement(el) { if (el) el.classList.toggle('d-none'); }

function setLoading(btn, loading) {
  if (!btn) return;
  if (loading) { btn.classList.add('loading'); btn.disabled = true; }
  else { btn.classList.remove('loading'); btn.disabled = false; }
}

// ── Toast Notifications ──────────────────────────────────────

const TOAST_ICONS = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };

/**
 * Show a toast notification
 */
function showToast(message, type = 'info', duration = 5000, title = '') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = createElement('div', { id: 'toastContainer', class: 'toast-container', 'aria-live': 'polite' });
    document.body.appendChild(container);
  }
  const defaultTitles = { success: 'Success', error: 'Error', warning: 'Warning', info: 'Information' };
  const toast = createElement('div', { class: `toast toast-${type}`, role: 'alert' }, [
    createElement('span', { class: 'toast-icon' }, [TOAST_ICONS[type] || 'ℹ️']),
    createElement('div', { class: 'toast-content' }, [
      createElement('div', { class: 'toast-title', text: title || defaultTitles[type] }),
      createElement('div', { class: 'toast-message', text: message })
    ]),
    createElement('button', { class: 'toast-close', 'aria-label': 'Dismiss', onclick: () => dismissToast(toast) }, ['×'])
  ]);
  container.appendChild(toast);
  if (duration > 0) setTimeout(() => dismissToast(toast), duration);
  return toast;
}

function dismissToast(toast) {
  toast.classList.add('dismissing');
  setTimeout(() => toast.remove(), 300);
}

function clearToasts() {
  const container = document.getElementById('toastContainer');
  if (container) container.innerHTML = '';
}

// ── Storage Helpers ──────────────────────────────────────────

function storageGet(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}

function storageSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

function storageRemove(key) {
  try { localStorage.removeItem(key); return true; } catch { return false; }
}

function storageClear() {
  try { localStorage.clear(); return true; } catch { return false; }
}

function sessionGet(key) {
  try { return JSON.parse(sessionStorage.getItem(key)); } catch { return null; }
}

function sessionSet(key, value) {
  try { sessionStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

function sessionRemove(key) {
  try { sessionStorage.removeItem(key); return true; } catch { return false; }
}

// ── ID & UUID Generation ─────────────────────────────────────

let idCounters = {};
function generateId(prefix = 'ID') {
  if (!idCounters[prefix]) idCounters[prefix] = 1;
  return prefix + String(idCounters[prefix]++).padStart(3, '0');
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function generateShortId(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length }, () => chars[Math.random() * chars.length | 0]).join('');
}

// ── Array / Object Utilities ─────────────────────────────────

function groupBy(array, key) {
  return array.reduce((acc, item) => {
    const k = typeof key === 'function' ? key(item) : item[key];
    (acc[k] = acc[k] || []).push(item);
    return acc;
  }, {});
}

function sortBy(array, key, direction = 'asc') {
  return [...array].sort((a, b) => {
    const va = typeof key === 'function' ? key(a) : a[key];
    const vb = typeof key === 'function' ? key(b) : b[key];
    const cmp = va < vb ? -1 : va > vb ? 1 : 0;
    return direction === 'asc' ? cmp : -cmp;
  });
}

function filterBy(array, filters) {
  return array.filter(item =>
    Object.entries(filters).every(([k, v]) => {
      if (v === '' || v === null || v === undefined) return true;
      const val = item[k];
      if (typeof v === 'string') return String(val).toLowerCase().includes(v.toLowerCase());
      return val === v;
    })
  );
}

function paginate(array, page = 1, perPage = 25) {
  const total = array.length;
  const pages = Math.ceil(total / perPage);
  const start = (page - 1) * perPage;
  return { data: array.slice(start, start + perPage), total, pages, current: page, perPage };
}

// ── Number Utilities ─────────────────────────────────────────

function clamp(value, min, max) { return Math.min(Math.max(value, min), max); }
function percentOf(value, total) { return total === 0 ? 0 : (value / total) * 100; }
function roundTo(value, decimals) { return bankersRound(value, decimals); }

// ── Debounce & Throttle ──────────────────────────────────────

function debounce(fn, delay) {
  let t;
  return function(...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), delay); };
}

function throttle(fn, limit) {
  let last = 0;
  return function(...args) {
    const now = Date.now();
    if (now - last >= limit) { last = now; return fn.apply(this, args); }
  };
}

// ── CSV Export ───────────────────────────────────────────────

/**
 * Export data array to CSV and trigger download
 */
function exportToCSV(data, filename = 'export.csv', headers = null) {
  if (!data.length) { showToast('No data to export', 'warning'); return; }
  const keys = headers || Object.keys(data[0]);
  const headerRow = keys.map(k => `"${k}"`).join(',');
  const rows = data.map(row =>
    keys.map(k => {
      const v = row[k] === undefined || row[k] === null ? '' : row[k];
      return `"${String(v).replace(/"/g, '""')}"`;
    }).join(',')
  );
  const csv = [headerRow, ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = createElement('a', { href: url, download: filename });
  document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  showToast(`${data.length} records exported as ${filename}`, 'success');
}

// ── Rendering Helpers ────────────────────────────────────────

/**
 * Render pagination controls
 */
function renderPagination(containerId, currentPage, totalPages, onPageChange) {
  const container = document.getElementById(containerId);
  if (!container || totalPages <= 1) { if (container) container.innerHTML = ''; return; }
  container.innerHTML = '';
  const addBtn = (label, page, disabled = false, active = false) => {
    const btn = createElement('button', {
      class: `page-btn${active ? ' active' : ''}`,
      onclick: () => !disabled && !active && onPageChange(page)
    }, [label]);
    if (disabled) btn.disabled = true;
    container.appendChild(btn);
  };
  addBtn('‹', currentPage - 1, currentPage === 1);
  const start = Math.max(1, currentPage - 2), end = Math.min(totalPages, start + 4);
  for (let i = start; i <= end; i++) addBtn(String(i), i, false, i === currentPage);
  addBtn('›', currentPage + 1, currentPage === totalPages);
  const info = createElement('span', { class: 'page-info', text: `Page ${currentPage} of ${totalPages}` });
  container.appendChild(info);
}

/**
 * Create initials avatar HTML string
 */
function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : parts[0].slice(0, 2).toUpperCase();
}

/**
 * Create avatar element
 */
function createAvatarEl(name, size = 'md', bgColor = null) {
  const colors = ['#003D82', '#008B8B', '#D4AF37', '#28A745', '#6f42c1', '#fd7e14'];
  const color = bgColor || colors[name.charCodeAt(0) % colors.length];
  return createElement('div', {
    class: `avatar avatar-${size}`,
    style: `background:${color};color:white`,
    text: getInitials(name)
  });
}

/**
 * Create empty state element
 */
function createEmptyState(icon, title, message, actionLabel = null, onAction = null) {
  const children = [
    createElement('div', { class: 'empty-icon', text: icon }),
    createElement('h3', { text: title }),
    createElement('p', { class: 'text-muted', text: message })
  ];
  if (actionLabel && onAction) {
    children.push(createElement('button', { class: 'btn btn-primary mt-4', text: actionLabel, onclick: onAction }));
  }
  return createElement('div', { class: 'empty-state' }, children);
}

// ── Misc ─────────────────────────────────────────────────────

/**
 * Format seconds as MM:SS
 */
function formatCountdown(seconds) {
  const m = Math.floor(seconds / 60), s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Mask phone number for display: +44 7*** *** 789
 */
function maskPhone(phone) {
  if (!phone) return '';
  const p = String(phone).replace(/\s/g, '');
  if (p.length < 6) return p;
  return p.slice(0, 4) + '*** ***' + p.slice(-3);
}

/**
 * Deep clone an object
 */
function deepClone(obj) {
  try { return JSON.parse(JSON.stringify(obj)); } catch { return { ...obj }; }
}

/**
 * Capitalize first letter
 */
function capitalize(str) {
  return String(str).charAt(0).toUpperCase() + String(str).slice(1);
}

/**
 * Get a color for risk level
 */
function getRiskColor(risk) {
  const map = { Low: 'success', Medium: 'warning', High: 'danger' };
  return map[risk] || 'info';
}

console.log('[Enomy-Finances] utils.js loaded');

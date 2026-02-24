/* ============================================================
   ENOMY-FINANCES | database.js
   localStorage CRUD Layer — simulates a cloud database
   ============================================================ */
'use strict';

const DB_VERSION    = '1.0.0';
const DB_PREFIX     = 'ef_';
const COLLECTIONS   = ['users','currencyConversions','investmentQuotes','sessions','auditLogs','feePolicies','advisorNotes'];

class Database {
  constructor() {
    this._ensureCollections();
  }

  _ensureCollections() {
    COLLECTIONS.forEach(name => {
      if (!localStorage.getItem(DB_PREFIX + name)) {
        localStorage.setItem(DB_PREFIX + name, JSON.stringify([]));
      }
    });
  }

  // ── Collection Operations ──────────────────────────────────

  getCollection(name) {
    try {
      return JSON.parse(localStorage.getItem(DB_PREFIX + name)) || [];
    } catch { return []; }
  }

  saveCollection(name, data) {
    try {
      localStorage.setItem(DB_PREFIX + name, JSON.stringify(data));
      return true;
    } catch (e) {
      console.error('[DB] Save failed for', name, e);
      return false;
    }
  }

  // ── CRUD ──────────────────────────────────────────────────

  create(collection, record) {
    const data = this.getCollection(collection);
    const now = new Date().toISOString();
    const newRecord = { ...record, createdAt: now, updatedAt: now };
    if (!newRecord.id) {
      const prefix = { users: 'USR', currencyConversions: 'CONV', investmentQuotes: 'QUOTE',
        sessions: 'SESS', auditLogs: 'LOG', feePolicies: 'FEE', advisorNotes: 'NOTE' }[collection] || 'REC';
      newRecord.id = prefix + String(data.length + 1).padStart(3, '0') + '_' + Date.now().toString(36).slice(-4);
    }
    data.push(newRecord);
    this.saveCollection(collection, data);
    return newRecord;
  }

  read(collection, id) {
    return this.getCollection(collection).find(r => r.id === id) || null;
  }

  update(collection, id, updates) {
    const data = this.getCollection(collection);
    const idx = data.findIndex(r => r.id === id);
    if (idx === -1) return null;
    data[idx] = { ...data[idx], ...updates, updatedAt: new Date().toISOString() };
    this.saveCollection(collection, data);
    return data[idx];
  }

  delete(collection, id) {
    const data = this.getCollection(collection);
    const idx = data.findIndex(r => r.id === id);
    if (idx === -1) return false;
    data.splice(idx, 1);
    this.saveCollection(collection, data);
    return true;
  }

  softDelete(collection, id) {
    return this.update(collection, id, { deletedAt: new Date().toISOString(), status: 'deleted' });
  }

  // ── Query Operations ───────────────────────────────────────

  find(collection, filters = {}) {
    return this.getCollection(collection).filter(record => {
      return Object.entries(filters).every(([key, val]) => {
        if (val === undefined || val === null) return true;
        const rv = record[key];
        if (typeof val === 'string' && typeof rv === 'string') return rv.toLowerCase().includes(val.toLowerCase());
        return rv === val;
      });
    }).filter(r => !r.deletedAt);
  }

  findOne(collection, filters = {}) {
    return this.find(collection, filters)[0] || null;
  }

  findAll(collection) {
    return this.getCollection(collection).filter(r => !r.deletedAt);
  }

  count(collection, filters = {}) {
    return this.find(collection, filters).length;
  }

  // ── User Queries ───────────────────────────────────────────

  findUserByEmail(email) {
    return this.getCollection('users').find(u => u.email && u.email.toLowerCase() === email.toLowerCase()) || null;
  }

  findUserById(id) {
    return this.getCollection('users').find(u => u.id === id || u.userID === id) || null;
  }

  findUserByRole(role) {
    return this.getCollection('users').filter(u => u.role === role && !u.deletedAt);
  }

  updateUser(id, updates) {
    const data = this.getCollection('users');
    const idx = data.findIndex(u => u.id === id || u.userID === id);
    if (idx === -1) return null;
    data[idx] = { ...data[idx], ...updates, updatedAt: new Date().toISOString() };
    this.saveCollection('users', data);
    return data[idx];
  }

  // ── Conversion Queries ─────────────────────────────────────

  findConversionsByUser(userId, limit = 50) {
    return this.getCollection('currencyConversions')
      .filter(c => c.userID === userId || c.userId === userId)
      .sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt))
      .slice(0, limit);
  }

  findConversionsInDateRange(from, to) {
    const fromD = new Date(from), toD = new Date(to);
    return this.getCollection('currencyConversions').filter(c => {
      const d = new Date(c.date || c.createdAt);
      return d >= fromD && d <= toD;
    });
  }

  getConversionStats() {
    const all = this.getCollection('currencyConversions');
    const today = new Date(); today.setHours(0,0,0,0);
    return {
      total: all.length,
      today: all.filter(c => new Date(c.date || c.createdAt) >= today).length,
      totalVolume: all.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0),
      totalFees:   all.reduce((s, c) => s + (parseFloat(c.fee) || 0), 0),
      byPair: all.reduce((acc, c) => {
        const key = `${c.fromCurrency}-${c.toCurrency}`;
        acc[key] = (acc[key] || 0) + 1; return acc;
      }, {})
    };
  }

  // ── Investment Queries ─────────────────────────────────────

  findQuotesByUser(userId) {
    return this.getCollection('investmentQuotes')
      .filter(q => q.userID === userId || q.userId === userId)
      .sort((a, b) => new Date(b.generatedDate || b.createdAt) - new Date(a.generatedDate || a.createdAt));
  }

  findSavedQuotes(userId) {
    return this.findQuotesByUser(userId).filter(q => q.saved);
  }

  getPendingAdvisorReview() {
    return this.getCollection('investmentQuotes').filter(q => q.saved && !q.advisorReviewed);
  }

  // ── Audit Log ─────────────────────────────────────────────

  log(userId, action, details = '', ipAddress = '0.0.0.0') {
    const entry = {
      id: 'LOG_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,6),
      userID: userId, action, details, ipAddress,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent.slice(0, 100)
    };
    const logs = this.getCollection('auditLogs');
    logs.unshift(entry);
    if (logs.length > 1000) logs.splice(1000); // Keep last 1000
    this.saveCollection('auditLogs', logs);
    return entry;
  }

  getAuditLogs(userId = null, limit = 100) {
    let logs = this.getCollection('auditLogs');
    if (userId) logs = logs.filter(l => l.userID === userId);
    return logs.slice(0, limit);
  }

  // ── Session Management ─────────────────────────────────────

  createSession(userId, token, durationMs = 15 * 60 * 1000) {
    const now = new Date();
    return this.create('sessions', {
      id: token,
      userID: userId,
      token,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + durationMs).toISOString(),
      lastActivity: now.toISOString()
    });
  }

  getSession(token) {
    return this.getCollection('sessions').find(s => s.token === token) || null;
  }

  updateSessionActivity(token) {
    const sessions = this.getCollection('sessions');
    const idx = sessions.findIndex(s => s.token === token);
    if (idx === -1) return null;
    const now = new Date();
    sessions[idx].lastActivity = now.toISOString();
    sessions[idx].expiresAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
    this.saveCollection('sessions', sessions);
    return sessions[idx];
  }

  invalidateSession(token) {
    const sessions = this.getCollection('sessions');
    const filtered = sessions.filter(s => s.token !== token);
    this.saveCollection('sessions', filtered);
  }

  invalidateUserSessions(userId) {
    const sessions = this.getCollection('sessions').filter(s => s.userID !== userId);
    this.saveCollection('sessions', sessions);
  }

  cleanExpiredSessions() {
    const now = new Date();
    const sessions = this.getCollection('sessions').filter(s => new Date(s.expiresAt) > now);
    this.saveCollection('sessions', sessions);
  }

  // ── Advisor Notes ──────────────────────────────────────────

  addAdvisorNote(clientId, advisorId, noteText) {
    return this.create('advisorNotes', {
      clientId, advisorId, text: sanitizeInput(noteText),
      timestamp: new Date().toISOString()
    });
  }

  getNotesByClient(clientId) {
    return this.getCollection('advisorNotes')
      .filter(n => n.clientId === clientId)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  // ── Fee Policies ───────────────────────────────────────────

  getFeePolicies() {
    const policies = this.getCollection('feePolicies');
    return policies.length ? policies[0] : null;
  }

  updateFeePolicies(newPolicies) {
    const existing = this.getCollection('feePolicies');
    if (existing.length) {
      existing[0] = { ...existing[0], ...newPolicies, updatedAt: new Date().toISOString() };
      this.saveCollection('feePolicies', existing);
      return existing[0];
    }
    return this.create('feePolicies', newPolicies);
  }

  // ── Analytics ─────────────────────────────────────────────

  getDatabaseStats() {
    return COLLECTIONS.reduce((acc, name) => {
      acc[name] = this.getCollection(name).length; return acc;
    }, {});
  }

  getSystemStats() {
    const users       = this.getCollection('users');
    const conversions = this.getCollection('currencyConversions');
    const quotes      = this.getCollection('investmentQuotes');
    const today       = new Date(); today.setHours(0,0,0,0);

    return {
      totalUsers:      users.length,
      customers:       users.filter(u => u.role === 'Customer').length,
      advisors:        users.filter(u => u.role === 'Advisor').length,
      admins:          users.filter(u => u.role === 'Admin').length,
      totalConversions: conversions.length,
      conversionsToday: conversions.filter(c => new Date(c.date || c.createdAt) >= today).length,
      totalQuotes:     quotes.length,
      totalFeesCollected: conversions.reduce((s, c) => s + (parseFloat(c.fee) || 0), 0),
      revenueToday:    conversions.filter(c => new Date(c.date || c.createdAt) >= today)
                         .reduce((s, c) => s + (parseFloat(c.fee) || 0), 0)
    };
  }

  // ── Seed & Reset ───────────────────────────────────────────

  seedDatabase(seedData) {
    try {
      COLLECTIONS.forEach(name => {
        if (seedData[name] && seedData[name].length) {
          this.saveCollection(name, seedData[name]);
        }
      });
      localStorage.setItem('ef_db_version', DB_VERSION);
      console.log('[DB] Database seeded with demo data');
    } catch (e) {
      console.error('[DB] Seed failed:', e);
    }
  }

  clearDatabase() {
    COLLECTIONS.forEach(name => this.saveCollection(name, []));
    localStorage.removeItem('ef_initialized');
    console.log('[DB] Database cleared');
  }

  exportData() {
    const data = {};
    COLLECTIONS.forEach(name => { data[name] = this.getCollection(name); });
    return JSON.stringify(data, null, 2);
  }

  importData(jsonStr) {
    try {
      const data = JSON.parse(jsonStr);
      COLLECTIONS.forEach(name => { if (data[name]) this.saveCollection(name, data[name]); });
      return true;
    } catch (e) { console.error('[DB] Import failed:', e); return false; }
  }

  // ── Error Logging (graceful degradation) ─────────────────

  logError(errorData) {
    try {
      this.log('SYSTEM', 'SYSTEM_ERROR', JSON.stringify(errorData).slice(0, 500));
    } catch {
      // Write to file system simulation: localStorage emergency log
      try {
        const emergencyLog = JSON.parse(localStorage.getItem('ef_emergency_log') || '[]');
        emergencyLog.push({ ...errorData, timestamp: new Date().toISOString() });
        if (emergencyLog.length > 50) emergencyLog.shift();
        localStorage.setItem('ef_emergency_log', JSON.stringify(emergencyLog));
      } catch { /* silent fail */ }
    }
  }
}

// ── Singleton ─────────────────────────────────────────────────
const db = new Database();

// Global error handler - log all uncaught errors
window.addEventListener('error', (e) => {
  db.logError({ type: 'UNCAUGHT_ERROR', message: e.message, filename: e.filename, line: e.lineno });
});

console.log('[Enomy-Finances] database.js loaded');

/* ============================================================
   ENOMY-FINANCES | admin.js
   Admin Portal & Advisor/Staff Portal Logic
   ============================================================ */
'use strict';

// ══════════════════════════════════════════════════════════════
// ADMIN PORTAL
// ══════════════════════════════════════════════════════════════

class AdminPortal {
  constructor() {
    this.currentSection = 'dashboard';
    this.currentPage    = { users: 1, transactions: 1, audit: 1 };
    this.perPage        = 10;
    this._init();
  }

  _init() {
    if (!document.getElementById('admin-portal')) return;
    this._bindNav();
    this._renderSection('dashboard');
    this._startSessionTimer();
  }

  // ── Navigation ───────────────────────────────────────────────

  _bindNav() {
    document.querySelectorAll('[data-admin-section]').forEach(link => {
      link.addEventListener('click', e => {
        e.preventDefault();
        const section = link.dataset.adminSection;
        this._renderSection(section);

        // Update active state
        document.querySelectorAll('[data-admin-section]').forEach(l => l.classList.remove('active'));
        link.classList.add('active');

        // Mobile: close sidebar
        document.getElementById('admin-sidebar')?.classList.remove('sidebar--open');
      });
    });

    document.getElementById('mobile-menu-toggle')?.addEventListener('click', () => {
      document.getElementById('admin-sidebar')?.classList.toggle('sidebar--open');
    });
  }

  _renderSection(section) {
    this.currentSection = section;
    document.querySelectorAll('.admin-section').forEach(s => s.style.display = 'none');
    const el = document.getElementById(`admin-${section}`);
    if (el) el.style.display = 'block';

    const methodMap = {
      dashboard:    '_renderDashboard',
      users:        '_renderUsers',
      transactions: '_renderTransactions',
      fees:         '_renderFeeManager',
      analytics:    '_renderAnalytics',
      audit:        '_renderAuditLog'
    };

    const method = methodMap[section];
    if (method && this[method]) this[method]();
  }

  // ── Dashboard ────────────────────────────────────────────────

  _renderDashboard() {
    const stats = db.getSystemStats();
    const el    = document.getElementById('admin-dashboard');
    if (!el) return;

    // Update stat cards
    this._setStatCard('stat-total-users',   stats.totalUsers);
    this._setStatCard('stat-customers',     stats.customers);
    this._setStatCard('stat-conversions-today', stats.conversionsToday);
    this._setStatCard('stat-revenue-today', '£' + stats.revenueToday.toFixed(2));
    this._setStatCard('stat-total-fees',    '£' + stats.totalFeesCollected.toFixed(2));
    this._setStatCard('stat-pending-reviews', db.getPendingAdvisorReview().length);

    // Recent activity
    const activityEl = document.getElementById('recent-activity-list');
    if (activityEl) {
      const logs = db.getAuditLogs(null, 8);
      if (!logs.length) {
        activityEl.innerHTML = '<p class="text-muted">No recent activity.</p>';
      } else {
        activityEl.innerHTML = logs.map(log => `
          <div class="activity-item">
            <span class="activity-badge activity-badge--${this._getActionColor(log.action)}">${log.action.replace(/_/g, ' ')}</span>
            <span class="activity-user">${log.userID}</span>
            <span class="activity-time text-muted">${timeAgo(log.timestamp)}</span>
          </div>
        `).join('');
      }
    }

    // Render dashboard charts
    setTimeout(() => renderAdminDashboardCharts(), 100);
  }

  _setStatCard(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  _getActionColor(action) {
    if (action.includes('LOGIN'))      return 'info';
    if (action.includes('CONVERSION')) return 'success';
    if (action.includes('QUOTE'))      return 'primary';
    if (action.includes('FAIL') || action.includes('ERROR')) return 'danger';
    if (action.includes('ADMIN'))      return 'warning';
    return 'secondary';
  }

  // ── User Management ──────────────────────────────────────────

  _renderUsers(page = 1) {
    const container = document.getElementById('users-table-container');
    if (!container) return;

    this.currentPage.users = page;
    const allUsers = db.findAll('users');
    const searchTerm = document.getElementById('user-search')?.value?.toLowerCase() || '';

    const filtered = allUsers.filter(u =>
      !searchTerm ||
      (u.email || '').toLowerCase().includes(searchTerm) ||
      (u.name || u.fullName || '').toLowerCase().includes(searchTerm) ||
      (u.role || '').toLowerCase().includes(searchTerm)
    );

    const paged = paginate(filtered, page, this.perPage);

    if (!filtered.length) {
      container.innerHTML = '<p class="text-muted">No users found.</p>';
      return;
    }

    container.innerHTML = `
      <div class="table-responsive">
        <table class="data-table" aria-label="User management">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${paged.data.map(u => `
              <tr ${u.status === 'locked' ? 'class="row--flagged"' : ''}>
                <td><code>${u.id || u.userID}</code></td>
                <td>${escapeHTML(u.name || u.fullName || '—')}</td>
                <td>${escapeHTML(u.email || '—')}</td>
                <td><span class="badge badge-role-${(u.role || '').toLowerCase()}">${u.role || '—'}</span></td>
                <td><span class="badge badge-${u.status === 'active' ? 'success' : u.status === 'locked' ? 'danger' : 'warning'}">${u.status || 'active'}</span></td>
                <td>${new Date(u.createdAt).toLocaleDateString('en-GB')}</td>
                <td class="actions-cell">
                  <button class="btn btn-ghost btn-xs" onclick="adminPortal._viewUser('${u.id || u.userID}')">View</button>
                  ${u.status === 'locked'
                    ? `<button class="btn btn-success btn-xs" onclick="adminPortal._unlockUser('${u.id || u.userID}')">Unlock</button>`
                    : `<button class="btn btn-warning btn-xs" onclick="adminPortal._lockUser('${u.id || u.userID}')">Lock</button>`
                  }
                  <button class="btn btn-danger btn-xs" onclick="adminPortal._confirmDeleteUser('${u.id || u.userID}')">Delete</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    renderPagination('users-pagination', page, paged.pages, p => this._renderUsers(p));
  }

  _viewUser(userId) {
    const user = db.findUserById(userId);
    if (!user) return;
    const conversions = db.findConversionsByUser(userId, 5);
    const quotes      = db.findQuotesByUser(userId);

    this._showModal('User Details', `
      <div class="user-detail-modal">
        <div class="user-detail-row"><strong>ID:</strong> ${user.id || user.userID}</div>
        <div class="user-detail-row"><strong>Name:</strong> ${escapeHTML(user.name || user.fullName || '—')}</div>
        <div class="user-detail-row"><strong>Email:</strong> ${escapeHTML(user.email || '—')}</div>
        <div class="user-detail-row"><strong>Role:</strong> ${user.role}</div>
        <div class="user-detail-row"><strong>Phone:</strong> ${escapeHTML(user.phone || '—')}</div>
        <div class="user-detail-row"><strong>Status:</strong> ${user.status || 'active'}</div>
        <div class="user-detail-row"><strong>Member Since:</strong> ${new Date(user.createdAt).toLocaleDateString('en-GB')}</div>
        <hr>
        <div class="user-detail-row"><strong>Conversions:</strong> ${conversions.length} recent</div>
        <div class="user-detail-row"><strong>Investment Quotes:</strong> ${quotes.length}</div>
      </div>
    `);
  }

  _lockUser(userId) {
    db.updateUser(userId, { status: 'locked' });
    db.log('ADMIN', 'ADMIN_USER_LOCKED', `User ${userId} locked by admin`);
    showToast('User account locked.', 'warning');
    this._renderUsers(this.currentPage.users);
  }

  _unlockUser(userId) {
    db.updateUser(userId, { status: 'active', loginAttempts: 0 });
    db.log('ADMIN', 'ADMIN_USER_UNLOCKED', `User ${userId} unlocked by admin`);
    showToast('User account unlocked.', 'success');
    this._renderUsers(this.currentPage.users);
  }

  _confirmDeleteUser(userId) {
    const user = db.findUserById(userId);
    if (!user) return;
    if (confirm(`Are you sure you want to delete user ${user.email}? This action cannot be undone.`)) {
      db.softDelete('users', userId);
      db.log('ADMIN', 'ADMIN_USER_DELETED', `User ${userId} soft-deleted`);
      showToast('User deleted.', 'success');
      this._renderUsers(this.currentPage.users);
    }
  }

  // ── Transaction Monitoring ───────────────────────────────────

  _renderTransactions(page = 1) {
    const container = document.getElementById('transactions-table-container');
    if (!container) return;

    this.currentPage.transactions = page;
    const COMPLIANCE_THRESHOLD = 10000; // £10,000 reporting threshold

    let allConversions = db.getCollection('currencyConversions');
    const filterFrom   = document.getElementById('txn-filter-from')?.value;
    const filterTo     = document.getElementById('txn-filter-to')?.value;

    if (filterFrom) allConversions = allConversions.filter(c => new Date(c.date || c.createdAt) >= new Date(filterFrom));
    if (filterTo)   allConversions = allConversions.filter(c => new Date(c.date || c.createdAt) <= new Date(filterTo + 'T23:59:59'));

    allConversions.sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));
    const paged = paginate(allConversions, page, this.perPage);

    const totalVolume = allConversions.reduce((s, c) => s + (parseFloat(c.gbpEquivalent) || 0), 0);
    const totalFees   = allConversions.reduce((s, c) => s + (parseFloat(c.fee) || 0), 0);

    // Summary stats
    this._setStatCard('txn-stat-total',  allConversions.length);
    this._setStatCard('txn-stat-volume', '£' + totalVolume.toLocaleString('en-GB', { minimumFractionDigits: 2 }));
    this._setStatCard('txn-stat-fees',   '£' + totalFees.toLocaleString('en-GB', { minimumFractionDigits: 2 }));
    this._setStatCard('txn-stat-flagged', allConversions.filter(c => (parseFloat(c.gbpEquivalent) || 0) >= COMPLIANCE_THRESHOLD).length);

    container.innerHTML = `
      <div class="table-responsive">
        <table class="data-table" aria-label="Transaction log">
          <thead>
            <tr>
              <th>Date</th>
              <th>Ref</th>
              <th>User ID</th>
              <th>From</th>
              <th>To</th>
              <th>Amount</th>
              <th>Received</th>
              <th>Fee (£)</th>
              <th>Rate</th>
              <th>Flag</th>
            </tr>
          </thead>
          <tbody>
            ${paged.data.map(c => {
              const gbp     = parseFloat(c.gbpEquivalent) || parseFloat(c.amount) || 0;
              const flagged = gbp >= COMPLIANCE_THRESHOLD;
              return `
                <tr class="${flagged ? 'row--compliance-flag' : ''}">
                  <td>${new Date(c.date || c.createdAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td><code>${(c.id || '').slice(-8)}</code></td>
                  <td><code>${c.userID || '—'}</code></td>
                  <td>${c.fromCurrency || '—'}</td>
                  <td>${c.toCurrency || '—'}</td>
                  <td>£${(parseFloat(c.amount) || 0).toFixed(2)}</td>
                  <td>${(parseFloat(c.convertedAmount) || 0).toFixed(2)} ${c.toCurrency || ''}</td>
                  <td>£${(parseFloat(c.fee) || 0).toFixed(2)}</td>
                  <td>${(parseFloat(c.exchangeRate) || 0).toFixed(4)}</td>
                  <td>${flagged ? '<span class="badge badge-danger">⚠ AML</span>' : '<span class="badge badge-success">OK</span>'}</td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    renderPagination('transactions-pagination', page, paged.pages, p => this._renderTransactions(p));
  }

  // ── Fee Manager ──────────────────────────────────────────────

  _renderFeeManager() {
    const container = document.getElementById('fee-manager-container');
    if (!container) return;

    const policies = db.getFeePolicies();

    container.innerHTML = `
      <div class="fee-editor">
        <h3>Currency Conversion Fee Tiers</h3>
        <p class="text-muted">Fees applied to GBP-equivalent transaction value.</p>
        <table class="data-table" aria-label="Fee tier editor">
          <thead>
            <tr><th>Tier</th><th>Min Amount (£)</th><th>Max Amount (£)</th><th>Rate (%)</th><th>Action</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Standard</td>
              <td>£0</td>
              <td>£499.99</td>
              <td><input type="number" class="form-input input-inline" id="fee-standard" value="${policies?.currencyFeeStandard || 3.5}" min="0" max="20" step="0.1"></td>
              <td><button class="btn btn-primary btn-xs" onclick="adminPortal._saveFee('standard')">Save</button></td>
            </tr>
            <tr>
              <td>Silver</td>
              <td>£500</td>
              <td>£999.99</td>
              <td><input type="number" class="form-input input-inline" id="fee-silver" value="${policies?.currencyFeeSilver || 2.7}" min="0" max="20" step="0.1"></td>
              <td><button class="btn btn-primary btn-xs" onclick="adminPortal._saveFee('silver')">Save</button></td>
            </tr>
            <tr>
              <td>Gold</td>
              <td>£1,000</td>
              <td>£1,999.99</td>
              <td><input type="number" class="form-input input-inline" id="fee-gold" value="${policies?.currencyFeeGold || 2.0}" min="0" max="20" step="0.1"></td>
              <td><button class="btn btn-primary btn-xs" onclick="adminPortal._saveFee('gold')">Save</button></td>
            </tr>
            <tr>
              <td>Platinum</td>
              <td>£2,000</td>
              <td>£5,000+</td>
              <td><input type="number" class="form-input input-inline" id="fee-platinum" value="${policies?.currencyFeePlatinum || 1.5}" min="0" max="20" step="0.1"></td>
              <td><button class="btn btn-primary btn-xs" onclick="adminPortal._saveFee('platinum')">Save</button></td>
            </tr>
          </tbody>
        </table>

        <h3 class="mt-lg">Investment Plan Management Fees</h3>
        <table class="data-table" aria-label="Investment fee editor">
          <thead>
            <tr><th>Plan</th><th>Annual Rate (%)</th><th>Management Fee (%)</th><th>Monthly Fee (£)</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Basic Savings</td>
              <td>3.5%</td>
              <td>0.5%</td>
              <td>£5.00</td>
            </tr>
            <tr>
              <td>Savings Plan Plus</td>
              <td>7.2%</td>
              <td>1.0%</td>
              <td>£12.00</td>
            </tr>
            <tr>
              <td>Managed Stock Portfolio</td>
              <td>12.4%</td>
              <td>1.5%</td>
              <td>£25.00</td>
            </tr>
          </tbody>
        </table>
        <p class="text-muted mt-sm">Investment plan rates are fixed per regulatory requirements. Contact compliance to modify.</p>
      </div>
    `;
  }

  _saveFee(tier) {
    const val = parseFloat(document.getElementById(`fee-${tier}`)?.value);
    if (isNaN(val) || val < 0 || val > 20) { showToast('Invalid fee rate. Must be 0–20%.', 'error'); return; }
    const key = { standard: 'currencyFeeStandard', silver: 'currencyFeeSilver', gold: 'currencyFeeGold', platinum: 'currencyFeePlatinum' }[tier];
    db.updateFeePolicies({ [key]: val });
    db.log('ADMIN', 'FEE_POLICY_UPDATED', `${tier} fee updated to ${val}%`);
    showToast(`${tier.charAt(0).toUpperCase() + tier.slice(1)} fee updated to ${val}%.`, 'success');
  }

  // ── Analytics ────────────────────────────────────────────────

  _renderAnalytics() {
    setTimeout(() => {
      renderAdminDashboardCharts();
      const conversions = db.getCollection('currencyConversions');
      if (document.getElementById('currency-pair-chart')) {
        renderCurrencyPairChart('currency-pair-chart', conversions);
      }
    }, 100);
  }

  // ── Audit Log ────────────────────────────────────────────────

  _renderAuditLog(page = 1) {
    const container = document.getElementById('audit-log-container');
    if (!container) return;

    this.currentPage.audit = page;
    const logs   = db.getAuditLogs(null, 500);
    const paged  = paginate(logs, page, 20);

    container.innerHTML = `
      <div class="table-responsive">
        <table class="data-table data-table--compact" aria-label="Audit log">
          <thead>
            <tr><th>Timestamp</th><th>User ID</th><th>Action</th><th>Details</th><th>IP</th></tr>
          </thead>
          <tbody>
            ${paged.data.map(log => `
              <tr>
                <td>${new Date(log.timestamp).toLocaleString('en-GB')}</td>
                <td><code>${log.userID || '—'}</code></td>
                <td><span class="badge badge-action badge-${this._getActionColor(log.action)}">${log.action.replace(/_/g, ' ')}</span></td>
                <td class="text-truncate" title="${escapeHTML(log.details || '')}">${escapeHTML((log.details || '').slice(0, 80))}</td>
                <td><code>${log.ipAddress || '—'}</code></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    renderPagination('audit-pagination', page, paged.pages, p => this._renderAuditLog(p));
  }

  // ── Modal Helper ─────────────────────────────────────────────

  _showModal(title, body) {
    const modal    = document.getElementById('admin-modal');
    const titleEl  = document.getElementById('admin-modal-title');
    const bodyEl   = document.getElementById('admin-modal-body');
    if (!modal) return;
    if (titleEl) titleEl.textContent = title;
    if (bodyEl)  bodyEl.innerHTML    = body;
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
  }

  closeModal() {
    const modal = document.getElementById('admin-modal');
    if (modal) { modal.style.display = 'none'; modal.setAttribute('aria-hidden', 'true'); }
  }

  _startSessionTimer() {
    setInterval(() => {
      const timerEl = document.getElementById('session-timer-display');
      if (!timerEl || typeof auth === 'undefined') return;
      const info = auth.getSessionInfo();
      if (info) {
        const remaining = Math.max(0, Math.ceil((new Date(info.expiresAt) - Date.now()) / 1000));
        timerEl.textContent = `Session: ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
      }
    }, 1000);
  }
}

// ══════════════════════════════════════════════════════════════
// ADVISOR PORTAL
// ══════════════════════════════════════════════════════════════

class AdvisorPortal {
  constructor() {
    this.currentSection  = 'dashboard';
    this.currentClientId = null;
    this.currentPage     = { clients: 1, reviews: 1 };
    this.perPage         = 10;
    this._init();
  }

  _init() {
    if (!document.getElementById('advisor-portal')) return;
    this._bindNav();
    this._renderSection('dashboard');
    this._startSessionTimer();
  }

  _bindNav() {
    document.querySelectorAll('[data-advisor-section]').forEach(link => {
      link.addEventListener('click', e => {
        e.preventDefault();
        const section = link.dataset.advisorSection;
        this._renderSection(section);

        document.querySelectorAll('[data-advisor-section]').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        document.getElementById('advisor-sidebar')?.classList.remove('sidebar--open');
      });
    });

    document.getElementById('mobile-menu-toggle')?.addEventListener('click', () => {
      document.getElementById('advisor-sidebar')?.classList.toggle('sidebar--open');
    });
  }

  _renderSection(section) {
    this.currentSection = section;
    document.querySelectorAll('.advisor-section').forEach(s => s.style.display = 'none');
    const el = document.getElementById(`advisor-${section}`);
    if (el) el.style.display = 'block';

    const methodMap = {
      dashboard: '_renderDashboard',
      clients:   '_renderClients',
      reviews:   '_renderPendingReviews',
      profile:   '_renderClientProfile'
    };

    const method = methodMap[section];
    if (method && this[method]) this[method]();
  }

  // ── Dashboard ────────────────────────────────────────────────

  _renderDashboard() {
    const advisor     = typeof auth !== 'undefined' ? auth.getCurrentUser() : null;
    const allCustomers = db.findUserByRole('Customer');
    const pending     = db.getPendingAdvisorReview();
    const conversions = db.getCollection('currencyConversions');

    this._setEl('adv-stat-clients',   allCustomers.length);
    this._setEl('adv-stat-pending',   pending.length);
    this._setEl('adv-stat-today',     conversions.filter(c => new Date(c.date || c.createdAt) >= new Date(new Date().setHours(0,0,0,0))).length);

    // Welcome message
    const welcomeEl = document.getElementById('advisor-welcome');
    if (welcomeEl && advisor) {
      welcomeEl.textContent = `Welcome back, ${advisor.name || advisor.fullName || 'Advisor'}`;
    }

    // Recent quotes pending review
    const pendingListEl = document.getElementById('adv-pending-preview');
    if (pendingListEl) {
      if (!pending.length) {
        pendingListEl.innerHTML = '<p class="text-muted">No quotes pending review.</p>';
      } else {
        pendingListEl.innerHTML = pending.slice(0, 5).map(q => `
          <div class="pending-item">
            <div class="pending-item__info">
              <span class="pending-item__plan">${q.planName}</span>
              <span class="pending-item__amount">£${parseFloat(q.principal).toLocaleString('en-GB', { minimumFractionDigits: 2 })}</span>
              <span class="pending-item__user text-muted">${q.userID}</span>
            </div>
            <button class="btn btn-primary btn-xs" onclick="advisorPortal._reviewQuote('${q.id}')">Review</button>
          </div>
        `).join('');
      }
    }
  }

  _setEl(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  // ── Client List ──────────────────────────────────────────────

  _renderClients(page = 1) {
    const container = document.getElementById('advisor-clients-container');
    if (!container) return;

    this.currentPage.clients = page;
    const searchTerm = document.getElementById('client-search')?.value?.toLowerCase() || '';
    const allClients = db.findUserByRole('Customer');

    const filtered = allClients.filter(u =>
      !searchTerm ||
      (u.email || '').toLowerCase().includes(searchTerm) ||
      (u.name || u.fullName || '').toLowerCase().includes(searchTerm)
    );

    const paged = paginate(filtered, page, this.perPage);

    if (!filtered.length) {
      container.innerHTML = '<p class="text-muted">No clients found.</p>';
      return;
    }

    container.innerHTML = `
      <div class="client-cards-grid">
        ${paged.data.map(client => {
          const conversions = db.findConversionsByUser(client.id || client.userID, 5);
          const quotes      = db.findSavedQuotes(client.id || client.userID);
          return `
            <div class="client-card" onclick="advisorPortal._openClient('${client.id || client.userID}')">
              <div class="client-card__avatar">${getInitials(client.name || client.fullName || client.email)}</div>
              <div class="client-card__info">
                <h4>${escapeHTML(client.name || client.fullName || 'Unknown')}</h4>
                <p class="text-muted">${escapeHTML(client.email || '')}</p>
                <div class="client-card__stats">
                  <span>${conversions.length} conversions</span>
                  <span>${quotes.length} quotes</span>
                </div>
              </div>
              <div class="client-card__badge">
                <span class="badge ${quotes.some(q => !q.advisorReviewed) ? 'badge-warning' : 'badge-success'}">
                  ${quotes.some(q => !q.advisorReviewed) ? 'Review Needed' : 'Up to date'}
                </span>
              </div>
            </div>`;
        }).join('')}
      </div>
    `;

    renderPagination('clients-pagination', page, paged.pages, p => this._renderClients(p));
  }

  _openClient(clientId) {
    this.currentClientId = clientId;
    this._renderSection('profile');
    document.querySelectorAll('[data-advisor-section]').forEach(l => {
      l.classList.toggle('active', l.dataset.advisorSection === 'profile');
    });
  }

  // ── Client Profile ───────────────────────────────────────────

  _renderClientProfile() {
    const container = document.getElementById('advisor-profile');
    if (!container) return;

    if (!this.currentClientId) {
      container.innerHTML = '<div class="empty-state"><p>Select a client from the Clients list.</p></div>';
      return;
    }

    const client      = db.findUserById(this.currentClientId);
    if (!client) { container.innerHTML = '<p class="text-danger">Client not found.</p>'; return; }

    const conversions = db.findConversionsByUser(this.currentClientId, 20);
    const quotes      = db.findQuotesByUser(this.currentClientId);
    const notes       = db.getNotesByClient(this.currentClientId);
    const advisor     = typeof auth !== 'undefined' ? auth.getCurrentUser() : null;

    container.innerHTML = `
      <div class="client-profile">
        <div class="client-profile__sidebar">
          <div class="client-avatar-lg">${getInitials(client.name || client.fullName || client.email)}</div>
          <h2>${escapeHTML(client.name || client.fullName || '—')}</h2>
          <p class="text-muted">${escapeHTML(client.email || '—')}</p>
          <p class="text-muted">${escapeHTML(client.phone || '—')}</p>
          <div class="client-info-list">
            <div><strong>Member since:</strong> ${new Date(client.createdAt).toLocaleDateString('en-GB')}</div>
            <div><strong>Risk profile:</strong> ${client.riskProfile || 'Not assessed'}</div>
            <div><strong>Conversions:</strong> ${conversions.length}</div>
            <div><strong>Quotes:</strong> ${quotes.length}</div>
          </div>
        </div>

        <div class="client-profile__main">
          <div class="tabs" role="tablist">
            <button class="tab-btn tab-btn--active" onclick="advisorPortal._switchProfileTab('conversions', this)">Conversions</button>
            <button class="tab-btn" onclick="advisorPortal._switchProfileTab('quotes', this)">Quotes</button>
            <button class="tab-btn" onclick="advisorPortal._switchProfileTab('notes', this)">Notes</button>
          </div>

          <div id="client-tab-conversions" class="client-tab">
            ${this._buildConversionsTab(conversions)}
          </div>
          <div id="client-tab-quotes" class="client-tab" style="display:none">
            ${this._buildQuotesTab(quotes)}
          </div>
          <div id="client-tab-notes" class="client-tab" style="display:none">
            ${this._buildNotesTab(notes, advisor)}
          </div>
        </div>
      </div>
    `;
  }

  _switchProfileTab(tab, btn) {
    document.querySelectorAll('.client-tab').forEach(t => t.style.display = 'none');
    document.querySelectorAll('#advisor-profile .tab-btn').forEach(b => b.classList.remove('tab-btn--active'));
    const el = document.getElementById(`client-tab-${tab}`);
    if (el) el.style.display = 'block';
    if (btn) btn.classList.add('tab-btn--active');
  }

  _buildConversionsTab(conversions) {
    if (!conversions.length) return '<p class="text-muted mt-md">No conversion history.</p>';
    return `
      <div class="table-responsive mt-md">
        <table class="data-table data-table--compact">
          <thead><tr><th>Date</th><th>From</th><th>To</th><th>Amount</th><th>Received</th><th>Fee</th></tr></thead>
          <tbody>
            ${conversions.map(c => `
              <tr>
                <td>${new Date(c.date || c.createdAt).toLocaleDateString('en-GB')}</td>
                <td>${c.fromCurrency}</td>
                <td>${c.toCurrency}</td>
                <td>£${parseFloat(c.amount).toFixed(2)}</td>
                <td>${parseFloat(c.convertedAmount).toFixed(2)} ${c.toCurrency}</td>
                <td>£${parseFloat(c.fee).toFixed(2)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  _buildQuotesTab(quotes) {
    if (!quotes.length) return '<p class="text-muted mt-md">No saved investment quotes.</p>';
    return `
      <div class="quotes-review-list mt-md">
        ${quotes.map(q => `
          <div class="review-quote-card ${!q.advisorReviewed ? 'review-quote-card--pending' : ''}">
            <div class="review-quote-card__header">
              <span>${q.planName}</span>
              <span class="badge ${q.advisorReviewed ? 'badge-success' : 'badge-warning'}">${q.advisorReviewed ? 'Reviewed' : 'Pending Review'}</span>
            </div>
            <div class="review-quote-card__body">
              <div>Principal: <strong>£${parseFloat(q.principal).toLocaleString('en-GB', { minimumFractionDigits: 2 })}</strong></div>
              <div>Period: <strong>${q.period} years</strong></div>
              <div>Risk: <strong>${q.riskLevel}</strong></div>
              <div>Projected: <strong class="text-success">£${parseFloat(q.finalBalance || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}</strong></div>
              <div>Date: ${new Date(q.generatedDate || q.createdAt).toLocaleDateString('en-GB')}</div>
            </div>
            ${!q.advisorReviewed ? `
              <div class="review-quote-card__actions">
                <button class="btn btn-success btn-sm" onclick="advisorPortal._approveQuote('${q.id}')">Approve</button>
                <button class="btn btn-warning btn-sm" onclick="advisorPortal._reviewQuote('${q.id}')">Add Note</button>
              </div>` : ''
            }
          </div>`).join('')}
      </div>`;
  }

  _buildNotesTab(notes, advisor) {
    return `
      <div class="advisor-notes mt-md">
        <div class="notes-form">
          <textarea id="new-note-text" class="form-input" rows="3" placeholder="Add a note about this client…" maxlength="500"></textarea>
          <button class="btn btn-primary btn-sm mt-sm" onclick="advisorPortal._addNote()">Add Note</button>
        </div>
        <div class="notes-timeline mt-md">
          ${notes.length ? notes.map(n => `
            <div class="note-item">
              <div class="note-item__dot"></div>
              <div class="note-item__content">
                <p>${escapeHTML(n.text)}</p>
                <small class="text-muted">${new Date(n.timestamp).toLocaleString('en-GB')} &bull; ${n.advisorId}</small>
              </div>
            </div>`).join('')
          : '<p class="text-muted">No notes yet. Add your first note above.</p>'}
        </div>
      </div>`;
  }

  _addNote() {
    const text    = document.getElementById('new-note-text')?.value?.trim();
    const advisor = typeof auth !== 'undefined' ? auth.getCurrentUser() : null;
    if (!text) { showToast('Please enter a note.', 'warning'); return; }
    if (!this.currentClientId || !advisor) return;

    db.addAdvisorNote(this.currentClientId, advisor.id || advisor.userID, text);
    db.log(advisor.id || advisor.userID, 'ADVISOR_NOTE_ADDED', `Note added for client ${this.currentClientId}`);
    showToast('Note added successfully.', 'success');
    this._renderClientProfile();
    this._switchProfileTab('notes', null);
  }

  // ── Pending Reviews ──────────────────────────────────────────

  _renderPendingReviews() {
    const container = document.getElementById('advisor-reviews-container');
    if (!container) return;

    const pending = db.getPendingAdvisorReview();

    if (!pending.length) {
      container.innerHTML = `
        <div class="empty-state">
          <p class="text-muted">No quotes pending review. All clients are up to date.</p>
        </div>`;
      return;
    }

    container.innerHTML = `
      <div class="pending-reviews-list">
        ${pending.map(q => {
          const client = db.findUserById(q.userID);
          return `
            <div class="pending-review-item">
              <div class="pending-review-item__client">
                <div class="client-avatar-sm">${getInitials(client?.name || client?.fullName || q.userID)}</div>
                <div>
                  <strong>${escapeHTML(client?.name || client?.fullName || q.userID)}</strong>
                  <p class="text-muted">${escapeHTML(client?.email || q.userID)}</p>
                </div>
              </div>
              <div class="pending-review-item__details">
                <div><strong>${q.planName}</strong></div>
                <div>£${parseFloat(q.principal).toLocaleString('en-GB', { minimumFractionDigits: 2 })} &bull; ${q.period} years &bull; <span class="badge badge-risk-${q.riskScore}">${q.riskLevel} Risk</span></div>
                <div class="text-muted">Submitted: ${new Date(q.generatedDate || q.createdAt).toLocaleDateString('en-GB')}</div>
              </div>
              <div class="pending-review-item__actions">
                <button class="btn btn-success btn-sm" onclick="advisorPortal._approveQuote('${q.id}')">Approve</button>
                <button class="btn btn-ghost btn-sm"   onclick="advisorPortal._openClient('${q.userID}')">View Client</button>
              </div>
            </div>`;
        }).join('')}
      </div>
    `;
  }

  _reviewQuote(quoteId) {
    const note = prompt('Add a review note for this quote (optional):');
    this._approveQuote(quoteId, note);
  }

  _approveQuote(quoteId, note = '') {
    const advisor = typeof auth !== 'undefined' ? auth.getCurrentUser() : null;
    db.update('investmentQuotes', quoteId, {
      advisorReviewed: true,
      advisorId:       advisor?.id || advisor?.userID,
      advisorNote:     note || '',
      reviewedAt:      new Date().toISOString()
    });

    if (advisor) {
      db.log(advisor.id || advisor.userID, 'QUOTE_REVIEWED', `Quote ${quoteId} reviewed and approved`);
    }

    showToast('Quote approved successfully.', 'success');

    // Refresh current view
    if (this.currentSection === 'reviews') this._renderPendingReviews();
    if (this.currentSection === 'profile') this._renderClientProfile();
  }

  _startSessionTimer() {
    setInterval(() => {
      const timerEl = document.getElementById('session-timer-display');
      if (!timerEl || typeof auth === 'undefined') return;
      const info = auth.getSessionInfo();
      if (info) {
        const remaining = Math.max(0, Math.ceil((new Date(info.expiresAt) - Date.now()) / 1000));
        timerEl.textContent = `Session: ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
      }
    }, 1000);
  }
}

// ── Shared: escape HTML helper (fallback if security.js not loaded) ──

function escapeHTML(str) {
  if (typeof sanitizeInput !== 'undefined') return sanitizeInput(String(str || ''));
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

// ── Module Singletons ──────────────────────────────────────────

let adminPortal   = null;
let advisorPortal = null;

function initAdminPortal() {
  adminPortal = new AdminPortal();
}

function initAdvisorPortal() {
  advisorPortal = new AdvisorPortal();
}

console.log('[Enomy-Finances] admin.js loaded');

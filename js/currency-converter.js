/* ============================================================
   ENOMY-FINANCES | currency-converter.js
   Currency Conversion Module — Tiered Fees, Live Rate Simulation
   ============================================================ */
'use strict';

// ── Currency Configuration ─────────────────────────────────────

const SUPPORTED_CURRENCIES = ['GBP', 'USD', 'EUR', 'BRL', 'JPY', 'TRY'];

const CURRENCY_INFO = {
  GBP: { symbol: '£',  name: 'British Pound Sterling', flag: '🇬🇧', decimals: 2 },
  USD: { symbol: '$',  name: 'US Dollar',              flag: '🇺🇸', decimals: 2 },
  EUR: { symbol: '€',  name: 'Euro',                   flag: '🇪🇺', decimals: 2 },
  BRL: { symbol: 'R$', name: 'Brazilian Real',         flag: '🇧🇷', decimals: 2 },
  JPY: { symbol: '¥',  name: 'Japanese Yen',           flag: '🇯🇵', decimals: 0 },
  TRY: { symbol: '₺',  name: 'Turkish Lira',           flag: '🇹🇷', decimals: 2 }
};

// Base exchange rates (GBP = 1.000)
const BASE_RATES_GBP = {
  GBP: 1.0000,
  USD: 1.2743,
  EUR: 1.1672,
  BRL: 6.4521,
  JPY: 190.45,
  TRY: 43.218
};

// Fee tiers applied to GBP-equivalent amount
const FEE_TIERS = [
  { min: 0,    max: 499.99,    rate: 0.035, label: 'Standard (3.5%)', tier: 1 },
  { min: 500,  max: 999.99,    rate: 0.027, label: 'Silver (2.7%)',   tier: 2 },
  { min: 1000, max: 1999.99,   rate: 0.020, label: 'Gold (2.0%)',     tier: 3 },
  { min: 2000, max: Infinity,  rate: 0.015, label: 'Platinum (1.5%)', tier: 4 }
];

const RATE_REFRESH_MS = 30 * 1000; // 30 seconds
const MIN_GBP_AMOUNT  = 300;
const MAX_GBP_AMOUNT  = 5000;

// ── Live Rate Engine ───────────────────────────────────────────

let _rateCache     = null;
let _rateCacheTime = 0;

/**
 * Get simulated live rates with ±0.5% random variation
 * Cached for RATE_REFRESH_MS; force-refresh by clearing _rateCache
 */
function getLiveRates() {
  const now = Date.now();
  if (_rateCache && (now - _rateCacheTime) < RATE_REFRESH_MS) return _rateCache;

  const rates = {};
  SUPPORTED_CURRENCIES.forEach(c => {
    if (c === 'GBP') {
      rates[c] = 1.0;
    } else {
      const jitter = 1 + (Math.random() - 0.5) * 0.01; // ±0.5%
      rates[c] = Math.round(BASE_RATES_GBP[c] * jitter * 10000) / 10000;
    }
  });

  _rateCache     = rates;
  _rateCacheTime = now;
  return rates;
}

/**
 * Get exchange rate between two currencies (via GBP base)
 */
function getLiveRate(fromCurrency, toCurrency) {
  if (fromCurrency === toCurrency) return 1;
  const rates = getLiveRates();
  const from  = rates[fromCurrency] || 1;
  const to    = rates[toCurrency]   || 1;
  return Math.round((to / from) * 1000000) / 1000000;
}

// ── Fee Calculation ────────────────────────────────────────────

/**
 * Get the applicable fee tier for a GBP-equivalent amount
 */
function getFeeTier(gbpAmount) {
  return FEE_TIERS.find(t => gbpAmount >= t.min && gbpAmount <= t.max) || FEE_TIERS[FEE_TIERS.length - 1];
}

/**
 * Calculate fee for a given amount in fromCurrency
 * Returns tier info plus feeAmount in fromCurrency
 */
function calculateConversionFee(amount, fromCurrency = 'GBP') {
  const rates        = getLiveRates();
  const gbpAmount    = fromCurrency === 'GBP' ? amount : amount / (rates[fromCurrency] || 1);
  const tier         = getFeeTier(gbpAmount);
  const feeAmount    = Math.round(amount * tier.rate * 100) / 100;
  return { ...tier, feeAmount, gbpEquivalent: Math.round(gbpAmount * 100) / 100 };
}

// ── Core Conversion ────────────────────────────────────────────

/**
 * Calculate a full conversion — returns all fields needed for receipt/preview
 */
function calculateConversion(fromCurrency, toCurrency, amount) {
  if (!amount || amount <= 0) return null;
  if (!SUPPORTED_CURRENCIES.includes(fromCurrency) || !SUPPORTED_CURRENCIES.includes(toCurrency)) {
    throw new Error(`Unsupported currency pair: ${fromCurrency}/${toCurrency}`);
  }

  const rates          = getLiveRates();
  const rate           = getLiveRate(fromCurrency, toCurrency);
  const gbpEquivalent  = fromCurrency === 'GBP' ? amount : Math.round((amount / rates[fromCurrency]) * 100) / 100;
  const tier           = getFeeTier(gbpEquivalent);
  const feeAmount      = Math.round(amount * tier.rate * 100) / 100;
  const amountAfterFee = Math.round((amount - feeAmount) * 100) / 100;
  const convertedAmount = Math.round(amountAfterFee * rate * 100) / 100;
  const feeInGBP       = fromCurrency === 'GBP' ? feeAmount : Math.round((feeAmount / rates[fromCurrency]) * 100) / 100;

  return {
    fromCurrency,
    toCurrency,
    inputAmount: amount,
    exchangeRate: rate,
    feeRate: tier.rate,
    feeTierLabel: tier.label,
    feeTier: tier.tier,
    feeAmount,
    feeInGBP,
    amountAfterFee,
    convertedAmount,
    gbpEquivalent,
    timestamp: new Date().toISOString()
  };
}

/**
 * Validate amount against min/max constraints (£300–£5,000 GBP equivalent)
 */
function validateConversionAmount(amount, currency = 'GBP') {
  const num = parseFloat(amount);
  if (isNaN(num) || num <= 0) return { valid: false, message: 'Please enter a valid amount.' };

  const rates    = getLiveRates();
  const gbpValue = currency === 'GBP' ? num : Math.round((num / rates[currency]) * 100) / 100;

  if (gbpValue < MIN_GBP_AMOUNT) {
    const minInCurrency = currency === 'GBP' ? `£${MIN_GBP_AMOUNT}` : `${CURRENCY_INFO[currency].symbol}${Math.ceil(MIN_GBP_AMOUNT * rates[currency])}`;
    return { valid: false, message: `Minimum transaction is £${MIN_GBP_AMOUNT} GBP equivalent (≈ ${minInCurrency} ${currency}).` };
  }
  if (gbpValue > MAX_GBP_AMOUNT) {
    const maxInCurrency = currency === 'GBP' ? `£${MAX_GBP_AMOUNT}` : `${CURRENCY_INFO[currency].symbol}${Math.floor(MAX_GBP_AMOUNT * rates[currency])}`;
    return { valid: false, message: `Maximum transaction is £${MAX_GBP_AMOUNT} GBP equivalent (≈ ${maxInCurrency} ${currency}).` };
  }

  return { valid: true, gbpEquivalent: gbpValue };
}

// ── Database Operations ────────────────────────────────────────

/**
 * Persist a completed conversion to localStorage DB
 */
function saveConversion(userId, result) {
  const record = db.create('currencyConversions', {
    userID:          userId,
    fromCurrency:    result.fromCurrency,
    toCurrency:      result.toCurrency,
    amount:          result.inputAmount,
    convertedAmount: result.convertedAmount,
    exchangeRate:    result.exchangeRate,
    fee:             result.feeInGBP,
    feeRate:         result.feeRate,
    feeTier:         result.feeTierLabel,
    gbpEquivalent:   result.gbpEquivalent,
    status:          'completed',
    date:            new Date().toISOString()
  });

  db.log(userId, 'CURRENCY_CONVERSION',
    `${result.fromCurrency}→${result.toCurrency} | ${result.inputAmount} | Fee £${result.feeInGBP}`,
    '0.0.0.0'
  );

  return record;
}

// ── Display Helpers ────────────────────────────────────────────

function getRateTable() {
  const rates = getLiveRates();
  return SUPPORTED_CURRENCIES.map(c => ({
    currency: c,
    ...CURRENCY_INFO[c],
    rateFromGBP: rates[c],
    rateToGBP: c === 'GBP' ? 1 : Math.round((1 / rates[c]) * 1000000) / 1000000
  }));
}

// ── Currency Converter UI ──────────────────────────────────────

class CurrencyConverterUI {
  constructor(containerId = 'currency-converter-section') {
    this.container = document.getElementById(containerId);
    if (!this.container) return;

    this.currentConversion  = null;
    this._lastReceipt       = null;
    this._debounceTimer     = null;
    this._rateRefreshTimer  = null;
    this._init();
  }

  _init() {
    this._bindElements();
    this._populateSelects();
    this._bindEvents();
    this._updateRateBar();
    this._startRateRefresh();
    this._loadHistory();
    this._renderFeeGuide();
  }

  _bindElements() {
    const q = sel => this.container.querySelector(sel);
    this.fromAmountInput    = q('#from-amount');
    this.fromCurrencySelect = q('#from-currency');
    this.toCurrencySelect   = q('#to-currency');
    this.swapBtn            = q('#swap-currencies');
    this.convertBtn         = q('#convert-btn');
    this.previewSection     = q('#conversion-preview');
    this.receiptSection     = q('#conversion-receipt');
    this.rateBar            = q('#live-rate-bar');
    this.feeTierBadge       = q('#fee-tier-badge');
    this.feeGuideContainer  = q('#fee-guide-container');
    this.historyContainer   = q('#conversion-history');
    this.exportBtn          = q('#export-conversions');
    this.amountError        = q('#amount-error');
  }

  _populateSelects() {
    const makeOption = (c, selected) =>
      `<option value="${c}" ${selected ? 'selected' : ''}>${CURRENCY_INFO[c].flag} ${c} — ${CURRENCY_INFO[c].name}</option>`;

    [this.fromCurrencySelect, this.toCurrencySelect].forEach(sel => {
      if (!sel) return;
      sel.innerHTML = SUPPORTED_CURRENCIES.map(c => makeOption(c, false)).join('');
    });

    if (this.fromCurrencySelect) this.fromCurrencySelect.value = 'GBP';
    if (this.toCurrencySelect)   this.toCurrencySelect.value   = 'USD';
  }

  _bindEvents() {
    this.fromAmountInput?.addEventListener('input',  () => this._onAmountChange());
    this.fromAmountInput?.addEventListener('blur',   () => this._validateAmount());
    this.fromCurrencySelect?.addEventListener('change', () => { this._updateRateBar(); this._onAmountChange(); });
    this.toCurrencySelect?.addEventListener('change',   () => { this._updateRateBar(); this._onAmountChange(); });
    this.swapBtn?.addEventListener('click',   () => this._swapCurrencies());
    this.convertBtn?.addEventListener('click', () => this._executeConversion());
    this.exportBtn?.addEventListener('click',  () => this._exportHistory());
  }

  _onAmountChange() {
    clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => this._updateLivePreview(), 400);
  }

  _validateAmount() {
    const val      = this.fromAmountInput?.value;
    const currency = this.fromCurrencySelect?.value || 'GBP';
    if (!val) { this._clearError(); return true; }

    const result = validateConversionAmount(parseFloat(val), currency);
    if (!result.valid) { this._showError(result.message); return false; }
    this._clearError();
    return true;
  }

  _showError(msg) {
    if (this.amountError) { this.amountError.textContent = msg; this.amountError.style.display = 'block'; }
    this.fromAmountInput?.classList.add('is-invalid');
  }

  _clearError() {
    if (this.amountError) { this.amountError.textContent = ''; this.amountError.style.display = 'none'; }
    this.fromAmountInput?.classList.remove('is-invalid');
  }

  _swapCurrencies() {
    if (!this.fromCurrencySelect || !this.toCurrencySelect) return;
    this.swapBtn?.classList.add('rotating');
    setTimeout(() => this.swapBtn?.classList.remove('rotating'), 400);

    const tmp = this.fromCurrencySelect.value;
    this.fromCurrencySelect.value = this.toCurrencySelect.value;
    this.toCurrencySelect.value = tmp;

    if (this.fromAmountInput) this.fromAmountInput.value = '';
    this._hidePreview();
    this._updateRateBar();
  }

  _updateRateBar() {
    if (!this.rateBar) return;
    const from = this.fromCurrencySelect?.value || 'GBP';
    const to   = this.toCurrencySelect?.value   || 'USD';
    const rate = getLiveRate(from, to);

    this.rateBar.innerHTML = `
      <span class="rate-live-dot" aria-hidden="true"></span>
      <strong>1 ${from} = ${rate.toFixed(4)} ${to}</strong>
      <span class="rate-meta">Live rate &bull; refreshes every 30s</span>
    `;

    const amount = parseFloat(this.fromAmountInput?.value) || 0;
    this._updateFeeTierBadge(amount);
  }

  _updateFeeTierBadge(amount) {
    if (!this.feeTierBadge) return;
    const currency = this.fromCurrencySelect?.value || 'GBP';
    const info = calculateConversionFee(amount || MIN_GBP_AMOUNT, currency);
    const colors = ['badge-warning', 'badge-info', 'badge-success', 'badge-accent'];
    this.feeTierBadge.className = `badge ${colors[info.tier - 1] || 'badge-warning'}`;
    this.feeTierBadge.textContent = info.label;
  }

  _updateLivePreview() {
    const amount   = parseFloat(this.fromAmountInput?.value);
    const from     = this.fromCurrencySelect?.value || 'GBP';
    const to       = this.toCurrencySelect?.value   || 'USD';

    if (!amount || isNaN(amount) || amount <= 0) { this._hidePreview(); return; }

    const validation = validateConversionAmount(amount, from);
    if (!validation.valid) { this._showError(validation.message); this._hidePreview(); return; }
    this._clearError();

    try {
      const result = calculateConversion(from, to, amount);
      if (result) { this._renderPreview(result); this._updateFeeTierBadge(amount); }
    } catch (e) {
      console.error('[CurrencyConverter] Preview error:', e);
    }
  }

  _renderPreview(result) {
    if (!this.previewSection) return;
    const fi = CURRENCY_INFO[result.fromCurrency];
    const ti = CURRENCY_INFO[result.toCurrency];

    this.previewSection.innerHTML = `
      <div class="conversion-preview">
        <div class="preview-row">
          <span class="preview-label">You send</span>
          <span class="preview-value">${fi.symbol}${result.inputAmount.toLocaleString('en-GB', { minimumFractionDigits: 2 })} <em>${result.fromCurrency}</em></span>
        </div>
        <div class="preview-row preview-row--fee">
          <span class="preview-label">Service fee <small>(${result.feeTierLabel})</small></span>
          <span class="preview-value text-warning">&minus;${fi.symbol}${result.feeAmount.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</span>
        </div>
        <div class="preview-row">
          <span class="preview-label">After fee</span>
          <span class="preview-value">${fi.symbol}${result.amountAfterFee.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</span>
        </div>
        <div class="preview-row preview-row--rate">
          <span class="preview-label">Exchange rate</span>
          <span class="preview-value text-muted">1 ${result.fromCurrency} = ${result.exchangeRate.toFixed(4)} ${result.toCurrency}</span>
        </div>
        <div class="preview-row preview-row--total">
          <span class="preview-label"><strong>Recipient gets</strong></span>
          <span class="preview-value preview-total">${ti.symbol}${result.convertedAmount.toLocaleString('en-GB', { minimumFractionDigits: 2 })} <em>${result.toCurrency}</em></span>
        </div>
      </div>
    `;

    this.previewSection.style.display = 'block';
    this.currentConversion = result;

    if (this.convertBtn) {
      this.convertBtn.disabled = false;
      this.convertBtn.textContent = `Confirm — Convert ${fi.symbol}${result.inputAmount.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`;
    }
  }

  _hidePreview() {
    if (this.previewSection) this.previewSection.style.display = 'none';
    if (this.convertBtn) { this.convertBtn.disabled = true; this.convertBtn.textContent = 'Convert'; }
    this.currentConversion = null;
  }

  async _executeConversion() {
    if (!this.currentConversion) return;

    const user = typeof auth !== 'undefined' ? auth.getCurrentUser() : null;
    if (!user) { showToast('Session expired. Please log in again.', 'error'); return; }

    const amount = parseFloat(this.fromAmountInput.value);
    const from   = this.fromCurrencySelect.value;
    const to     = this.toCurrencySelect.value;

    // Force fresh rate for actual execution
    _rateCache = null;
    const finalResult = calculateConversion(from, to, amount);
    if (!finalResult) return;

    if (typeof setLoading !== 'undefined') setLoading(this.convertBtn, true, 'Processing…');

    try {
      await new Promise(r => setTimeout(r, 800)); // Simulate network latency
      const saved = saveConversion(user.id || user.userID, finalResult);
      this._renderReceipt(finalResult, saved);
      this._loadHistory();
      showToast('Conversion completed successfully!', 'success', 4000, 'Transaction Complete');

      // Reset form
      if (this.fromAmountInput) this.fromAmountInput.value = '';
      this._hidePreview();
    } catch (e) {
      console.error('[CurrencyConverter] Execution error:', e);
      showToast('Conversion failed. Please try again.', 'error');
    } finally {
      if (typeof setLoading !== 'undefined') setLoading(this.convertBtn, false);
      if (this.convertBtn) { this.convertBtn.disabled = true; this.convertBtn.textContent = 'Convert'; }
    }
  }

  _renderReceipt(result, saved) {
    if (!this.receiptSection) return;
    const fi   = CURRENCY_INFO[result.fromCurrency];
    const ti   = CURRENCY_INFO[result.toCurrency];
    const refNo = saved?.id || ('TXN' + Date.now().toString(36).toUpperCase());
    this._lastReceipt = { result, refNo };

    this.receiptSection.innerHTML = `
      <div class="receipt-card">
        <div class="receipt-header">
          <div class="receipt-check">&#10003;</div>
          <h3>Transaction Complete</h3>
          <p class="receipt-ref">Ref: <strong>${refNo}</strong></p>
        </div>
        <div class="receipt-body">
          <div class="receipt-row">
            <span>You sent</span>
            <span>${fi.symbol}${result.inputAmount.toLocaleString('en-GB', { minimumFractionDigits: 2 })} ${result.fromCurrency}</span>
          </div>
          <div class="receipt-row">
            <span>Service fee</span>
            <span>&minus;${fi.symbol}${result.feeAmount.toLocaleString('en-GB', { minimumFractionDigits: 2 })} <small>(${result.feeTierLabel})</small></span>
          </div>
          <div class="receipt-row">
            <span>Exchange rate</span>
            <span>1 ${result.fromCurrency} = ${result.exchangeRate.toFixed(4)} ${result.toCurrency}</span>
          </div>
          <div class="receipt-row receipt-row--highlight">
            <span><strong>Amount received</strong></span>
            <span><strong>${ti.symbol}${result.convertedAmount.toLocaleString('en-GB', { minimumFractionDigits: 2 })} ${result.toCurrency}</strong></span>
          </div>
          <div class="receipt-row">
            <span>Date &amp; Time</span>
            <span>${new Date().toLocaleString('en-GB')}</span>
          </div>
        </div>
        <div class="receipt-footer">
          <button class="btn btn-secondary btn-sm" onclick="currencyUI && currencyUI.downloadReceipt()">
            &#8659; Download Receipt
          </button>
          <button class="btn btn-ghost btn-sm" onclick="currencyUI && currencyUI.closeReceipt()">
            Close
          </button>
        </div>
      </div>
    `;

    this.receiptSection.style.display = 'block';
    this.receiptSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  closeReceipt() {
    if (this.receiptSection) this.receiptSection.style.display = 'none';
  }

  downloadReceipt() {
    if (!this._lastReceipt) return;
    const { result, refNo } = this._lastReceipt;
    const fi = CURRENCY_INFO[result.fromCurrency];
    const ti = CURRENCY_INFO[result.toCurrency];

    const lines = [
      '='.repeat(42),
      '       ENOMY-FINANCES TRANSACTION RECEIPT',
      '='.repeat(42),
      `Reference   : ${refNo}`,
      `Date & Time : ${new Date().toLocaleString('en-GB')}`,
      '-'.repeat(42),
      `From        : ${fi.symbol}${result.inputAmount.toFixed(2)} ${result.fromCurrency}`,
      `Fee         : ${fi.symbol}${result.feeAmount.toFixed(2)} (${result.feeTierLabel})`,
      `Rate        : 1 ${result.fromCurrency} = ${result.exchangeRate.toFixed(4)} ${result.toCurrency}`,
      `Converted   : ${ti.symbol}${result.convertedAmount.toFixed(2)} ${result.toCurrency}`,
      '='.repeat(42),
      'Enomy-Finances | Phonyt Digital Solutions',
      'This is a demonstration receipt only.'
    ].join('\n');

    const blob = new Blob([lines], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `receipt-${refNo}.txt`; a.click();
    URL.revokeObjectURL(url);
  }

  _loadHistory() {
    if (!this.historyContainer) return;
    const user = typeof auth !== 'undefined' ? auth.getCurrentUser() : null;
    if (!user) return;

    const conversions = db.findConversionsByUser(user.id || user.userID, 10);

    if (!conversions.length) {
      this.historyContainer.innerHTML = `
        <div class="empty-state">
          <p class="text-muted">No conversion history yet. Make your first conversion above.</p>
        </div>`;
      return;
    }

    this.historyContainer.innerHTML = `
      <div class="table-responsive">
        <table class="data-table data-table--compact" aria-label="Conversion history">
          <thead>
            <tr>
              <th>Date</th>
              <th>From</th>
              <th>To</th>
              <th>Sent</th>
              <th>Received</th>
              <th>Fee (GBP)</th>
              <th>Rate</th>
            </tr>
          </thead>
          <tbody>
            ${conversions.map(c => {
              const fi = CURRENCY_INFO[c.fromCurrency] || {};
              const ti = CURRENCY_INFO[c.toCurrency]   || {};
              return `
                <tr>
                  <td>${new Date(c.date || c.createdAt).toLocaleDateString('en-GB')}</td>
                  <td>${fi.flag || ''} ${c.fromCurrency}</td>
                  <td>${ti.flag || ''} ${c.toCurrency}</td>
                  <td>${fi.symbol || ''}${parseFloat(c.amount).toFixed(2)}</td>
                  <td>${ti.symbol || ''}${parseFloat(c.convertedAmount).toFixed(2)}</td>
                  <td>£${parseFloat(c.fee).toFixed(2)}</td>
                  <td>${parseFloat(c.exchangeRate).toFixed(4)}</td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  _exportHistory() {
    const user = typeof auth !== 'undefined' ? auth.getCurrentUser() : null;
    if (!user) return;

    const conversions = db.findConversionsByUser(user.id || user.userID, 1000);
    if (!conversions.length) { showToast('No conversion history to export.', 'info'); return; }

    const headers = {
      date: 'Date', fromCurrency: 'From', toCurrency: 'To',
      amount: 'Sent Amount', convertedAmount: 'Received Amount',
      fee: 'Fee (GBP)', exchangeRate: 'Rate', feeTier: 'Fee Tier'
    };
    const data = conversions.map(c => ({
      date:            new Date(c.date || c.createdAt).toLocaleString('en-GB'),
      fromCurrency:    c.fromCurrency,
      toCurrency:      c.toCurrency,
      amount:          c.amount,
      convertedAmount: c.convertedAmount,
      fee:             c.fee,
      exchangeRate:    c.exchangeRate,
      feeTier:         c.feeTier
    }));

    if (typeof exportToCSV !== 'undefined') {
      exportToCSV(data, 'enomy-finances-conversions', headers);
      showToast('Conversion history exported.', 'success');
    }
  }

  _renderFeeGuide() {
    if (!this.feeGuideContainer) return;
    this.feeGuideContainer.innerHTML = `
      <h4 class="fee-guide__title">Fee Structure</h4>
      <table class="fee-guide__table" aria-label="Fee tiers">
        <thead>
          <tr><th>Tier</th><th>GBP Equivalent</th><th>Rate</th></tr>
        </thead>
        <tbody>
          ${FEE_TIERS.map((t, i) => {
            const names = ['Standard', 'Silver', 'Gold', 'Platinum'];
            const range = i < FEE_TIERS.length - 1
              ? `£${t.min.toLocaleString('en-GB')} – £${t.max.toLocaleString('en-GB')}`
              : `£${t.min.toLocaleString('en-GB')}+`;
            return `
              <tr>
                <td><span class="badge badge-tier-${t.tier}">${names[i]}</span></td>
                <td>${range}</td>
                <td><strong>${(t.rate * 100).toFixed(1)}%</strong></td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>
      <p class="fee-guide__note">Fees calculated on GBP equivalent value at time of transaction.</p>
    `;
  }

  _startRateRefresh() {
    this._rateRefreshTimer = setInterval(() => {
      _rateCache = null; // Force new rates
      this._updateRateBar();
      if (this.currentConversion) this._updateLivePreview();

      // Update timestamp text
      const meta = this.rateBar?.querySelector('.rate-meta');
      if (meta) meta.textContent = 'Live rate \u2022 just refreshed';
    }, RATE_REFRESH_MS);
  }

  destroy() {
    clearTimeout(this._debounceTimer);
    clearInterval(this._rateRefreshTimer);
  }
}

// ── Module Singleton ───────────────────────────────────────────

let currencyUI = null;

function initCurrencyConverter(containerId = 'currency-converter-section') {
  currencyUI = new CurrencyConverterUI(containerId);
}

console.log('[Enomy-Finances] currency-converter.js loaded');

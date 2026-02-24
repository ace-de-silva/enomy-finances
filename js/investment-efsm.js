/* ============================================================
   ENOMY-FINANCES | investment-efsm.js
   Investment Quote Generator — Extended Finite State Machine
   ============================================================ */
'use strict';

// ── EFSM State Definitions ─────────────────────────────────────

const EFSM_STATES = {
  INITIAL:         'INITIAL',
  VALIDATING:      'VALIDATING',
  CALCULATING:     'CALCULATING',
  RISK_ASSESSMENT: 'RISK_ASSESSMENT',
  DISPLAY:         'DISPLAY',
  ERROR:           'ERROR',
  SAVED:           'SAVED'
};

const EFSM_TRANSITIONS = {
  INITIAL:         { SUBMIT: 'VALIDATING' },
  VALIDATING:      { VALID: 'CALCULATING', INVALID: 'ERROR' },
  CALCULATING:     { DONE: 'RISK_ASSESSMENT', ERROR: 'ERROR' },
  RISK_ASSESSMENT: { DONE: 'DISPLAY', ERROR: 'ERROR' },
  DISPLAY:         { SAVE: 'SAVED', RESET: 'INITIAL', RECALCULATE: 'VALIDATING' },
  ERROR:           { RESET: 'INITIAL' },
  SAVED:           { RESET: 'INITIAL', NEW: 'INITIAL' }
};

// ── Investment Plan Definitions ────────────────────────────────

const INVESTMENT_PLANS = {
  'basic-savings': {
    id:          'basic-savings',
    name:        'Basic Savings',
    annualRate:  0.035,        // 3.5% AER
    managementFee: 0.005,     // 0.5% annual management fee
    monthlyFee:  5.00,        // £5/month account fee
    minAmount:   500,
    maxAmount:   10000,
    riskLevel:   'Low',
    riskScore:   1,
    description: 'Steady, low-risk savings with guaranteed minimum returns. FSCS-protected up to £85,000.',
    features:    ['Capital protected', 'FSCS insured', 'Flexible withdrawals', 'Monthly statements'],
    icon:        '🏦'
  },
  'savings-plus': {
    id:          'savings-plus',
    name:        'Savings Plan Plus',
    annualRate:  0.072,        // 7.2% AER
    managementFee: 0.010,     // 1.0% annual management fee
    monthlyFee:  12.00,       // £12/month
    minAmount:   1000,
    maxAmount:   50000,
    riskLevel:   'Medium',
    riskScore:   2,
    description: 'Balanced portfolio with enhanced returns. Mix of bonds, equities, and money market funds.',
    features:    ['Diversified portfolio', 'Quarterly rebalancing', 'Online portal access', 'Advisor consultation'],
    icon:        '📈'
  },
  'managed-stock': {
    id:          'managed-stock',
    name:        'Managed Stock Portfolio',
    annualRate:  0.124,        // 12.4% target AER
    managementFee: 0.015,     // 1.5% annual management fee
    monthlyFee:  25.00,       // £25/month
    minAmount:   5000,
    maxAmount:   500000,
    riskLevel:   'High',
    riskScore:   3,
    description: 'Actively managed equity portfolio targeting premium returns. Suitable for experienced investors.',
    features:    ['Active management', 'Dedicated advisor', 'Weekly reporting', 'Tax-loss harvesting'],
    icon:        '🚀'
  }
};

// UK Income Tax bands (2024/25)
const UK_TAX_BANDS = [
  { from: 0,      to: 12570,  rate: 0,    label: 'Personal Allowance' },
  { from: 12571,  to: 50270,  rate: 0.20, label: 'Basic Rate (20%)' },
  { from: 50271,  to: 125140, rate: 0.40, label: 'Higher Rate (40%)' },
  { from: 125141, to: Infinity, rate: 0.45, label: 'Additional Rate (45%)' }
];

const SAVINGS_ALLOWANCE_BASIC  = 1000; // £1,000 for basic rate taxpayers
const SAVINGS_ALLOWANCE_HIGHER = 500;  // £500 for higher rate taxpayers

// ── UK Tax Calculation ─────────────────────────────────────────

/**
 * Calculate UK income tax on savings interest
 * @param {number} interest - Annual gross interest earned
 * @param {number} annualIncome - Approximate annual income (default: basic rate taxpayer)
 * @returns {{ taxDue: number, netInterest: number, band: object, allowance: number }}
 */
function calculateUKTax(interest, annualIncome = 30000) {
  const band = UK_TAX_BANDS.find(b => annualIncome > b.from && annualIncome <= b.to)
    || UK_TAX_BANDS[UK_TAX_BANDS.length - 1];

  const allowance = band.rate === 0.20 ? SAVINGS_ALLOWANCE_BASIC
    : band.rate === 0.40 ? SAVINGS_ALLOWANCE_HIGHER : 0;

  const taxableInterest = Math.max(0, interest - allowance);
  const taxDue          = Math.round(taxableInterest * band.rate * 100) / 100;
  const netInterest     = Math.round((interest - taxDue) * 100) / 100;

  return { taxDue, netInterest, band, allowance, taxableInterest };
}

// ── Core Calculation Engine ────────────────────────────────────

/**
 * Month-by-month compound interest projection
 * @param {number} principal - Initial investment amount
 * @param {object} plan - Plan definition object
 * @param {number} years - Projection period
 * @param {number} annualIncome - For UK tax calculation
 * @returns {object} Full projection data
 */
function projectInvestment(principal, plan, years, annualIncome = 30000) {
  const months          = years * 12;
  const monthlyRate     = plan.annualRate / 12;
  const monthlyMgmtFee = (plan.managementFee * principal) / 12;

  let balance       = principal;
  let totalFees     = 0;
  let totalInterest = 0;
  let totalTax      = 0;

  const schedule = [];

  for (let m = 1; m <= months; m++) {
    const grossInterest = Math.round(balance * monthlyRate * 100) / 100;
    const taxResult     = calculateUKTax(grossInterest * 12, annualIncome);
    const monthlyTax    = Math.round((taxResult.taxDue / 12) * 100) / 100;
    const netInterest   = grossInterest - monthlyTax;
    const fees          = Math.round((plan.monthlyFee + monthlyMgmtFee) * 100) / 100;

    balance       = Math.round((balance + netInterest - fees) * 100) / 100;
    totalInterest = Math.round((totalInterest + grossInterest) * 100) / 100;
    totalFees     = Math.round((totalFees + fees) * 100) / 100;
    totalTax      = Math.round((totalTax + monthlyTax) * 100) / 100;

    if (m % 12 === 0 || m === months) {
      schedule.push({ month: m, year: Math.ceil(m / 12), balance, totalInterest, totalFees, totalTax });
    }
  }

  const grossReturn    = Math.round((balance - principal + totalFees + totalTax) * 100) / 100;
  const netReturn      = Math.round((balance - principal) * 100) / 100;
  const effectiveRate  = Math.round((netReturn / principal / years) * 10000) / 100; // % p.a.

  return {
    principal,
    finalBalance:   balance,
    grossReturn,
    netReturn,
    totalInterest,
    totalFees,
    totalTax,
    effectiveRate,
    years,
    schedule
  };
}

/**
 * Calculate risk-adjusted scenarios (best/base/worst)
 */
function calculateScenarios(principal, plan, annualIncome = 30000) {
  const volatilityFactors = { 1: 0.005, 2: 0.02, 3: 0.045 }; // by risk score
  const vf = volatilityFactors[plan.riskScore] || 0.01;

  const bestPlan  = { ...plan, annualRate: plan.annualRate + vf,       managementFee: plan.managementFee };
  const worstPlan = { ...plan, annualRate: Math.max(0, plan.annualRate - vf), managementFee: plan.managementFee };

  return {
    1:  {
      base:  projectInvestment(principal, plan, 1, annualIncome),
      best:  projectInvestment(principal, bestPlan, 1, annualIncome),
      worst: projectInvestment(principal, worstPlan, 1, annualIncome)
    },
    5:  {
      base:  projectInvestment(principal, plan, 5, annualIncome),
      best:  projectInvestment(principal, bestPlan, 5, annualIncome),
      worst: projectInvestment(principal, worstPlan, 5, annualIncome)
    },
    10: {
      base:  projectInvestment(principal, plan, 10, annualIncome),
      best:  projectInvestment(principal, bestPlan, 10, annualIncome),
      worst: projectInvestment(principal, worstPlan, 10, annualIncome)
    }
  };
}

/**
 * Assess risk profile for the user
 */
function assessRisk(plan, principal) {
  const plan_obj = INVESTMENT_PLANS[plan];
  if (!plan_obj) return { level: 'Unknown', score: 0, warnings: [] };

  const warnings = [];
  if (plan_obj.riskScore === 3 && principal < 10000) warnings.push('High-risk products are best suited for larger investments.');
  if (plan_obj.riskScore >= 2) warnings.push('Past performance is not indicative of future results.');
  warnings.push('Capital at risk. Please read the Key Investor Information Document (KIID).');

  return {
    level:    plan_obj.riskLevel,
    score:    plan_obj.riskScore,
    warnings,
    suitable: true
  };
}

// ── Extended Finite State Machine ─────────────────────────────

class InvestmentEFSM {
  constructor() {
    this.state      = EFSM_STATES.INITIAL;
    this.context    = {};
    this.listeners  = [];
  }

  getState()   { return this.state; }
  getContext() { return { ...this.context }; }

  on(listener) { this.listeners.push(listener); return this; }

  _notify(event, data) {
    this.listeners.forEach(fn => { try { fn(event, this.state, data); } catch (e) { console.error('[EFSM] Listener error:', e); } });
  }

  _transition(event) {
    const allowed = EFSM_TRANSITIONS[this.state];
    if (!allowed || !allowed[event]) {
      console.warn(`[EFSM] Invalid transition: ${this.state} --${event}--> ?`);
      return false;
    }
    const nextState = allowed[event];
    console.log(`[EFSM] ${this.state} --${event}--> ${nextState}`);
    this.state = nextState;
    this._notify('stateChange', { from: this.state, event, to: nextState });
    return true;
  }

  // ── EFSM Actions ────────────────────────────────────────────

  submit(formData) {
    if (this.state !== EFSM_STATES.INITIAL) this.reset();
    this._transition('SUBMIT');
    this._notify('validating', formData);

    const errors = this._validate(formData);
    if (errors.length) {
      this.context.errors = errors;
      this._transition('INVALID');
      this._notify('error', errors);
      return false;
    }

    this.context.input = { ...formData };
    this._transition('VALID');
    this._calculate();
    return true;
  }

  _validate(data) {
    const errors = [];
    const plan   = INVESTMENT_PLANS[data.plan];

    if (!plan) { errors.push('Please select a valid investment plan.'); return errors; }

    const amount = parseFloat(data.amount);
    if (isNaN(amount) || amount < plan.minAmount) {
      errors.push(`Minimum investment for ${plan.name} is £${plan.minAmount.toLocaleString('en-GB')}.`);
    }
    if (amount > plan.maxAmount) {
      errors.push(`Maximum investment for ${plan.name} is £${plan.maxAmount.toLocaleString('en-GB')}.`);
    }
    if (!data.period || ![1, 5, 10].includes(parseInt(data.period))) {
      errors.push('Please select a valid investment period (1, 5, or 10 years).');
    }

    return errors;
  }

  _calculate() {
    this._notify('calculating', this.context.input);
    try {
      const { plan: planId, amount, annualIncome } = this.context.input;
      const plan      = INVESTMENT_PLANS[planId];
      const principal = parseFloat(amount);
      const income    = parseFloat(annualIncome) || 30000;

      const scenarios = calculateScenarios(principal, plan, income);
      this.context.result = { plan, principal, scenarios };

      this._transition('DONE');
      this._assessRisk();
    } catch (e) {
      console.error('[EFSM] Calculation error:', e);
      this.context.errors = ['Calculation failed. Please try again.'];
      this._transition('ERROR');
      this._notify('error', this.context.errors);
    }
  }

  _assessRisk() {
    this._notify('assessing', this.context.result);
    try {
      const { plan, principal } = this.context.result;
      this.context.risk = assessRisk(plan.id, principal);
      this._transition('DONE');
      this._notify('complete', { result: this.context.result, risk: this.context.risk });
    } catch (e) {
      this.context.errors = ['Risk assessment failed.'];
      this._transition('ERROR');
      this._notify('error', this.context.errors);
    }
  }

  save(userId) {
    if (this.state !== EFSM_STATES.DISPLAY) return null;

    const { result, risk, input } = this.context;
    const period   = parseInt(input.period);
    const scenario = result.scenarios[period];

    const record = db.create('investmentQuotes', {
      userID:         userId,
      plan:           result.plan.id,
      planName:       result.plan.name,
      principal:      result.principal,
      period:         period,
      annualRate:     result.plan.annualRate,
      managementFee:  result.plan.managementFee,
      monthlyFee:     result.plan.monthlyFee,
      riskLevel:      risk.level,
      riskScore:      risk.score,
      projections: {
        1:  result.scenarios[1],
        5:  result.scenarios[5],
        10: result.scenarios[10]
      },
      finalBalance:   scenario.base.finalBalance,
      netReturn:      scenario.base.netReturn,
      effectiveRate:  scenario.base.effectiveRate,
      saved:          true,
      generatedDate:  new Date().toISOString()
    });

    db.log(userId, 'INVESTMENT_QUOTE_SAVED',
      `Plan: ${result.plan.name} | Amount: £${result.principal} | Period: ${period}yr`,
      '0.0.0.0'
    );

    this._transition('SAVE');
    this._notify('saved', record);
    return record;
  }

  reset() {
    const prevState = this.state;
    if (EFSM_TRANSITIONS[this.state]?.RESET) this._transition('RESET');
    else this.state = EFSM_STATES.INITIAL;
    this.context = {};
    this._notify('reset', { from: prevState });
  }
}

// ── Investment Quote UI ────────────────────────────────────────

class InvestmentQuoteUI {
  constructor(containerId = 'investment-section') {
    this.container = document.getElementById(containerId);
    if (!this.container) return;

    this.efsm       = new InvestmentEFSM();
    this.chartInst  = null;
    this._init();
  }

  _init() {
    this._bindElements();
    this._bindEFSM();
    this._bindEvents();
    this._renderPlanCards();
    this._loadSavedQuotes();
  }

  _bindElements() {
    const q = sel => this.container.querySelector(sel);
    this.planSelect       = q('#investment-plan');
    this.amountInput      = q('#investment-amount');
    this.periodSelect     = q('#investment-period');
    this.incomeInput      = q('#annual-income');
    this.submitBtn        = q('#calculate-quote-btn');
    this.resetBtn         = q('#reset-quote-btn');
    this.saveBtn          = q('#save-quote-btn');
    this.resultsSection   = q('#investment-results');
    this.errorSection     = q('#investment-errors');
    this.stateIndicator   = q('#efsm-state-badge');
    this.planCardsContainer = q('#plan-cards');
    this.savedQuotesContainer = q('#saved-quotes-list');
    this.amountError      = q('#investment-amount-error');
  }

  _bindEFSM() {
    this.efsm.on((event, state, data) => {
      this._updateStateBadge(state);

      if (event === 'complete') {
        this._renderResults(this.efsm.getContext());
      }
      if (event === 'error') {
        this._renderErrors(data);
      }
      if (event === 'saved') {
        showToast('Quote saved! Your advisor will review it shortly.', 'success', 5000, 'Quote Saved');
        this._loadSavedQuotes();
      }
      if (event === 'reset') {
        this._clearResults();
      }
    });
  }

  _bindEvents() {
    this.planSelect?.addEventListener('change', () => this._onPlanChange());
    this.amountInput?.addEventListener('input', () => this._onAmountInput());
    this.submitBtn?.addEventListener('click', () => this._onSubmit());
    this.resetBtn?.addEventListener('click',  () => this._onReset());
    this.saveBtn?.addEventListener('click',   () => this._onSave());
  }

  _onPlanChange() {
    const planId = this.planSelect?.value;
    const plan   = INVESTMENT_PLANS[planId];
    if (!plan) return;

    // Highlight corresponding plan card
    this.planCardsContainer?.querySelectorAll('.plan-card').forEach(c => {
      c.classList.toggle('plan-card--active', c.dataset.plan === planId);
    });

    // Update amount min/max hint
    if (this.amountInput) {
      this.amountInput.min         = plan.minAmount;
      this.amountInput.max         = plan.maxAmount;
      this.amountInput.placeholder = `£${plan.minAmount.toLocaleString()} – £${plan.maxAmount.toLocaleString()}`;
    }
  }

  _onAmountInput() {
    if (!this.amountError) return;
    const planId = this.planSelect?.value;
    const plan   = INVESTMENT_PLANS[planId];
    const amount = parseFloat(this.amountInput?.value);
    if (!plan || isNaN(amount)) { this.amountError.style.display = 'none'; return; }

    if (amount < plan.minAmount) {
      this.amountError.textContent = `Minimum £${plan.minAmount.toLocaleString('en-GB')} for this plan.`;
      this.amountError.style.display = 'block';
    } else if (amount > plan.maxAmount) {
      this.amountError.textContent = `Maximum £${plan.maxAmount.toLocaleString('en-GB')} for this plan.`;
      this.amountError.style.display = 'block';
    } else {
      this.amountError.style.display = 'none';
    }
  }

  _onSubmit() {
    const formData = {
      plan:         this.planSelect?.value,
      amount:       this.amountInput?.value,
      period:       this.periodSelect?.value,
      annualIncome: this.incomeInput?.value || 30000
    };

    if (typeof setLoading !== 'undefined') setLoading(this.submitBtn, true, 'Calculating…');

    setTimeout(() => {
      this.efsm.submit(formData);
      if (typeof setLoading !== 'undefined') setLoading(this.submitBtn, false);
      if (this.submitBtn) this.submitBtn.textContent = 'Recalculate';
    }, 600);
  }

  _onReset() {
    this.efsm.reset();
    if (this.submitBtn) this.submitBtn.textContent = 'Generate Quote';
    if (this.amountInput) this.amountInput.value = '';
    if (this.planSelect)  this.planSelect.value  = '';
    if (this.periodSelect) this.periodSelect.value = '';
  }

  _onSave() {
    const user = typeof auth !== 'undefined' ? auth.getCurrentUser() : null;
    if (!user) { showToast('Please log in to save quotes.', 'error'); return; }

    if (this.efsm.getState() !== EFSM_STATES.DISPLAY) {
      showToast('Please generate a quote first.', 'info');
      return;
    }

    this.efsm.save(user.id || user.userID);
    this.efsm.state = EFSM_STATES.DISPLAY; // allow re-save if needed
  }

  _updateStateBadge(state) {
    if (!this.stateIndicator) return;
    const colors = {
      INITIAL: 'badge-secondary', VALIDATING: 'badge-warning', CALCULATING: 'badge-info',
      RISK_ASSESSMENT: 'badge-info', DISPLAY: 'badge-success', ERROR: 'badge-danger', SAVED: 'badge-accent'
    };
    this.stateIndicator.className = `badge ${colors[state] || 'badge-secondary'}`;
    this.stateIndicator.textContent = state.replace('_', ' ');
  }

  _renderPlanCards() {
    if (!this.planCardsContainer) return;
    this.planCardsContainer.innerHTML = Object.values(INVESTMENT_PLANS).map(plan => `
      <div class="plan-card" data-plan="${plan.id}" role="button" tabindex="0"
           onclick="investmentUI && investmentUI._selectPlan('${plan.id}')">
        <div class="plan-card__icon">${plan.icon}</div>
        <h3 class="plan-card__name">${plan.name}</h3>
        <div class="plan-card__rate">${(plan.annualRate * 100).toFixed(1)}% <small>AER target</small></div>
        <span class="badge badge-risk-${plan.riskScore}">${plan.riskLevel} Risk</span>
        <p class="plan-card__desc">${plan.description}</p>
        <ul class="plan-card__features">
          ${plan.features.map(f => `<li>${f}</li>`).join('')}
        </ul>
        <div class="plan-card__range">£${plan.minAmount.toLocaleString()} – £${plan.maxAmount.toLocaleString()}</div>
      </div>
    `).join('');
  }

  _selectPlan(planId) {
    if (this.planSelect) { this.planSelect.value = planId; this._onPlanChange(); }
    this.planCardsContainer?.querySelectorAll('.plan-card').forEach(c => {
      c.classList.toggle('plan-card--active', c.dataset.plan === planId);
    });
  }

  _renderResults(context) {
    if (!this.resultsSection) return;
    const { result, risk, input } = context;
    const period     = parseInt(input.period);
    const scenarios  = result.scenarios;

    if (this.errorSection) this.errorSection.style.display = 'none';
    if (this.saveBtn) this.saveBtn.style.display = 'inline-flex';

    this.resultsSection.style.display = 'block';
    this.resultsSection.innerHTML = `
      <div class="results-header">
        <h3>${result.plan.icon} ${result.plan.name} &mdash; ${period}-Year Projection</h3>
        <div class="risk-banner risk-${risk.score}">
          <span class="risk-label">Risk Level: <strong>${risk.level}</strong></span>
          ${risk.warnings.map(w => `<p class="risk-warning">&bull; ${w}</p>`).join('')}
        </div>
      </div>

      <div class="projections-tabs">
        ${[1, 5, 10].map(y => `
          <button class="tab-btn ${y === period ? 'tab-btn--active' : ''}"
                  onclick="investmentUI && investmentUI._switchPeriod(${y})" data-year="${y}">
            ${y} Year${y > 1 ? 's' : ''}
          </button>
        `).join('')}
      </div>

      <div class="projections-grid" id="projections-grid">
        ${this._buildProjectionCard('Worst Case', scenarios[period].worst, 'worst')}
        ${this._buildProjectionCard('Base Case', scenarios[period].base, 'base')}
        ${this._buildProjectionCard('Best Case', scenarios[period].best, 'best')}
      </div>

      <div class="plan-details-summary">
        <h4>Plan Details</h4>
        <div class="details-grid">
          <div class="detail-item">
            <span class="detail-label">Initial Investment</span>
            <span class="detail-value">£${result.principal.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Annual Rate (Target)</span>
            <span class="detail-value">${(result.plan.annualRate * 100).toFixed(1)}% AER</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Management Fee</span>
            <span class="detail-value">${(result.plan.managementFee * 100).toFixed(1)}% p.a.</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Monthly Fee</span>
            <span class="detail-value">£${result.plan.monthlyFee.toFixed(2)}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Total Fees (${period}yr)</span>
            <span class="detail-value text-warning">£${scenarios[period].base.totalFees.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Tax Deducted (est.)</span>
            <span class="detail-value text-warning">£${scenarios[period].base.totalTax.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
      </div>

      <canvas id="investment-growth-chart" class="chart-canvas" height="120" aria-label="Investment growth chart"></canvas>

      <p class="disclaimer-text">
        &dagger; Projections are indicative only. Returns are not guaranteed.
        Past performance is not a reliable indicator of future results.
        Tax treatment depends on individual circumstances and may change.
      </p>
    `;

    this.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    this._renderChart(scenarios, period, result.principal);
  }

  _buildProjectionCard(label, projection, type) {
    const isBase     = type === 'base';
    const returnPct  = ((projection.netReturn / projection.principal) * 100).toFixed(1);
    return `
      <div class="projection-card projection-card--${type} ${isBase ? 'projection-card--featured' : ''}">
        <div class="projection-card__label">${label}</div>
        <div class="projection-card__balance">£${projection.finalBalance.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</div>
        <div class="projection-card__return ${projection.netReturn >= 0 ? 'text-success' : 'text-danger'}">
          ${projection.netReturn >= 0 ? '+' : ''}£${projection.netReturn.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
          (${returnPct >= 0 ? '+' : ''}${returnPct}%)
        </div>
        <div class="projection-card__rate">${projection.effectiveRate.toFixed(2)}% effective p.a.</div>
      </div>
    `;
  }

  _switchPeriod(year) {
    const context = this.efsm.getContext();
    if (!context.result) return;

    // Update active tab
    this.resultsSection.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('tab-btn--active', parseInt(btn.dataset.year) === year);
    });

    // Re-render projection grid
    const grid      = this.resultsSection.querySelector('#projections-grid');
    const scenarios = context.result.scenarios;
    if (grid) {
      grid.innerHTML =
        this._buildProjectionCard('Worst Case', scenarios[year].worst, 'worst') +
        this._buildProjectionCard('Base Case',  scenarios[year].base,  'base')  +
        this._buildProjectionCard('Best Case',  scenarios[year].best,  'best');
    }

    // Update chart
    this._renderChart(scenarios, year, context.result.principal);
  }

  _renderChart(scenarios, period, principal) {
    const canvas = this.resultsSection?.querySelector('#investment-growth-chart');
    if (!canvas || typeof Chart === 'undefined') return;

    if (this.chartInst) { this.chartInst.destroy(); this.chartInst = null; }

    const schedule = scenarios[period].base.schedule;
    const labels   = schedule.map(s => `Year ${s.year}`);
    const baseData = schedule.map(s => s.balance);
    const bestData = scenarios[period].best.schedule.map(s => s.balance);
    const worstData= scenarios[period].worst.schedule.map(s => s.balance);

    this.chartInst = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Best Case',
            data: bestData,
            borderColor: '#28A745',
            backgroundColor: 'rgba(40,167,69,0.08)',
            borderWidth: 2,
            fill: false,
            tension: 0.3,
            pointRadius: 3
          },
          {
            label: 'Base Case',
            data: baseData,
            borderColor: '#003D82',
            backgroundColor: 'rgba(0,61,130,0.1)',
            borderWidth: 3,
            fill: true,
            tension: 0.3,
            pointRadius: 4
          },
          {
            label: 'Worst Case',
            data: worstData,
            borderColor: '#DC3545',
            backgroundColor: 'rgba(220,53,69,0.05)',
            borderWidth: 2,
            fill: false,
            tension: 0.3,
            pointRadius: 3
          },
          {
            label: 'Principal',
            data: schedule.map(() => principal),
            borderColor: '#D4AF37',
            borderWidth: 1,
            borderDash: [6, 3],
            fill: false,
            pointRadius: 0
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'top' },
          tooltip: {
            callbacks: {
              label: ctx => ` £${ctx.raw.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`
            }
          }
        },
        scales: {
          y: {
            ticks: {
              callback: v => '£' + v.toLocaleString('en-GB')
            }
          }
        }
      }
    });
  }

  _renderErrors(errors) {
    if (!this.errorSection) return;
    this.errorSection.innerHTML = `
      <div class="alert alert-danger" role="alert">
        <strong>Please correct the following:</strong>
        <ul>${Array.isArray(errors) ? errors.map(e => `<li>${e}</li>`).join('') : `<li>${errors}</li>`}</ul>
      </div>`;
    this.errorSection.style.display = 'block';
    if (this.resultsSection) this.resultsSection.style.display = 'none';
  }

  _clearResults() {
    if (this.resultsSection) { this.resultsSection.style.display = 'none'; this.resultsSection.innerHTML = ''; }
    if (this.errorSection)   { this.errorSection.style.display = 'none';   this.errorSection.innerHTML   = ''; }
    if (this.saveBtn)        { this.saveBtn.style.display = 'none'; }
    if (this.chartInst)      { this.chartInst.destroy(); this.chartInst = null; }
  }

  _loadSavedQuotes() {
    if (!this.savedQuotesContainer) return;
    const user = typeof auth !== 'undefined' ? auth.getCurrentUser() : null;
    if (!user) return;

    const quotes = db.findSavedQuotes(user.id || user.userID);

    if (!quotes.length) {
      this.savedQuotesContainer.innerHTML = `
        <p class="text-muted">No saved quotes yet. Generate and save a quote above.</p>`;
      return;
    }

    this.savedQuotesContainer.innerHTML = quotes.map(q => {
      const plan = INVESTMENT_PLANS[q.plan] || {};
      const proj = q.projections?.[q.period]?.base || {};
      return `
        <div class="saved-quote-card">
          <div class="saved-quote-card__header">
            <span>${plan.icon || '📋'} ${q.planName}</span>
            <span class="badge badge-risk-${q.riskScore}">${q.riskLevel} Risk</span>
          </div>
          <div class="saved-quote-card__body">
            <div class="sq-row"><span>Investment</span><span>£${parseFloat(q.principal).toLocaleString('en-GB', { minimumFractionDigits: 2 })}</span></div>
            <div class="sq-row"><span>Period</span><span>${q.period} year${q.period > 1 ? 's' : ''}</span></div>
            <div class="sq-row"><span>Projected Balance</span><span class="text-success">£${parseFloat(q.finalBalance || proj.finalBalance || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}</span></div>
            <div class="sq-row"><span>Effective Rate</span><span>${parseFloat(q.effectiveRate || proj.effectiveRate || 0).toFixed(2)}% p.a.</span></div>
          </div>
          <div class="saved-quote-card__footer">
            <span class="text-muted">${new Date(q.generatedDate || q.createdAt).toLocaleDateString('en-GB')}</span>
            ${q.advisorReviewed ? '<span class="badge badge-success">Reviewed</span>' : '<span class="badge badge-warning">Pending Review</span>'}
          </div>
        </div>`;
    }).join('');
  }
}

// ── Module Singleton ───────────────────────────────────────────

let investmentUI = null;

function initInvestmentModule(containerId = 'investment-section') {
  investmentUI = new InvestmentQuoteUI(containerId);
}

console.log('[Enomy-Finances] investment-efsm.js loaded');

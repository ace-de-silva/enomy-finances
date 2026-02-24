/* ============================================================
   ENOMY-FINANCES | mortgage-calculator.js
   Mortgage Calculator — Annuity Formula + Amortization Schedule
   ============================================================ */
'use strict';

// ── Constants ──────────────────────────────────────────────────

const MORTGAGE_CONFIG = {
  minLoanAmount:    10000,
  maxLoanAmount:    2000000,
  minProperty:      50000,
  maxProperty:      5000000,
  minTermYears:     5,
  maxTermYears:     35,
  minRate:          0.5,   // % per annum
  maxRate:          25,    // % per annum
  minDepositPct:    5,     // % of property value
  ltvWarning:       80,    // LTV % above which PMI/warning shown
  ltvHigh:          90     // LTV % considered high risk
};

const MORTGAGE_TYPES = {
  repayment:      { label: 'Repayment', description: 'Capital + interest each month. Balance reaches zero at end of term.' },
  'interest-only': { label: 'Interest Only', description: 'Pay only interest; full balance due at term end. Requires separate repayment strategy.' }
};

// ── Core Calculation ───────────────────────────────────────────

/**
 * Standard annuity formula for monthly mortgage payment
 *   M = P * [r(1+r)^n] / [(1+r)^n - 1]
 *
 * @param {number} principal  - Loan amount (£)
 * @param {number} annualRate - Interest rate (% p.a.)
 * @param {number} termYears  - Mortgage term in years
 * @param {string} type       - 'repayment' | 'interest-only'
 * @returns {number} Monthly payment
 */
function calculateMonthlyPayment(principal, annualRate, termYears, type = 'repayment') {
  const r = annualRate / 100 / 12;  // Monthly rate
  const n = termYears * 12;          // Total payments

  if (type === 'interest-only') {
    return Math.round(principal * r * 100) / 100;
  }

  if (r === 0) return Math.round((principal / n) * 100) / 100;

  const factor = Math.pow(1 + r, n);
  return Math.round((principal * r * factor) / (factor - 1) * 100) / 100;
}

/**
 * Build full amortization schedule (monthly breakdown)
 * Returns yearly summary for display performance; full schedule on demand
 *
 * @param {number} principal
 * @param {number} annualRate
 * @param {number} termYears
 * @param {string} type
 * @returns {object} { schedule (yearly), fullSchedule (monthly), totals }
 */
function buildAmortizationSchedule(principal, annualRate, termYears, type = 'repayment') {
  const r               = annualRate / 100 / 12;
  const monthlyPayment  = calculateMonthlyPayment(principal, annualRate, termYears, type);
  const totalMonths     = termYears * 12;

  let balance         = principal;
  let totalInterest   = 0;
  let totalPrincipal  = 0;

  const fullSchedule  = [];
  const yearlySummary = [];

  let yearInterest  = 0;
  let yearPrincipal = 0;

  for (let month = 1; month <= totalMonths; month++) {
    const interestPayment = Math.round(balance * r * 100) / 100;
    let   principalPayment;

    if (type === 'interest-only') {
      principalPayment = 0;
      balance = Math.round((balance + interestPayment - monthlyPayment) * 100) / 100;
    } else {
      principalPayment = Math.round((monthlyPayment - interestPayment) * 100) / 100;
      balance          = Math.round((balance - principalPayment) * 100) / 100;
      if (balance < 0) balance = 0;
    }

    totalInterest   = Math.round((totalInterest + interestPayment) * 100) / 100;
    totalPrincipal  = Math.round((totalPrincipal + principalPayment) * 100) / 100;
    yearInterest    = Math.round((yearInterest + interestPayment) * 100) / 100;
    yearPrincipal   = Math.round((yearPrincipal + principalPayment) * 100) / 100;

    fullSchedule.push({
      month, balance, interest: interestPayment, principal: principalPayment, payment: monthlyPayment
    });

    if (month % 12 === 0) {
      const year = month / 12;
      yearlySummary.push({
        year,
        balance,
        yearlyInterest:   yearInterest,
        yearlyPrincipal:  yearPrincipal,
        yearlyPayment:    Math.round((yearInterest + yearPrincipal) * 100) / 100,
        equityPct:        Math.round(((principal - balance) / principal) * 10000) / 100
      });
      yearInterest  = 0;
      yearPrincipal = 0;
    }
  }

  const totalRepayable = Math.round((principal + totalInterest) * 100) / 100;
  const totalCost      = Math.round(totalInterest * 100) / 100;
  const finalBalance   = type === 'interest-only' ? principal : 0;

  return {
    monthlyPayment,
    totalRepayable,
    totalCost,
    totalInterest,
    totalPrincipal,
    finalBalance,
    schedule:     yearlySummary,
    fullSchedule
  };
}

/**
 * Calculate Loan-to-Value ratio
 */
function calculateLTV(loanAmount, propertyValue) {
  return Math.round((loanAmount / propertyValue) * 10000) / 100; // %
}

/**
 * Calculate stamp duty (England rates, 2024/25)
 */
function calculateStampDuty(propertyValue, firstTimeBuyer = false) {
  const bands = firstTimeBuyer
    ? [
        { from: 0,      to: 425000,  rate: 0 },
        { from: 425001, to: 625000,  rate: 0.05 },
        { from: 625001, to: Infinity, rate: 0.10 }
      ]
    : [
        { from: 0,      to: 250000,  rate: 0 },
        { from: 250001, to: 925000,  rate: 0.05 },
        { from: 925001, to: 1500000, rate: 0.10 },
        { from: 1500001, to: Infinity, rate: 0.12 }
      ];

  let duty   = 0;
  let remaining = propertyValue;

  for (const band of bands) {
    if (remaining <= 0 || propertyValue < band.from) break;
    const taxable = Math.min(remaining, band.to === Infinity ? remaining : band.to - band.from + 1);
    duty += taxable * band.rate;
    remaining -= taxable;
  }

  // First-time buyer relief: no SDLT if <= £425,000; reduced if £425,001–£625,000; no relief above £625,000
  if (firstTimeBuyer && propertyValue > 625000) {
    // Full standard rates apply above £625,000 for FTBs
    return calculateStampDuty(propertyValue, false);
  }

  return Math.round(duty * 100) / 100;
}

// ── Validation ─────────────────────────────────────────────────

function validateMortgageInputs(data) {
  const errors = [];
  const c = MORTGAGE_CONFIG;

  const property = parseFloat(data.propertyValue);
  const deposit  = parseFloat(data.deposit);
  const rate     = parseFloat(data.interestRate);
  const term     = parseInt(data.term);

  if (isNaN(property) || property < c.minProperty || property > c.maxProperty) {
    errors.push(`Property value must be £${c.minProperty.toLocaleString('en-GB')} – £${c.maxProperty.toLocaleString('en-GB')}.`);
  }
  if (isNaN(deposit) || deposit < 0) {
    errors.push('Please enter a valid deposit amount.');
  } else if (!isNaN(property) && deposit >= property) {
    errors.push('Deposit cannot exceed the property value.');
  } else if (!isNaN(property) && (deposit / property) * 100 < c.minDepositPct) {
    errors.push(`Minimum deposit is ${c.minDepositPct}% of property value (£${Math.ceil(property * c.minDepositPct / 100).toLocaleString('en-GB')}).`);
  }

  if (isNaN(rate) || rate < c.minRate || rate > c.maxRate) {
    errors.push(`Interest rate must be between ${c.minRate}% and ${c.maxRate}%.`);
  }
  if (isNaN(term) || term < c.minTermYears || term > c.maxTermYears) {
    errors.push(`Mortgage term must be between ${c.minTermYears} and ${c.maxTermYears} years.`);
  }

  const loanAmount = !isNaN(property) && !isNaN(deposit) ? property - deposit : 0;
  if (loanAmount > 0 && (loanAmount < c.minLoanAmount || loanAmount > c.maxLoanAmount)) {
    errors.push(`Loan amount (£${loanAmount.toLocaleString('en-GB')}) must be £${c.minLoanAmount.toLocaleString('en-GB')} – £${c.maxLoanAmount.toLocaleString('en-GB')}.`);
  }

  return errors;
}

// ── Mortgage Calculator UI ─────────────────────────────────────

class MortgageCalculatorUI {
  constructor(containerId = 'mortgage-section') {
    this.container = document.getElementById(containerId);
    if (!this.container) return;

    this.amortChart   = null;
    this.currentCalc  = null;
    this._init();
  }

  _init() {
    this._bindElements();
    this._bindEvents();
    this._updateLTVIndicator(0, 0);
  }

  _bindElements() {
    const q = sel => this.container.querySelector(sel);
    this.propertyInput    = q('#property-value');
    this.depositInput     = q('#deposit-amount');
    this.rateInput        = q('#interest-rate');
    this.termInput        = q('#mortgage-term');
    this.typeSelect       = q('#mortgage-type');
    this.ftbCheckbox      = q('#first-time-buyer');
    this.calculateBtn     = q('#calculate-mortgage-btn');
    this.resetBtn         = q('#reset-mortgage-btn');
    this.resultsSection   = q('#mortgage-results');
    this.errorSection     = q('#mortgage-errors');
    this.ltvBar           = q('#ltv-bar-fill');
    this.ltvLabel         = q('#ltv-label');
    this.ltvSection       = q('#ltv-indicator');
    this.depositPctLabel  = q('#deposit-pct-label');
    this.loanAmountLabel  = q('#loan-amount-label');
  }

  _bindEvents() {
    [this.propertyInput, this.depositInput, this.rateInput, this.termInput].forEach(el => {
      el?.addEventListener('input', () => this._onInputChange());
    });
    this.calculateBtn?.addEventListener('click', () => this._calculate());
    this.resetBtn?.addEventListener('click',     () => this._reset());

    // Range inputs (if present)
    const rateRange = this.container.querySelector('#interest-rate-range');
    const termRange = this.container.querySelector('#mortgage-term-range');
    rateRange?.addEventListener('input', e => { if (this.rateInput) { this.rateInput.value = e.target.value; this._onInputChange(); }});
    termRange?.addEventListener('input', e => { if (this.termInput) { this.termInput.value = e.target.value; this._onInputChange(); }});
  }

  _onInputChange() {
    const property = parseFloat(this.propertyInput?.value) || 0;
    const deposit  = parseFloat(this.depositInput?.value) || 0;
    const loan     = property - deposit;

    this._updateLTVIndicator(loan, property);

    // Update helper labels
    if (this.depositPctLabel && property > 0) {
      const pct = Math.round((deposit / property) * 10000) / 100;
      this.depositPctLabel.textContent = `${pct.toFixed(1)}% of property value`;
    }
    if (this.loanAmountLabel && loan > 0) {
      this.loanAmountLabel.textContent = `Loan: £${loan.toLocaleString('en-GB', { minimumFractionDigits: 0 })}`;
    }
  }

  _updateLTVIndicator(loanAmount, propertyValue) {
    if (!this.ltvBar || !this.ltvLabel) return;
    if (!propertyValue || !loanAmount || loanAmount <= 0) {
      this.ltvBar.style.width = '0%';
      this.ltvBar.style.backgroundColor = 'var(--color-primary)';
      this.ltvLabel.textContent = 'LTV: —';
      return;
    }

    const ltv    = calculateLTV(loanAmount, propertyValue);
    const capped = Math.min(ltv, 100);

    this.ltvBar.style.width = capped + '%';
    this.ltvBar.style.backgroundColor =
      ltv >= MORTGAGE_CONFIG.ltvHigh    ? '#DC3545' :
      ltv >= MORTGAGE_CONFIG.ltvWarning ? '#FFC107' : '#28A745';
    this.ltvLabel.textContent = `LTV: ${ltv.toFixed(1)}%`;

    if (this.ltvSection) {
      this.ltvSection.title =
        ltv >= MORTGAGE_CONFIG.ltvHigh    ? 'High LTV — lenders may require mortgage insurance' :
        ltv >= MORTGAGE_CONFIG.ltvWarning ? 'Elevated LTV — consider increasing deposit for better rates' :
                                            'Good LTV ratio';
    }
  }

  _calculate() {
    if (typeof setLoading !== 'undefined') setLoading(this.calculateBtn, true, 'Calculating…');

    setTimeout(() => {
      const data = {
        propertyValue: this.propertyInput?.value,
        deposit:       this.depositInput?.value,
        interestRate:  this.rateInput?.value,
        term:          this.termInput?.value,
        type:          this.typeSelect?.value || 'repayment',
        firstTimeBuyer: this.ftbCheckbox?.checked || false
      };

      const errors = validateMortgageInputs(data);
      if (errors.length) {
        this._renderErrors(errors);
        if (typeof setLoading !== 'undefined') setLoading(this.calculateBtn, false);
        return;
      }

      const property  = parseFloat(data.propertyValue);
      const deposit   = parseFloat(data.deposit);
      const rate      = parseFloat(data.interestRate);
      const term      = parseInt(data.term);
      const loanAmount = property - deposit;

      const result     = buildAmortizationSchedule(loanAmount, rate, term, data.type);
      const ltv        = calculateLTV(loanAmount, property);
      const stampDuty  = calculateStampDuty(property, data.firstTimeBuyer);

      this.currentCalc = { ...result, loanAmount, property, deposit, rate, term, ltv, stampDuty, type: data.type };

      this._renderResults(this.currentCalc);
      this._updateLTVIndicator(loanAmount, property);

      if (typeof setLoading !== 'undefined') setLoading(this.calculateBtn, false);
      if (this.calculateBtn) this.calculateBtn.textContent = 'Recalculate';
    }, 400);
  }

  _renderResults(calc) {
    if (!this.resultsSection) return;
    if (this.errorSection) this.errorSection.style.display = 'none';

    const ltvClass = calc.ltv >= MORTGAGE_CONFIG.ltvHigh    ? 'text-danger' :
                     calc.ltv >= MORTGAGE_CONFIG.ltvWarning ? 'text-warning' : 'text-success';
    const typeInfo = MORTGAGE_TYPES[calc.type] || MORTGAGE_TYPES.repayment;

    this.resultsSection.style.display = 'block';
    this.resultsSection.innerHTML = `
      <div class="mortgage-summary">
        <div class="mortgage-stat-card mortgage-stat-card--primary">
          <div class="stat-label">Monthly Payment</div>
          <div class="stat-value">£${calc.monthlyPayment.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</div>
          <div class="stat-note">${typeInfo.label}</div>
        </div>
        <div class="mortgage-stat-card">
          <div class="stat-label">Total Repayable</div>
          <div class="stat-value">£${calc.totalRepayable.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</div>
          <div class="stat-note">${calc.type === 'interest-only' ? 'Plus £' + calc.loanAmount.toLocaleString('en-GB') + ' at term end' : 'Over ' + calc.term + ' years'}</div>
        </div>
        <div class="mortgage-stat-card">
          <div class="stat-label">Total Interest Cost</div>
          <div class="stat-value text-warning">£${calc.totalInterest.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</div>
          <div class="stat-note">${((calc.totalInterest / calc.loanAmount) * 100).toFixed(1)}% of loan</div>
        </div>
        <div class="mortgage-stat-card">
          <div class="stat-label">LTV Ratio</div>
          <div class="stat-value ${ltvClass}">${calc.ltv.toFixed(1)}%</div>
          <div class="stat-note">${calc.ltv >= MORTGAGE_CONFIG.ltvWarning ? 'Consider larger deposit' : 'Good ratio'}</div>
        </div>
      </div>

      <div class="mortgage-breakdown">
        <div class="breakdown-item">
          <span>Property Value</span>
          <span>£${calc.property.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</span>
        </div>
        <div class="breakdown-item">
          <span>Deposit (${((calc.deposit / calc.property) * 100).toFixed(1)}%)</span>
          <span>£${calc.deposit.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</span>
        </div>
        <div class="breakdown-item">
          <span>Loan Amount</span>
          <span>£${calc.loanAmount.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</span>
        </div>
        <div class="breakdown-item">
          <span>Interest Rate</span>
          <span>${calc.rate}% p.a.</span>
        </div>
        <div class="breakdown-item">
          <span>Term</span>
          <span>${calc.term} years (${calc.term * 12} payments)</span>
        </div>
        <div class="breakdown-item">
          <span>Stamp Duty (est.)</span>
          <span>${calc.stampDuty > 0 ? '£' + calc.stampDuty.toLocaleString('en-GB', { minimumFractionDigits: 2 }) : 'None (FTB relief)'}</span>
        </div>
      </div>

      <div class="chart-section">
        <h4>Amortization Schedule</h4>
        <canvas id="amortization-chart" class="chart-canvas" height="120" aria-label="Amortization chart"></canvas>
      </div>

      <div class="amortization-table-wrapper">
        <h4>Yearly Breakdown</h4>
        <div class="table-responsive">
          <table class="data-table data-table--compact" aria-label="Yearly amortization schedule">
            <thead>
              <tr>
                <th>Year</th>
                <th>Monthly Payment</th>
                <th>Interest Paid</th>
                <th>Principal Paid</th>
                <th>Outstanding Balance</th>
                <th>Equity</th>
              </tr>
            </thead>
            <tbody>
              ${calc.schedule.map(row => `
                <tr>
                  <td>${row.year}</td>
                  <td>£${calc.monthlyPayment.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</td>
                  <td class="text-warning">£${row.yearlyInterest.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</td>
                  <td class="text-success">£${row.yearlyPrincipal.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</td>
                  <td>£${row.balance.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</td>
                  <td>${row.equityPct.toFixed(1)}%</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <button class="btn btn-secondary btn-sm" onclick="mortgageUI && mortgageUI.exportAmortization()">
        &#8659; Export Amortization (CSV)
      </button>

      <p class="disclaimer-text">
        These calculations are for illustrative purposes only and do not constitute financial advice.
        Actual mortgage rates and terms are subject to lender approval and individual circumstances.
      </p>
    `;

    this.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    this._renderAmortChart(calc);
  }

  _renderAmortChart(calc) {
    const canvas = this.resultsSection.querySelector('#amortization-chart');
    if (!canvas || typeof Chart === 'undefined') return;

    if (this.amortChart) { this.amortChart.destroy(); this.amortChart = null; }

    const labels      = calc.schedule.map(r => `Year ${r.year}`);
    const interest    = calc.schedule.map(r => r.yearlyInterest);
    const principalPd = calc.schedule.map(r => r.yearlyPrincipal);
    const balances    = calc.schedule.map(r => r.balance);

    this.amortChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Interest',
            data: interest,
            backgroundColor: 'rgba(212,175,55,0.8)',
            stack: 'payments'
          },
          {
            label: 'Principal',
            data: principalPd,
            backgroundColor: 'rgba(0,61,130,0.8)',
            stack: 'payments'
          },
          {
            label: 'Remaining Balance',
            data: balances,
            type: 'line',
            borderColor: '#DC3545',
            backgroundColor: 'transparent',
            yAxisID: 'y1',
            tension: 0.3,
            pointRadius: 2,
            borderWidth: 2
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'top' },
          tooltip: {
            callbacks: { label: ctx => ` £${ctx.raw.toLocaleString('en-GB', { minimumFractionDigits: 2 })}` }
          }
        },
        scales: {
          y: {
            stacked: true,
            ticks: { callback: v => '£' + v.toLocaleString('en-GB') },
            title: { display: true, text: 'Annual Payment (£)' }
          },
          y1: {
            position: 'right',
            ticks: { callback: v => '£' + v.toLocaleString('en-GB') },
            title: { display: true, text: 'Outstanding Balance (£)' },
            grid: { drawOnChartArea: false }
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
        <ul>${errors.map(e => `<li>${e}</li>`).join('')}</ul>
      </div>`;
    this.errorSection.style.display = 'block';
    if (this.resultsSection) this.resultsSection.style.display = 'none';
    this.errorSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  _reset() {
    [this.propertyInput, this.depositInput, this.rateInput, this.termInput].forEach(el => {
      if (el) el.value = '';
    });
    if (this.typeSelect) this.typeSelect.value = 'repayment';
    if (this.ftbCheckbox) this.ftbCheckbox.checked = false;
    if (this.resultsSection) { this.resultsSection.style.display = 'none'; this.resultsSection.innerHTML = ''; }
    if (this.errorSection) this.errorSection.style.display = 'none';
    if (this.amortChart) { this.amortChart.destroy(); this.amortChart = null; }
    if (this.calculateBtn) this.calculateBtn.textContent = 'Calculate';
    this._updateLTVIndicator(0, 0);
    if (this.depositPctLabel) this.depositPctLabel.textContent = '';
    if (this.loanAmountLabel) this.loanAmountLabel.textContent = '';
    this.currentCalc = null;
  }

  exportAmortization() {
    if (!this.currentCalc) return;
    const calc = this.currentCalc;

    const rows = calc.schedule.map(r => [
      r.year,
      calc.monthlyPayment.toFixed(2),
      r.yearlyInterest.toFixed(2),
      r.yearlyPrincipal.toFixed(2),
      r.balance.toFixed(2),
      r.equityPct.toFixed(1) + '%'
    ]);

    const header = ['Year', 'Monthly Payment (£)', 'Interest (£)', 'Principal (£)', 'Balance (£)', 'Equity (%)'];
    const summary = [
      ['--- Mortgage Summary ---'],
      ['Property Value', `£${calc.property.toFixed(2)}`],
      ['Loan Amount', `£${calc.loanAmount.toFixed(2)}`],
      ['Interest Rate', `${calc.rate}%`],
      ['Term', `${calc.term} years`],
      ['Monthly Payment', `£${calc.monthlyPayment.toFixed(2)}`],
      ['Total Repayable', `£${calc.totalRepayable.toFixed(2)}`],
      ['Total Interest', `£${calc.totalInterest.toFixed(2)}`],
      ['---']
    ];

    const allRows = [...summary, header, ...rows];
    const csv = '\uFEFF' + allRows.map(row => row.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'enomy-mortgage-schedule.csv'; a.click();
    URL.revokeObjectURL(url);

    showToast('Amortization schedule exported.', 'success');
  }

  destroy() {
    if (this.amortChart) { this.amortChart.destroy(); this.amortChart = null; }
  }
}

// ── Module Singleton ───────────────────────────────────────────

let mortgageUI = null;

function initMortgageCalculator(containerId = 'mortgage-section') {
  mortgageUI = new MortgageCalculatorUI(containerId);
}

console.log('[Enomy-Finances] mortgage-calculator.js loaded');

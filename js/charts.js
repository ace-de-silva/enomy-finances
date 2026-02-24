/* ============================================================
   ENOMY-FINANCES | charts.js
   Chart.js v4 Wrapper — All portal visualizations
   ============================================================ */
'use strict';

// ── Brand Color Palette ────────────────────────────────────────

const CHART_COLORS = {
  primary:   '#003D82',
  teal:      '#008B8B',
  gold:      '#D4AF37',
  success:   '#28A745',
  warning:   '#FFC107',
  danger:    '#DC3545',
  info:      '#17A2B8',
  accent:    '#20c997',
  muted:     '#6C757D',
  // Transparent variants
  primaryT:  'rgba(0,61,130,0.15)',
  tealT:     'rgba(0,139,139,0.15)',
  goldT:     'rgba(212,175,55,0.15)',
  successT:  'rgba(40,167,69,0.15)',
  warningT:  'rgba(255,193,7,0.15)',
  dangerT:   'rgba(220,53,69,0.15)'
};

// ── Global Chart Defaults ──────────────────────────────────────

function applyChartDefaults() {
  if (typeof Chart === 'undefined') return;
  Chart.defaults.font.family = "'Inter', 'Segoe UI', sans-serif";
  Chart.defaults.font.size   = 12;
  Chart.defaults.color       = '#4A5568';
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.legend.labels.padding = 16;
  Chart.defaults.animation.duration = 600;
  Chart.defaults.responsive = true;
  Chart.defaults.maintainAspectRatio = true;
}

// ── Chart Registry — track instances for destroy ──────────────

const _chartRegistry = {};

function _destroyChart(id) {
  if (_chartRegistry[id]) {
    _chartRegistry[id].destroy();
    delete _chartRegistry[id];
  }
}

function _register(id, instance) {
  _destroyChart(id); // destroy any existing chart with same id
  _chartRegistry[id] = instance;
  return instance;
}

// ── Helpers ────────────────────────────────────────────────────

function _getCanvas(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) { console.warn('[Charts] Canvas not found:', canvasId); return null; }
  if (typeof Chart === 'undefined') { console.warn('[Charts] Chart.js not loaded'); return null; }
  return canvas;
}

// ── 1. Investment Growth Chart (multi-line: best/base/worst) ──

/**
 * Render investment growth projection
 * @param {string} canvasId
 * @param {object} scenarios - { 1: {base, best, worst}, 5: ..., 10: ... }
 * @param {number} period - 1, 5, or 10
 * @param {number} principal
 */
function renderInvestmentGrowthChart(canvasId, scenarios, period, principal) {
  const canvas = _getCanvas(canvasId);
  if (!canvas) return null;

  const s       = scenarios[period];
  const labels  = s.base.schedule.map(r => `Year ${r.year}`);

  const chart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Best Case',
          data:  s.best.schedule.map(r => r.balance),
          borderColor: CHART_COLORS.success,
          backgroundColor: CHART_COLORS.successT,
          borderWidth: 2,
          fill: false,
          tension: 0.35,
          pointRadius: 3,
          pointHoverRadius: 5
        },
        {
          label: 'Base Case',
          data:  s.base.schedule.map(r => r.balance),
          borderColor: CHART_COLORS.primary,
          backgroundColor: CHART_COLORS.primaryT,
          borderWidth: 3,
          fill: true,
          tension: 0.35,
          pointRadius: 4,
          pointHoverRadius: 6
        },
        {
          label: 'Worst Case',
          data:  s.worst.schedule.map(r => r.balance),
          borderColor: CHART_COLORS.danger,
          backgroundColor: CHART_COLORS.dangerT,
          borderWidth: 2,
          fill: false,
          tension: 0.35,
          pointRadius: 3,
          pointHoverRadius: 5
        },
        {
          label: 'Initial Investment',
          data:  s.base.schedule.map(() => principal),
          borderColor: CHART_COLORS.gold,
          borderWidth: 1.5,
          borderDash: [6, 4],
          fill: false,
          pointRadius: 0,
          tension: 0
        }
      ]
    },
    options: {
      responsive: true,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { position: 'top' },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: £${ctx.raw.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`
          }
        }
      },
      scales: {
        y: {
          ticks: { callback: v => '£' + v.toLocaleString('en-GB') },
          title: { display: true, text: 'Portfolio Value (£)' }
        },
        x: {
          title: { display: true, text: 'Year' }
        }
      }
    }
  });

  return _register(canvasId, chart);
}

// ── 2. Currency Volume Bar Chart ──────────────────────────────

/**
 * Render monthly currency conversion volume
 * @param {string} canvasId
 * @param {Array} conversions - DB records
 */
function renderCurrencyVolumeChart(canvasId, conversions) {
  const canvas = _getCanvas(canvasId);
  if (!canvas) return null;

  // Group by month (last 6 months)
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    months.push({ label: d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }), year: d.getFullYear(), month: d.getMonth() });
  }

  const volumeData = months.map(m =>
    conversions
      .filter(c => {
        const d = new Date(c.date || c.createdAt);
        return d.getFullYear() === m.year && d.getMonth() === m.month;
      })
      .reduce((sum, c) => sum + (parseFloat(c.gbpEquivalent) || parseFloat(c.amount) || 0), 0)
  );

  const countData = months.map(m =>
    conversions.filter(c => {
      const d = new Date(c.date || c.createdAt);
      return d.getFullYear() === m.year && d.getMonth() === m.month;
    }).length
  );

  const chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: months.map(m => m.label),
      datasets: [
        {
          label: 'Volume (£GBP)',
          data: volumeData,
          backgroundColor: CHART_COLORS.primary,
          borderRadius: 4,
          yAxisID: 'y'
        },
        {
          label: 'Transactions',
          data: countData,
          type: 'line',
          borderColor: CHART_COLORS.gold,
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 4,
          yAxisID: 'y1',
          tension: 0.3
        }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'top' } },
      scales: {
        y: {
          ticks: { callback: v => '£' + v.toLocaleString('en-GB') },
          title: { display: true, text: 'Volume (£)' }
        },
        y1: {
          position: 'right',
          title: { display: true, text: 'Transactions' },
          grid: { drawOnChartArea: false }
        }
      }
    }
  });

  return _register(canvasId, chart);
}

// ── 3. Investment Plan Distribution (Doughnut) ────────────────

/**
 * Render plan type distribution doughnut
 */
function renderInvestmentTypesChart(canvasId, quotes) {
  const canvas = _getCanvas(canvasId);
  if (!canvas) return null;

  const counts = { 'basic-savings': 0, 'savings-plus': 0, 'managed-stock': 0 };
  quotes.forEach(q => { if (counts[q.plan] !== undefined) counts[q.plan]++; });

  const chart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['Basic Savings', 'Savings Plan Plus', 'Managed Stock'],
      datasets: [{
        data: Object.values(counts),
        backgroundColor: [CHART_COLORS.teal, CHART_COLORS.primary, CHART_COLORS.gold],
        borderWidth: 2,
        borderColor: '#fff',
        hoverOffset: 8
      }]
    },
    options: {
      responsive: true,
      cutout: '60%',
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${ctx.raw} quote${ctx.raw !== 1 ? 's' : ''}`
          }
        }
      }
    }
  });

  return _register(canvasId, chart);
}

// ── 4. Revenue Trend Line Chart ───────────────────────────────

/**
 * Render monthly fee revenue trend
 */
function renderRevenueTrendChart(canvasId, conversions) {
  const canvas = _getCanvas(canvasId);
  if (!canvas) return null;

  // Last 12 months
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    months.push({ label: d.toLocaleDateString('en-GB', { month: 'short' }), year: d.getFullYear(), month: d.getMonth() });
  }

  const revenueData = months.map(m =>
    conversions
      .filter(c => {
        const d = new Date(c.date || c.createdAt);
        return d.getFullYear() === m.year && d.getMonth() === m.month;
      })
      .reduce((sum, c) => sum + (parseFloat(c.fee) || 0), 0)
  );

  const chart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: months.map(m => m.label),
      datasets: [{
        label: 'Fee Revenue (£)',
        data: revenueData,
        borderColor: CHART_COLORS.teal,
        backgroundColor: CHART_COLORS.tealT,
        borderWidth: 2.5,
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointBackgroundColor: CHART_COLORS.teal,
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          ticks: { callback: v => '£' + v.toFixed(2) },
          title: { display: true, text: 'Revenue (£)' }
        },
        x: { title: { display: true, text: 'Month' } }
      }
    }
  });

  return _register(canvasId, chart);
}

// ── 5. Amortization Stacked Bar ───────────────────────────────

/**
 * Render mortgage amortization chart (interest vs principal stacked bars + balance line)
 */
function renderAmortizationChart(canvasId, schedule, monthlyPayment) {
  const canvas = _getCanvas(canvasId);
  if (!canvas) return null;

  const chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels:   schedule.map(r => `Yr ${r.year}`),
      datasets: [
        {
          label: 'Interest',
          data:  schedule.map(r => r.yearlyInterest),
          backgroundColor: CHART_COLORS.gold,
          borderRadius: 2,
          stack: 'payment'
        },
        {
          label: 'Principal',
          data:  schedule.map(r => r.yearlyPrincipal),
          backgroundColor: CHART_COLORS.primary,
          borderRadius: 2,
          stack: 'payment'
        },
        {
          label: 'Remaining Balance',
          type:  'line',
          data:  schedule.map(r => r.balance),
          borderColor: CHART_COLORS.danger,
          backgroundColor: 'transparent',
          borderWidth: 2,
          yAxisID: 'y1',
          pointRadius: 2,
          tension: 0.3
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'top' },
        tooltip: {
          callbacks: { label: ctx => ` ${ctx.dataset.label}: £${ctx.raw.toLocaleString('en-GB', { minimumFractionDigits: 2 })}` }
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
          title: { display: true, text: 'Balance (£)' },
          grid: { drawOnChartArea: false }
        }
      }
    }
  });

  return _register(canvasId, chart);
}

// ── 6. User Activity Bar Chart ────────────────────────────────

/**
 * Render user activity by day (last 7 days)
 */
function renderUserActivityChart(canvasId, auditLogs) {
  const canvas = _getCanvas(canvasId);
  if (!canvas) return null;

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push({ label: d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' }), date: d.toDateString() });
  }

  const activityData = days.map(day =>
    auditLogs.filter(log => new Date(log.timestamp).toDateString() === day.date).length
  );

  const chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: days.map(d => d.label),
      datasets: [{
        label: 'Activity Events',
        data: activityData,
        backgroundColor: days.map((_, i) => i === 6 ? CHART_COLORS.teal : CHART_COLORS.primaryT),
        borderColor: days.map((_, i) => i === 6 ? CHART_COLORS.teal : CHART_COLORS.primary),
        borderWidth: 1,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1 }, title: { display: true, text: 'Events' } }
      }
    }
  });

  return _register(canvasId, chart);
}

// ── 7. Currency Pair Distribution (Horizontal Bar) ────────────

/**
 * Render conversion count by currency pair
 */
function renderCurrencyPairChart(canvasId, conversions) {
  const canvas = _getCanvas(canvasId);
  if (!canvas) return null;

  const pairs = {};
  conversions.forEach(c => {
    const key = `${c.fromCurrency} → ${c.toCurrency}`;
    pairs[key] = (pairs[key] || 0) + 1;
  });

  const sorted  = Object.entries(pairs).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const palette = [CHART_COLORS.primary, CHART_COLORS.teal, CHART_COLORS.gold, CHART_COLORS.success,
                   CHART_COLORS.info, CHART_COLORS.warning, CHART_COLORS.accent, CHART_COLORS.muted];

  const chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels:   sorted.map(([pair]) => pair),
      datasets: [{
        label: 'Conversions',
        data:  sorted.map(([, count]) => count),
        backgroundColor: sorted.map((_, i) => palette[i % palette.length]),
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { beginAtZero: true, ticks: { stepSize: 1 }, title: { display: true, text: 'Number of Conversions' } }
      }
    }
  });

  return _register(canvasId, chart);
}

// ── 8. Admin Dashboard — KPI Sparkline ────────────────────────

/**
 * Mini sparkline for KPI cards
 */
function renderSparkline(canvasId, data, color = CHART_COLORS.primary) {
  const canvas = _getCanvas(canvasId);
  if (!canvas) return null;

  const chart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: data.map((_, i) => i),
      datasets: [{
        data,
        borderColor: color,
        backgroundColor: color + '22',
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: 0
      }]
    },
    options: {
      responsive: false,
      animation: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: {
        x: { display: false },
        y: { display: false }
      }
    }
  });

  return _register(canvasId, chart);
}

// ── Utility: destroy chart by ID ───────────────────────────────

function destroyChart(canvasId) { _destroyChart(canvasId); }
function destroyAllCharts() { Object.keys(_chartRegistry).forEach(_destroyChart); }

// ── Admin Dashboard Charts ─────────────────────────────────────

/**
 * Render all admin dashboard charts from DB data
 */
function renderAdminDashboardCharts() {
  if (typeof Chart === 'undefined') { console.warn('[Charts] Chart.js not available'); return; }
  applyChartDefaults();

  const conversions = db.getCollection('currencyConversions');
  const quotes      = db.getCollection('investmentQuotes');
  const auditLogs   = db.getCollection('auditLogs');

  if (document.getElementById('revenue-trend-chart')) {
    renderRevenueTrendChart('revenue-trend-chart', conversions);
  }
  if (document.getElementById('currency-volume-chart')) {
    renderCurrencyVolumeChart('currency-volume-chart', conversions);
  }
  if (document.getElementById('investment-types-chart')) {
    renderInvestmentTypesChart('investment-types-chart', quotes);
  }
  if (document.getElementById('currency-pair-chart')) {
    renderCurrencyPairChart('currency-pair-chart', conversions);
  }
  if (document.getElementById('user-activity-chart')) {
    renderUserActivityChart('user-activity-chart', auditLogs);
  }
}

// Init defaults when Chart.js is available
if (typeof Chart !== 'undefined') {
  applyChartDefaults();
}

console.log('[Enomy-Finances] charts.js loaded');

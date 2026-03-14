// client/assets/js/my-community-competition/qmiSoldTable.js
import { fetchQmiSolds } from './api.js';

const moneyFmt = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const sqftFmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const monthFmt = new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' });

const formatMoney = (val) => (Number.isFinite(val) ? moneyFmt.format(val) : '--');
const formatSqft = (val) => (Number.isFinite(val) ? sqftFmt.format(val) : '--');
const formatMonth = (ym) => {
  if (!ym || typeof ym !== 'string') return '--';
  const dt = new Date(`${ym}-01T00:00:00`);
  return Number.isNaN(dt.getTime()) ? ym : monthFmt.format(dt);
};
const formatDate = (val) => {
  if (!val) return '--';
  const dt = new Date(val);
  if (Number.isNaN(dt.getTime())) return String(val);
  return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};
const parseNumber = (val) => {
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  if (typeof val === 'string') {
    const cleaned = val.replace(/[^0-9.-]/g, '');
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : null;
  }
  const num = Number(val);
  return Number.isFinite(num) ? num : null;
};
const planLabel = (plan) => {
  if (!plan) return '--';
  const name = plan.name ? String(plan.name).trim() : '';
  const number = plan.planNumber ? String(plan.planNumber).trim() : '';
  if (name && number) return `${name} (#${number})`;
  if (name) return name;
  if (number) return `Plan #${number}`;
  return '--';
};

const monthValue = (month) => {
  if (!month || typeof month !== 'string') return -Infinity;
  const cleaned = month.replace('-', '');
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : -Infinity;
};
const normalizeStatus = (status) => String(status || '').toLowerCase().trim();
const isFinishedHome = (item) => {
  const status = normalizeStatus(item?.status);
  return (
    status.includes('finished') ||
    status.includes('complete') ||
    status.includes('completed') ||
    status.includes('move in ready')
  );
};
const qmiCategory = (item) => (isFinishedHome(item) ? 'finished' : 'qmi');

export function qmiSoldTable({ onData } = {}) {
  const section = document.getElementById('qmiSoldSection');
  if (!section) {
    return { load: async () => {}, getState: () => ({}) };
  }

  const qmiBody = section.querySelector('#qmiTableBody');
  const soldBody = section.querySelector('#soldTableBody');
  const planAveragesBody = section.querySelector('#qmiPlanAveragesBody');
  const filterButtons = Array.from(section.querySelectorAll('.qmi-filter-pill'));
  const finishedCount = section.querySelector('#qmiFilterFinishedCount');
  const qmiCount = section.querySelector('#qmiFilterQmiCount');
  const soldCount = section.querySelector('#qmiFilterSoldCount');
  const avgSoldPriceValue = section.querySelector('#qmiAvgSoldPriceValue');
  const soldHomesValue = section.querySelector('#qmiSoldHomesValue');
  const planSalesCountValue = section.querySelector('#qmiPlanSalesCountValue');

  const state = {
    communityId: null,
    months: [],
    data: null,
    activeFilters: new Set(['finished', 'qmi', 'sold'])
  };

  const clearTable = (tbody, colspan, message) => {
    tbody.innerHTML = '';
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = colspan;
    td.className = 'text-muted';
    td.textContent = message;
    tr.appendChild(td);
    tbody.appendChild(tr);
  };

  const buildRow = (cells) => {
    const tr = document.createElement('tr');
    cells.forEach((value) => {
      const td = document.createElement('td');
      td.textContent = value ?? '--';
      tr.appendChild(td);
    });
    return tr;
  };

  const sortByMonth = (items, secondaryKey) => {
    return [...items].sort((a, b) => {
      const diff = monthValue(b.month) - monthValue(a.month);
      if (diff !== 0) return diff;
      if (!secondaryKey) return 0;
      const aVal = secondaryKey(a) || '';
      const bVal = secondaryKey(b) || '';
      return String(bVal).localeCompare(String(aVal));
    });
  };

  const setSummaryValue = (node, value) => {
    if (node) node.textContent = value;
  };

  const clearPlanAverages = (message) => {
    if (!planAveragesBody) return;
    clearTable(planAveragesBody, 3, message);
  };

  const updateFilterCounts = (qmiItems, soldItems) => {
    const counts = qmiItems.reduce((acc, item) => {
      acc[qmiCategory(item)] += 1;
      return acc;
    }, { finished: 0, qmi: 0 });

    if (finishedCount) finishedCount.textContent = String(counts.finished);
    if (qmiCount) qmiCount.textContent = String(counts.qmi);
    if (soldCount) soldCount.textContent = String(soldItems.length);
  };

  const renderSummary = (soldItems) => {
    const pricedSolds = soldItems.filter((item) => parseNumber(item.soldPrice) != null);
    const totalSoldPrice = pricedSolds.reduce((sum, item) => sum + parseNumber(item.soldPrice), 0);
    const overallAverage = pricedSolds.length ? totalSoldPrice / pricedSolds.length : null;
    const plansWithSales = new Set(
      pricedSolds
        .map((item) => planLabel(item.plan))
        .filter((label) => label && label !== '--')
    );

    setSummaryValue(avgSoldPriceValue, formatMoney(overallAverage));
    setSummaryValue(soldHomesValue, String(soldItems.length));
    setSummaryValue(planSalesCountValue, String(plansWithSales.size));
  };

  const renderPlanAverages = (soldItems) => {
    if (!planAveragesBody) return;

    const pricedSolds = soldItems.filter((item) => parseNumber(item.soldPrice) != null);
    if (!pricedSolds.length) {
      clearPlanAverages(state.communityId ? 'No sold-price data available for the current filters.' : 'Select a community to load data.');
      return;
    }

    const grouped = new Map();
    pricedSolds.forEach((item) => {
      const key = planLabel(item.plan);
      const entry = grouped.get(key) || { label: key, solds: 0, totalSoldPrice: 0 };
      entry.solds += 1;
      entry.totalSoldPrice += parseNumber(item.soldPrice);
      grouped.set(key, entry);
    });

    const rows = Array.from(grouped.values()).sort((a, b) => {
      if (b.solds !== a.solds) return b.solds - a.solds;
      return a.label.localeCompare(b.label);
    });

    planAveragesBody.innerHTML = '';
    rows.forEach((item) => {
      planAveragesBody.appendChild(buildRow([
        item.label,
        String(item.solds),
        formatMoney(item.totalSoldPrice / item.solds)
      ]));
    });
  };

  const renderTables = () => {
    const qmiItems = Array.isArray(state.data?.qmi) ? state.data.qmi : [];
    const soldItems = Array.isArray(state.data?.sold) ? state.data.sold : [];
    const filteredQmiItems = qmiItems.filter((item) => state.activeFilters.has(qmiCategory(item)));
    const filteredSoldItems = state.activeFilters.has('sold') ? soldItems : [];

    updateFilterCounts(qmiItems, soldItems);
    renderSummary(filteredSoldItems);
    renderPlanAverages(filteredSoldItems);

    qmiBody.innerHTML = '';
    soldBody.innerHTML = '';

    if (!qmiItems.length) {
      clearTable(qmiBody, 6, state.communityId ? 'No quick move-in homes recorded for the recent months.' : 'Select a community to load data.');
    } else if (!filteredQmiItems.length) {
      clearTable(qmiBody, 6, 'No finished or quick move-in homes match the current filters.');
    } else {
      const sorted = sortByMonth(filteredQmiItems, (item) => item.listDate);
      sorted.forEach(item => {
        qmiBody.appendChild(buildRow([
          formatMonth(item.month),
          item.address || '--',
          planLabel(item.plan),
          formatSqft(item.sqft),
          formatMoney(item.listPrice),
          item.status || '--'
        ]));
      });
    }

    if (!soldItems.length) {
      clearTable(soldBody, 7, state.communityId ? 'No sold homes recorded for the recent months.' : 'Select a community to load data.');
    } else if (!filteredSoldItems.length) {
      clearTable(soldBody, 7, 'Sold homes are hidden by the current filters.');
    } else {
      const sorted = sortByMonth(filteredSoldItems, (item) => item.soldDate || item.listDate);
      sorted.forEach(item => {
        soldBody.appendChild(buildRow([
          formatMonth(item.month),
          item.address || '--',
          planLabel(item.plan),
          formatSqft(item.sqft),
          formatMoney(item.listPrice),
          formatMoney(item.soldPrice),
          formatDate(item.soldDate)
        ]));
      });
    }
  };

  filterButtons.forEach((button) => {
    const filter = button.dataset.filter;
    if (!filter) return;

    button.addEventListener('click', () => {
      if (state.activeFilters.has(filter)) {
        state.activeFilters.delete(filter);
      } else {
        state.activeFilters.add(filter);
      }

      const isActive = state.activeFilters.has(filter);
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
      renderTables();
    });
  });

  async function load(communityId) {
    state.communityId = communityId || null;
    state.data = null;
    state.months = [];

    if (!communityId) {
      renderTables();
      return;
    }

    try {
      const res = await fetchQmiSolds(communityId);
      if (!res.ok) {
        console.error('Failed to load QMI vs Sold data:', await res.text());
        state.data = null;
        state.months = [];
        renderTables();
        return;
      }
      const payload = await res.json();
      if (state.communityId !== communityId) return;

      state.data = payload;
      state.months = Array.isArray(payload.months) ? payload.months : [];

      renderTables();

      if (typeof onData === 'function') {
        onData({ communityId, data: payload });
      }
    } catch (err) {
      console.error('Failed to load QMI vs Sold data:', err);
      state.data = null;
      state.months = [];
      renderTables();
    }
  }

  return {
    load,
    getState: () => ({ ...state, activeFilters: Array.from(state.activeFilters) })
  };
}

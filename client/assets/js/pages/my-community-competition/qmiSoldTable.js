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

export function qmiSoldTable({ onData } = {}) {
  const section = document.getElementById('qmiSoldSection');
  if (!section) {
    return { load: async () => {}, getState: () => ({}) };
  }

  const qmiBody = section.querySelector('#qmiTableBody');
  const soldBody = section.querySelector('#soldTableBody');

  const state = { communityId: null, months: [], data: null };

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

  const renderTables = () => {
    const qmiItems = Array.isArray(state.data?.qmi) ? state.data.qmi : [];
    const soldItems = Array.isArray(state.data?.sold) ? state.data.sold : [];

    qmiBody.innerHTML = '';
    soldBody.innerHTML = '';

    if (!qmiItems.length) {
      clearTable(qmiBody, 6, state.communityId ? 'No quick move-in homes recorded for the recent months.' : 'Select a community to load data.');
    } else {
      const sorted = sortByMonth(qmiItems, (item) => item.listDate);
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
    } else {
      const sorted = sortByMonth(soldItems, (item) => item.soldDate || item.listDate);
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
    getState: () => ({ ...state })
  };
}

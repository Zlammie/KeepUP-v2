// assets/js/contact-details/financeToggle.js
import { getState } from './state.js';

function setHiddenState(isCash) {
  document.querySelectorAll('[data-hide-when-cash]').forEach((el) => {
    el.classList.toggle('d-none', isCash);
  });
  document.querySelectorAll('[data-show-when-cash]').forEach((el) => {
    const existing = el.dataset.showDisplay;
    if (!existing) {
      const inline = el.style.display;
      const computed = getComputedStyle(el).display;
      const value = inline && inline !== 'none' ? inline : (computed && computed !== 'none' ? computed : '');
      el.dataset.showDisplay = value || '';
    }
    el.classList.toggle('d-none', !isCash);
    el.style.display = isCash ? (el.dataset.showDisplay || '') : 'none';
  });
}

function setRadioState(type) {
  const financed = document.getElementById('finance-type-financed');
  const cash = document.getElementById('finance-type-cash');
  if (financed) financed.checked = type !== 'cash';
  if (cash) cash.checked = type === 'cash';
}

function setFundsFields(contact = {}) {
  const fundsChecked = !!contact.fundsVerified;
  const fundsInput = document.getElementById('funds-verified');
  if (fundsInput) fundsInput.checked = fundsChecked;

  const dateInput = document.getElementById('funds-verified-date-input');
  if (dateInput) {
    const val = contact.fundsVerifiedDate;
    if (!val) {
      dateInput.value = '';
    } else {
      const d = new Date(val);
      if (Number.isNaN(+d)) {
        dateInput.value = '';
      } else {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        dateInput.value = `${yyyy}-${mm}-${dd}`;
      }
    }
  }
}

export function refreshFinanceUI(contact = {}) {
  const type = (contact.financeType || 'financed').toLowerCase();
  const isCash = type === 'cash';
  setRadioState(type);
  setFundsFields(contact);
  setHiddenState(isCash);
}

export function initFinanceToggle() {
  const financeRadios = document.querySelectorAll('input[name="financeType"]');
  if (financeRadios.length) {
    financeRadios.forEach((radio) => {
      radio.addEventListener('change', () => {
        if (!radio.checked) return;
        const isCash = radio.value === 'cash';
        setHiddenState(isCash);
      });
    });
  }
  refreshFinanceUI(getState().contact || {});
}

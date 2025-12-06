// /assets/js/realtors/render.js
import { updateRealtor } from './api.js';
import { formatPhoneDisplay } from '../../shared/phone.js';

let actionHandlers = {
  onTask: null,
  onComment: null
};

export function setActionHandlers(handlers = {}) {
  actionHandlers = {
    ...actionHandlers,
    ...handlers
  };
}

function applyAttentionIndicator(buttonEl, imgEl, requiresAttention) {
  if (!buttonEl || !imgEl) return;
  if (requiresAttention) {
    buttonEl.classList.add('attention-on');
  } else {
    buttonEl.classList.remove('attention-on');
  }
}

export function renderTable(realtors, statsByRealtor = new Map()) {
  const tbody = document.querySelector('#realtorsTable tbody');
  tbody.innerHTML = '';

  realtors.forEach((realtor) => {
    const row = document.createElement('tr');
    row.dataset.id = realtor._id;

    const fullName = `${realtor.firstName || ''} ${realtor.lastName || ''}`.trim() || realtor.brokerage || 'Realtor';

    {
      const cell = document.createElement('td');
      cell.classList.add('contact-table-icons');
      const wrapper = document.createElement('div');
      wrapper.className = 'table-action-buttons';

      const createIconButton = ({ src, label, extraClasses = [] }) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.classList.add('table-icon-btn', ...extraClasses);
        btn.setAttribute('aria-label', label);
        const img = document.createElement('img');
        img.src = src;
        img.alt = '';
        btn.appendChild(img);
        return { btn, img };
      };

      const { btn: taskBtn } = createIconButton({
        src: '/assets/icons/add_task.svg',
        label: `Manage tasks for ${fullName}`
      });
      taskBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        actionHandlers.onTask?.({ id: realtor._id, name: fullName });
      });
      wrapper.appendChild(taskBtn);

      const requiresAttention = Boolean(realtor.requiresAttention);
      const { btn: attentionBtn, img: attentionImg } = createIconButton({
        src: '/assets/icons/exclamation.svg',
        label: requiresAttention
          ? `${fullName} has urgent tasks`
          : `${fullName} has no urgent tasks`,
        extraClasses: ['attention-indicator']
      });
      attentionBtn.setAttribute('aria-disabled', 'true');
      attentionBtn.tabIndex = -1;
      attentionBtn.setAttribute('title', requiresAttention ? 'Urgent tasks pending' : 'No urgent tasks');
      applyAttentionIndicator(attentionBtn, attentionImg, requiresAttention);
      wrapper.appendChild(attentionBtn);

      const { btn: commentBtn } = createIconButton({
        src: '/assets/icons/comment.svg',
        label: `Add comment for ${fullName}`
      });
      commentBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        actionHandlers.onComment?.({ id: realtor._id, name: fullName });
      });
      wrapper.appendChild(commentBtn);

      cell.appendChild(wrapper);
      row.appendChild(cell);
    }

    // 🔎 View
    {
      const cell = document.createElement('td');
      cell.classList.add('text-center');
      const btn = document.createElement('button');
      btn.textContent = 'View';
      btn.classList.add('btn', 'btn-primary', 'btn-sm');
      btn.addEventListener('click', () => {
        window.location.href = `/realtor-details?id=${realtor._id}`;
      });
      cell.appendChild(btn);
      row.appendChild(cell);
    }

    // Editable fields
    ['firstName', 'lastName', 'email', 'phone', 'brokerage'].forEach((field) => {
      const cell = document.createElement('td');
      const isPhone = field === 'phone';
      const currentValue = realtor[field] || '';
      const displayValue = isPhone ? formatPhoneDisplay(currentValue) : currentValue;

      cell.textContent = displayValue;
      cell.contentEditable = true;
      cell.dataset.field = field;
      cell.dataset.displayValue = displayValue;
      cell.dataset.comparable = isPhone ? currentValue.replace(/\D+/g, '') : currentValue;

      if (isPhone) {
        cell.addEventListener('focus', () => {
          cell.textContent = realtor[field] || '';
        });
      }

      cell.addEventListener('blur', async (e) => {
        const newValue = e.target.textContent.trim();
        const comparableValue = isPhone ? newValue.replace(/\D+/g, '') : newValue;
        if (comparableValue === cell.dataset.comparable) {
          e.target.textContent = cell.dataset.displayValue || '';
          return;
        }
        try {
          await updateRealtor(realtor._id, { [field]: newValue });
          realtor[field] = newValue;
          const updatedDisplay = isPhone ? formatPhoneDisplay(newValue) : newValue;
          cell.dataset.displayValue = updatedDisplay;
          cell.dataset.comparable = comparableValue;
          e.target.textContent = updatedDisplay;
        } catch (err) {
          console.error(err);
          const fallback = cell.dataset.displayValue || realtor[field] || '';
          e.target.textContent = fallback;
        }
      });

      row.appendChild(cell);
    });

    // NEW: stats columns
    {
      const s = statsByRealtor.get(realtor._id) || { total: 0, purchased: 0, negotiating: 0, closed: 0 };

      const totalTd = document.createElement('td');
      totalTd.classList.add('text-center');
      totalTd.textContent = s.total;

      const purchasedTd = document.createElement('td');
      purchasedTd.textContent = s.purchased;

      const negotiatingTd = document.createElement('td');
      negotiatingTd.textContent = s.negotiating;

      const closedTd = document.createElement('td');
      closedTd.textContent = s.closed;

      row.append(totalTd, purchasedTd, negotiatingTd, closedTd);
    }

    {
      const cell = document.createElement('td');
      cell.classList.add('col-delete', 'd-none');

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.classList.add('btn', 'btn-sm', 'btn-danger', 'delete-realtor-btn');
      btn.dataset.id = realtor._id;
      btn.title = 'Delete';
      btn.textContent = '✕';

      cell.appendChild(btn);
      row.appendChild(cell);
    }

    tbody.appendChild(row);
  });
}

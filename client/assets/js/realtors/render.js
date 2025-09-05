// /assets/js/realtors/render.js
import { updateRealtor } from './api.js';

function setFlagIconColor(imgEl, flagged) {
  imgEl.style.filter = flagged
    ? 'invert(23%) sepia(93%) saturate(6575%) hue-rotate(358deg) brightness(99%) contrast(119%)'
    : '';
}

export function renderTable(realtors, statsByRealtor = new Map()) {
  const tbody = document.querySelector('#realtorsTable tbody');
  tbody.innerHTML = '';

  realtors.forEach((realtor) => {
    const row = document.createElement('tr');
    row.dataset.id = realtor._id;

    // 📋 Task
    {
      const cell = document.createElement('td');
      cell.classList.add('text-center');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.classList.add('icon-btn', 'btn', 'btn-sm', 'btn-link');
      const img = document.createElement('img');
      img.src = '/assets/icons/add_task.svg';
      img.alt = 'Task';
      btn.appendChild(img);
      cell.appendChild(btn);
      row.appendChild(cell);
    }

    // 🚩 Flag
    {
      const cell = document.createElement('td');
      cell.classList.add('text-center');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.classList.add('icon-btn', 'btn', 'btn-sm', 'btn-link');
      const img = document.createElement('img');
      img.src = '/assets/icons/exclamation.svg';
      img.alt = 'Flag';
      btn.appendChild(img);

      let flagged = Boolean(realtor.flagged);
      setFlagIconColor(img, flagged);

      btn.addEventListener('click', async () => {
        const next = !flagged;
        setFlagIconColor(img, next);
        try {
          await updateRealtor(realtor._id, { flagged: next });
          flagged = next;
        } catch (err) {
          setFlagIconColor(img, flagged);
          console.error(err);
        }
      });

      cell.appendChild(btn);
      row.appendChild(cell);
    }

    // 💬 Comment
    {
      const cell = document.createElement('td');
      cell.classList.add('text-center');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.classList.add('icon-btn', 'btn', 'btn-sm', 'btn-link');
      const img = document.createElement('img');
      img.src = '/assets/icons/comment.svg';
      img.alt = 'Comment';
      btn.appendChild(img);
      // TODO: open modal later
      cell.appendChild(btn);
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
      cell.textContent = realtor[field] || '';
      cell.contentEditable = true;
      cell.dataset.field = field;

      cell.addEventListener('blur', async (e) => {
        const newValue = e.target.textContent.trim();
        if (newValue === (realtor[field] || '')) return;
        try {
          await updateRealtor(realtor._id, { [field]: newValue });
          realtor[field] = newValue;
        } catch (err) {
          console.error(err);
          e.target.textContent = realtor[field] || '';
        }
      });

      row.appendChild(cell);
    });

    // NEW: stats columns
    {
      const s = statsByRealtor.get(realtor._id) || { total: 0, purchased: 0, negotiating: 0, closed: 0 };

      const totalTd = document.createElement('td');
      totalTd.textContent = s.total;

      const purchasedTd = document.createElement('td');
      purchasedTd.textContent = s.purchased;

      const negotiatingTd = document.createElement('td');
      negotiatingTd.textContent = s.negotiating;

      const closedTd = document.createElement('td');
      closedTd.textContent = s.closed;

      row.append(totalTd, purchasedTd, negotiatingTd, closedTd);
    }

    tbody.appendChild(row);
  });
}

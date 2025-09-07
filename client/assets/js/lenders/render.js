// /assets/js/lenders/render.js
import { updateLender } from './api.js';

function setFlagIconColor(imgEl, flagged) {
  imgEl.style.filter = flagged
    ? 'invert(23%) sepia(93%) saturate(6575%) hue-rotate(358deg) brightness(99%) contrast(119%)'
    : '';
}

export function renderTable(lenders, statsByLender = new Map()) {
  const tbody = document.querySelector('#lendersTable tbody');
  tbody.innerHTML = '';

  lenders.forEach((lender) => {
    const row = document.createElement('tr');
    row.dataset.id = lender._id;

    // 📋 Task
    {
      const cell = document.createElement('td');
      cell.classList.add('icon-col');
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
      cell.classList.add('icon-col');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.classList.add('icon-btn', 'btn', 'btn-sm', 'btn-link');
      const img = document.createElement('img');
      img.src = '/assets/icons/exclamation.svg';
      img.alt = 'Flag';
      btn.appendChild(img);

      let flagged = Boolean(lender.flagged);
      setFlagIconColor(img, flagged);

      btn.addEventListener('click', async () => {
        const next = !flagged;
        setFlagIconColor(img, next);
        try {
          await updateLender(lender._id, { flagged: next });
          flagged = next;
        } catch (err) {
          setFlagIconColor(img, flagged); // revert on error
          console.error(err);
        }
      });

      cell.appendChild(btn);
      row.appendChild(cell);
    }

    // 💬 Comment
    {
      const cell = document.createElement('td');
      cell.classList.add('icon-col');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.classList.add('icon-btn', 'btn', 'btn-sm', 'btn-link');
      const img = document.createElement('img');
      img.src = '/assets/icons/comment.svg';
      img.alt = 'Comment';
      btn.appendChild(img);

      btn.addEventListener('click', () => {
        // openLenderCommentModal(lender._id);
        console.log('open comment modal for', lender._id);
      });

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
        window.location.href = `/lender-view?id=${lender._id}`;
      });
      cell.appendChild(btn);
      row.appendChild(cell);
    }

    // Editable fields
 ['firstName', 'lastName', 'email', 'phone', 'lenderBrokerage'].forEach((field) => {
      const cell = document.createElement('td');
      cell.textContent = lender[field] || '';
      cell.title = cell.textContent;
      cell.contentEditable = true;
      cell.dataset.field = field;

      cell.addEventListener('blur', async (e) => {
        const newValue = e.target.textContent.trim();
        if (newValue === (lender[field] || '')) return;
        try {
          await updateLender(lender._id, { [field]: newValue });
          lender[field] = newValue;
        } catch (err) {
          console.error(err);
          e.target.textContent = lender[field] || '';
        }
      });

      row.appendChild(cell);
    });

    // NEW: Invited / Purchased not Approved / Purchased cells
  {
    const s = statsByLender.get(lender._id) || { invited: 0, purchasedNotApproved: 0, purchased: 0 };

    const invitedTd = document.createElement('td');
    invitedTd.classList.add('stats-col');
    invitedTd.textContent = s.invited;

    const purchasedNotApprovedTd = document.createElement('td');
    purchasedNotApprovedTd.classList.add('stats-col');
    purchasedNotApprovedTd.textContent = s.purchasedNotApproved;

    const purchasedTd = document.createElement('td');
    purchasedTd.classList.add('stats-col');
    purchasedTd.textContent = s.purchased;


    row.append(invitedTd, purchasedNotApprovedTd, purchasedTd);
  }
  {
  const cell = document.createElement('td');
  cell.classList.add('col-delete', 'd-none');

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.classList.add('btn', 'btn-sm', 'btn-danger', 'delete-lender-btn');
  btn.dataset.id = lender._id;
  btn.title = 'Delete';
  btn.textContent = '✕';

  cell.appendChild(btn);
  row.appendChild(cell);
}

    tbody.appendChild(row);
  });
}

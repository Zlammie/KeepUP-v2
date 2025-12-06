// Utilities for rendering <select> options in a consistent way
export function renderSelectOptions(selectEl, items = [], { placeholder } = {}) {
  if (!selectEl) return;
  selectEl.innerHTML = '';

  if (placeholder) {
    const option = document.createElement('option');
    option.value = placeholder.value ?? '';
    option.textContent = placeholder.label ?? placeholder;
    if (placeholder.disabled) option.disabled = true;
    if (placeholder.selected) option.selected = true;
    selectEl.appendChild(option);
  }

  items.forEach(({ value, label }) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    selectEl.appendChild(option);
  });
}

export function renderErrorOption(selectEl, message) {
  if (!selectEl) return;
  selectEl.innerHTML = '';
  const option = document.createElement('option');
  option.value = '';
  option.textContent = message;
  option.disabled = true;
  option.selected = true;
  selectEl.appendChild(option);
}

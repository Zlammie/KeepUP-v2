// Status dropdown background
  const statusSelect = document.getElementById('status');
  const statusBackgrounds = {
    'new': 'lightblue',
    'be-back': 'orange',
    'cold': 'lightgray',
    'target': 'plum',
    'possible': 'lightseagreen',
    'negotiating': 'khaki',
    'purchased': 'lightgreen',
    'closed': 'mediumseagreen',
    'not-interested': 'salmon',
    'deal-lost': 'crimson'
  };

  function updateStatusBackground() {
    const selectedValue = statusSelect.value;
    const bg = statusBackgrounds[selectedValue] || 'white';
    statusSelect.style.backgroundColor = bg;
  }

  statusSelect.addEventListener('mousedown', () => {
    statusSelect.style.backgroundColor = 'white';
  });

  window.addEventListener('pointerdown', (e) => {
    if (!statusSelect.contains(e.target)) {
      setTimeout(updateStatusBackground, 50);
    }
  });

  statusSelect.addEventListener('change', updateStatusBackground);
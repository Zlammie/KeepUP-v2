export function renderProsCons(pros = [], cons = []) {
  const prosList = document.getElementById('prosList');
  const consList = document.getElementById('consList');

  prosList.innerHTML = '';
  consList.innerHTML = '';

  pros.forEach(pro => {
    const div = document.createElement('div');
    div.className = 'badge bg-success me-1';
    div.textContent = pro;
    prosList.appendChild(div);
  });

  cons.forEach(con => {
    const div = document.createElement('div');
    div.className = 'badge bg-danger me-1';
    div.textContent = con;
    consList.appendChild(div);
  });
}
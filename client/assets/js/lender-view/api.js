export async function fetchLender(id){
  const r = await fetch(`/api/lenders/${id}`); if(!r.ok) throw new Error('Lender not found'); return r.json();
}
export async function updateLenderField(id, payload){
  const r = await fetch(`/api/lenders/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
  if(!r.ok) throw new Error('Failed to save'); return r.json().catch(()=>({}));
}
export async function fetchRelatedContacts(id){
  const r = await fetch(`/api/contacts/by-lender/${id}`); if(!r.ok) throw new Error('Failed to load related contacts'); return r.json();
}

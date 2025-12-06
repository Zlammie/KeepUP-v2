// client/assets/js/mcc/context.js
const dataEl = document.getElementById('community-data');
const initial = dataEl ? JSON.parse(dataEl.textContent) : {};

export const communityId =
  (document.body.getAttribute('data-community-id') || '').trim() ||
  initial.communityId ||
  '';

if (!communityId) console.error('[mcc] Missing communityId');

export const COMMUNITY_API = `/api/communities/${communityId}`;
export const PROFILE_API   = `/api/community-competition-profiles/${communityId}`;
export const PLANS_API     = `/api/communities/${communityId}/floorplans`;
export const LOT_STATS_API = `/api/communities/${communityId}/lot-stats`;

export const enc = encodeURIComponent;
export const q  = (sel, root=document) => root.querySelector(sel);
export const qq = (sel, root=document) => Array.from(root.querySelectorAll(sel));

export const okOrText = async (r) => r.ok ? r : Promise.reject(new Error(`${r.status} ${await r.text()}`));
export const j = (r) => r.json();

export const toFormData = (form) => Object.fromEntries(new FormData(form).entries());
export const numOrNull  = (v) => (v === '' || v == null ? null : Number(v));

// assets/js/contact-details/state.js
import * as api from './api.js';
import { emit } from './events.js';

const state = {
  contactId: null,
  initialStatus: 'New',
  contact: null,    // populated on init
  linkedLot: null,  // { communityId, lotId, ... } normalized
  realtors: [],
  lenders: [],
};

// Normalize various backend shapes into flat ids
function normalizeLinkedLot(raw) {
  if (!raw) return null;

  const cId =
    raw.communityId?._id ||
    raw.community?._id ||
    raw.communityId ||
    raw.community ||
    raw.community_id ||
    null;

  const lId =
    raw.lotId?._id ||
    raw.lot?._id ||
    raw.lotId ||
    raw.lot ||
    raw.lot_id ||
    raw.id ||
    null;

  return {
    ...raw,
    communityId: cId ? String(cId) : null,
    lotId:       lId ? String(lId) : null,
  };
}

export async function initState({ contactId, initialStatus, contactSeed = null }) {
  state.contactId = contactId;
  state.initialStatus = initialStatus;

  const seeded = contactSeed && typeof contactSeed === 'object' ? contactSeed : null;
  const contact = seeded || (await api.fetchContact(contactId));
  state.contact = contact || null;

  // Make sure linkedLot is normalized on boot
  state.linkedLot = normalizeLinkedLot(contact?.linkedLot ?? null);

  // let listeners hydrate UI
  emit('state:init', { ...state });
  emit('state:contact', state.contact);
  emit('state:linkedLot', state.linkedLot);

  return state;
}

export function getState() {
  return state;
}

export function getContact() {
  return state.contact;
}

export function setContact(patch) {
  state.contact = { ...state.contact, ...patch };
  emit('state:contact', state.contact);
}

export function setLinkedLot(ll) {
  state.linkedLot = normalizeLinkedLot(ll);
  emit('state:linkedLot', state.linkedLot);
}

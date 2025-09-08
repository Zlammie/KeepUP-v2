// Cache all DOM nodes once.

import { $, $$ } from './utils.js';

export const dom = {
  // Identity header
  hdrName:  $('#hdrName'),
  hdrPhone: $('#hdrPhone'),
  hdrEmail: $('#hdrEmail'),
  toggleEditBtn: $('#toggleEdit'),

  // Editor card
  editorCard: $('#editorCard'),
  titleName:  $('#titleName'),

  // Form inputs (ids must match your EJS)
  inputs: {
    firstName: $('#realtorFirstName'),
    lastName:  $('#realtorLastName'),
    email:     $('#realtorEmail'),
    phone:     $('#realtorPhone'),
    license:   $('#realtorLicenseNumber'),
    brokerage: $('#realtorBrokerage'),
    bAddr:     $('#realtorBrokerageAddress'),
    bCity:     $('#realtorBrokerageCity'),
    bState:    $('#realtorBrokerageState'),
    bZip:      $('#realtorBrokerageZip'),
  },

  // Filters / table
  searchInput:   $('#searchInput'),
  statusChips:   $('#statusChips'),
  communitySel:  $('#communitySelect'),
  resultCount:   $('#resultCount'),
  tableBody:     $('#relatedContactsBody'),
};

export function allDataInputs() {
  // inputs having data-field attribute (for autosave)
  return $$('input[data-field]', document);
}

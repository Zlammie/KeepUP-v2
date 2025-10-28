import { $ } from './utils.js';

export const dom = {
  // identity
  hdrName:  $('#hdrName'),
  hdrPhone: $('#hdrPhone'),
  hdrEmail: $('#hdrEmail'),
  toggleEditBtn: $('#toggleEdit'),

  // editor
  editorCard: $('#editorCard'),
  titleName:  $('#titleName'),
  inputs: {
    firstName: $('#lenderFirstName'),
    lastName:  $('#lenderLastName'),
    email:     $('#lenderEmail'),
    phone:     $('#lenderPhone'),
    company:   $('#lenderCompany'),
  },

  // top bar
  communitySel:  $('#communitySelect'),
  statusFilters: $('#statusFilters'),
  countTotal:    $('#countTotal'),
  toggleMode:    $('#toggleFilterMode'),
  resetBtn:      $('#resetFilters'),

  // table
  tableBody: $('#relatedContactsBody'),
  purchasedTableBody: $('#purchasedContactsBody'),

  tabs: {
    allBtn: $('#tabAllContacts'),
    purchasedBtn: $('#tabPurchasedContacts'),
    allPanel: $('#tabPanelAll'),
    purchasedPanel: $('#tabPanelPurchased'),
  },
};

// Cache and export all DOM elements we need in one place
export const els = {
  leadTypeInput: document.getElementById('lead-type'),
  leadTypeButtonsWrap: document.getElementById('lead-type-buttons'),
  form: document.getElementById('contactForm'),

  // shared
  firstName: document.getElementById('firstName'),
  lastName: document.getElementById('lastName'),
  email: document.getElementById('email'),
  phone: document.getElementById('phone'),
  visitDate: document.getElementById('visit-date'),
  leadSource: document.getElementById('leadSource'),
  communitySelect: document.getElementById('communitySelect'),
  statusSelect: document.getElementById('leadStatus'),

  // realtor
  realtorFields: document.querySelector('.realtor-fields'),
  brokerage: document.getElementById('brokerage'),

  // lender
  lenderFields: document.querySelector('.lender-fields'),
  lenderBrokerage: document.getElementById('lenderBrokerage'),
  lenderFirstName: document.getElementById('lenderFirstName'),
  lenderLastName: document.getElementById('lenderLastName'),
  lenderEmail: document.getElementById('lenderEmail'),
  lenderPhone: document.getElementById('lenderPhone'),
};

// Common “.mb-3” containers for show/hide
export const groups = {
  firstNameGroup: els.firstName.closest('.mb-3'),
  lastNameGroup: els.lastName.closest('.mb-3'),
  emailGroup: els.email.closest('.mb-3'),
  phoneGroup: els.phone.closest('.mb-3'),
  visitDateGroup: els.visitDate.closest('.mb-3'),
  communityGroup: els.communitySelect ? els.communitySelect.closest('.mb-3') : null,
  sourceContainer: els.leadSource ? els.leadSource.closest('.col-md-6') : null,
  statusContainer: els.statusSelect ? els.statusSelect.closest('.col-md-6') : null,
};

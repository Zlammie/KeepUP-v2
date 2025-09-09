// client/assets/js/my-community-competition/autosave.js
import {
  salesPerson, salesPersonPhone, salesPersonEmail,
  address, city, zip, modelPlan, lotSize, totalLots,
  schoolISD, elementarySchool, middleSchool, highSchool,
  hoaFee, hoaFrequency, tax, mudFee, pidFee, earnestAmount, realtorCommission,
  feeMud, feePid, feeNone, garageTypeFront, garageTypeRear
} from './dom.js';

import { currentCommunityId, numOrNull, saveTimer, setSaveTimer } from './state.js';
import { updateCommunityProfile } from './api.js';

export function bindAutosaveOnce() {
  if (bindAutosaveOnce._bound) return;
  bindAutosaveOnce._bound = true;
  const inputs = [
    salesPerson, salesPersonPhone, salesPersonEmail,
    address, city, zip, modelPlan, lotSize, totalLots,
    schoolISD, elementarySchool, middleSchool, highSchool,
    hoaFee, hoaFrequency, tax, mudFee, pidFee, earnestAmount, realtorCommission
  ];
  inputs.forEach(el => el && el.addEventListener('input', autosave));
  [feeMud, feePid, feeNone, garageTypeFront, garageTypeRear].forEach(el => el && el.addEventListener('change', autosave));
}

async function autosave() {
  if (!currentCommunityId) return;
  clearTimeout(saveTimer);
  setSaveTimer(setTimeout(async () => {
    const payload = {
      salesPerson: salesPerson.value,
      salesPersonPhone: salesPersonPhone.value,
      salesPersonEmail: salesPersonEmail.value,
      address: address.value,
      city: city.value,
      zip: zip.value,
      modelPlan: modelPlan.value || null,
      lotSize: lotSize.value || null,
      garageType: garageTypeFront.checked ? 'Front' : (garageTypeRear.checked ? 'Rear' : undefined),
      schoolISD: schoolISD.value,
      elementarySchool: elementarySchool.value,
      middleSchool: middleSchool.value,
      highSchool: highSchool.value,
      hoaFee: numOrNull(hoaFee.value),
      hoaFrequency: hoaFrequency.value || null,
      tax: numOrNull(tax.value),
      feeTypes: [
        feeMud.checked ? 'MUD' : null,
        feePid.checked ? 'PID' : null,
        feeNone.checked ? 'None' : null
      ].filter(Boolean),
      mudFee: feeMud.checked ? numOrNull(mudFee.value) : null,
      pidFee: feePid.checked ? numOrNull(pidFee.value) : null,
      earnestAmount: numOrNull(earnestAmount.value),
      realtorCommission: numOrNull(realtorCommission.value)
    };
    await updateCommunityProfile(currentCommunityId, payload);
  }, 350));
}

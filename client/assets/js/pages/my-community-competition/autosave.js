// client/assets/js/my-community-competition/autosave.js
import {
  salesPerson, salesPersonPhone, salesPersonEmail,
  address, city, state, zip, modelPlan, productTypes, lotSizes, totalLots,
  schoolISD, elementarySchool, middleSchool, highSchool,
  hoaFee, hoaFrequency, tax, mudTaxRate, pidFee, pidFeeFrequency, earnestAmount, realtorCommission,
  feeMud, feePid, feeNone, garageTypeFront, garageTypeRear
} from './dom.js';

import { currentCommunityId, numOrNull, saveTimer, setSaveTimer } from './state.js';
import { updateCommunityProfile } from './api.js';

const parseTextList = (value) => {
  if (value == null) return [];
  const results = [];
  const seen = new Set();

  String(value).split(/[,\n]/).forEach((entry) => {
    const text = String(entry).trim();
    if (!text) return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    results.push(text);
  });

  return results;
};

const parseNumberList = (value) => {
  if (value == null) return [];
  const results = [];
  const seen = new Set();

  String(value).split(/[,\n]/).forEach((entry) => {
    const text = String(entry).trim().replace(/[^0-9.]+/g, '').trim();
    if (!text) return;
    const parsed = Number(text);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    const normalized = Number(parsed.toFixed(3));
    if (seen.has(normalized)) return;
    seen.add(normalized);
    results.push(normalized);
  });

  return results;
};

export function bindAutosaveOnce() {
  if (bindAutosaveOnce._bound) return;
  bindAutosaveOnce._bound = true;
  const inputs = [
    salesPerson, salesPersonPhone, salesPersonEmail,
    address, city, state, zip, modelPlan, productTypes, lotSizes, totalLots,
    schoolISD, elementarySchool, middleSchool, highSchool,
    hoaFee, hoaFrequency, tax, mudTaxRate, pidFee, pidFeeFrequency, earnestAmount, realtorCommission
  ];
  inputs.forEach(el => el && el.addEventListener('change', autosave));
  inputs.forEach(el => el && el.addEventListener('blur', autosave));
  [feeMud, feePid, feeNone, garageTypeFront, garageTypeRear, pidFeeFrequency].forEach(el => el && el.addEventListener('change', autosave));
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
      state: state.value,
      zip: zip.value,
      modelPlan: modelPlan.value || null,
      productTypes: parseTextList(productTypes.value),
      lotSizes: parseNumberList(lotSizes.value),
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
      mudTaxRate: feeMud.checked ? numOrNull(mudTaxRate.value) : null,
      pidFee: feePid.checked ? numOrNull(pidFee.value) : null,
      pidFeeFrequency: feePid.checked ? (pidFeeFrequency.value || '') : '',
      earnestAmount: numOrNull(earnestAmount.value),
      realtorCommission: numOrNull(realtorCommission.value)
    };
    await updateCommunityProfile(currentCommunityId, payload);
  }, 350));
}

// Tiny state holder so we don’t depend on DOM to know the current type
let _leadType = 'contact';

export function getLeadType() {
  return _leadType;
}

export function setLeadType(type) {
  _leadType = type;
}

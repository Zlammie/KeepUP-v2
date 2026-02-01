const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

function resolveVariable(path, data) {
  if (!path) return '';
  const parts = String(path).split('.');
  let current = data;
  for (const part of parts) {
    if (current == null) return '';
    current = current[part];
  }
  if (current == null) return '';
  return String(current);
}

function renderString(template, data) {
  if (!template || typeof template !== 'string') return '';
  return template.replace(VARIABLE_PATTERN, (_match, key) => resolveVariable(key, data));
}

function extractVariables(text) {
  if (!text || typeof text !== 'string') return [];
  const vars = new Set();
  let match;
  while ((match = VARIABLE_PATTERN.exec(text))) {
    if (match[1]) vars.add(match[1]);
  }
  return Array.from(vars);
}

function renderTemplate({ subject, html, text }, data = {}) {
  return {
    subject: renderString(subject, data),
    html: renderString(html, data),
    text: renderString(text, data)
  };
}

module.exports = {
  renderTemplate,
  renderString,
  extractVariables
};

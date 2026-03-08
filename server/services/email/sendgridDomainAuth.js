const https = require('https');
const { getSendgridConfig, getSendgridAdminKey } = require('./emailConfig');

const sanitizeValue = (value) => String(value || '').trim();

const normalizeDomain = (value) => {
  const trimmed = sanitizeValue(value).toLowerCase();
  if (!trimmed) return { error: 'Domain is required' };
  if (trimmed.includes('://') || trimmed.includes('/')) {
    return { error: 'Domain must not include protocol or path' };
  }
  if (!/^[a-z0-9.-]+$/i.test(trimmed)) {
    return { error: 'Domain contains invalid characters' };
  }
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(trimmed)) {
    return { error: 'Enter a root domain like example.com' };
  }
  return { domain: trimmed };
};

const normalizeSubdomain = (value, fallback = 'email') => {
  const trimmed = sanitizeValue(value).toLowerCase().replace(/^@/, '');
  if (!trimmed) return { subdomain: fallback };
  if (!/^[a-z0-9-]+$/i.test(trimmed)) {
    return { error: 'Subdomain contains invalid characters' };
  }
  return { subdomain: trimmed };
};

const normalizePurpose = (value) => {
  const key = sanitizeValue(value).toLowerCase().replace(/\s+/g, '_');
  if (!key) return '';
  if (key.includes('dkim')) return 'DKIM';
  if (key.includes('mail') && key.includes('cname')) return 'Mail CNAME';
  if (key.includes('return')) return 'Return Path';
  if (key.includes('brand') || key.includes('link') || key === 'url' || key.includes('url')) {
    return 'Link Branding';
  }
  if (key.includes('dmarc')) return 'DMARC';
  return value;
};

const normalizeDnsRecord = ({ type, host, value, purpose }) => {
  const cleanType = sanitizeValue(type || '').toUpperCase();
  const cleanHost = sanitizeValue(host || '');
  const cleanValue = sanitizeValue(value || '');
  const cleanPurpose = normalizePurpose(purpose);
  if (!cleanType && !cleanHost && !cleanValue) return null;
  return {
    type: cleanType,
    host: cleanHost,
    value: cleanValue,
    purpose: cleanPurpose
  };
};

const normalizeDnsRecords = (payload) => {
  const records = [];
  const dnsObj = payload?.dns;
  if (dnsObj && typeof dnsObj === 'object' && !Array.isArray(dnsObj)) {
    Object.entries(dnsObj).forEach(([purposeKey, record]) => {
      if (!record || typeof record !== 'object') return;
      const entry = normalizeDnsRecord({
        type: record.type || record.record_type,
        host: record.host || record.name || record.hostname,
        value: record.data || record.value || record.target,
        purpose: purposeKey || record.purpose
      });
      if (entry) records.push(entry);
    });
  }

  if (!records.length) {
    const alt = payload?.dns_records || payload?.records || payload?.dns;
    if (Array.isArray(alt)) {
      alt.forEach((record) => {
        if (!record || typeof record !== 'object') return;
        const entry = normalizeDnsRecord({
          type: record.type || record.record_type,
          host: record.host || record.name || record.hostname,
          value: record.data || record.value || record.target,
          purpose: record.purpose || record.name
        });
        if (entry) records.push(entry);
      });
    }
  }

  return records;
};

const sendgridRequest = (method, path, body) => {
  const apiKey = getSendgridAdminKey() || getSendgridConfig().apiKey;
  if (!apiKey) {
    const err = new Error('SENDGRID_ADMIN_API_KEY or SENDGRID_API_KEY is missing');
    err.statusCode = 500;
    throw err;
  }

  const payload = body ? JSON.stringify(body) : null;
  const options = {
    hostname: 'api.sendgrid.com',
    path,
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  };
  if (payload) {
    options.headers['Content-Length'] = Buffer.byteLength(payload);
  }

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => {
        raw += chunk;
      });
      res.on('end', () => {
        let parsed = null;
        if (raw) {
          try {
            parsed = JSON.parse(raw);
          } catch (_) {
            parsed = raw;
          }
        }
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ status: res.statusCode, body: parsed, headers: res.headers });
          return;
        }
        const err = new Error(
          parsed?.errors?.[0]?.message || `SendGrid request failed (${res.statusCode})`
        );
        err.response = {
          statusCode: res.statusCode,
          body: parsed,
          headers: res.headers
        };
        reject(err);
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
};

const createDomainAuth = async ({ domain, subdomain, linkBranding }) => {
  const body = {
    domain,
    subdomain,
    automatic_security: true,
    custom_spf: false,
    link_branding: Boolean(linkBranding)
  };
  const response = await sendgridRequest('POST', '/v3/whitelabel/domains', body);
  return response.body || {};
};

const validateDomainAuth = async (id) => {
  const response = await sendgridRequest('POST', `/v3/whitelabel/domains/${id}/validate`, {});
  return response.body || {};
};

module.exports = {
  createDomainAuth,
  validateDomainAuth,
  normalizeDomain,
  normalizeSubdomain,
  normalizeDnsRecords
};

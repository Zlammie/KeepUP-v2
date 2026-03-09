const { BUILDROOTZ_API_BASE, BUILDROOTZ_INTERNAL_API_KEY } = process.env;

const truncateText = (value, max = 800) => {
  const text = String(value == null ? '' : value);
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
};

const parseResponseBody = async (res) => {
  const contentType = String(res.headers.get('content-type') || '').toLowerCase();
  const text = await res.text().catch(() => '');
  if (!text) {
    return { body: {}, hasBody: false, isJson: contentType.includes('application/json') };
  }

  if (contentType.includes('application/json')) {
    try {
      return { body: JSON.parse(text), hasBody: true, isJson: true };
    } catch (_) {
      return { body: { raw: truncateText(text, 2000) }, hasBody: true, isJson: false };
    }
  }

  return { body: { raw: truncateText(text, 2000) }, hasBody: true, isJson: false };
};

const getErrorMessageFromBody = (body) => {
  if (!body || typeof body !== 'object') return '';
  const direct = body.error || body.message || body.raw || '';
  if (direct) return String(direct);
  return '';
};

const getFetch = async () => {
  if (typeof fetch !== 'undefined') return fetch;
  const { default: nodeFetch } = await import('node-fetch');
  return nodeFetch;
};

async function buildrootzFetch(path, { method = 'GET', body, signal, timeoutMs } = {}) {
  if (!BUILDROOTZ_API_BASE || !BUILDROOTZ_INTERNAL_API_KEY) {
    const err = new Error('BuildRootz API not configured');
    err.status = 500;
    throw err;
  }

  const url = `${BUILDROOTZ_API_BASE.replace(/\/+$/, '')}${path}`;
  const headers = {
    Accept: 'application/json',
    'x-api-key': BUILDROOTZ_INTERNAL_API_KEY
  };
  const options = { method, headers, signal };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  const fetchFn = await getFetch();
  const controller = timeoutMs ? new AbortController() : null;
  const finalSignal = controller ? controller.signal : signal;
  if (controller && signal) {
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  if (controller) setTimeout(() => controller.abort(), timeoutMs).unref?.();

  const res = await fetchFn(url, { ...options, signal: finalSignal, redirect: 'manual' });
  const { body: resBody, hasBody, isJson } = await parseResponseBody(res);

  if ([301, 302, 303, 307, 308].includes(res.status)) {
    const location = res.headers.get('location') || '';
    const err = new Error(
      `BuildRootz request redirected (${res.status})${location ? ` to ${location}` : ''}`
    );
    err.status = 502;
    err.payload = { location, body: resBody };
    throw err;
  }

  if (res.status === 401 || res.status === 403) {
    const err = new Error('BUILDROOTZ_AUTH_FAILED');
    err.status = 500;
    throw err;
  }

  if (!res.ok) {
    const err = new Error(getErrorMessageFromBody(resBody) || `BuildRootz request failed (${res.status})`);
    err.status = res.status;
    err.payload = resBody;
    throw err;
  }

  if (hasBody && !isJson) {
    const err = new Error('BuildRootz returned non-JSON response');
    err.status = 502;
    err.payload = resBody;
    throw err;
  }

  return resBody;
}

module.exports = { buildrootzFetch, getFetch };

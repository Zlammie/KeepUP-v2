const { BUILDROOTZ_API_BASE, BUILDROOTZ_INTERNAL_API_KEY } = process.env;

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

  const res = await fetchFn(url, { ...options, signal: finalSignal });
  const resBody = await res.json().catch(() => ({}));

  if (res.status === 401) {
    const err = new Error('BUILDROOTZ_AUTH_FAILED');
    err.status = 500;
    throw err;
  }

  if (!res.ok) {
    const err = new Error(resBody?.error || `BuildRootz request failed (${res.status})`);
    err.status = res.status;
    err.payload = resBody;
    throw err;
  }

  return resBody;
}

module.exports = { buildrootzFetch };

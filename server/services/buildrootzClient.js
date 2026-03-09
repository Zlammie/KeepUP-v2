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

const resolveInternalFallbackPath = (path) => {
  const match = String(path || '').match(/^\/api\/internal(\/.*)?$/i);
  if (!match) return '';
  return `/internal${match[1] || ''}`;
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

  const baseUrl = BUILDROOTZ_API_BASE.replace(/\/+$/, '');
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

  const requestOnce = async (requestPath) => {
    const url = `${baseUrl}${requestPath}`;
    const res = await fetchFn(url, { ...options, signal: finalSignal, redirect: 'manual' });
    const parsed = await parseResponseBody(res);
    return { res, requestPath, url, ...parsed };
  };

  let result = await requestOnce(path);
  if (result.res.status === 404) {
    const fallbackPath = resolveInternalFallbackPath(path);
    if (fallbackPath && fallbackPath !== path) {
      result = await requestOnce(fallbackPath);
    }
  }

  const { res, body: resBody, hasBody, isJson, requestPath: finalPath, url: finalUrl } = result;

  if ([301, 302, 303, 307, 308].includes(res.status)) {
    const location = res.headers.get('location') || '';
    const err = new Error(
      `BuildRootz request redirected (${res.status})${location ? ` to ${location}` : ''}`
    );
    err.status = 502;
    err.payload = { location, requestPath: finalPath, url: finalUrl, body: resBody };
    throw err;
  }

  if (res.status === 401 || res.status === 403) {
    const err = new Error('BUILDROOTZ_AUTH_FAILED');
    err.status = 500;
    throw err;
  }

  if (!res.ok) {
    const message =
      getErrorMessageFromBody(resBody)
      || (res.status === 404 && !isJson
        ? 'BuildRootz endpoint not found (404). Check BUILDROOTZ_API_BASE or internal route prefix.'
        : `BuildRootz request failed (${res.status})`);
    const err = new Error(message);
    err.status = res.status;
    err.payload = { requestPath: finalPath, url: finalUrl, body: resBody };
    throw err;
  }

  if (hasBody && !isJson) {
    const err = new Error('BuildRootz returned non-JSON response');
    err.status = 502;
    err.payload = { requestPath: finalPath, url: finalUrl, body: resBody };
    throw err;
  }

  return resBody;
}

module.exports = { buildrootzFetch, getFetch };

const { getFetch } = require('./buildrootzClient');

const truncateText = (value, max = 800) => {
  const text = String(value == null ? '' : value);
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
};

const parseResponseBody = async (res) => {
  const text = await res.text().catch(() => '');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (_) {
    return { raw: truncateText(text, 2000) };
  }
};

const getErrorMessageFromBody = (body) => {
  if (!body || typeof body !== 'object') return '';
  const direct = body.error || body.message || body.raw || '';
  if (direct) return String(direct);
  if (Array.isArray(body.errors) && body.errors.length) {
    const first = body.errors[0];
    if (typeof first === 'string') return first;
    if (first && typeof first === 'object') {
      return String(first.message || first.error || first.code || '');
    }
  }
  return '';
};

const trimEnv = (value) => String(value == null ? '' : value).trim();

const resolvePublishConfig = () => {
  const baseUrl = trimEnv(
    process.env.BUILDROOTZ_API_BASE
    || process.env.BUILDROOTZ_BASE_URL
  );
  const internalKey = trimEnv(
    process.env.BUILDROOTZ_PUBLISH_INTERNAL_API_KEY
    || process.env.BUILDROOTZ_PUBLISH_API_KEY
    || process.env.BRZ_PUBLISH_INTERNAL_API_KEY
    || process.env.BRZ_INTERNAL_PUBLISH_API_KEY
    || process.env.BRZ_INTERNAL_API_KEY
    || process.env.BUILDROOTZ_INTERNAL_KEY
    || process.env.BUILDROOTZ_INTERNAL_API_KEY
    || process.env.BUILDROOTZ_API_KEY
  );

  if (!baseUrl || !internalKey) {
    const err = new Error(
      'BuildRootz publish endpoint is not configured. '
      + 'Expected BUILDROOTZ_API_BASE and a publish/internal API key '
      + '(BUILDROOTZ_PUBLISH_INTERNAL_API_KEY or BUILDROOTZ_INTERNAL_API_KEY).'
    );
    err.status = 500;
    throw err;
  }

  return { baseUrl, internalKey };
};

async function publishBundleToBuildRootz(bundle, { timeoutMs = 120000, signal } = {}) {
  const { baseUrl, internalKey } = resolvePublishConfig();
  const url = `${baseUrl.replace(/\/+$/, '')}/internal/publish/keepup/bundle`;
  const fetchFn = await getFetch();
  const controller = timeoutMs ? new AbortController() : null;
  const finalSignal = controller ? controller.signal : signal;
  if (controller && signal) {
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  if (controller) setTimeout(() => controller.abort(), timeoutMs).unref?.();

  const res = await fetchFn(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${internalKey}`,
      'x-api-key': internalKey
    },
    body: JSON.stringify(bundle),
    signal: finalSignal
  });

  const body = await parseResponseBody(res);
  if (!res.ok) {
    const messageFromBody = getErrorMessageFromBody(body);
    const err = new Error(
      `BuildRootz publish failed (${res.status}): ${truncateText(messageFromBody || 'Unknown error')}`
    );
    err.status = res.status === 401 || res.status === 403 ? 500 : res.status;
    err.payload = body;
    throw err;
  }

  return body;
}

module.exports = {
  publishBundleToBuildRootz
};

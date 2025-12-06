// Lightweight fetch helpers shared across pages
async function parseJsonSafe(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await parseJsonSafe(response);

  if (!response.ok) {
    const error = new Error(`Request failed: ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

export function getJson(url, options = {}) {
  return requestJson(
    url,
    {
      ...options,
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...(options.headers || {}),
      },
    },
  );
}

export function postJson(url, body, options = {}) {
  return requestJson(
    url,
    {
      ...options,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(options.headers || {}),
      },
      body: JSON.stringify(body ?? {}),
    },
  );
}

export function putJson(url, body, options = {}) {
  return requestJson(
    url,
    {
      ...options,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(options.headers || {}),
      },
      body: JSON.stringify(body ?? {}),
    },
  );
}

export function patchJson(url, body, options = {}) {
  return requestJson(
    url,
    {
      ...options,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(options.headers || {}),
      },
      body: JSON.stringify(body ?? {}),
    },
  );
}

export function deleteJson(url, options = {}) {
  return requestJson(
    url,
    {
      ...options,
      method: 'DELETE',
      headers: {
        Accept: 'application/json',
        ...(options.headers || {}),
      },
    },
  );
}

export async function postForm(url, formData, options = {}) {
  const response = await fetch(
    url,
    {
      ...options,
      method: 'POST',
      body: formData,
    },
  );
  const data = await parseJsonSafe(response);

  if (!response.ok) {
    const error = new Error(`Request failed: ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

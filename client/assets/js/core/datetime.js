const pad = (n) => String(n).padStart(2, '0');

export const formatDateTime = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const datePart = d.toLocaleDateString();
  const timePart = d.toLocaleTimeString([], { hour: 'numeric', minute: 'numeric' });
  return `${datePart} ${timePart}`;
};

export const splitDateTimeForInputs = (value) => {
  if (!value) return { date: '', time: '' };

  let raw = value;
  if (value instanceof Date) {
    raw = value.toISOString();
  } else if (typeof value === 'number') {
    raw = new Date(value).toISOString();
  } else if (typeof value !== 'string') {
    raw = String(value ?? '');
  }

  const str = raw.trim();
  if (!str) return { date: '', time: '' };

  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/;
  const isLocalDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
  const isUTCISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{3})?)?Z$/;

  if (isDateOnly.test(str)) {
    return { date: str, time: '' };
  }
  if (isLocalDateTime.test(str)) {
    return { date: str.slice(0, 10), time: str.slice(11, 16) };
  }

  if (isUTCISO.test(str)) {
    const match = str.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
    if (match && match[2] === '00' && match[3] === '00') {
      return { date: match[1], time: '' };
    }
    const d = new Date(str);
    if (!Number.isNaN(d.getTime())) {
      return {
        date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
        time: `${pad(d.getHours())}:${pad(d.getMinutes())}`
      };
    }
    return { date: match ? match[1] : '', time: '' };
  }

  const genericMatch = str.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/);
  if (genericMatch) {
    return { date: genericMatch[1], time: `${genericMatch[2]}:${genericMatch[3]}` };
  }

  return { date: str.slice(0, 10), time: '' };
};

export const toLocalInputDateTime = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const formatClosingSummary = (input) => {
  const { date, time } =
    (input && typeof input === 'object' && ('date' in input || 'time' in input))
      ? { date: input.date || '', time: input.time || '' }
      : splitDateTimeForInputs(input);

  if (!date) return '';

  if (!time) {
    const [y, m, d] = date.split('-').map(Number);
    if ([y, m, d].every((n) => Number.isFinite(n))) {
      return new Date(y, m - 1, d).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    }
    return date;
  }

  const dt = new Date(`${date}T${time}`);
  if (!Number.isNaN(dt.getTime())) {
    return dt.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }
  return `${date} @ ${time}`;
};

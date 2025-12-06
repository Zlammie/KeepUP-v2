// Tiny event bus to avoid cross-module imports getting messy


const handlers = new Map();


export function on(type, cb) {
if (!handlers.has(type)) handlers.set(type, new Set());
handlers.get(type).add(cb);
return () => handlers.get(type).delete(cb);
}


export function emit(type, payload) {
const set = handlers.get(type);
if (set) [...set].forEach(cb => cb(payload));
}
const REQUIRED_FIREBASE_FIELDS = ['apiKey', 'authDomain', 'projectId', 'appId'];
const BINDING_APP_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const PROJECT_ID_RE = /^[a-z0-9][a-z0-9-]{4,61}[a-z0-9]$/;

function requiredString(value, field, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} field ${field} is required`);
  return value.trim();
}

/**
 * Validate the public Firebase config and the app's explicit isolation binding.
 * The expected project is intentionally supplied independently of config.projectId.
 */
export function validateFirebaseBinding(config, binding) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new TypeError('Firebase public config is required');
  }
  for (const field of REQUIRED_FIREBASE_FIELDS) requiredString(config[field], field, 'Firebase public config');

  if (!binding || typeof binding !== 'object' || Array.isArray(binding)) {
    throw new TypeError('Explicit Firebase app binding is required');
  }
  const appId = requiredString(binding.appId, 'appId', 'Firebase app binding');
  const expectedProjectId = requiredString(binding.expectedProjectId, 'expectedProjectId', 'Firebase app binding');
  if (!BINDING_APP_RE.test(appId)) throw new TypeError('Invalid Firebase app binding appId');
  if (!PROJECT_ID_RE.test(expectedProjectId)) throw new TypeError('Invalid Firebase app binding expectedProjectId');
  if (config.projectId.trim() !== expectedProjectId) {
    throw new Error('Firebase projectId does not match the app binding expectedProjectId');
  }
  return Object.freeze({ appId, expectedProjectId });
}

export const firebaseConfigConstants = Object.freeze({ REQUIRED_FIREBASE_FIELDS, BINDING_APP_RE, PROJECT_ID_RE });

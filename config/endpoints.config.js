/**
 * Central API route map.
 * Edit this file if you need to remap core route groups.
 * Runtime deep-freeze prevents accidental mutation by application code.
 */

const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.getOwnPropertyNames(value).forEach((key) => deepFreeze(value[key]));
  return value;
};

export const API_CONFIG = deepFreeze({
  PREFIX: '/api',
  ROUTES: {
    AUTH: '/auth',
    DASHBOARD: '/dashboard',
    PENTEST: '/pentest',
    AUDITS: '/audits',
    FEEDBACK: '/feedback',
    COMMUNITY: '/community',
    STUDENT: '/student',
    PROFILE: '/profile',
    ADMIN: '/admin',
    PUBLIC: '/public',
    ENGAGEMENTS: '/engagements',
    REPORTS: '/reports',
    REMEDIATION: '/remediation',
    ASSETS: '/assets',
    BILLING: '/billing',
    NOTIFICATIONS: '/notifications',
    PENTESTERS: '/pentesters',
  },
});

export default API_CONFIG;

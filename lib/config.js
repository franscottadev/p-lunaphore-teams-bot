const REQUIRED_KEYS = [
  'MicrosoftAppId',
  'MicrosoftAppPassword',
  'MicrosoftAppTenantId',
  'KV_REST_API_URL',
  'KV_REST_API_TOKEN',
  'NOTIFY_SECRET',
];

const missing = REQUIRED_KEYS.filter((key) => !process.env[key]);
if (missing.length > 0) {
  throw new Error(`[config] Missing required env vars: ${missing.join(', ')}`);
}

export const config = {
  MicrosoftAppId: process.env.MicrosoftAppId,
  MicrosoftAppPassword: process.env.MicrosoftAppPassword,
  MicrosoftAppTenantId: process.env.MicrosoftAppTenantId,
  KV_REST_API_URL: process.env.KV_REST_API_URL,
  KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN,
  NOTIFY_SECRET: process.env.NOTIFY_SECRET,
  MAKE_WEBHOOK_URL: process.env.MAKE_WEBHOOK_URL,
};

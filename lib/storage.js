import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const NS = 'convref';

export async function saveConversationReference(key, ref) {
  await redis.set(`${NS}:${key}`, ref);
}

export async function getConversationReference(key) {
  return await redis.get(`${NS}:${key}`);
}

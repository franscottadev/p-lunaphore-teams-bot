import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const NS = 'convref';

export async function saveConversationReference(key, ref) {
  await redis.set(`${NS}:${key}`, JSON.stringify(ref));
}

export async function getConversationReference(key) {
  const raw = await redis.get(`${NS}:${key}`);
  return raw ? JSON.parse(raw) : null;
}

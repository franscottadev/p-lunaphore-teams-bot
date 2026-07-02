import { timingSafeEqual } from 'node:crypto';
import { config } from './config.js';

export function requireSecret(req) {
  const token = (req.headers['authorization'] ?? '').replace('Bearer ', '');
  const expected = config.NOTIFY_SECRET;

  const tokenBuf = Buffer.from(token);
  const expectedBuf = Buffer.from(expected);

  if (tokenBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(tokenBuf, expectedBuf);
}

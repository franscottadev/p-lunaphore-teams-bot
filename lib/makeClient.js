import fetch from 'node-fetch';

export async function forwardToMake(payload) {
  const url = process.env.MAKE_WEBHOOK_URL;
  if (!url) {
    console.warn('[makeClient] MAKE_WEBHOOK_URL not set — skipping');
    return;
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) console.error('[makeClient] Make responded with', res.status);
  } catch (err) {
    console.error('[makeClient] Error forwarding to Make:', err.message);
  }
}

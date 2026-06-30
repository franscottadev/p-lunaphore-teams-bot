import { saveConversationReference, getConversationReference } from '../lib/storage.js';
import { forwardToMake } from '../lib/makeClient.js';

// Fake conversation reference — mimics what Teams would provide
function buildFakeRef(userId, userName) {
  return {
    activityId: `sim-${Date.now()}`,
    user: { id: userId, name: userName },
    bot: { id: 'bot-sim', name: 'TeamsBot (sim)' },
    conversation: { id: `sim-conv-${userId}`, isGroup: false, tenantId: 'sim-tenant' },
    channelId: 'msteams',
    serviceUrl: 'https://smba.trafficmanager.net/teams/',
  };
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({
      usage: 'POST /api/simulate',
      body: { userId: 'string', userName: 'string', text: 'string', action: 'send | notify' },
    });
  }

  if (req.method !== 'POST') return res.status(405).end();

  const { userId = 'sim-user-001', userName = 'Sim User', text, action = 'send' } = req.body ?? {};
  const log = [];

  // --- action: notify — simulate Make calling back with AI response ---
  if (action === 'notify') {
    log.push({ step: 'notify', note: 'Simulating Make → Bot callback' });
    const ref = await getConversationReference(userId);
    if (!ref) {
      log.push({ step: 'notify', error: 'No conversation reference — run action:send first' });
      return res.status(404).json({ log });
    }
    log.push({ step: 'notify', foundRef: true, ref });
    log.push({
      step: 'notify',
      note: 'In real mode bot would call adapter.continueConversation() and send to Teams',
      wouldSend: text ?? '(no text provided)',
    });
    return res.status(200).json({ ok: true, log });
  }

  // --- action: send — simulate Teams user message ---
  if (!text) return res.status(400).json({ error: 'text is required for action:send' });

  log.push({ step: 'receive', note: 'Simulated Teams message received', userId, userName, text });

  // 1. Save conversation reference
  const ref = buildFakeRef(userId, userName);
  await saveConversationReference(userId, ref);
  log.push({ step: 'storage', note: 'Conversation reference saved to KV', key: `convref:${userId}` });

  // 2. Build Make payload (same as real bot)
  const ts = String(Date.now() / 1000);
  const makePayload = {
    text,
    user: userId,
    username: userName,
    channel: `sim-channel-${userId}`,
    ts,
    thread_ts: ts,
    channel_type: 'teams',
    teams_user_id: userId,
    teams_team_id: 'sim-team',
  };
  log.push({ step: 'make', note: 'Forwarding to Make webhook', payload: makePayload });

  // 3. Hit Make (real call)
  const makeUrl = process.env.MAKE_WEBHOOK_URL;
  if (!makeUrl) {
    log.push({ step: 'make', warning: 'MAKE_WEBHOOK_URL not set — skipped real call' });
  } else {
    await forwardToMake(makePayload);
    log.push({ step: 'make', note: 'Webhook called. Make AI agent will process and call /api/notify', notifyPayload: { user: userId, text: '<ai_response>' } });
  }

  log.push({
    step: 'done',
    note: 'When Make finishes, it should call POST /api/notify',
    example: {
      method: 'POST',
      url: '/api/notify',
      headers: { Authorization: 'Bearer <NOTIFY_SECRET>' },
      body: { user: userId, text: '<AI response here>' },
    },
  });

  return res.status(200).json({ ok: true, log });
}

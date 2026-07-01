import { CloudAdapter, ConfigurationBotFrameworkAuthentication } from 'botbuilder';
import { getConversationReference } from '../lib/storage.js';

const auth = new ConfigurationBotFrameworkAuthentication({
  MicrosoftAppId: process.env.MicrosoftAppId,
  MicrosoftAppPassword: process.env.MicrosoftAppPassword,
  MicrosoftAppType: 'SingleTenant',
  MicrosoftAppTenantId: process.env.MicrosoftAppTenantId,
});
const adapter = new CloudAdapter(auth);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = (req.headers['authorization'] ?? '').replace('Bearer ', '');
  if (!token || token !== process.env.NOTIFY_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Make sends: { user: <teams_user_id>, text: <ai_response> }
  // Also accepts legacy: { userId, message, channelId }
  const body = req.body ?? {};
  const lookupKey = body.channelId ?? body.userId ?? body.user;
  const message = body.message ?? body.text;

  if (!lookupKey || !message) {
    return res.status(400).json({ error: 'Missing user/userId/channelId or message/text' });
  }

  const ref = await getConversationReference(lookupKey);
  if (!ref) {
    return res.status(404).json({ error: 'No conversation reference found — user must message the bot first' });
  }

  // Simulated ref — skip real Teams delivery, return what would be sent
  if (ref._simulated) {
    return res.status(200).json({
      ok: true,
      simulated: true,
      wouldSendToTeams: { user: lookupKey, message },
    });
  }

  await adapter.continueConversationAsync(process.env.MicrosoftAppId, ref, async (context) => {
    await context.sendActivity(message);
  });

  return res.status(200).json({ ok: true });
}

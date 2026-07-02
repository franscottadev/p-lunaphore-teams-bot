import { CloudAdapter, ConfigurationBotFrameworkAuthentication } from 'botbuilder';
import { getConversationReference } from '../lib/storage.js';
import { config } from '../lib/config.js';
import { requireSecret } from '../lib/auth.js';

const auth = new ConfigurationBotFrameworkAuthentication({
  MicrosoftAppId: config.MicrosoftAppId,
  MicrosoftAppPassword: config.MicrosoftAppPassword,
  MicrosoftAppType: 'SingleTenant',
  MicrosoftAppTenantId: config.MicrosoftAppTenantId,
});
const adapter = new CloudAdapter(auth);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  if (!requireSecret(req)) {
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

  await adapter.continueConversationAsync(config.MicrosoftAppId, ref, async (context) => {
    await context.sendActivity(message);
  });

  return res.status(200).json({ ok: true });
}

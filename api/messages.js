import { CloudAdapter, ConfigurationBotFrameworkAuthentication } from 'botbuilder';
import { TeamsBot } from '../lib/bot.js';

const auth = new ConfigurationBotFrameworkAuthentication({
  MicrosoftAppId: process.env.MicrosoftAppId,
  MicrosoftAppPassword: process.env.MicrosoftAppPassword,
});
const adapter = new CloudAdapter(auth);

adapter.onTurnError = async (context, error) => {
  console.error('[onTurnError]', error);
  await context.sendActivity('An error occurred.');
};

const bot = new TeamsBot();

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!res.header) res.header = res.setHeader.bind(res);
  await adapter.process(req, res, (context) => bot.run(context));
}

import { TeamsActivityHandler, TurnContext } from 'botbuilder';
import { saveConversationReference } from './storage.js';
import { forwardToMake } from './makeClient.js';

export class TeamsBot extends TeamsActivityHandler {
  constructor() {
    super();

    this.onMessage(async (context, next) => {
      const ref = TurnContext.getConversationReference(context.activity);
      await saveConversationReference(context.activity.from.id, ref);

      const activity = context.activity;
      // ts mirrors Slack timestamp — used by Make AI agent as thread ID
      const ts = String(new Date(activity.timestamp).getTime() / 1000);
      const threadTs = activity.replyToId
        ? String(new Date(activity.replyToId).getTime() / 1000)
        : ts;

      await forwardToMake({
        // Slack-compatible fields (Make AI agent uses these)
        text: activity.text,
        user: activity.from.id,
        username: activity.from.name,
        channel: activity.channelData?.channel?.id ?? activity.conversation.id,
        ts,
        thread_ts: threadTs,
        channel_type: 'teams',
        // Extra Teams context for Make routing
        teams_user_id: activity.from.id,
        teams_team_id: activity.channelData?.team?.id,
      });

      await next();
    });

    this.onMembersAdded(async (context, next) => {
      for (const member of context.activity.membersAdded) {
        if (member.id !== context.activity.recipient.id) {
          const ref = TurnContext.getConversationReference(context.activity);
          await saveConversationReference(member.id, ref);
        }
      }
      await next();
    });
  }
}

# p-lunaphore-teams-bot

A Microsoft Teams bot that forwards user messages to a Make.com scenario for AI processing, and delivers the AI's response back to Teams proactively once Make calls back.

The bot itself holds no AI logic — it's a thin relay between Teams and Make, with Upstash Redis as the durable link between the two async legs of the conversation.

## Architecture

```mermaid
flowchart LR
    Teams["Microsoft Teams"] -- "user message" --> Bot["Bot Framework\n(api/messages.js)"]
    Bot -- "save conversation ref" --> Redis[("Upstash Redis\nconvref:<userId>")]
    Bot -- "forward payload" --> Make["Make.com scenario\n(AI agent)"]
    Make -- "POST /api/notify\n+ NOTIFY_SECRET" --> Notify["api/notify.js"]
    Notify -- "lookup conversation ref" --> Redis
    Notify -- "continueConversation()" --> Bot
    Bot -- "proactive reply" --> Teams
```

## Message flow (happy path)

```mermaid
sequenceDiagram
    participant U as Teams User
    participant B as Bot (api/messages.js)
    participant R as Upstash Redis
    participant M as Make Scenario

    U->>B: sends message ("hi")
    B->>R: saveConversationReference(userId, ref)
    B->>M: POST MAKE_WEBHOOK_URL (Slack-shaped payload)
    Note over B,U: No immediate reply — bot returns 200 to Teams and waits
    M->>M: AI agent processes message
    M->>B: POST /api/notify { user, text }\nAuthorization: Bearer NOTIFY_SECRET
    B->>R: getConversationReference(userId)
    R-->>B: stored ref
    B->>U: adapter.continueConversation() → sendActivity(text)
```

Key point: the bot **never replies synchronously** to a Teams message. It saves the conversation reference, fires the message to Make, and ends the turn. The actual reply only happens later, when Make calls `/api/notify` — at which point the bot uses the stored reference to push a message back into the same conversation.

## Components

| File | Responsibility |
|---|---|
| `api/messages.js` | Bot Framework webhook. Receives Teams activities, delegates to `TeamsBot`. |
| `lib/bot.js` | `TeamsActivityHandler` — on every message, saves the conversation reference and forwards to Make. On member-added, pre-saves the reference so proactive notify works even before the first message. |
| `lib/makeClient.js` | Fire-and-forget POST to `MAKE_WEBHOOK_URL` with a Slack-compatible payload shape (`text`, `user`, `channel`, `ts`, `thread_ts`, ...) since the Make scenario's AI agent expects Slack-style fields. |
| `lib/storage.js` | Upstash Redis KV wrapper. Namespace `convref:<key>` maps a Teams user/channel id to its serialized conversation reference. No schema, no TTL. |
| `api/notify.js` | Callback endpoint for Make. Auth via `Authorization: Bearer <NOTIFY_SECRET>`. Looks up the stored reference and pushes the AI response into Teams via `continueConversation`. |
| `api/simulate.js` | Local/dev harness that mimics the Teams → Make → notify round trip without a real Teams client, useful for testing the Make scenario in isolation. |

## Environment variables

| Variable | Purpose |
|---|---|
| `MicrosoftAppId` | Azure App Registration application (client) ID |
| `MicrosoftAppPassword` | Azure App Registration client secret **value** (not the Secret ID) |
| `MicrosoftAppTenantId` | Azure tenant ID — required when the App Registration is Single Tenant |
| `MAKE_WEBHOOK_URL` | Make.com scenario webhook that receives incoming Teams messages |
| `NOTIFY_SECRET` | Shared secret required as `Authorization: Bearer <secret>` on both `/api/notify` (called by Make) and `/api/simulate` (dev testing) |
| `KV_REST_API_URL` | Upstash Redis REST URL |
| `KV_REST_API_TOKEN` | Upstash Redis REST token |

## Setup

Full step-by-step walkthrough (Azure App Registration, Bot resource, Teams manifest, sideload, production rollout) is in **[SETUP.md](./SETUP.md)**.

Quick summary:

1. **Azure App Registration** — gives you `MicrosoftAppId` + client secret (`MicrosoftAppPassword`).
2. **Azure Bot resource** — create it, link the App Registration, add the Microsoft Teams channel.
3. **Upstash Redis** — create a database, copy REST URL/token.
4. **Deploy to Vercel** — set all env vars above in the project settings, deploy.
5. **Wire the endpoint** — set the Azure Bot's messaging endpoint to `https://<your-domain>/api/messages`.
6. **Make.com scenario** — set its incoming webhook URL as `MAKE_WEBHOOK_URL`, and configure the scenario to call `POST https://<your-domain>/api/notify` with the AI response once done.
7. **Teams manifest + sideload** — package `teamsAppManifest/` into a zip, upload as a custom app in Teams.

## Notes / known gaps

- Conversation references in Redis never expire (no TTL) — stale entries accumulate over time.
- `api/messages.js` and `api/notify.js` polyfill `res.header` (Vercel's response object lacks it, but `botbuilder`'s `CloudAdapter.process`/`continueConversationAsync` require it) — without this the adapter throws a Zod validation error and the webhook returns 500.
- `continueConversation` is deprecated/throws in current `botbuilder` — use `continueConversationAsync(MicrosoftAppId, ref, logic)` instead.
- If the Azure Bot resource's "Type of App" is Single Tenant, the App Registration's "Supported account types" must also be single-tenant, and `MicrosoftAppTenantId` must be set — otherwise you get `AADSTS...invalid_client` or a 401 from the Bot Framework connector when sending activities.
- `MicrosoftAppPassword` must be the secret **Value**, not the **Secret ID** (both are shown in Certificates & secrets — easy to copy the wrong one).
- `/api/simulate` is gated with the same `NOTIFY_SECRET` bearer check as `/api/notify` — don't expose it without auth in production, it can trigger fake conversations and read/write Redis.

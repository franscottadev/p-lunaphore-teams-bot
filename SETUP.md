# Setup Guide — p-lunaphore-teams-bot

End-to-end steps to create, configure, deploy, and roll out this bot to Microsoft Teams. Follow in order — later steps depend on values from earlier ones.

## 1. Create the Azure App Registration

This is the bot's identity, independent of where the code is hosted.

1. Go to [portal.azure.com](https://portal.azure.com) → search **"Entra ID"** (formerly Azure Active Directory).
2. Left menu → **App registrations** → **New registration**.
3. Name it (e.g. `p-lunaphore-teams-bot`).
4. **Supported account types** — pick one, and remember your choice, it must match the Azure Bot resource type in step 2:
   - **Single tenant** ("Accounts in this organizational directory only") — simpler, recommended unless you need multi-org support.
   - **Multi tenant** ("Accounts in any organizational directory + personal Microsoft accounts") — only if you need the bot installable across arbitrary orgs.
5. Create. On the Overview page, copy:
   - **Application (client) ID** → this is `MicrosoftAppId`.
   - **Directory (tenant) ID** → this is `MicrosoftAppTenantId` (only needed if you picked Single Tenant).
6. Left menu → **Certificates & secrets** → **Client secrets** tab → **+ New client secret**.
   - Pick an expiry, add it.
   - Copy the **Value** column immediately — it's hidden after you leave the page. This is `MicrosoftAppPassword`.
   - Do **not** copy the **Secret ID** column — that's a different, non-secret identifier and will cause an `AADSTS7000215: Invalid client secret` error if used by mistake.

## 2. Create the Azure Bot resource

This is what connects your App Registration to the Bot Framework channels (Teams, Web Chat, etc).

1. Portal → **Create a resource** → search **"Azure Bot"** → Create.
2. Fill in:
   - **Bot handle**: any unique name.
   - **Pricing tier**: F0 (free) is enough for dev/small usage.
   - **Type of App**: must match what you picked in step 1 — **Single Tenant** or **Multi Tenant**. This field is **locked after creation**, so get it right now.
   - **Microsoft App ID**: choose "Use existing app registration" → paste the Application ID from step 1.
3. Create, wait for deployment to finish.
4. Left menu → **Channels** → add **Microsoft Teams** → Save (accept the default Messaging config, skip Calling, skip Publish).
5. Leave **Configuration → Messaging endpoint** blank for now — comes back in step 5.

> If you ever need to change Single Tenant ↔ Multi Tenant, you cannot edit the existing resource — delete it and recreate with the correct type.

## 3. Create the Upstash Redis database

Used as the only datastore — a flat KV store mapping a Teams user/channel id to its serialized conversation reference (no schema, no relations needed).

1. [Upstash console](https://console.upstash.com) → Create database.
2. Copy **REST URL** → `KV_REST_API_URL`.
3. Copy **REST Token** → `KV_REST_API_TOKEN`.

## 4. Set environment variables and deploy to Vercel

Set these in Vercel project → Settings → Environment Variables:

```
MicrosoftAppId=<from step 1>
MicrosoftAppPassword=<secret VALUE from step 1>
MicrosoftAppTenantId=<tenant id from step 1, if Single Tenant>
KV_REST_API_URL=<from step 3>
KV_REST_API_TOKEN=<from step 3>
MAKE_WEBHOOK_URL=<your Make.com scenario's webhook URL>
NOTIFY_SECRET=<any random string you generate — used to auth /api/notify and /api/simulate>
```

Deploy:

```
vercel --prod
```

(or push to the linked git branch if git integration is enabled — Vercel auto-deploys on push).

Env var changes require a **new deployment** to take effect — updating them alone doesn't republish already-running functions.

## 5. Wire the messaging endpoint

1. Azure Bot resource → **Configuration** → **Messaging endpoint**:
   ```
   https://<your-vercel-domain>/api/messages
   ```
2. Save.
3. Azure Bot resource → **Test in Web Chat** (left menu) — send a message, confirm it doesn't 500. This tests the Teams↔bot leg only; the Make round trip needs `MAKE_WEBHOOK_URL`/`NOTIFY_SECRET` wired too.

## 6. Configure the Make.com scenario

1. In Make, create a webhook trigger, copy its URL into `MAKE_WEBHOOK_URL` (Vercel env var, redeploy after).
2. The bot forwards Slack-shaped fields to this webhook: `text`, `user`, `username`, `channel`, `ts`, `thread_ts`, `channel_type: 'teams'`, `teams_user_id`, `teams_team_id` — build the scenario logic against those.
3. When the scenario finishes, it must call back:
   ```
   POST https://<your-vercel-domain>/api/notify
   Authorization: Bearer <NOTIFY_SECRET>
   Content-Type: application/json

   { "user": "<teams_user_id from the trigger payload>", "text": "<AI response>" }
   ```
4. Test with a real Teams message once Web Chat sanity-checks pass.

## 7. Package the Teams app manifest

Files live in `teamsAppManifest/`:
- `manifest.json` — already scoped to `botId` = your `MicrosoftAppId`, and `validDomains` = your Vercel domain. Update both if either changes.
- `color.png` (192×192) and `outline.png` (32×32) — app icons. Resize source images with `sips` on macOS:
  ```
  sips -z 192 192 <source>.png --out color.png
  sips -z 32 32 <source>.png --out outline.png
  ```

Zip it:

```
cd teamsAppManifest && zip -r ../lunaphore-bot.zip manifest.json color.png outline.png
```

## 8. Sideload into Teams

1. Teams client → **Apps** (left sidebar) → **Manage your apps** → **Upload an app** → **Upload a custom app**.
2. Select the zip from step 7.
3. If the upload option is missing/greyed out, custom app uploads are disabled by org policy — a Teams admin needs to enable it at [admin.teams.microsoft.com](https://admin.teams.microsoft.com) → **Teams apps** → **Setup policies** → (Global or relevant policy) → toggle **Upload custom apps** → Save.

This sideloads the app to your account only. For org-wide rollout without per-user sideloading, submit it through **Teams admin center → Teams apps → Manage apps → Upload** (publish for the org's app catalog) instead.

## Production rollout checklist

- [ ] Client secret expiry noted — rotate before it lapses (bot fails silently on the token step otherwise).
- [ ] `NOTIFY_SECRET` is a real random string, not guessable.
- [ ] `/api/simulate` requires the same `Authorization: Bearer <NOTIFY_SECRET>` header — confirm it 401s without one before treating the deploy as production-safe.
- [ ] Azure Bot pricing tier reviewed — F0 (free) has usage limits, upgrade to S1 if traffic requires it.
- [ ] Decide sideload (personal) vs org catalog publish (wide rollout) based on audience.
- [ ] Redis conversation references have no TTL — acceptable for now, but revisit if storage grows unbounded.

## Common errors and fixes

| Error | Cause | Fix |
|---|---|---|
| `ZodError: ... message: "Response"` in `cloudAdapter.js` | Vercel's `res` object lacks `.header()`, which `CloudAdapter.process` requires | Polyfill `res.header = res.setHeader.bind(res)` before calling `adapter.process` |
| `CloudAdapterBase.continueConversation is deprecated` (thrown, not just a warning) | Current `botbuilder` removed the sync method | Use `adapter.continueConversationAsync(MicrosoftAppId, ref, logic)` instead |
| `AADSTS7000215: Invalid client secret provided` | Copied the Secret **ID** instead of the Secret **Value** | Go back to Certificates & secrets, copy the Value column (visible once, at creation) |
| `RestError` 401 posting to `webchat.botframework.com`/Teams, even though AAD token acquisition succeeds | Azure Bot resource's "Type of App" doesn't match the App Registration's tenant scope | Recreate the Bot resource with the matching type (Single Tenant ↔ Multi Tenant); if Single Tenant, also set `MicrosoftAppTenantId` and `MicrosoftAppType: 'SingleTenant'` in the adapter config |
| Sent a message, nothing happens in Teams | This is by design — the bot never replies synchronously. Check Vercel function logs for `[makeClient]` warnings (missing `MAKE_WEBHOOK_URL`) or confirm Make's scenario history shows the trigger fired and it called back `/api/notify` |

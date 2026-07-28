# Tale of Two Crew Reminder Pilot

This build adds a private Telegram pilot alongside the existing Calendar
Reminder build. The pilot links only the signed-in test user's Crew profile,
sends one on-demand private test reminder and records the **I'll Be There**
button response in the Ledger. It does not contact other crew members and does
not enable automatic Telegram scheduling.

## Telegram pilot setup

1. In Telegram, open `@BotFather`, run `/newbot`, and create a bot named
   `Tale of Two Crew`.
2. Copy the bot token. Do not place it in HTML, commit it to GitHub or share it
   in chat.
3. From the project folder, save it as a Firebase secret:

   ```bash
   firebase functions:secrets:set TELEGRAM_BOT_TOKEN
   ```

4. Deploy the three Telegram pilot functions:

   ```bash
   npm --prefix functions install
   firebase deploy --only functions:createTelegramActivation,functions:sendTelegramTest,functions:telegramWebhook
   ```

5. Sign in to `crew.html` with the test Google account and create a Crew
   profile if needed.
6. Tap **Activate Telegram Test**, press **Start** in Telegram, allow Telegram
   notifications and tap **Notifications Enabled**.
7. Return to the Crew App, tap **Send Test Reminder**, then press
   **I'll Be There** in Telegram.

The bot webhook configures itself when the activation link is created. The
Crew App then shows the delivery and confirmation proof. The Telegram bot token
stays only in Firebase Secrets.

## What remains off during the pilot

- No automatic assignment messages
- No previous-evening reminders
- No automatic two-hour reminders
- No crew-wide activation links
- No WhatsApp API messages

## Legacy WhatsApp code retained but not activated

The earlier WhatsApp reminder functions remain in the source so no previous
work is lost. They are not part of the three-function Telegram pilot deployment.
Do not deploy all functions unless the official WhatsApp API is intentionally
being activated later.

When deliberately deployed and configured, that older flow can:

- Send a WhatsApp message when a crew member is assigned or their assignment
  details materially change.
- Send a WhatsApp reminder two hours before that crew member's reporting time.
- A member-specific arrival-time override is used when present. Otherwise, the
  event's overall team reporting time is used.
- Each send is claimed and recorded once to prevent duplicate messages.
- The Ledger shows `WhatsApp scheduled`, `Assignment sent`, `WhatsApp sent` or
  `WhatsApp failed`, followed by the existing Opened, Confirmed, In progress and
  Completed states.

All reminder calculations use Asia/Kolkata.

## Calendar reminder fallback

After a crew member confirms an assignment, the Crew App shows an **Add this
shoot to your calendar** card.

- **Google Calendar** opens a pre-filled Google Calendar event for Android or
  anyone who uses Google Calendar. The Crew App asks the member to add a
  two-hour notification before saving because Google's public pre-fill link
  does not set per-event notifications.
- **Apple / Other** downloads a standard `.ics` event containing a two-hour
  display alarm.
- The event begins at that crew member's individual reporting time and blocks
  time through the expected end of coverage.
- The title, role, venue, directions, reporting time and exact Crew App link are
  included.
- If the date, reporting time, venue, role or event changes after the calendar
  link was opened, the Crew App asks that person to update their calendar.

Calendar events are free and do not need the WhatsApp Business API. The crew
member must still tap Save/Add inside their calendar, and calendar notifications
must be allowed in their phone settings. The Ledger records that the calendar
link was opened; a browser cannot prove that the final calendar save happened.

## Official WhatsApp setup

Use the Tale of Two Weddings WhatsApp Business number connected to Meta's
WhatsApp Cloud API. Create and approve these two utility templates:

- `totw_crew_assignment`
- `totw_crew_reporting_reminder`

Both templates use five body variables in this order:

1. Couple
2. Event
3. Reporting time
4. Role
5. Venue

Recommended assignment template:

```text
New shoot assigned

{{1}} · {{2}}
Reporting: {{3}}
Your role: {{4}}
Venue: {{5}}

Please open your assignment and confirm.
```

Recommended two-hour template:

```text
Shoot reminder — reporting in 2 hours

{{1}} · {{2}}
Reporting: {{3}}
Your role: {{4}}
Venue: {{5}}

Please review your assignment before leaving.
```

Add one dynamic URL button to each template. Use this base:

`https://studio.taleoftwoweddings.com/crew.html{{1}}`

The backend supplies `?event=EVENT_ID` as the dynamic value.

## Optional WhatsApp setup — do not use for this pilot

Set the WhatsApp access token as a Firebase secret:

```bash
firebase functions:secrets:set WHATSAPP_ACCESS_TOKEN
```

Create `functions/.env.tot-ledger`:

```dotenv
WHATSAPP_PHONE_NUMBER_ID=YOUR_PHONE_NUMBER_ID
WHATSAPP_ASSIGNMENT_TEMPLATE=totw_crew_assignment
WHATSAPP_REMINDER_TEMPLATE=totw_crew_reporting_reminder
WHATSAPP_TEMPLATE_LANGUAGE=en
```

Then deploy:

```bash
npm --prefix functions install
firebase deploy --only functions
```

Scheduled functions require the Firebase project to be on the Blaze plan. Keep
the permanent system-user token only in Firebase Secrets; never place it in an
HTML or browser JavaScript file.

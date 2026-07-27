# Tale of Two Crew WhatsApp Reminders

This build uses official WhatsApp Business messaging for crew reminders. It
does not ask the crew for browser notification permission, register devices or
send test notifications.

## What is automatic

- A WhatsApp message is sent when a crew member is assigned or their assignment
  details materially change.
- A WhatsApp reminder is sent two hours before that crew member's reporting
  time.
- A member-specific arrival-time override is used when present. Otherwise, the
  event's overall team reporting time is used.
- Each send is claimed and recorded once to prevent duplicate messages.
- The Ledger shows `WhatsApp scheduled`, `Assignment sent`, `WhatsApp sent` or
  `WhatsApp failed`, followed by the existing Opened, Confirmed, In progress and
  Completed states.

All reminder calculations use Asia/Kolkata.

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

## Configure and deploy

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

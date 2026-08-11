# Tale of Two Weddings — Studio Handoff

**Build:** `v13.1.0-traditional-day-pass-beta-2026-08-11`  
**Client and crew URLs:** unchanged

## The simple operating rule

Use **Today** to see what needs you. Use **Weddings → Team & prep** to assign crew, timings, lists, boards, costs and data status once. **Day-of** and **Finance & Reports** read from that same operational record.

Dates & Enquiries and Crew Planner remain unchanged.

## Main navigation

| Area | Purpose |
|---|---|
| Today | Due follow-ups, client reviews, upcoming work, live events and delivery queue |
| Dates & Enquiries | Sales calendar and enquiries — unchanged |
| Weddings | One folder per couple; client link, event plan, crew, delivery and package spend |
| Crew Planner | Monthly roster — unchanged |
| Day-of | Check-in/out, WhatsApp, cards and handover |
| Team | Master identity, contact, role and default day rate |
| Finance & Reports | Package, crew spend, margin, custody and exports |
| Settings | Shot-list and Pinterest templates plus checklist archive |

## Single-source data contract

- `crewProfiles/{uid}` owns crew identity, contact, default role and default day rate.
- `crewCheckins/events/{eventId}/crew/{uid}` owns the exact event assignment and event-specific arrival/role.
- `crewDayCosts/{formId}/{date}/{uid}` owns one manual cost per wedding/date/person.
- `crewCheckins/assignments` is the Crew App index.
- `prod.days[].roles[]` is the backwards-compatible Finance/report projection.
- `traditionalUnits/{weddingId}/{date}/{unitId}` owns the private supplier, composition, cost and internal note.
- `traditionalPasses/{passId}` is a sanitized operational projection for one authenticated, temporary on-ground captain.
- Client event details shown to crew come from the approved client snapshot, not a newer unapproved edit.

## Workflow

1. Book in Dates & Enquiries.
2. Open the couple in Weddings and create/share the private client link.
3. Review and approve each completed client event.
4. In Weddings → Team & prep, add crew once, set overall/individual arrival, shot lists, Pinterest and day cost.
5. Share the crew link. Day-of uses the same assignment for check-in/out and cards.
6. After the shoot, complete handoff, delivery and package/crew-cost review inside the same wedding folder.

## Traditional Day Pass beta

1. In Team, add or edit Sai Charan, Prithvi or Srinivas and choose **Traditional Partner**.
2. In Weddings → Team & prep, choose **+ Traditional unit**.
3. Select the partner, date, TP/TV count, reporting time and one private manual day cost.
4. Choose **WhatsApp pass**. The partner forwards the secure link only to the person responsible on location.
5. The captain signs in with Google, confirms their name/phone, starts the traditional day, completes event-wise traditional checklists and records cards/data handover at finish.
6. The pass expires after the shoot. Rates and internal notes never appear in it. Hours are informational and never calculate payment.

## Crew without a phone number

You can create a pending Team profile with only a name and role for planning. Add the person’s Google-account email before sharing the Crew App link; their first sign-in can then connect to the pending profile and inherit its assignments. The Team card clearly shows whether the profile is connected.

## Release checks

- Back up Firebase data first.
- Deploy and verify the included database.rules.json. It preserves the supplied access model and adds the v13 owner-only day-cost/planning paths and Team profile fields.
- Confirm owner, client-token and assigned-crew access with separate test identities.
- Test two events on one date: one person must appear twice operationally but only once in that day’s Finance cost.
- Test partial client approval, crew registration, profile edit, check-in/out, cards and hard refresh on desktop and mobile.
- Deploy only `functions:claimTraditionalDayPass` for the beta claim flow.
- Confirm page-source build tag: `v13.1.0-traditional-day-pass-beta-2026-08-11`.

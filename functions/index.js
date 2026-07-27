"use strict";

const {initializeApp} = require("firebase-admin/app");
const {getDatabase} = require("firebase-admin/database");
const {onValueWritten} = require("firebase-functions/v2/database");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {defineSecret, defineString} = require("firebase-functions/params");
const logger = require("firebase-functions/logger");

initializeApp();

const REGION = "asia-southeast1";
const IST_OFFSET_MINUTES = 330;
const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;

const whatsappAccessToken = defineSecret("WHATSAPP_ACCESS_TOKEN");
const whatsappPhoneNumberId = defineString("WHATSAPP_PHONE_NUMBER_ID", {default: ""});
const whatsappAssignmentTemplate = defineString("WHATSAPP_ASSIGNMENT_TEMPLATE", {default: "totw_crew_assignment"});
const whatsappReminderTemplate = defineString("WHATSAPP_REMINDER_TEMPLATE", {default: "totw_crew_reporting_reminder"});
const whatsappLanguage = defineString("WHATSAPP_TEMPLATE_LANGUAGE", {default: "en"});

function eventTimeMs(date, time) {
  const match = String(date || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const clock = String(time || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!match || !clock) return NaN;
  return Date.UTC(+match[1], +match[2] - 1, +match[3], +clock[1], +clock[2]) - IST_OFFSET_MINUTES * MINUTE;
}

function arrivalTime(event, member) {
  return member.arrivalTime || member.reportTime || event.reportingTime || event.scheduledStart || event.functionStart || "";
}

function fmtTime(value) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return "time pending";
  const hour = +match[1];
  return `${hour % 12 || 12}:${match[2]} ${hour >= 12 ? "PM" : "AM"}`;
}

function assignmentFingerprint(event, member) {
  return JSON.stringify([
    event.couple || "",
    event.eventName || "",
    event.date || "",
    arrivalTime(event, member),
    member.role || "",
    event.venueName || "",
    event.mapsUrl || "",
  ]);
}

function whatsappTemplate(kind, eventId, event, member) {
  const report = fmtTime(arrivalTime(event, member));
  const values = [
    event.couple || "Wedding assignment",
    event.eventName || "Event",
    report,
    member.role || "Crew",
    event.venueName || "Venue to be updated",
  ];
  return {
    name: kind === "assignment" ? whatsappAssignmentTemplate.value() : whatsappReminderTemplate.value(),
    language: {code: whatsappLanguage.value()},
    components: [
      {type: "body", parameters: values.map((text) => ({type: "text", text}))},
      {type: "button", sub_type: "url", index: "0", parameters: [{type: "text", text: `?event=${eventId}`}]},
    ],
  };
}

async function sendWhatsApp(kind, eventId, event, member, profile) {
  const phoneNumberId = whatsappPhoneNumberId.value();
  const phone = String(member.phone || profile.phone || "").replace(/\D/g, "");
  const internationalPhone = phone.length === 10 ? `91${phone}` : phone;
  let token = "";
  try {
    token = whatsappAccessToken.value();
  } catch (error) {
    return {status: "unavailable"};
  }
  if (!phoneNumberId || !token || internationalPhone.length < 11) return {status: "unavailable"};
  const response = await fetch(`https://graph.facebook.com/v25.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {"Authorization": `Bearer ${token}`, "Content-Type": "application/json"},
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: internationalPhone,
      type: "template",
      template: whatsappTemplate(kind, eventId, event, member),
    }),
  });
  const result = await response.json();
  if (!response.ok) {
    logger.error("WhatsApp reminder failed", {eventId, kind, uid: profile.uid, status: response.status, result});
    return {status: "failed", httpStatus: response.status};
  }
  return {status: "sent", messageId: result.messages && result.messages[0] && result.messages[0].id || null};
}

async function claimDelivery(eventId, uid, kind, now) {
  const ref = getDatabase().ref(`crewNotifications/${eventId}/${uid}/${kind}`);
  const result = await ref.transaction((current) => {
    if (current && current.sentAt) return;
    if (current && current.claimedAt && now - current.claimedAt < 10 * MINUTE) return;
    if (current && current.status === "unavailable" && current.completedAt && now - current.completedAt < HOUR) return;
    return {...(current || {}), status: "sending", claimedAt: now};
  });
  return result.committed ? ref : null;
}

async function deliver(kind, eventId, uid, event, member, profile) {
  const now = Date.now();
  const statusRef = await claimDelivery(eventId, uid, kind, now);
  if (!statusRef) return false;
  try {
    const whatsapp = await sendWhatsApp(kind, eventId, event, member, profile);
    const sent = whatsapp.status === "sent";
    await statusRef.update({
      channel: "whatsapp",
      status: sent ? "sent" : (whatsapp.status === "failed" ? "failed" : "unavailable"),
      completedAt: Date.now(),
      sentAt: sent ? Date.now() : null,
      whatsapp,
    });
    return sent;
  } catch (error) {
    logger.error("Crew reminder delivery failed", {eventId, uid, kind, error});
    await statusRef.update({status: "failed", completedAt: Date.now(), error: String(error && error.message || error)});
    return false;
  }
}

exports.notifyAssignmentChange = onValueWritten(
    {ref: "/crewCheckins/events/{eventId}", region: REGION, secrets: [whatsappAccessToken]},
    async (event) => {
      const before = event.data.before.val() || {};
      const after = event.data.after.val() || {};
      if (!event.data.after.exists()) return;
      const eventId = event.params.eventId;
      const profilesSnap = await getDatabase().ref("crewProfiles").get();
      const profiles = profilesSnap.val() || {};
      const jobs = [];
      for (const [uid, member] of Object.entries(after.crew || {})) {
        const oldMember = (before.crew || {})[uid];
        if (oldMember && assignmentFingerprint(before, oldMember) === assignmentFingerprint(after, member)) continue;
        if (!profiles[uid]) continue;
        jobs.push(deliver("assignment", eventId, uid, after, member, {...profiles[uid], uid}));
      }
      await Promise.all(jobs);
    },
);

exports.processCrewReminders = onSchedule(
    {schedule: "every 5 minutes", timeZone: "Asia/Kolkata", region: REGION, secrets: [whatsappAccessToken]},
    async () => {
      const now = Date.now();
      const [eventsSnap, profilesSnap, notificationsSnap] = await Promise.all([
        getDatabase().ref("crewCheckins/events").get(),
        getDatabase().ref("crewProfiles").get(),
        getDatabase().ref("crewNotifications").get(),
      ]);
      const events = eventsSnap.val() || {};
      const profiles = profilesSnap.val() || {};
      const notifications = notificationsSnap.val() || {};
      const jobs = [];
      for (const [eventId, shoot] of Object.entries(events)) {
        for (const [uid, member] of Object.entries(shoot.crew || {})) {
          const profile = profiles[uid];
          if (!profile) continue;
          const arrival = eventTimeMs(shoot.date, arrivalTime(shoot, member));
          if (!Number.isFinite(arrival) || arrival <= now) continue;
          const status = ((notifications[eventId] || {})[uid]) || {};
          if (!status.assignment || !status.assignment.sentAt) {
            jobs.push(deliver("assignment", eventId, uid, shoot, member, {...profile, uid}));
          }
          const twoHourAt = arrival - 2 * HOUR;
          if (now >= twoHourAt && !status.twoHour?.sentAt) {
            jobs.push(deliver("twoHour", eventId, uid, shoot, member, {...profile, uid}));
          }
        }
      }
      await Promise.all(jobs);
    },
);

"use strict";

const {initializeApp} = require("firebase-admin/app");
const {getDatabase} = require("firebase-admin/database");
const {onValueWritten} = require("firebase-functions/v2/database");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {onCall, onRequest, HttpsError} = require("firebase-functions/v2/https");
const {defineSecret, defineString} = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const crypto = require("crypto");

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
const telegramBotToken = defineSecret("TELEGRAM_BOT_TOKEN");

function telegramSecret(token) {
  return crypto.createHash("sha256").update(token).digest("hex").slice(0, 32);
}

async function telegramApi(method, body) {
  const token = telegramBotToken.value();
  if (!token) throw new Error("Telegram bot token is unavailable");
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(body || {}),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    throw new Error(`Telegram ${method} failed: ${result.description || response.status}`);
  }
  return result.result;
}

async function ensureTelegramWebhook() {
  const token = telegramBotToken.value();
  const project = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
  if (!project) throw new Error("Firebase project ID is unavailable");
  const url = `https://${REGION}-${project}.cloudfunctions.net/telegramWebhook`;
  await telegramApi("setWebhook", {
    url,
    secret_token: telegramSecret(token),
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: false,
  });
  return telegramApi("getMe");
}

async function sendTelegramMessage(chatId, text, buttons) {
  return telegramApi("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: buttons ? {inline_keyboard: buttons} : undefined,
  });
}

function callbackUid(data, prefix) {
  const value = String(data || "");
  return value.startsWith(`${prefix}:`) ? value.slice(prefix.length + 1) : "";
}

exports.createTelegramActivation = onCall(
    {region: REGION, secrets: [telegramBotToken]},
    async (request) => {
      if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to the Crew App first.");
      const uid = request.auth.uid;
      const profileRef = getDatabase().ref(`crewProfiles/${uid}`);
      const profileSnap = await profileRef.get();
      if (!profileSnap.exists()) throw new HttpsError("failed-precondition", "Create your crew profile first.");
      const token = crypto.randomBytes(18).toString("hex");
      const now = Date.now();
      await getDatabase().ref(`telegramActivations/${token}`).set({
        uid,
        createdAt: now,
        expiresAt: now + 24 * HOUR,
      });
      await profileRef.child("telegram").update({
        status: "setup_pending",
        invitedAt: now,
      });
      try {
        const bot = await ensureTelegramWebhook();
        return {
          url: `https://t.me/${bot.username}?start=${token}`,
          botUsername: bot.username,
        };
      } catch (error) {
        await getDatabase().ref(`telegramActivations/${token}`).remove();
        logger.error("Telegram activation link failed", {uid, error});
        throw new HttpsError("unavailable", "The Telegram test bot is not configured yet.");
      }
    },
);

exports.sendTelegramTest = onCall(
    {region: REGION, secrets: [telegramBotToken]},
    async (request) => {
      if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to the Crew App first.");
      const uid = request.auth.uid;
      const profileSnap = await getDatabase().ref(`crewProfiles/${uid}`).get();
      const profile = profileSnap.val() || {};
      const telegram = profile.telegram || {};
      if (!telegram.chatId) throw new HttpsError("failed-precondition", "Activate Telegram first.");
      const firstName = String(profile.name || "there").trim().split(/\s+/)[0];
      const now = Date.now();
      const crewUrl = "https://studio.taleoftwoweddings.com/crew.html";
      const message = [
        "<b>Test reminder — Tale of Two Weddings</b>",
        "",
        `Hi ${firstName}, this is your private Telegram reminder test.`,
        "",
        "<b>Test shoot:</b> Telegram Pilot",
        "<b>Reporting:</b> In 2 hours",
        "<b>Role:</b> Test crew member",
        "",
        "Tap the button below so the Ledger can record your confirmation.",
      ].join("\n");
      const sent = await sendTelegramMessage(telegram.chatId, message, [
        [{text: "I’ll Be There", callback_data: `test:${uid}`}],
        [{text: "Open Crew App", url: crewUrl}],
      ]);
      await getDatabase().ref(`telegramTests/${uid}`).set({
        status: "sent",
        sentAt: now,
        messageId: sent.message_id,
        chatId: String(telegram.chatId),
      });
      await getDatabase().ref(`crewProfiles/${uid}/telegram`).update({
        lastTestSentAt: now,
        lastTestConfirmedAt: null,
      });
      return {sent: true};
    },
);

exports.telegramWebhook = onRequest(
    {region: REGION, secrets: [telegramBotToken]},
    async (request, response) => {
      const expected = telegramSecret(telegramBotToken.value());
      if (request.get("x-telegram-bot-api-secret-token") !== expected) {
        response.status(403).send("Forbidden");
        return;
      }
      const update = request.body || {};
      try {
        if (update.message && update.message.chat) {
          const text = String(update.message.text || "");
          const match = text.match(/^\/start(?:@\w+)?\s+([A-Za-z0-9_-]+)$/);
          if (match) {
            const activationRef = getDatabase().ref(`telegramActivations/${match[1]}`);
            const activationSnap = await activationRef.get();
            const activation = activationSnap.val();
            if (!activation || !activation.uid || activation.expiresAt < Date.now()) {
              await sendTelegramMessage(update.message.chat.id, "This activation link has expired. Open the Crew App and create a fresh link.");
            } else {
              const uid = activation.uid;
              const chatId = String(update.message.chat.id);
              const now = Date.now();
              const profileRef = getDatabase().ref(`crewProfiles/${uid}`);
              const profileSnap = await profileRef.get();
              const profile = profileSnap.val() || {};
              await getDatabase().ref().update({
                [`crewProfiles/${uid}/telegram/chatId`]: chatId,
                [`crewProfiles/${uid}/telegram/username`]: update.message.from && update.message.from.username || "",
                [`crewProfiles/${uid}/telegram/firstName`]: update.message.from && update.message.from.first_name || "",
                [`crewProfiles/${uid}/telegram/status`]: "activated",
                [`crewProfiles/${uid}/telegram/activatedAt`]: now,
                [`crewProfiles/${uid}/telegram/notificationsAcknowledgedAt`]: null,
                [`telegramChatIndex/${chatId}`]: uid,
                [`telegramActivations/${match[1]}`]: null,
              });
              const name = String(profile.name || update.message.from.first_name || "there").trim().split(/\s+/)[0];
              await sendTelegramMessage(
                  chatId,
                  `<b>Telegram reminders activated</b>\n\nHi ${name}, this private chat is now linked to your Tale of Two crew profile.\n\nPlease allow Telegram notifications on your phone, then tap below.`,
                  [[{text: "Notifications Enabled", callback_data: `notice:${uid}`}]],
              );
            }
          }
        }

        if (update.callback_query) {
          const query = update.callback_query;
          const chatId = String(query.message && query.message.chat && query.message.chat.id || "");
          const noticeUid = callbackUid(query.data, "notice");
          const testUid = callbackUid(query.data, "test");
          const uid = noticeUid || testUid;
          if (uid) {
            const profileRef = getDatabase().ref(`crewProfiles/${uid}`);
            const profileSnap = await profileRef.get();
            const profile = profileSnap.val() || {};
            if (String(profile.telegram && profile.telegram.chatId || "") !== chatId) {
              await telegramApi("answerCallbackQuery", {callback_query_id: query.id, text: "This button is not linked to this Telegram account.", show_alert: true});
            } else if (noticeUid) {
              const now = Date.now();
              await profileRef.child("telegram").update({
                status: "ready",
                notificationsAcknowledgedAt: now,
              });
              await telegramApi("answerCallbackQuery", {callback_query_id: query.id, text: "Notifications confirmed"});
              await sendTelegramMessage(chatId, "✅ Setup complete. Return to the Crew App and tap <b>Send Test Reminder</b>.");
            } else {
              const now = Date.now();
              await getDatabase().ref(`telegramTests/${uid}`).update({status: "confirmed", confirmedAt: now});
              await profileRef.child("telegram").update({lastTestConfirmedAt: now});
              await telegramApi("answerCallbackQuery", {callback_query_id: query.id, text: "Confirmation recorded"});
              await sendTelegramMessage(chatId, "✅ Test confirmed. The Ledger has recorded your response successfully.");
            }
          }
        }
        response.status(200).send("OK");
      } catch (error) {
        logger.error("Telegram webhook failed", {error});
        response.status(200).send("OK");
      }
    },
);

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

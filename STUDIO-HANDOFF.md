# Tale of Two Weddings — Full Studio Handoff

**Build to upload:** full folder · `v12.7.9-finance-sync-and-refresh-fix-2026-08-09`  
**Live links:** client + crew URLs unchanged · data paths unchanged  

---

## 1. What the product is now

One studio ledger with a **Weddings hub** at the center.

| Left rail | Job |
|-----------|-----|
| **Dates & Enquiries** | Sales / calendar / bookings |
| **Weddings** | One couple home — plan, team, deliver, finance, handoff |
| **Crew Planner** | Month roster (CP/CV/TP/TV) + optional push of pay/GB |
| **Shoot Operations** | Day-of: links, check-in, cards, live status |
| **Data & custody** | Deep disks / pay / cards / alerts / season PDF |
| **Settings** | Common shot lists + Pinterest boards |

Hidden from rail (still safe if old bookmarks exist): Business Overview, Deliverables → remapped into Weddings.

---

## 2. End-to-end wedding flow

```
Enquiry → Booked → Weddings folder + client link
    → Couple fills private link
    → You approve in Weddings
    → Events appear in Shoot Operations
    → Plan team / lists / boards in Weddings → Events
    → Shoot day in Shoot Operations
    → Overview → Confirm handoff (per completed event)
    → Deliver + Finance (+ Data & custody depth)
    → Closed when deliverables done
```

### A. Before the week

1. **Dates & Enquiries** — book the couple  
2. The couple appears immediately in **Weddings**; open the folder and confirm the prefilled private **client link** setup  
3. Couple fills timings, venue, maps (`event-details.html` — URL never changes)  
4. Approve in Weddings (review panel if they update)  
5. **Crew Planner** — fill month grid if you want studio-wide roster  

### B. Event prep (inside Weddings → Events)

For Haldi / Wedding / etc.:

- Team (CP/CV/TP/TV)  
- Shot lists (content edited in **Settings**; assigned per event here)  
- Optional Pinterest  
- Save / publish plan → Shoot Operations  

### C. Shoot day (Shoot Operations)

- Crew link / WhatsApp  
- Newly published assignments appear in an already-open Crew App without a manual reload  
- Check-in / out, late, cards, handover  
- **No Confirm handoff button here** — by design  

### D. After checkout (Weddings → Overview)

- Status **Complete** → **Confirm handoff** (once per event)  
- Becomes **Handed off** → opens **Data & custody**  
- Incomplete shoots never show Confirm  

### E. Post-shoot money & data

- **Weddings → Deliver** — deliverable checklist, album, client PDF  
- **Weddings → Finance** — package / margin / day cost summary  
- **Data & custody** — disks I/II, GB, card ticks, ₹ pay, alerts  

**Sync shoot days from Weddings** — adds missing dates (Mehndi, Pre wedding…) without wiping pay/cards.  
**Edit date & events** — rename/add/remove events on a day.  
**Pull team from Weddings** — fills crew into existing days only.

---

## 3. Where each kind of data lives

| Data | Where you work | Store |
|------|----------------|-------|
| Client form answers | Weddings → Events / Overview / Activity | `clientForms` / `clientSubmissions` / `clientApprovals` |
| Crew check-in | Shoot Operations + `crew.html` | `crewCheckins/*` |
| Shot list content | Settings | `shotLists` |
| Event Pinterest / list pick | Weddings → Events (also Shoot Ops board) | shoot / plan draft |
| Deliverables | Weddings → Deliver | `prod.stages` |
| Package / pay summary | Weddings → Finance | `prod.pkg`, day roles |
| Disks / GB / card verify | Data & custody | `prod.days` |
| Confirm handoff | Weddings Overview | `prod.businessEvents` |

---

## 4. Confirm handoff vs Planner “→ Production”

| Control | Place | Meaning |
|---------|-------|---------|
| **Confirm handoff** | Weddings Overview | “This completed shoot is handed to post-shoot tracking” |
| **→ Production / Day wrap-up** | Crew Planner | Push that planner row’s crew / GB / ₹ into Data & custody |
| **Sync shoot days from Weddings** | Data & custody | Create missing shoot **days** from the couple’s events |

They do different jobs. Completing Shoot Ops alone does **not** auto-hand off — you Confirm once (option B).

---

## 5. What must never break (and didn’t)

- Client links: `event-details.html?f=…`  
- Crew links: `crew.html?event=…`  
- Firebase paths for forms, check-ins, `prod`  
- Existing deliverable ticks, pay, disks, past `businessEvents`  

Migration was **navigation + copy + hub**, not a data rewrite.

---

## 6. GitHub / security (quick)

- Firebase **web API key** in HTML is normal; real safety = Auth + DB rules + authorized domains  
- “Main branch not protected” = GitHub hygiene — turn on branch protection when you can  
- This Downloads folder is **not** a git clone — upload `index.html` manually when you update the live site  

---

## 7. Upload checklist

1. Upload  
   `index.html` from this project folder  
2. Hard refresh (Cmd+Shift+R)  
3. Confirm build tag in page source: `v12.4.4-edit-shoot-days-2026-07-31`  
4. Smoke: Weddings rail · Confirm handoff on a completed event · client link · crew link · Sync shoot days · Edit date & events  

---

## 8. One-sentence operating rule

**Open the couple in Weddings for the relationship and money; open Shoot Operations for the live day; use Data & custody when you need disk/card depth.**

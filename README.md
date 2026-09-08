# CRSC — Saturday Drop-in Sign-up App

A mobile-first, bilingual (English/French) web app for the **Concordia
Recreational Sports Club** that replaces the shared Google Sheet for Saturday
drop-in events (volleyball, basketball, football).

## What it does

**For players**
- **Registration first**: the first time anyone opens the link they create a
  player profile (name + email required; phone, Instagram, photo optional).
  The device remembers them — next visit goes straight to the calendar.
- A **season calendar** (every Saturday until the configured season end, e.g. Dec 26): tap a date to sign up. Orange = open, struck-through = full, green ring = your games.
- One-tap sign-up: first time you enter your **name + email + optional phone/Instagram/photo**; the device remembers you.
- Pick **one or several lists** (e.g. volleyball in both slots) — the **4h bundle price** applies automatically. Prices are shown once, in one recap line.
- Choose **e-transfer or cash**, and see exactly how much to send and to which email.
- Full lists automatically become a **waitlist**. When a spot frees up, the first person in line is **promoted automatically and emailed** (see automatic emails below).
- See who's signed up and, once execs set them, **which team everyone is on**.
- Switch the whole app to **Français** with the FR button (English is the default).

**For execs** (unlock with the club PIN — tap "Exec" in the header)
- Tap any player to **mark paid / check in / move lists / assign a team / bump to top / remove**.
- **Players directory**: every registered player with their name, email, phone,
  Instagram, photo, games played and unpaid count — searchable, exportable to CSV.
- **Teams**: give any list teams and assign players from their card. Players see
  the teams; only execs can change them. **Volleyball is capped at 4 teams of 7
  players max** (buttons show each team's count and lock when full); basketball
  and football rules can be added the same way once the club decides them.
- **Payments screen**: who paid, who didn't, expected amount per person (bundle-aware), totals collected and outstanding.
- **"Open the season"**: one tap creates an event for every remaining Saturday until the season end, copied from the latest event.
- Every past Saturday is kept automatically as a read-only **week-by-week record** (players, collected, outstanding).
- Add walk-ins, edit caps/prices/levels, close/reopen sign-ups, **export CSV** (includes emails and teams), edit club settings (e-transfer email, PIN, season end, policies…).

Everything updates **live** — all execs and players see the same lists in real time.

## Demo mode vs live mode

- **Demo mode** (default, zero setup): open `public/index.html` and everything runs
  with data stored in your own browser. Waitlist emails are simulated (you see the
  toast, no real email). Default exec PIN: `1234`.
- **Live mode**: connect a free Firebase project (below) and everyone shares the
  same realtime database.

## Going live — one-time setup (~15 minutes, free)

1. **Create a Firebase project**
   - Go to <https://console.firebase.google.com> → *Add project* (e.g. `crsc-app`).

2. **Enable Firestore**
   - *Build → Firestore Database → Create database* → *Production mode*, region
     `northamerica-northeast1` (Montréal).

3. **Register a web app & copy the config**
   - Project overview → *</> (Add app → Web)* → *Register*.
   - Paste the `firebaseConfig` object into
     [`public/firebase-config.js`](public/firebase-config.js) as
     `window.FIREBASE_CONFIG = { ... };`

4. **Deploy the security rules and the site**
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase use <your-project-id>
   firebase deploy
   ```
   Your app is now at `https://<your-project-id>.web.app` — put that link in the
   club's linktr.ee and Instagram bio.

5. **First run**
   - Open the site, tap **Exec**, enter the default PIN `1234`.
   - Open **Club settings**: change the PIN, check the e-transfer email,
     location, and **season end date**.
   - Tap **New event** (pre-filled Saturday template) → create it, then
     **Open the season** to fill every Saturday until the season end.

> Alternative hosting: `public/` is plain static files — drag-and-drop onto
> [Netlify](https://app.netlify.com/drop) or GitHub Pages also works.

## Automatic emails from the club Gmail (free, 5-minute setup)

Three emails are sent automatically, **from the club's own Gmail** — the same
account that receives the e-transfers (`concordiaRSclub@gmail.com`):

1. **Sign-up confirmation** — the moment someone registers: their lists, total,
   and how to pay, in the language (EN/FR) they signed up in.
2. **Payment reminder** — in the 24 hours before the event, everyone still
   marked unpaid gets one reminder with their exact amount. (A static site has
   no scheduler, so the check runs whenever anyone has the app open in that
   window — in practice players and execs open it constantly on game day. Each
   person is flagged after sending, so nobody gets it twice.)
3. **Waitlist promotion** — when a spot frees up, the person moving off the
   waitlist is told they're confirmed.

Setup, done while logged into the club Gmail:

1. Go to <https://script.google.com> → **New project**, and replace the code with:

   ```js
   const SECRET = 'change-me-to-something-random';

   function doPost(e) {
     const d = JSON.parse(e.postData.contents);
     if (d.secret !== SECRET) {
       return ContentService.createTextOutput('forbidden');
     }
     MailApp.sendEmail({
       to: d.to,
       subject: d.subject,
       body: d.message,
       name: 'CRSC',
     });
     return ContentService.createTextOutput('ok');
   }
   ```

2. Change `SECRET` to something random and save.
3. **Deploy → New deployment → Web app**: *Execute as: Me*, *Who has access:
   Anyone* → authorize when asked → copy the **web app URL**.
4. Put the URL and the same secret into `window.MAILER` in
   [`public/firebase-config.js`](public/firebase-config.js) and redeploy the site.

Quota: a normal Gmail account can send ~100 emails/day through Apps Script —
comfortable for a weekly event. If the mailer isn't configured, everything
still works; the app just shows a toast that the email was skipped. Phone
numbers are collected for the exec's reference only (automatic SMS would
require a paid service like Twilio).

One honest caveat: the secret sits in the site's JavaScript, so a determined
person could use the mailer to send emails from the club account (capped at
the daily quota). That matches the app's overall trust level; rotate the
secret in both places if it's ever abused.

## Weekly exec workflow

1. Once per season: **Open the season** — every Saturday is bookable from day one.
2. Players pick their Saturdays from the calendar all season long.
3. As e-transfers arrive, tap the player → *Mark paid*.
4. Saturday afternoon: assign **teams** on each volleyball list.
5. At the gym: tap players → *Check in*; collect cash → *Mark paid*.
6. The *Payments* screen shows who still owes what; past weeks archive themselves.

## Notes & limits (honest ones)

- **Security model**: the exec PIN is a convenience gate, like the club's current
  public Google Sheet — anyone determined could edit data via the API. Same trust
  level the club already operates on, with better structure and history. The
  upgrade path is Firebase Auth with per-exec accounts and stricter rules.
- **Payments** are *tracked*, not *processed* — the club is not a registered
  business, so there is no card checkout. Players declare cash/e-transfer and
  execs confirm.
- **Promotion emails** are sent by whichever device performs the removal (player
  cancelling or exec removing). If that device is offline the email is skipped —
  the promotion itself still happens because positions are recomputed live.
- **Photos** are downscaled to tiny thumbnails (~5 KB) stored inline in
  Firestore — no file storage setup needed.
- Firebase's free tier (50k reads / 20k writes per day) is far beyond a weekly
  ~100-player event, even with the whole season open.

## Project structure

```
public/
  index.html            app shell (loads Barlow / Barlow Condensed fonts)
  css/styles.css        styles
  js/store.js           data layer (localStorage demo store + Firestore store)
  js/app.js             UI: calendar, sign-up flow, teams, exec tools
  js/i18n.js            English/French strings (English primary)
  js/notify.js          mailer client + promotion/reminder logic
  firebase-config.js    Firebase + club mailer config (null = demo mode)
firebase.json           Firebase Hosting + rules wiring
firestore.rules         Firestore security rules
```

No build step, no npm dependencies — plain HTML/CSS/JS, easy for any exec to tweak.

## App or website?

It's a website that behaves like an app. It ships a web-app manifest and icons,
so on a phone players can use "Add to Home Screen" (Share menu on iOS, browser
menu on Android) and it opens full-screen with its own CRSC icon, like a native
app — no app store, no installs to maintain, and every update is live for
everyone the moment it's deployed.

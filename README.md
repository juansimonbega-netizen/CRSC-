# CRSC — Saturday Drop-in Sign-up App

A mobile-first web app for the **Concordia Recreational Sports Club** that replaces
the shared Google Sheet for Saturday drop-in events (volleyball, basketball,
football).

## What it does

**For players**
- See upcoming Saturday events, both time slots, every sport/level list, and how many spots are left.
- One-tap sign-up: first time you enter your **name + Instagram + optional photo**; the device remembers you, so next week is one tap.
- Pick **one or several lists** (e.g. volleyball in both slots) — the app applies the **4h bundle price** automatically.
- Choose **e-transfer or cash**, and see exactly how much to send and to which email.
- Full lists automatically become a **waitlist** (with your position shown).
- Remove your own name if you can't come (per club policy).

**For execs** (unlock with the club PIN — tap "Exec" in the header)
- Tap any player to **mark paid / check in / move to another list / bump to top / remove**.
- **Payments screen**: who paid, who didn't, expected amount per person (bundle-aware), totals collected and outstanding.
- **Add players manually** (walk-ins), edit list capacities, prices, levels.
- **Duplicate last Saturday's event in one tap** for the next week.
- Close/reopen sign-ups, **export the event to CSV**, edit club settings (e-transfer email, PIN, policies…).

Everything updates **live** — all execs and players see the same lists in real time.

## Demo mode vs live mode

- **Demo mode** (default, zero setup): open `public/index.html` and everything runs
  with data stored in your own browser. Great for trying it out.
  Default exec PIN: `1234`.
- **Live mode**: connect a free Firebase project (below) and everyone shares the
  same realtime database.

## Going live — one-time setup (~15 minutes, free)

1. **Create a Firebase project**
   - Go to <https://console.firebase.google.com> → *Add project* (e.g. `crsc-app`).
   - No Google Analytics needed.

2. **Enable Firestore**
   - In the project: *Build → Firestore Database → Create database*.
   - Choose *Production mode* and a nearby region (e.g. `northamerica-northeast1`, Montréal).

3. **Register a web app & copy the config**
   - Project overview → *</> (Add app → Web)* → give it a name → *Register*.
   - Copy the `firebaseConfig = { ... }` object it shows you.
   - Paste it into [`public/firebase-config.js`](public/firebase-config.js) as
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
   - Open **Club settings** and immediately **change the PIN**, and check the
     e-transfer email / location / policies.
   - Tap **New event** — it comes pre-filled with the usual Saturday template
     (both slots, all sports/levels/prices) — adjust and create.
   - Every following week: **Duplicate latest** → done.

> Alternative hosting: the `public/` folder is plain static files, so you can also
> drag-and-drop it onto [Netlify](https://app.netlify.com/drop) or serve it with
> GitHub Pages. Firestore works from any host.

## Weekly exec workflow

1. Saturday morning: *Duplicate latest* (or it's already up since last week).
2. Players sign up all week from the Instagram/linktr.ee link.
3. As e-transfers arrive in the inbox, an exec opens the event, taps the player → *Mark paid*.
4. At the gym: tap players → *Check in*; collect cash → *Mark paid*.
5. The 💰 *Payments* screen shows exactly who still owes what — no more chasing a sheet.
6. After the event: *Close sign-ups* (and *Export CSV* if you want an archive).

## Notes & limits (honest ones)

- **Security model**: the exec PIN is a convenience gate, like the club's current
  public Google Sheet — anyone determined could edit data via the API. That is the
  same trust level the club already operates on, with better structure and
  history. If the club ever needs hard security, the upgrade path is Firebase
  Auth with per-exec accounts and stricter Firestore rules.
- **Payments** are *tracked*, not *processed* — the club is not a registered
  business, so there is no Stripe/card checkout. Players declare cash/e-transfer
  and execs confirm. (If the club registers later, Stripe Payment Links could be
  added per event.)
- **Photos** are downscaled to tiny thumbnails (~5 KB) and stored inline in
  Firestore — no file storage setup needed.
- Firebase's free tier (50k reads / 20k writes per day) is far beyond what a
  weekly ~100-player event uses.

## Project structure

```
public/
  index.html            app shell
  css/styles.css        styles
  js/store.js           data layer (localStorage demo store + Firestore store)
  js/app.js             UI: views, sign-up flow, exec tools
  firebase-config.js    paste your Firebase config here (null = demo mode)
firebase.json           Firebase Hosting + rules wiring
firestore.rules         Firestore security rules
```

No build step, no npm dependencies — plain HTML/CSS/JS, easy for any exec to tweak.

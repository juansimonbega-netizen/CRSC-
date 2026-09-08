/*
 * Firebase configuration.
 *
 * Leave this as `null` to run in DEMO MODE (data stays in the browser —
 * perfect for trying the app out).
 *
 * To go live:
 *   1. Create a free Firebase project at https://console.firebase.google.com
 *   2. Add a "Web app" to the project and copy its config object here.
 *   3. Enable Cloud Firestore (production mode) in the console.
 *   4. Paste the config below, e.g.:
 *
 *      window.FIREBASE_CONFIG = {
 *        apiKey: "AIza....",
 *        authDomain: "crsc-app.firebaseapp.com",
 *        projectId: "crsc-app",
 *        storageBucket: "crsc-app.appspot.com",
 *        messagingSenderId: "123456789",
 *        appId: "1:123456789:web:abcdef",
 *      };
 *
 * Full steps: see README.md at the root of this repository.
 */
window.FIREBASE_CONFIG = null;

/*
 * EmailJS configuration — powers the automatic "you're off the waitlist"
 * emails. Leave as `null` to skip sending (promotions still happen, the app
 * just tells the exec no email went out).
 *
 * To enable:
 *   1. Create a free account at https://www.emailjs.com (200 emails/month free).
 *   2. Add an email service (e.g. the club Gmail) and note its Service ID.
 *   3. Create a template using these variables:
 *      {{to_email}} {{to_name}} {{event_date}} {{list_label}} {{session_label}}
 *      {{location}} {{etransfer_email}} {{club_name}}
 *      Set the template's "To email" field to {{to_email}}.
 *   4. Fill in:
 *
 *      window.EMAILJS_CONFIG = {
 *        publicKey: "your_public_key",
 *        serviceId: "service_xxxxxxx",
 *        templateId: "template_xxxxxxx",
 *      };
 */
window.EMAILJS_CONFIG = null;

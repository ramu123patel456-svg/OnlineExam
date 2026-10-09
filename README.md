# Online Exam System — Firebase + Firestore Ready v3

This package is prepared so you can add your Firebase Admin service-account JSON yourself and run/deploy the application.

## What is included

- Admin login and protected admin dashboard
- Create exams with: MCQ 1/2/3 correct, fill blank, true/false, match, short answer, programming and HREF/page-link questions
- Draft / Publish / Unpublish / Delete exam workflow
- Student login and Firestore student profiles
- Published exam delivery from Firestore
- Timer with auto-submit at 00:00
- Browser answer auto-save and restore
- Server-side grading (the browser never decides the final score)
- Automatic result generation and Firestore persistence
- Retry-safe submission using an attempt ID (prevents duplicate results after a repeated auto-submit request)
- Result page that loads directly from Firestore by result ID
- Leaderboard from Firestore results
- Student profile and result history from Firestore
- Anti-cheat event logging: tab switches, fullscreen exits, copy attempts and shortcut attempts
- HTML/CSS/JavaScript/PHP programming questions with a 400-line limit
- Render deployment configuration (`render.yaml`)
- Firebase setup and deployment guide

## Important security rule

The Firebase Admin service-account JSON is NOT included. Add it yourself as `server/service-account.json` for local development, or set `FIREBASE_SERVICE_ACCOUNT_JSON` as a secret environment variable on your hosting provider. Never put the Admin key in `client/`, `config/firebase-config.js`, GitHub, or a public download.

Because a service-account key was previously exposed in the conversation, revoke that old key and generate a new one before using production.

## Local setup

1. Open Firebase Console and select `online-exam-system-a131e`.
2. Enable Cloud Firestore.
3. Generate a NEW Firebase Admin SDK private key.
4. Rename the downloaded file to `service-account.json`.
5. Put it at `server/service-account.json`.
6. Copy `.env.example` to `.env`.
7. Run `npm install`.
8. Run `npm start`.
9. Open `http://localhost:3000`.
10. Check `http://localhost:3000/api/health`.

Expected health response:

```json
{
  "ok": true,
  "firebase": true
}
```

## Default admin

Email: `admin@onlineexam.com`
Password: `admin123`

Change both values in `.env` before production.

## Firestore collections

- `exams`
- `students`
- `submissions`
- `results`
- `antiCheatLogs`
- `auditLogs`

## Automatic result flow

`Timer reaches 00:00` → `POST /api/exam/submit` → Node.js loads the published exam from Firestore → server grades answers → Firestore batch writes result/submission/student/anti-cheat log → result ID returned → `result.html?id=...` loads the result from Firestore.

The server also uses an `attemptId` to make repeated submission requests idempotent, reducing duplicate results if the browser retries an automatic submission.

## Deploy to Render

1. Create a GitHub repository and upload the project.
2. Do NOT upload `server/service-account.json`, `.env`, or `node_modules`.
3. Create a Render Web Service connected to the repository.
4. Build command: `npm install`.
5. Start command: `npm start`.
6. Add these Render environment variables:
   - `NODE_ENV=production`
   - `PORT=10000`
   - `ADMIN_EMAIL=your-admin-email`
   - `ADMIN_PASSWORD=your-strong-password`
   - `FIREBASE_SERVICE_ACCOUNT_JSON=<entire NEW service-account JSON>`
   - `MIGRATE_JSON_TO_FIRESTORE=false`
   - `SEED_DEFAULT_EXAM=true`
7. Deploy.
8. Open your Render URL and test `/api/health`.

The included `render.yaml` describes the same deployment settings.

## Firebase Web config

`config/firebase-config.js` contains the browser Firebase project configuration. This is separate from the Admin SDK service account. The service account must remain server-side.

## Production recommendations

- Use Firebase Authentication instead of the demo name/roll-number login.
- Use strong admin credentials or Firebase Auth custom claims for admin roles.
- Keep Firestore Security Rules restrictive; browser clients should not be allowed to write final results directly.
- Add rate limiting and session expiry.
- Use HTTPS (Render provides HTTPS).
- Consider a dedicated proctoring solution for stronger anti-cheating controls. Browser JavaScript alone cannot guarantee that a student is not using another device.


## AI Semantic Grading
See `AI_SEMANTIC_GRADING.md`. Short and long answers use normalized exact matching: an exact match receives full marks; any non-matching answer receives zero marks.

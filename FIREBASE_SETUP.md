# Firebase + Firestore + Internet Deployment

## A. Firebase

1. Open Firebase Console and select `online-exam-system-a131e`.
2. Create/enable Cloud Firestore.
3. Generate a NEW Admin SDK private key.
4. For local use, save it as `server/service-account.json`.
5. For Render, store the complete JSON as the secret environment variable `FIREBASE_SERVICE_ACCOUNT_JSON`.

Do not expose the Admin key. If an old key was exposed, revoke it and generate a replacement.

## B. Local

```bash
npm install
npm start
```

Open `http://localhost:3000` and check `/api/health`.

## C. Firestore data

The server writes to: `exams`, `students`, `submissions`, `results`, `antiCheatLogs`, and `auditLogs`.

## D. Automatic result

The timer calls the same server submission endpoint as manual submit. The server grades from the exam definition stored in Firestore, then writes the result in a Firestore batch. The browser does not calculate the final score.

An `attemptId` is sent with each exam attempt so a repeated automatic-submit request returns the existing result instead of creating another result.

## E. Render

1. Push the project to GitHub without `.env` or `server/service-account.json`.
2. Create a Render Web Service.
3. Build: `npm install`.
4. Start: `npm start`.
5. Add `FIREBASE_SERVICE_ACCOUNT_JSON` with the complete NEW service-account JSON.
6. Add `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `PORT=10000`, `MIGRATE_JSON_TO_FIRESTORE=false`, `SEED_DEFAULT_EXAM=true`.
7. Deploy and test `/api/health`.

The included `render.yaml` can be used as a deployment blueprint.


## Firebase Admin SDK service account

For Node.js/Express, place your downloaded Firebase Admin SDK private key here:

`server/serviceAccountKey.json`

The server initializes Firebase Admin with:

```js
const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
```

For security, `serviceAccountKey.json` is ignored by Git. Never upload or share this file.

The application also supports `FIREBASE_SERVICE_ACCOUNT_JSON` or `FIREBASE_SERVICE_ACCOUNT_PATH`.
If no credentials are present, local JSON storage remains available for local development.

# Online Exam System - Fixed v5

## Critical fixes
- Fixed result page JavaScript syntax error (`Unexpected identifier 'document'`).
- Fixed missing `js/app.js` that caused `Unexpected token '<'`.
- Result API loads results by ID.
- Automatic timer submission generates and saves a result.
- Result page displays manual vs automatic submission.
- Anti-cheat flags are stored with results.
- Default questions now include explicit `type: "mcq1"` so the exam does not show `undefined`.
- Programming answers are limited to 400 lines and automatic submission will safely truncate excess lines.
- Added optional Firebase Admin integration and `FIREBASE_SETUP.md`.

## Run

```bash
npm install
npm start
```

Open http://localhost:3000

Admin:
- Email: admin@onlineexam.com
- Password: admin123

## Result storage

Local development uses:
`server/data/results.json`

Firebase is optional. See `FIREBASE_SETUP.md`.

## Important

Stop every old Node.js server before starting this version. Use Ctrl+C in the terminal running the old server, then run `npm start` from this project's folder.


## IMPORTANT — Exam Timer Fix (September 2026)
- The student exam page uses `exam.durationMinutes` returned by the server.
- When `/api/exam` is opened without an exam ID, the server now selects the **newest Published exam by `updatedAt`/`createdAt`**, instead of an arbitrary older Published exam.
- This prevents an old 50-minute published exam from being loaded when the admin has updated/published a newer 90-minute exam.
- The timer remains persistent across refreshes through the saved deadline.

### Firebase / Firestore
This build is Firebase/Firestore ready. It uses `FIREBASE_SERVICE_ACCOUNT_JSON` on Render. When that environment variable contains the Firebase Admin service-account JSON, the server logs `Firebase/Firestore: connected` and stores exams, students, sessions, and results in Firestore. No Firebase secret is bundled in this ZIP.

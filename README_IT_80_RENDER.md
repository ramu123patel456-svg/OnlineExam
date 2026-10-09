# Standard XII IT 80-Mark Ready-to-Use Exam

This build includes the supplied 80-mark paper as a published Firebase/Firestore exam. Q1 and Q2 each contain 10 subquestions. Q7 contains 8 short-answer subquestions with an Attempt Any 5 cap. Q8(A) selects one HTML program and Q8(B) selects one JavaScript program; each selected program is 5 marks.

## Firebase / Render
Set these Render environment variables:

- `FIREBASE_SERVICE_ACCOUNT_JSON` = the complete Firebase Admin service-account JSON
- `ADMIN_EMAIL` = your admin email
- `ADMIN_PASSWORD` = your admin password
- `SEED_IT_EXAM=true`
- `SEED_DEFAULT_EXAM=false`
- `MIGRATE_JSON_TO_FIRESTORE=false`

Build: `npm install`
Start: `npm start`

On startup, the server upserts the published exam ID `it-std12-80-textbook-001` into Firestore. The Admin Control Center also has **Load IT 80 Marks** for a one-click Firebase upsert.

## Important
Do not put a Firebase service-account JSON file or private key into GitHub. Keep it in Render Environment Variables.

## Exam settings
- Marks: 80
- Passing marks: 28
- Default duration: 180 minutes (editable in the admin exam-management flow)
- Database: Firebase Firestore when `FIREBASE_SERVICE_ACCOUNT_JSON` is valid
- Student question order: shuffled inside each paper section only
- Duplicate question protection: enabled

# Local startup — Firebase credentials are optional

This version no longer stops when Firebase Admin credentials are missing.

Run:

    npm i
    npm start

If `server/service-account.json` or `FIREBASE_SERVICE_ACCOUNT_JSON` is present, the app uses Firebase/Firestore.
If not, it automatically uses `server/data/local-firestore.json` as a local development database.

This prevents the previous:
"Firebase credentials not found... Server cannot start without Firebase credentials."
startup error.

For production deployment with Firestore, provide a Firebase Admin service account through environment variables rather than committing the JSON key.

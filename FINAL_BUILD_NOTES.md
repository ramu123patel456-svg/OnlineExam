# OnlineExams — Final Combined Build

This build combines the PDF-import fix (including ASCII85 + Flate PDF stream decoding)
with the selected/fixed admin-control build.

## Main guarantees
- Student ID + password authentication.
- Persistent Firestore/local sessions.
- Student-specific deterministic papers.
- Question order is shuffled independently inside each question type.
- MCQ/T-F options are shuffled without changing the correct-answer mapping.
- `variantCount` defaults to 25.
- Leaderboard includes only `subjectiveChecked === true` results.
- Short/Long Answer and teacher-required Programming questions are manually graded.
- PDF import supports selectable-text PDFs and the common question/section formats used
  by the supplied IT UT12 paper.
- OR programming alternatives are kept as a single teacher-graded item when represented
  as an alternative in the source.
- Firebase credentials are optional for local development; without them, local JSON
  persistence is used.

## Run
```bat
npm i
npm start
```

Default admin:
- Email: `admin@onlineexam.com`
- Password: `admin123`

Change these with `ADMIN_EMAIL` and `ADMIN_PASSWORD` before deployment.

## Important PDF limitation
Scanned/image-only PDFs require OCR and are not guaranteed by the built-in parser.
Use a selectable-text PDF for automatic question extraction.

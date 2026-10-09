# Duplicate Question + Programming Marks Fix

- Student paper generation now de-duplicates identical question text within each type.
- This protects older Firestore exams that were imported with duplicate questions.
- PDF imports also de-duplicate identical questions before saving.
- Submission grading only grades the exact de-duplicated questions shown to the student.
- Programming questions are always normalized to 5 marks.
- Exactly one programming question is selected from the programming pool per student.
- Teacher grading accepts 0 through 5 marks for programming.
- Existing Firebase credentials are not stored in this ZIP; keep FIREBASE_SERVICE_ACCOUNT_JSON in Render.

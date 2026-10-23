# Question-by-question checking UI

- Admin **View Paper** now opens a question navigator and shows one question at a time.
- Each sub-question is labelled from the existing section/sub-number fields (for example Q1.1, Q1.2).
- Use the question buttons or Previous/Next to navigate.
- Objective questions show the student's answer, correct answer when available, and awarded marks.
- Subjective/programming questions provide marks and optional teacher feedback. **Save & Next** saves marks and advances to the next question.
- The student exam page already uses a single-question view with question navigation; this change keeps that flow intact.
- The existing API and grading endpoints are reused; no database schema changes were introduced.

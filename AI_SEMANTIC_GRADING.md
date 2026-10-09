# Exact Answer Grading

AI semantic grading and approximate grading have been removed.

Short Answer and Long Answer questions are graded by normalized exact matching:
- Uppercase/lowercase differences are ignored.
- Leading/trailing and repeated whitespace differences are ignored by `normalizeText`.
- If the normalized student answer exactly matches the normalized expected answer, the student receives the full marks for that question.
- If it does not exactly match, the student receives 0 marks.

No AI API key is required.

# PDF Import

The Admin PDF importer accepts selectable-text PDFs and automatically creates a Published exam.

## Supported sections
- Fill in the Blanks
- MCQ / Multiple Choice
- Choose TWO / Multiple Select
- True / False
- Short Answer
- Long Answer / Descriptive
- Programming questions

### Marks
Headers such as `(5 x 1 = 5 Marks)` are read as 1 mark per question. Headers such as `[10 Marks]` are distributed across the questions in that section.

### Answer keys
If an ANSWER KEY is present, objective questions can be auto-graded. If the PDF has no answer key, the questions are still imported; objective answers are marked `answer_key_pending` until an answer key is configured.

### Scanned PDFs
Image-only/scanned PDFs require OCR. The built-in importer does not claim to OCR arbitrary scanned documents.


## Supplied Sem 1 50-mark paper
Use Admin → Exams → **Load IT Sem 1 (50 Marks)** instead of PDF Import. This structured exam seed avoids the generic parser limitations for Select THREE and Match the Following.

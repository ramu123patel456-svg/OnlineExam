# Semester 1 IT Exam Setup

Source PDF: `exam-pdfs/Std12_IT_Sem1_50Marks_Source_Paper.pdf`.

## Use this exam (recommended)
The generic PDF importer in the original project does not correctly recognize this paper’s “Choose the correct alternative”, “Select THREE”, and “Match the following” sections. This ZIP includes a structured seed based on the same paper, so do NOT use PDF Import for this Sem 1 exam.

1. Deploy/run this updated ZIP.
2. Sign in to Admin Control Center and open Exams.
3. Click **Load IT Sem 1 (50 Marks)**.
4. Confirm the exam list says **Information Technology**, **12th Science**, **50 marks**, **90 min**, **Published**.
5. Delete/unpublish the old bad imported copy showing Physics/Q9999.
6. Click **Start Now** on the new Sem 1 exam when ready; keep duration at 90 minutes.
7. Ask one dummy student to test before the real exam.

Q1–Q6 have objective answer keys; Q7 and Q8 are programming questions and need teacher/admin marking. This bypasses the PDF parser and keeps the supplied PDF in `exam-pdfs` as the source copy.


## Final scoring fix and regression checks
- Q6 Match the Following is graded per pair: each of the 4 pairs earns 1 mark independently.
- 3 correct pairs = 3/4; 2 = 2/4; 1 = 1/4; none = 0/4.
- A blank matching response is treated as skipped, not as an attempted response.
- Q4 Select TWO and Q5 Select THREE award proportional credit for correctly selected expected options; incorrect extras do not subtract marks.
- Run `npm run check` and `npm run test:sem1` before deploying.

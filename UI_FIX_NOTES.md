# STD12 IT Exam UI / Ordering Fix

## Fixed
1. Question paper now always follows section order Q1 -> Q2 -> Q3 -> Q4 -> Q5 -> Q6 -> Q7 -> Q8.
2. Programming OR selection still happens per student, but Q8 cannot jump to the beginning of the paper.
3. Left Question Status is grouped by section. Each Q1/Q2/etc row contains its sub-question status buttons.
4. Status colors:
   - Yellow = current question
   - Green = answered/saved question
   - Red = pending/unanswered question
5. Top section tabs show only Q1-Q8 sections.
6. Sub-question tabs show only the sub-questions belonging to the currently selected section.
7. Q8(A) is shown before Q8(B).

## Deploy
Replace/push this project to the same Render service. Build command: `npm install`.
Start command: `node server/server.js`.

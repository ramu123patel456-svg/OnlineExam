# Approximate Short and Long Answer Grading

Short Answer and Long Answer questions are graded on the Node.js server using keyword overlap and text similarity.

Scoring:
- 75% similarity or higher: full marks
- 50% to 74.99%: 50% of marks
- 30% to 49.99%: 25% of marks
- below 30%: 0 marks

Example expected answer:
"Newton's third law states that for every action there is an equal and opposite reaction."

Accepted as full-credit examples include:
- "Newton's 3rd law"
- "Newton's third law"
- "According to Newton's third law, every action has an equal and opposite reaction."

A response such as "net force" should receive no credit because it does not contain enough of the expected concepts.

The final score is calculated server-side and the detailed similarity/awarded marks are stored in the Firestore result review.

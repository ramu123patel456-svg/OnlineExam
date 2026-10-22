# Exam Start-Time Control

1. Publish the exam from Admin → Exams.
2. Use **Start Now** to begin for everyone immediately, or **Schedule Start** to choose a future local date/time.
3. The server stores one official `startedAt` and `endsAt` for the exam. The duration is taken from the exam's configured duration.
4. Every student who opens the exam while it is Live sees the same server deadline. Logging in late does not grant extra time.
5. The server transitions scheduled exams to Live and Live exams to Ended. Manual **End Exam Now** ends the exam immediately.
6. Open exam pages automatically submit when the official countdown reaches zero. The server rejects submissions after the deadline (with a short 15-second network grace period).
7. For the first test, use a test exam and a short duration (e.g. 2 minutes). Confirm students cannot open it before Start Now, all see the same deadline, and submissions after the deadline are rejected.

Note: the browser must remain open for its automatic submission request to be sent. The server still enforces the deadline if a student closes the page; server-side auto-finalization of unsent/local-only answers is not possible unless answers are also autosaved to the server.

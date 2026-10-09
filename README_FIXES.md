# Final fixes

- Independent deterministic variant slots for each question type and option set.
- Student ID is the stable identity used for papers, attempts and drafts.
- Final leaderboard only includes `subjectiveChecked === true` results.
- Programming answers are auto-graded when an expected answer/key is configured; otherwise they are marked for teacher checking.
- PDF import preserves questions even when an answer key is absent.
- Section marks are calculated from common paper-header formats.
- Session tokens are persisted in the database, so restart/multiple server instances do not depend on an in-memory Map.
- Admin initial load avoids immediately fetching leaderboard/live data, reducing UI lag.

# Real production pilot

The pilot has two honest execution paths:

- `READY_FOR_REAL_PROVIDERS`: local FFmpeg, Windows SAPI and programmatic visuals can run; commercial providers are not claimed to have run.
- `PUBLICATION_CANDIDATE`: only after structural, audio, visual, synchronization, copyright and render gates pass. Semantic and voice dimensions remain `NOT_EVALUATED` without evaluators.

Apply migrations 024 and 025 with the existing `npm run migrate` flow before durable database execution. Without `DATABASE_URL`, the filesystem pilot is allowed but persisted commercial work is reported as `MIGRATION_REQUIRED`.

Recognized variables: `DATABASE_URL`, optional `DATABASE_SSL=true`, `TAVILY_API_KEY`, `OPENAI_API_KEY`/`OPENAI_MODEL`, `GEMINI_API_KEY` or `GOOGLE_API_KEY`/`GEMINI_MODEL`, `ELEVENLABS_API_KEY`, and `RUNWAY_API_KEY`/`RUNWAY_VIDEO_MODEL`.

Keys are never written to run snapshots, reports or logs. A configured key is not treated as healthy until a safe provider probe succeeds. No commercial call is made in `DRY_RUN`, and the pilot budget is hard-capped at USD 5 including revision reserve.

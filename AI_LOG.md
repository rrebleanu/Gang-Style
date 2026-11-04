# AI_LOG

A log of AI usage in the GangStyle project: what I asked, what I accepted,
what I changed, and what I decided myself.

**Task:** Reviewing the project state and cleaning up the frontend

**What I asked the AI:** To analyze the repository and compare its state
with the 30-day plan and the official NAQQA requirements.

**What it generated:** A list of issues: an unused dependency
(`@google/generative-ai`), duplicate files, a README that did not match
the real project structure, and a missing AI_LOG.md.

**What I accepted:** Removing the unused dependency and creating this log.

**What I changed and why:** I postponed moving the frontend into `frontend/`
until I start the backend, so I can do it in a single commit.

**What I learned / what I did not understand at first:** The difference
between Gemini CLI (a standalone terminal tool, independent of the project)
and the `@google/generative-ai` SDK (a code dependency).

**Final decision (mine):** I keep the current structure until I start the
backend, and I remove dependencies that are not used.

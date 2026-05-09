# Workflow Overview

Two execution models exist in this system. They are not mutually exclusive — the right
choice depends on ticket type, required output, and how much you want in the loop.

---

## Model A — Assisted (current default)

**What it is:** You work with Claude Code directly, using a queue ticket as a
pre-written brief. The queue is a decision surface and planning layer. You are
the execution layer.

**Best for:**
- Exploratory work where direction may shift mid-session
- Architecture and design decisions that require back-and-forth
- Anything where you want fine-grained control over each step
- Sessions where context across multiple files matters deeply

**Queue role:** The ticket's `description` and `acceptance` fields are your session
opening prompt, already written and ready. Dispatching a ticket to "active" is a
human declaration of intent — nothing automated fires.

→ See `model-a-assisted.md` for step-by-step workflow.

---

## Model B — Conductor (automated, partially built)

**What it is:** Dispatching a ticket from the UI triggers the conductor, which
invokes `claude -p` non-interactively in the project's working directory. The
agent's output streams to the browser in real-time. Code-producing tickets
require your review before the item is marked complete.

**Best for:**
- Well-scoped, spec-complete tickets where the acceptance criteria are unambiguous
- Planning/documentation tasks (pm, research) that can run to completion unattended
- Boilerplate, scaffolding, test generation (eng-junior tickets)
- Anything where re-running is cheap and the blast radius of a wrong output is low

**Queue role:** Dispatch is both a state change AND an execution trigger. The
conductor creates a bead, runs Claude in the project directory, streams output
to your browser, and awaits your approval on code-changing work.

→ See `model-b-conductor.md` for architecture, constraints, and current build state.

---

## Quick reference

| Ticket type | Recommended model | Notes |
|-------------|------------------|-------|
| `feature`   | B (with review gate) | Conductor runs in project dir; you review diff before complete |
| `bug`       | B (with review gate) | Same as feature |
| `ops`       | B (with review gate) | Config/infra changes; review before complete |
| `pm`        | B (auto-complete) | Planning output; no git risk; conductor completes automatically |
| `research`  | B (auto-complete) | Document/analysis output; no git risk |
| `design`    | A or B | Depends on whether output is code or prose |
| Complex arch decisions | A | Requires interactive back-and-forth |
| Cross-project work | A | Conductor is scoped to one project dir per bead |

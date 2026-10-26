# Evergreen Terrace v1 repository onboarding evidence

## Purpose

Onboarding occurs before the first goal in a repository. It is a read-only,
evidence-producing process, not a setup wizard that guesses policy. The result
lets the engineer approve one bounded operating profile before any worktree or
worker is created.

## Preconditions

- The repository has a canonical Git remote. `origin` is the default, but the
  selected remote is explicit in `.et/config.toml`.
- The engineer has a local checkout with the intended base commit present.
- Discovery has no write, fetch, push, credential, or remote-side-effect
  capability.

## Discovery pool

The mayor runs two to four isolated read-only discovery workers. They inspect
the repository independently and cite file paths, commits, command output, and
timestamps for every conclusion. Their scope is limited to:

- Git branches, remotes, current local SHA, and ignored paths.
- Project topology and ownership boundaries.
- Build, test, lint, typecheck, and validation commands.
- Dependency, secret, migration, release, and protected-branch risks.
- Existing documentation, contributor rules, and coding conventions.

The discovery pool never fetches a remote. An operator may invoke the governed
`workspace.sync` action later if refreshed remote references are required.

## Approval packet

The mayor consolidates citations into one durable approval packet containing:

1. Canonical normalized remote identity and selected remote name.
2. Active checkout, verified local base SHA, protected branches, and allowed
   base refs.
3. Proposed `.et/config.toml`, including branch classes, priority classes,
   validation commands, risk policy, worktree root, and remote policy.
4. Repository/module map, validation evidence, known risks, and unresolved
   ambiguities.
5. Initial project profile and a clear separation between immutable policy,
   project-local convention, and candidate global preferences.

The engineer approves, revises, or rejects the packet as one decision. Approval
creates `.et/config.toml` on a normal factory branch and records the supporting
evidence. It never mutates `main`, `dev`, or the active checkout.

## `.et` contract

The future parser is Zod-backed, strict, and fails closed on unknown fields.
The configuration includes at minimum:

- Canonical remote (default `origin`) and normalized project identifier.
- Protected branches and allowed base refs.
- Factory branch classes (`feature/`, `patch/`, and project additions).
- Explicit priority classes and scheduler weights.
- Validation commands, timeout/resource constraints, and risk categories.
- Worktree location policy, permitted `gh` behavior, and decision thresholds.

Configuration is versioned with the repository. Changes use the same
factory-branch and review trail as code. Learned behavior cannot weaken the
engine safety floor or override `.et` policy.

## First-goal gate

The goal command accepts an onboarded project only after the approved profile
matches the local remote and base SHA. The mayor must surface a decision instead
of guessing when the repository diverges, policy is absent, a protected branch
is requested, or a risk category is present.

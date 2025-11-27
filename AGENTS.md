# Codex Agent: StudArchive

You are Codex working on the **StudArchive** mobile app.

StudArchive is an **Expo + React Native + TypeScript** app that tracks a LEGO collection
(sets, parts, minifigs, duplicates/trade list, valuations) using a **local SQLite database**.

## Priorities

1. Accuracy – don’t break working behavior.
2. Minimal, targeted changes – only change what the user asked for.
3. Consistency – follow existing patterns, naming, and folder structure.

## Tech & Structure

- Expo + React Native + TypeScript.
- SQLite via the existing Expo / SQLite setup.
- Keep the current `/src` layout; don’t move or rename files unless explicitly asked.
- Use functional components and React hooks.
- Reuse existing global UI components (buttons, inputs, etc.) instead of ad-hoc styles.

## Behavior Rules

- When I ask for a **fix**, change only what’s needed to fix it.
- When I ask for a **new feature/screen**, follow the existing theme, navigation pattern,
  and database layer.
- Prefer small, focused edits and clear commit/PR descriptions.
- Don’t add big dependencies (new nav lib, new state lib, UI kits) unless I explicitly ask.
- If a change could affect existing data, highlight it in the PR description or comments.

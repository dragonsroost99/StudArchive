# Codex Project Rules – StudArchive

You are Codex working on the **StudArchive** mobile app.

StudArchive is an **Expo + React Native + TypeScript** app that helps the user track their LEGO collection (sets, minifigs, parts, duplicates, valuation, and trade/duplicate lists) using a **local SQLite database**.

Your top priorities, in order, are:
1. **Accuracy** – Don’t break working behavior. Follow established patterns.
2. **Minimal, targeted changes** – Only change what the user asked for.
3. **Consistency** – Match the existing style, structure, and naming.

---

## 1. Tech Stack & Project Structure

- Platform: **Expo** (React Native)
- Language: **TypeScript**
- Data: **SQLite** (Expo SQLite or equivalent)
- Navigation: Use the existing navigation approach in the repo (do not introduce a new navigation library without being asked).
- Directory structure:
  - Keep the current `/src` layout intact.
  - Do **not** move, rename, or reorganize folders/files unless the user explicitly requests it.
  - Prefer adding new files alongside similar existing ones (e.g., screens with screens, components with components, hooks with hooks).

If you need to create new utilities, hooks, or components, follow the **existing folder structure and naming patterns** you see in the repo.

---

## 2. Code Style & Conventions

- Use **TypeScript** strictly: add or preserve proper types, interfaces, and return types.
- Prefer **functional components** and **React hooks** over class components.
- Match the existing:
  - Naming conventions (camelCase for functions/variables, PascalCase for components/types).
  - File naming conventions (e.g., `SomethingScreen.tsx`, `SomeComponent.tsx`).
- Keep functions **small and focused**. If a function grows too large, consider extracting helper functions into a nearby file (e.g., `utils` or `hooks`) that matches the current project style.
- Don’t introduce heavy new dependencies without explicit instruction. Work with:
  - React Native standard APIs
  - Expo libraries already in use
  - SQLite already wired into the project

If you must suggest a new library, do it in comments or PR description, not by adding it directly unless the user asked.

---

## 3. UI / UX Rules

- Respect and **reuse the global themed UI components** already in the app:
  - Use the existing global `Button`, `Input`, and any other shared UI components instead of creating one-off inline styles.
  - Match the app’s existing color scheme, spacing, and typography patterns.
- When creating new screens or components:
  - Use the same layout style (e.g., padding, margins, font sizes, etc.) as existing screens.
  - Maintain consistent behavior for form fields (validation, labels, placeholders).
- Avoid introducing inline styles that duplicate existing style constants. Prefer:
  - Existing style modules
  - Existing layout helpers
- Accessibility: follow the same accessibility patterns already used. Don’t regress accessibility (e.g., remove labels, touch targets, etc.).

---

## 4. Data, SQLite & Business Logic

- Use the **existing SQLite setup**:
  - Don’t replace the database layer or switch libraries unless explicitly requested.
  - Follow existing patterns for opening connections, running transactions, and handling errors.
- When adding or modifying tables:
  - Implement **schema migrations**, don’t silently break existing data.
  - Keep naming consistent with existing tables and columns (e.g., snake_case vs camelCase, singular vs plural).
- For LEGO entities:
  - Respect the distinctions already in the project (sets, parts, minifigs, duplicates, trade lists, etc.).
  - Don’t merge unrelated concepts into a single table “to simplify” unless the user asks for a redesign.
- Handle errors **gracefully**:
  - Don’t crash the app on common failures (e.g., DB not ready yet, empty results).
  - Follow the app’s existing error-handling and logging patterns.

---

## 5. Behavior & Features

- **Do not change working behavior** unless:
  - The user explicitly asks for a change, or
  - You are clearly fixing a bug they pointed out.
- When the user asks for a new feature (e.g., new screen, new filter, new sort mode):
  - Integrate it into existing flows and navigation.
  - Reuse existing UX patterns (buttons, modals, list item layouts, etc.).
- When the user asks for a **fix** (e.g., `db.transaction is not defined`):
  - Identify the root cause using the current libraries and versions.
  - Fix it using the idiomatic Expo/SQLite approach.
  - Don’t rewrite large portions of the app.

---

## 6. Git, PRs & Change Scope

When opening PRs or suggested diffs:

- Keep changes **as small and focused as possible**:
  - If the user requested a specific change, limit edits to that area plus what is strictly necessary to make it work.
- Don’t refactor unrelated files “for cleanliness” in the same PR unless specifically requested.
- Write **clear commit/PR descriptions** that state:
  - What was changed
  - Why it was changed
  - Any migrations or manual steps required

If a change could impact existing data or behavior, explicitly call that out in the PR description.

---

## 7. Things You Must NOT Do (Without Explicit Permission)

- Do **not**:
  - Change the app name or identifiers.
  - Replace or remove the global themed components.
  - Reorganize folders or rename modules on your own.
  - Introduce new major dependencies (state management library, navigation library, UI kit, etc.).
  - Hardcode user-specific paths, secrets, tokens, or credentials.
  - Remove or bypass error handling already in place.

- Avoid “helpful” large-scale rewrites:
  - No full-screen rewrites unless the user asks for it.
  - No whole-project lint/format changes in the same PR as a feature or bugfix.

---

## 8. How to Interpret User Requests

When the user asks for something like:

- “Fix this error”:  
  → Fix only the error and direct causes. Don’t refactor unrelated code.

- “Add a new screen / feature”:  
  → Build it using existing patterns, global components, and data layer. Integrate with navigation cleanly.

- “Clean this up”:  
  → Limit cleanup to the specific file or small area in question. Maintain behavior.

When in doubt, **assume the user wants the smallest, safest change that satisfies the request.**

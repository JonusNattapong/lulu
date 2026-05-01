# Documentation Maintenance Rules

## 1. Continuous Updates
- **Requirement:** All AI agents MUST update the documentation files immediately after implementing changes.
- **Trigger:**
  - **New Feature/Tool:** Update `ARCHITECTURE.md` (system flow) and `ROADMAP.md` (check off items).
  - **Design Change:** Update `DECISIONS.md` with the rationale.
  - **Every Commit:** Update `CHANGELOG.md` following the established conventions.

## 2. File Specifics
- **ARCHITECTURE.md:** Keep the Mermaid diagrams and code map in sync with the actual `src/` structure.
- **ROADMAP.md:** Use `[x]` to mark completed tasks. Add new ideas to Phase 4+ as they arise.
- **DECISIONS.md:** Record WHY a specific path was chosen, especially if it deviates from common patterns.
- **CHANGELOG.md:** Ensure every user-facing change is documented under the correct category.

## 3. Self-Verification
- Before ending a session, the agent should check if any architectural or roadmap updates were missed.

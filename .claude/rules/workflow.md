# Agent Workflow Guidelines

## 1. Plan-First Strategy
- **Requirement:** Before making any destructive or complex changes, the agent must output a detailed plan.
- **Content:** The plan should include the files to be modified, the expected changes, and potential risks.
- **Approval:** Wait for user confirmation (explicit or implicit based on context) before proceeding to execution.

## 2. Iterative Development
- Do not attempt to fix 10 things at once.
- Break large tasks into small, verifiable chunks.
- Test or verify each chunk before moving to the next.

## 3. Self-Correction & Verification
- **Post-Change Check:** After writing a file, use `read_file` to verify the content matches the intention.
- **Lints/Tests:** Run project-specific validation tools (e.g., `npm run typecheck`, `npm test`) frequently.
- **Error Recovery:** If a tool fails, analyze the error message and attempt a different approach rather than repeating the same failed command.

## 4. Communication
- Keep responses concise and technical.
- Use Markdown formatting for code and logs.
- Highlight any important design decisions made during the process.

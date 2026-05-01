# Security & Permissions

- **Tool Access:** Tools like `write_file` and `run_command` are guarded by environment variables.
- **Environment Variables:**
  - `LULU_ALLOW_WRITE`: Must be `true` to enable file modifications.
  - `LULU_ALLOW_COMMAND`: Must be `true` to enable terminal command execution.
- **Confirmation:** For highly destructive commands (e.g., `rm -rf`), always ask for explicit user confirmation in the chat before executing.

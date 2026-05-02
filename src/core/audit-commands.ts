import type { CommandContext, CommandResult } from "./commands.js";
import { getAuditLog } from "./audit.js";

// Audit commands registration
async function registerAuditCommands() {
  const { commandRegistry } = await import("./commands.js");

  // Audit command
  commandRegistry.register({
    name: "audit",
    description: "View and manage audit logs: /audit query, stats, export, clear",
    execute: async (args, context): Promise<CommandResult> => {
      const sub = args[0]?.toLowerCase();
      const projectName = context.config.projectName || "default";
      const audit = getAuditLog(projectName);

      switch (sub) {
        case "query": {
          const options: any = {};
          if (args.includes("--type")) {
            const idx = args.indexOf("--type");
            options.types = args[idx + 1]?.split(",");
          }
          if (args.includes("--channel")) {
            const idx = args.indexOf("--channel");
            options.channel = args[idx + 1];
          }
          if (args.includes("--risk")) {
            const idx = args.indexOf("--risk");
            options.risk = args[idx + 1];
          }
          if (args.includes("--limit")) {
            const idx = args.indexOf("--limit");
            options.limit = parseInt(args[idx + 1] || "50");
          }

          const events = audit.query(options);

          if (events.length === 0) {
            return { text: "No audit events found." };
          }

          const lines = [
            `## Audit Events (${events.length})`,
            "",
            ...events.slice(0, 20).map((e) => {
              const time = new Date(e.timestamp).toLocaleString();
              const riskEmoji = e.risk === "critical" ? "🔴" : e.risk === "high" ? "🟠" : e.risk === "medium" ? "🟡" : "🟢";
              return `${riskEmoji} [${time}] ${e.type}: ${JSON.stringify(e.data).slice(0, 100)}`;
            }),
            "",
            events.length > 20 ? `... and ${events.length - 20} more` : "",
          ];

          return { text: lines.join("\n") };
        }

        case "stats": {
          const stats = audit.getStats(7);
          return { text: audit.formatReport(stats) };
        }

        case "export": {
          const filePath = args[1] || `~/.lulu/audit-${Date.now()}.jsonl`;
          const count = audit.exportToFile(filePath);
          return { text: `Exported ${count} events to ${filePath}` };
        }

        case "clear": {
          const days = parseInt(args[1] || "30");
          const count = audit.clear(days);
          return { text: `Cleared ${count} events older than ${days} days` };
        }

        case "errors": {
          const events = audit.query({ types: ["error"], limit: 20 });
          if (events.length === 0) {
            return { text: "No errors in audit log." };
          }

          const lines = [
            `## Recent Errors (${events.length})`,
            "",
            ...events.map((e) => {
              const time = new Date(e.timestamp).toLocaleString();
              return `⚠️  [${time}]\n${e.error || JSON.stringify(e.data)}`;
            }),
          ];

          return { text: lines.join("\n\n") };
        }

        case "tool": {
          const toolName = args[1];
          if (!toolName) {
            return { text: "Usage: /audit tool <tool-name>" };
          }

          const events = audit.query({
            types: ["tool_call", "tool_result"],
            limit: 50,
          });

          const toolEvents = events.filter(
            (e) => e.data.toolName === toolName
          );

          return {
            text: `## Tool: ${toolName}\n\nEvents: ${toolEvents.length}\n\n${toolEvents
              .slice(0, 10)
              .map((e) => `- ${new Date(e.timestamp).toLocaleString()}: ${e.success ? "✅" : "❌"}`)
              .join("\n")}`,
          };
        }

        case "session": {
          const sessionId = args[1];
          if (!sessionId) {
            return { text: "Usage: /audit session <session-id>" };
          }

          const events = audit.query({ sessionId, limit: 100 });

          const lines = [
            `## Session: ${sessionId}`,
            "",
            `Events: ${events.length}`,
            "",
            ...events.slice(0, 30).map((e) => {
              const time = new Date(e.timestamp).toLocaleTimeString();
              return `[${time}] ${e.type}: ${JSON.stringify(e.data).slice(0, 80)}`;
            }),
          ];

          return { text: lines.join("\n") };
        }

        default:
          return {
            text: `Usage: /audit <command>

Commands:
  query           - Show recent audit events
  stats           - Show statistics
  errors          - Show recent errors
  export [path]   - Export events to file
  clear [days]    - Clear events older than N days
  tool <name>     - Show events for a specific tool
  session <id>    - Show events for a session

Options:
  --type <types>   Filter by type (comma-separated)
  --channel <ch>   Filter by channel
  --risk <level>   Filter by risk level
  --limit <n>      Limit results (default 50)

Examples:
  /audit stats
  /audit errors
  /audit query --type tool_call --limit 100
  /audit export /tmp/audit.jsonl
  /audit clear 30`,
          };
      }
    },
  });

  console.log("[Audit] Commands registered");
}

// Auto-register when imported
registerAuditCommands();
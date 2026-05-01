---
name: add-tool
description: Add a new built-in tool to Lulu. Use when extending Lulu with a new capability like file editing, git operations, or web search.
---

# Skill: Add Built-in Tool

Add a new tool to Lulu's built-in tool set.

## Context
- Tools defined in `src/agent/tools.ts`
- `BUILTIN_TOOLS: ToolDef[]` — declarative schema array
- `executeToolImpl` — switch-based dispatch
- Types in `src/types.ts` (`ToolDef`, `ToolCall`, `ToolResult`)

## Steps

1. **Define the schema** — add entry to `BUILTIN_TOOLS` array:

```typescript
{
  name: "my_tool",
  description: "What this tool does. Keep it clear for the LLM.",
  input_schema: {
    type: "object",
    properties: {
      param1: { type: "string", description: "Description of param1" },
      param2: { type: "integer", description: "Optional param" },
    },
    required: ["param1"],
  },
}
```

2. **Add implementation** — add case to `executeToolImpl` switch:

```typescript
case "my_tool": {
  const p1 = call.input.param1 as string;
  const p2 = (call.input.param2 as number) ?? default;
  // ... tool logic ...
  return `Result: ${output}`;
}
```

3. **Add permission gate if destructive** — check env var at top:

```typescript
if (process.env.LULU_ALLOW_MY_TOOL !== "true") {
  throw new Error("my_tool is disabled. Set LULU_ALLOW_MY_TOOL=true.");
}
```

4. **Build & test**:
```sh
npm run build && node dist/index.js "use my_tool to do something"
```

## Tool Design Rules
- Return plain text strings — the LLM reads the output
- Report errors via return string (not throw) when possible
- Use `throw` only for hard failures (caught by `executeTool`)
- Keep tools idempotent where possible

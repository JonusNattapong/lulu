import { loadPromptBuild } from "../../core/config.js";
import { describePrompt, listPromptProfiles, readPromptProfile, writePromptProfile } from "../../core/prompt.js";
import type { Tool } from "../registry.js";

export const promptTools: Tool[] = [
  {
    name: "prompt_status",
    category: "prompt",
    description: "Show active prompt profile and layers.",
    risk: "low",
    input_schema: { type: "object", properties: {} },
    execute: async () => describePrompt(loadPromptBuild(process.env))
  },
  {
    name: "prompt_list_profiles",
    category: "prompt",
    description: "List saved prompt profiles.",
    risk: "low",
    input_schema: { type: "object", properties: {} },
    execute: async () => {
      const profiles = listPromptProfiles();
      return profiles.length > 0 ? profiles.join("\n") : "No profiles found.";
    }
  },
  {
    name: "prompt_read_profile",
    category: "prompt",
    description: "Read a saved prompt profile.",
    risk: "low",
    input_schema: {
      type: "object",
      properties: { profile: { type: "string" } }
    },
    execute: async (input) => {
      const profile = input.profile || "default";
      const content = readPromptProfile(profile);
      return content ? `# ${profile}\n${content}` : "Profile not found.";
    }
  },
  {
    name: "prompt_write_profile",
    category: "prompt",
    description: "Write a prompt profile.",
    risk: "medium",
    permissions: ["write"],
    input_schema: {
      type: "object",
      properties: { profile: { type: "string" }, content: { type: "string" } },
      required: ["profile", "content"]
    },
    execute: async (input) => {
      const { profile, content } = input;
      const savedPath = writePromptProfile(profile, content);
      return `Profile saved: ${savedPath}`;
    }
  }
];

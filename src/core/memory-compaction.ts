import { MemoryManager } from "./memory.js";
import { getSoulFile, writeSoulFile } from "./soul.js";
import { sendToProvider } from "../providers/providers.js";
import type { AgentConfig } from "../types/types.js";

/**
 * Memory Compaction:
 * Takes raw memories from SQLite, summarizes them into stable facts,
 * and updates soul/MEMORY.md to keep the context window clean.
 */
export async function compactProjectMemory(projectName: string, config: AgentConfig) {
  const memoryManager = new MemoryManager(projectName);
  const uncompacted = memoryManager.getUncompactedMemories(50);

  if (uncompacted.length < 5) {
    console.log(`[Compaction] Not enough new memories for ${projectName} (found ${uncompacted.length})`);
    memoryManager.close();
    return;
  }

  console.log(`[Compaction] Compacting ${uncompacted.length} memories for ${projectName}...`);

  const currentMemoryMd = getSoulFile(projectName, "MEMORY.md")?.content || "# MEMORY\n\nLong-term project memory and stable facts.";
  
  const memoriesText = uncompacted.map(m => `- ${m.content}`).join("\n");
  
  const systemPrompt = `You are Lulu's Memory Compactor. 
Your task is to integrate new learned information into the existing project MEMORY.md.
Rules:
1. Preserve existing stable facts unless the new info corrects them.
2. Group information logically (e.g., # Preferences, # Project Structure, # Technical Decisions).
3. Be extremely concise. Use bullet points.
4. If information is redundant or trivial, discard it.
5. Return ONLY the complete updated Markdown content.`;

  const userPrompt = `Existing MEMORY.md:
---
${currentMemoryMd}
---

New information to integrate:
---
${memoriesText}
---`;

  try {
    // We use sendToProvider with an empty tool list and inject system prompt via config override
    const response = await sendToProvider(
      { ...config, systemPrompt }, 
      [{ role: "user", content: userPrompt }], 
      []
    );
    
    if (response.text) {
      writeSoulFile(projectName, "MEMORY.md", response.text.trim());
      memoryManager.markAsCompacted(uncompacted.map(m => m.id));
      console.log(`[Compaction] Successfully updated MEMORY.md for ${projectName}`);
    }
  } catch (err) {
    console.error(`[Compaction] Failed to compact memory for ${projectName}:`, err);
  } finally {
    memoryManager.close();
  }
}

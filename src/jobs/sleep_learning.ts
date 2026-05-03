import { autonomousResearcher } from "../core/autonomous-research.js";
import { proactiveEngine } from "../core/proactive.js";
import { runAgent } from "../core/agent.js";
import { loadConfig } from "../core/config.js";

export async function runSleepLearning(projectRoot: string): Promise<string> {
  const config = loadConfig({ ...process.env, LULU_PROJECT_NAME: "sleep_learning" });
  if (!config) return "No config available for sleep learning.";

  try {
    // Generate a topic to research
    const prompt = `You are a proactive sleep learning worker. Analyze the current tech landscape or general software engineering trends. Pick ONE interesting new framework, library, or concept that would be beneficial to learn for a developer. Return ONLY the topic string (e.g., "WebAssembly in Node.js", "htmx"), nothing else.`;
    const result = await runAgent(config, prompt, []);
    const topic = result.finalText?.trim() || "Latest trends in TypeScript development";

    // Queue it in the autonomous researcher
    autonomousResearcher.queue(topic, "medium", ["Use cases", "Pros and cons", "Getting started"]);
    
    // Create a proactive suggestion to greet the user in the morning
    proactiveEngine.suggest({
      type: "opportunity",
      title: "👻 Ghost Worker Activity",
      body: `While you were sleeping, I queued a research task on: "${topic}". The results will be stored in my brain soon!`,
      context: "sleep_learning",
      priority: "medium",
    });

    return `Sleep learning triggered for topic: ${topic}`;
  } catch (e: any) {
    return `Failed to run sleep learning: ${e.message}`;
  }
}

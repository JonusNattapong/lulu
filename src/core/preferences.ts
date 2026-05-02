/**
 * Preference Learning System
 * Tracks user preferences across sessions and applies them to agent behavior.
 * Learns from: user corrections, accepted/rejected suggestions, repeated patterns.
 */
import { eventBus } from "./events.js";
import { userProfile } from "./user-profile.js";
import { skillProposalManager } from "./skill-proposal.js";
import { proactiveEngine } from "./proactive.js";

export interface PreferenceRule {
  pattern: RegExp;
  value: string;
  weight: number;
  source: "explicit" | "inferred" | "corrected";
}

const PREFERENCE_PATTERNS: Array<{ pattern: RegExp; key: string; defaultValue: string }> = [
  { pattern: /prefer (typescript|javascript|python|go|rust)/i, key: "codeLanguage", defaultValue: "" },
  { pattern: /use (prettier|eslint|black|pylint)/i, key: "linter", defaultValue: "" },
  { pattern: /(verbose|concise|brief)/i, key: "verbosity", defaultValue: "" },
  { pattern: /(formal|casual|friendly)/i, key: "tone", defaultValue: "" },
  { pattern: /explain (more|less|briefly)/i, key: "explanations", defaultValue: "" },
];

class PreferenceLearner {
  private activeRules: PreferenceRule[] = [];

  /** Analyze text for implicit preferences */
  detectPreferences(text: string): void {
    for (const { pattern, key, defaultValue } of PREFERENCE_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        const value = match[1] || defaultValue;
        if (value) {
          userProfile.recordPreference(key, value, `Detected in: "${text.slice(0, 100)}"`, "pattern", 0.6);
          proactiveEngine.recordPattern(`pref:${key}:${value}`);
        }
      }
    }
  }

  /** Learn from user correction */
  learnFromCorrection(original: string, corrected: string, context: string): void {
    // Simple heuristic: if user replaces a tool or approach, record the preference
    const corrections: Array<{ from: RegExp; to: string; key: string }> = [
      { from: /bash|shell|exec/gi, to: "script", key: "executionMethod" },
      { from: /write|create|make file/gi, to: "fileCreate", key: "fileMethod" },
      { from: /explain|describe/gi, to: "explanation", key: "communication" },
    ];

    for (const rule of corrections) {
      if (corrected.match(rule.from)) {
        userProfile.recordPreference(
          rule.key,
          rule.to,
          `Correction in context: "${context.slice(0, 80)}"`,
          "correction",
          0.85
        );
      }
    }

    // General learning: if user provides a correction, note the topic
    proactiveEngine.recordPattern(`corrected:${context.slice(0, 50)}`);
  }

  /** Learn from accepted suggestion */
  learnFromAcceptance(suggestionId: string): void {
    const proposal = skillProposalManager.get(suggestionId);
    if (!proposal) return;

    proposal.acceptanceRate = (proposal.acceptanceRate * proposal.frequency + 1) / (proposal.frequency + 1);
    proposal.frequency++;

    // Inferred preference: user accepted this workflow
    userProfile.recordPreference(
      "acceptedWorkflow",
      proposal.name,
      `Accepted proposal: ${proposal.description}`,
      "suggestion_accepted",
      0.8
    );

    proactiveEngine.recordPattern(`accepted:${proposal.name}`);
  }

  /** Learn from rejected suggestion */
  learnFromRejection(suggestionId: string): void {
    const proposal = skillProposalManager.get(suggestionId);
    if (!proposal) return;

    proposal.acceptanceRate = proposal.acceptanceRate * 0.5; // decay on rejection

    proactiveEngine.recordPattern(`rejected:${proposal.name}`);
  }

  /** Learn from repeated tool usage */
  learnFromToolUsage(toolName: string, frequency: number): void {
    if (frequency >= 3) {
      userProfile.recordPreference(
        "preferredTool",
        toolName,
        `Used ${frequency} times in recent sessions`,
        "pattern",
        Math.min(0.95, 0.5 + frequency * 0.1)
      );
    }
  }

  /** Build preference rules for agent */
  buildPreferenceRules(): string[] {
    const profile = userProfile.getProfile();
    const rules: string[] = [];

    for (const pref of profile.preferences) {
      if (pref.confidence < 0.5) continue;
      rules.push(`${pref.key} = ${pref.value} (${(pref.confidence * 100).toFixed(0)}% confidence)`);
    }

    return rules;
  }

  /** Get most confident preferences */
  getTopPreferences(limit = 5): Array<{ key: string; value: string; confidence: number }> {
    const profile = userProfile.getProfile();
    return profile.preferences
      .filter(p => p.confidence >= 0.6)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, limit)
      .map(p => ({ key: p.key, value: p.value, confidence: p.confidence }));
  }
}

export const preferenceLearner = new PreferenceLearner();
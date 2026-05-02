/**
 * Self-Reflection System
 * Analyzes agent performance after each session and generates insights.
 * Runs during idle times in daemon mode.
 */
import { eventBus } from "./events.js";
import { userProfile } from "./user-profile.js";
import { skillProposalManager } from "./skill-proposal.js";

export interface ReflectionResult {
  timestamp: string;
  sessionId: string;
  taskCompletion: "full" | "partial" | "failed" | "unknown";
  toolEfficiency: number; // 0-1
  userSatisfaction: number; // 0-1
  insights: string[];
  suggestions: string[];
}

interface SessionMetrics {
  turns: number;
  toolCalls: number;
  errors: number;
  timeMs: number;
  completed: boolean;
}

class SelfReflection {
  private recentMetrics: SessionMetrics[] = [];

  /** Record metrics from a completed session */
  recordSession(metrics: SessionMetrics): void {
    this.recentMetrics.push(metrics);
    if (this.recentMetrics.length > 50) {
      this.recentMetrics.shift();
    }
    this.analyzeAndLearn(metrics);
  }

  private analyzeAndLearn(metrics: SessionMetrics): void {
    // Tool efficiency: toolCalls / turns ratio
    const toolRatio = metrics.toolCalls / Math.max(1, metrics.turns);
    if (toolRatio > 3) {
      userProfile.addLearning(
        "insight",
        `High tool usage ratio detected (${toolRatio.toFixed(1)} tools/turn). Consider if task could be simplified.`,
        `efficiency:tool:${toolRatio}`,
        0.5
      );
    }

    // Session length analysis
    if (metrics.turns > 30 && !metrics.completed) {
      userProfile.addLearning(
        "insight",
        `Long incomplete session (${metrics.turns} turns, ${metrics.timeMs}ms). Consider breaking into smaller sub-tasks.`,
        `efficiency:session:${metrics.turns}`,
        0.6
      );
    }

    // Error rate
    const errorRate = metrics.errors / Math.max(1, metrics.toolCalls);
    if (errorRate > 0.3) {
      userProfile.addLearning(
        "insight",
        `High error rate (${(errorRate * 100).toFixed(0)}%). Review tool usage patterns.`,
        `efficiency:errors:${errorRate}`,
        0.7
      );
    }

    // Fast successful sessions — positive signal
    if (metrics.completed && metrics.turns <= 5 && metrics.errors === 0) {
      userProfile.addLearning(
        "insight",
        `Quick successful session (${metrics.turns} turns, no errors). Good workflow pattern.`,
        `success:fast:${metrics.turns}`,
        0.8
      );
    }
  }

  /** Run a full reflection analysis on recent sessions */
  reflect(): ReflectionResult[] {
    const results: ReflectionResult[] = [];

    // Analyze trend over recent sessions
    if (this.recentMetrics.length >= 3) {
      const recent = this.recentMetrics.slice(-5);

      // Average tool efficiency
      const avgTurns = recent.reduce((s, m) => s + m.turns, 0) / recent.length;
      const avgTools = recent.reduce((s, m) => s + m.toolCalls, 0) / recent.length;
      const avgErrors = recent.reduce((s, m) => s + m.errors, 0) / recent.length;
      const avgTime = recent.reduce((s, m) => s + m.timeMs, 0) / recent.length;

      const toolEfficiency = Math.max(0, 1 - (avgTools / Math.max(1, avgTurns) - 1) / 3);
      const userSatisfaction = Math.max(0, Math.min(1, 1 - avgErrors / Math.max(1, avgTools)));

      const insights: string[] = [];
      const suggestions: string[] = [];

      if (avgTurns > 15) {
        insights.push(`Average session length is high (${avgTurns.toFixed(0)} turns). Consider task decomposition.`);
        suggestions.push("Break complex tasks into sub-tasks using /coordinator.");
      }

      if (avgErrors > 2) {
        insights.push(`Average ${avgErrors.toFixed(1)} errors per session. Review common failure patterns.`);
        suggestions.push("Check /audit errors for recurring issues.");
      }

      if (avgTime > 60_000) {
        insights.push(`Average session time is ${(avgTime / 1000).toFixed(0)}s.`);
        suggestions.push("Consider using sub-agents for parallel execution.");
      }

      // Store as a batch insight
      userProfile.addLearning(
        "insight",
        `Session trend: ${avgTurns.toFixed(0)} turns avg, ${(toolEfficiency * 100).toFixed(0)}% tool efficiency, ${(userSatisfaction * 100).toFixed(0)}% satisfaction`,
        `trend:${recent.length}-sessions`,
        0.6
      );

      results.push({
        timestamp: new Date().toISOString(),
        sessionId: "trend-analysis",
        taskCompletion: "unknown",
        toolEfficiency,
        userSatisfaction,
        insights,
        suggestions,
      });
    }

    return results;
  }

  /** Get performance summary */
  getSummary(): {
    totalSessions: number;
    avgTurns: number;
    avgToolCalls: number;
    avgErrors: number;
    completionRate: number;
  } {
    if (this.recentMetrics.length === 0) {
      return { totalSessions: 0, avgTurns: 0, avgToolCalls: 0, avgErrors: 0, completionRate: 0 };
    }

    const total = this.recentMetrics.length;
    const completed = this.recentMetrics.filter(m => m.completed).length;

    return {
      totalSessions: total,
      avgTurns: this.recentMetrics.reduce((s, m) => s + m.turns, 0) / total,
      avgToolCalls: this.recentMetrics.reduce((s, m) => s + m.toolCalls, 0) / total,
      avgErrors: this.recentMetrics.reduce((s, m) => s + m.errors, 0) / total,
      completionRate: completed / total,
    };
  }
}

export const selfReflection = new SelfReflection();
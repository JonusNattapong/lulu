import { resolve, normalize, sep } from "node:path";
import { homedir } from "node:os";

export class SecurityManager {
  private static readonly SENSITIVE_KEYS = [
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "GOOGLE_API_KEY",
    "GOOGLE_GENERATIVE_AI_API_KEY",
    "DEEPSEEK_API_KEY",
    "MISTRAL_API_KEY",
    "LULU_API_KEY",
    "LULU_API_TOKEN",
    "TELEGRAM_BOT_TOKEN",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "GITHUB_TOKEN",
  ];

  /**
   * Sanitizes a file path to ensure it stays within allowed boundaries.
   * Throws an error if path traversal is detected.
   */
  static sanitizePath(targetPath: string, allowedRoots: string[]): string {
    const resolvedPath = resolve(targetPath);
    const normalizedAllowed = allowedRoots.map(r => resolve(r));
    
    // Always allow ~/.lulu for internal data
    normalizedAllowed.push(resolve(homedir(), ".lulu"));

    const isAllowed = normalizedAllowed.some(root => {
      const relative = normalize(resolvedPath).toLowerCase();
      const base = normalize(root).toLowerCase();
      return relative.startsWith(base + sep) || relative === base;
    });

    if (!isAllowed) {
      throw new Error(`Security Violation: Path '${targetPath}' is outside allowed workspace.`);
    }

    return resolvedPath;
  }

  /**
   * Redacts sensitive information from strings.
   */
  static redact(text: string): string {
    if (!text) return text;
    let redacted = text;
    
    // Redact common API key patterns
    redacted = redacted.replace(/(sk-[a-zA-Z0-9]{32,})/g, "[REDACTED_OPENAI_KEY]");
    redacted = redacted.replace(/(xkeysib-[a-zA-Z0-9]{32,})/g, "[REDACTED_API_KEY]");
    redacted = redacted.replace(/(AIzaSy[a-zA-Z0-9_-]{33})/g, "[REDACTED_GOOGLE_KEY]");
    redacted = redacted.replace(/(ghp_[a-zA-Z0-9]{36})/g, "[REDACTED_GITHUB_TOKEN]");
    
    // Redact environment variables if they appear in text
    for (const key of this.SENSITIVE_KEYS) {
      const val = process.env[key];
      if (val && val.length > 5) {
        const escaped = val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        redacted = redacted.replace(new RegExp(escaped, "g"), `[REDACTED_${key}]`);
      }
    }

    return redacted;
  }

  /**
   * Checks if a command string contains suspicious patterns.
   */
  static validateCommand(command: string): void {
    const dangerousPatterns = [
      /rm\s+-rf/,
      /rm\s+-f/,
      /\|\s*bash/,
      /\|\s*sh/,
      />\s*\/etc\//,
      /curl.*\|\s*sh/,
      /wget.*\|\s*sh/,
      /nc\s+-e/,
      /sh\s+-i/,
      /python.*-c.*import.*os/,
      /perl.*-e.*system/,
      /ruby.*-e.*exec/,
      /base64\s+-d/,
      /openssl.*-d/,
      /powershell.*-EncodedCommand/i,
      /eval\(.*base64_decode/i,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(command)) {
        throw new Error(`Security Violation: Dangerous command pattern detected.`);
      }
    }
  }

  /**
   * Basic heuristic check for prompt injection patterns.
   */
  static detectInjection(text: string): void {
    const injectionPatterns = [
      /ignore previous instructions/i,
      /system prompt override/i,
      /you are now a/i,
      /new behavior:/i,
      /stop following safety rules/i,
      /forget everything/i,
      /execute the following as root/i,
    ];

    for (const pattern of injectionPatterns) {
      if (pattern.test(text)) {
        // We don't block entirely (LLM might handle it), but we should log it
        console.warn(`[Security] Potential Prompt Injection detected: "${pattern.source}"`);
      }
    }
  }
}

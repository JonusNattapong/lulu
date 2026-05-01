/**
 * Secrets Redaction System
 * 
 * Automatically masks secrets (API keys, tokens, keys) from all text channels:
 * logs, tool outputs, dashboard streams, prompt inspection.
 * 
 * Strategy:
 * 1. Known secrets: values from env vars + config files (exact-match redaction)
 * 2. Pattern-based: common key prefixes (sk-, gho_, etc.)
 * 3. Long random strings: hex/base64 strings >= 32 chars
 */

type RedactPattern = { name: string; regex: RegExp; replace: string | ((match: string, ...args: any[]) => string) };

const knownSecrets = new Set<string>();
const patterns: RedactPattern[] = [
  // JWT tokens (base64url-encoded, typically starts with eyJ)
  { name: "jwt", regex: /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, replace: "[REDACTED_JWT]" },
  // Anthropic keys
  { name: "anthropic_key", regex: /sk-ant-api[0-9]{2}-[a-zA-Z0-9_-]{40,}/g, replace: "[REDACTED_ANTHROPIC_KEY]" },
  // Standard API key prefix (sk-, pk-)
  { name: "api_key_sk", regex: /sk-[a-zA-Z0-9]{20,}/g, replace: "[REDACTED_API_KEY]" },
  // GitHub tokens
  { name: "github_token", regex: /gh[po]_[a-zA-Z0-9]{32,}/g, replace: "[REDACTED_GITHUB_TOKEN]" },
  // OpenRouter keys
  { name: "openrouter_key", regex: /sk-or-v[0-9]-[a-f0-9]{40,}/g, replace: "[REDACTED_OPENROUTER_KEY]" },
  // Bearer auth headers
  { name: "bearer_token", regex: /Bearer\s+([a-zA-Z0-9\.\-_~\+\/]+=*)/gi, replace: "Bearer [REDACTED]" },
  // Authorization headers
  { name: "auth_header", regex: /Authorization:\s*([a-zA-Z0-9\.\-_~\+\/]+=*)/gi, replace: "Authorization: [REDACTED]" },
  // API key in JSON/object format
  { name: "api_key_json", regex: /"api[Kk]ey"\s*:\s*"[^"]{10,}"/g, replace: '"apiKey": "[REDACTED]"' },
  // Private key blocks
  { name: "private_key", regex: /-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----[^]*?-----END \1?PRIVATE KEY-----/g, replace: "[REDACTED_PRIVATE_KEY]" },
  // Connection strings with passwords
  { name: "conn_string", regex: /(postgres|mysql|mongodb|sqlite):\/\/[^:]+:([^@]+)@/gi, replace: ((_: string, p1: string, p2: string) => `${p1}://[user]:[REDACTED_PASSWORD]@`) as any },
  { name: "hex_key", regex: /\b[a-f0-9]{40,}\b/gi, replace: ((match: string) => match.length > 60 ? `[REDACTED_HEX_${match.length}]` : match) as any },
  { name: "base64_key", regex: /\b[A-Za-z0-9+/]{40,}={0,2}\b/g, replace: ((match: string) => match.length > 80 ? `[REDACTED_B64_${match.length}]` : match) as any },
];

export function registerSecret(value: string): void {
  if (value && value.length > 6) {
    knownSecrets.add(value);
  }
}

export function initSecrets(): void {
  // Scan process.env for secret-looking values
  for (const [key, val] of Object.entries(process.env)) {
    if (!val || val.length < 8) continue;
    
    const upperKey = key.toUpperCase();
    const isSecretEnv = 
      upperKey.includes("KEY") ||
      upperKey.includes("TOKEN") ||
      upperKey.includes("SECRET") ||
      upperKey.includes("PASSWORD") ||
      upperKey.includes("AUTH");
    
    if (isSecretEnv) {
      registerSecret(val);
    }
  }
}

export function redact(text: string): string {
  if (!text || text.length < 5) return text;

  let result = text;

  // 1. Exact-match known secrets
  for (const secret of knownSecrets) {
    if (secret.length > 6 && result.includes(secret)) {
      result = result.split(secret).join(`[REDACTED_SECRET]`);
    }
  }

  // 2. Pattern-based redaction
  for (const pattern of patterns) {
    result = result.replace(pattern.regex, pattern.replace as any);
  }

  // 3. Known secrets in URL-encoded form
  for (const secret of knownSecrets) {
    const encoded = encodeURIComponent(secret);
    if (encoded !== secret && result.includes(encoded)) {
      result = result.split(encoded).join(`[REDACTED_ENCODED]`);
    }
  }

  return result;
}

export function redactObject(obj: any): any {
  if (!obj) return obj;
  if (typeof obj === "string") return redact(obj);
  if (Array.isArray(obj)) return obj.map(redactObject);
  if (typeof obj === "object") {
    const result: Record<string, any> = {};
    for (const [key, val] of Object.entries(obj)) {
      const upperKey = key.toUpperCase();
      if (upperKey.includes("KEY") || upperKey.includes("TOKEN") || upperKey.includes("SECRET") || upperKey.includes("PASSWORD")) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = redactObject(val);
      }
    }
    return result;
  }
  return obj;
}

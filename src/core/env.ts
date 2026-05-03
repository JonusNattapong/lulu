import { z } from "zod";
import pc from "picocolors";

const envSchema = z.object({
  // Providers & API Keys
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  DEEPSEEK_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  MISTRAL_API_KEY: z.string().optional(),
  KILOCODE_API_KEY: z.string().optional(),

  // App Configuration
  LULU_PROVIDER: z.string().default("claude"),
  LULU_MODEL: z.string().optional(),
  LULU_CHANNEL: z.enum(["cli", "api", "telegram", "dashboard"]).default("cli"),
  LULU_ALLOW_WRITE: z.preprocess(v => v === "true" || v === true, z.boolean()).default(false),
  LULU_ALLOW_COMMAND: z.preprocess(v => v === "true" || v === true, z.boolean()).default(false),
  LULU_DEBUG: z.preprocess(v => v === "true" || v === true, z.boolean()).default(false),
  
  // Storage
  LULU_DATA_DIR: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error(pc.red("❌ Invalid environment variables:"));
    result.error.issues.forEach(issue => {
      console.error(pc.red(`  - ${issue.path.join('.')}: ${issue.message}`));
    });
    // We don't necessarily want to crash the app, but we want to warn loudly.
    return null;
  }

  return result.data;
}

export const env = validateEnv();

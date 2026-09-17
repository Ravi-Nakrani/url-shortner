import { z } from "zod";

const envSchema = z.object({
  MONGODB_URI: z.string().url({ message: "MONGODB_URI must be a valid connection string" }),
  OUTBOX_SECRET: z.string().min(16, { message: "OUTBOX_SECRET must be at least 16 characters" }),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration. Check your .env.local file:\n${issues}`);
  }

  return parsed.data;
}

export const env = loadEnv();

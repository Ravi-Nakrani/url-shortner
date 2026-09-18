import { z } from "zod";

const envSchema = z.object({
  MONGODB_URI: z.string().url({ message: "MONGODB_URI must be a valid connection string" }),
  OUTBOX_SECRET: z.string().min(16, { message: "OUTBOX_SECRET must be at least 16 characters" }),
  AUTH_SECRET: z.string().min(16, { message: "AUTH_SECRET must be at least 16 characters" }),
  AUTH_GITHUB_ID: z.string().min(1, { message: "AUTH_GITHUB_ID is required" }),
  AUTH_GITHUB_SECRET: z.string().min(1, { message: "AUTH_GITHUB_SECRET is required" }),
  AUTH_GOOGLE_ID: z.string().min(1, { message: "AUTH_GOOGLE_ID is required" }),
  AUTH_GOOGLE_SECRET: z.string().min(1, { message: "AUTH_GOOGLE_SECRET is required" }),
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

import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, "../../.env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

export const AI_CONFIG = {
  provider: process.env.AI_PROVIDER || (process.env.AI_API_KEY ? "nvidia" : "ollama"),
  baseUrl: process.env.AI_API_URL || (process.env.AI_API_KEY ? "https://integrate.api.nvidia.com/v1" : "http://127.0.0.1:11434"),
  apiKey: process.env.AI_API_KEY || "",
  
  preferredModels: [
    process.env.AI_MODEL,
    "deepseek-ai/deepseek-v4-flash-0731",
    "deepseek-ai/deepseek-coder-6.7b-instruct",
    "qwen2.5-coder:latest",
    "qwen2.5-coder:7b",
    "qwen3:8b",
    "qwen2.5-coder:1.5b",
    "qwen2:latest"
  ].filter(Boolean) as string[],
  
  defaultModel: process.env.AI_MODEL || (process.env.AI_API_KEY ? "deepseek-ai/deepseek-v4-flash-0731" : "qwen2.5-coder:latest"),
  temperature: 0.1,
  maxTokens: 2048,
  timeoutMs: 60000,
  maxFileSizeMb: 25,
  maxFilesPerMessage: 5,
  tempUploadDir: path.resolve(process.cwd(), "data", "ai-uploads")
};

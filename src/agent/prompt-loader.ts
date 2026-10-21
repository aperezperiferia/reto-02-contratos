import fs from "node:fs/promises";
import path from "node:path";

export async function loadSystemPrompt(directory: string): Promise<string> {
  const promptPath = path.join(directory, "agent", "prompt.md");
  const knowledgePath = path.join(directory, "src", "knowledge", "registro-contratos.md");
  const [prompt, knowledge] = await Promise.all([
    fs.readFile(promptPath, "utf8"),
    fs.readFile(knowledgePath, "utf8"),
  ]);
  return `${prompt.trim()}\n\n---\n\n## Conocimiento del proceso\n\n${knowledge.trim()}`;
}

import type { z } from "zod";
import type { ToolContext } from "../context.js";

export type ToolResult = { ok: true; data: unknown } | { ok: false; error: string };

export function toolJson(result: ToolResult): string {
  return JSON.stringify(result);
}

export type ToolDefinition<TArgs extends Record<string, unknown>> = {
  description: string;
  args: { [K in keyof TArgs]: z.ZodType<TArgs[K]> };
  execute: (args: TArgs, ctx: ToolContext) => Promise<string>;
};

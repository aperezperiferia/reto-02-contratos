import { z } from "zod";

function innerSchema(schema: z.ZodType): Record<string, unknown> {
  if (schema instanceof z.ZodOptional) {
    return innerSchema(schema.unwrap() as z.ZodType);
  }
  if (schema instanceof z.ZodString) {
    const out: Record<string, unknown> = { type: "string" };
    if (schema.description) out.description = schema.description;
    return out;
  }
  if (schema instanceof z.ZodBoolean) {
    const out: Record<string, unknown> = { type: "boolean" };
    if (schema.description) out.description = schema.description;
    return out;
  }
  if (schema instanceof z.ZodEnum) {
    const out: Record<string, unknown> = { type: "string", enum: schema.options };
    if (schema.description) out.description = schema.description;
    return out;
  }
  if (schema instanceof z.ZodUnknown || schema instanceof z.ZodAny) {
    const out: Record<string, unknown> = {};
    if (schema.description) out.description = schema.description;
    return out;
  }
  const out: Record<string, unknown> = {};
  if (schema.description) out.description = schema.description;
  return out;
}

export function zodArgsToJsonSchema(args: Record<string, z.ZodType>): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [key, schema] of Object.entries(args)) {
    properties[key] = innerSchema(schema);
    if (!(schema instanceof z.ZodOptional)) {
      required.push(key);
    }
  }
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}

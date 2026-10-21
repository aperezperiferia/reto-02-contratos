export type ToolContext = {
  /** Raíz del repositorio reto-02 (process.cwd() al ejecutar desde ahí). */
  directory: string;
  sessionId: string;
};

export function createToolContext(sessionId = "default"): ToolContext {
  return {
    directory: process.cwd(),
    sessionId,
  };
}

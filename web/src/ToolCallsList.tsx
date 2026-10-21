import type { ToolCallView } from "./api";

type Props = {
  toolCalls: ToolCallView[];
};

export function ToolCallsList({ toolCalls }: Props) {
  if (!toolCalls.length) return null;

  return (
    <div className="tool-calls">
      <div className="tool-calls-title">Herramientas ejecutadas</div>
      <ul>
        {toolCalls.map((tc, i) => (
          <li key={`${tc.name}-${i}`} className={tc.ok ? "tool-ok" : "tool-err"}>
            <div className="tool-name">{tc.name}</div>
            <pre className="tool-args">{JSON.stringify(tc.arguments, null, 2)}</pre>
            <div className="tool-result">{tc.resultSummary}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

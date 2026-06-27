export type LogStream = "stdout" | "stderr" | "system";

export type LogLine = {
  stream: LogStream;
  text: string;
  timestamp: number;
};

export function createLogLine(
  stream: LogStream,
  text: string,
): LogLine {
  return { stream, text: text.trimEnd(), timestamp: Date.now() };
}

export function appendLogs(
  existing: LogLine[],
  incoming: LogLine[],
  max = 500,
): LogLine[] {
  return [...existing, ...incoming].slice(-max);
}

export function formatLogLine(line: LogLine): string {
  const time = new Date(line.timestamp).toLocaleTimeString(undefined, {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const prefix =
    line.stream === "stderr"
      ? "ERR"
      : line.stream === "system"
        ? "SYS"
        : "OUT";
  return `[${time}] ${prefix}  ${line.text}`;
}

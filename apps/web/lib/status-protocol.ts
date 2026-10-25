import {
  statusSignalPayloadSchema,
  statusSignalSchema,
  type StatusSignal,
} from "@joint/contracts";

/** Validate the empty status protocol at both server and browser boundaries. */
export function createStatusDecoder(
  onSignal?: (signal: StatusSignal) => void,
): {
  push(bytes: Uint8Array): Uint8Array | null;
  finish(): void;
} {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const encoder = new TextEncoder();
  let buffer = "";
  const invalid = (): never => {
    throw new Error("Invalid status stream");
  };
  function frame(value: string): string {
    if (value === ": keepalive") return ": keepalive\n\n";
    const match = /^event: ([a-z]+)\ndata: (.*)$/.exec(value);
    const signal = statusSignalSchema.safeParse(match?.[1]);
    if (!match || !signal.success) return invalid();
    let payload: unknown;
    try {
      payload = JSON.parse(match[2] ?? "");
    } catch {
      return invalid();
    }
    if (!statusSignalPayloadSchema.safeParse(payload).success) return invalid();
    onSignal?.(signal.data);
    return `event: ${signal.data}\ndata: {}\n\n`;
  }
  return {
    push(bytes): Uint8Array | null {
      buffer += decoder.decode(bytes, { stream: true });
      const output: string[] = [];
      let delimiter: RegExpExecArray | null;
      while ((delimiter = /\r?\n\r?\n/.exec(buffer))) {
        if (delimiter.index > 8192) return invalid();
        const value = buffer.slice(0, delimiter.index).replaceAll("\r\n", "\n");
        buffer = buffer.slice(delimiter.index + delimiter[0].length);
        output.push(frame(value));
      }
      if (buffer.length > 8192) return invalid();
      return output.length ? encoder.encode(output.join("")) : null;
    },
    finish(): void {
      buffer += decoder.decode();
      if (buffer) invalid();
    },
  };
}

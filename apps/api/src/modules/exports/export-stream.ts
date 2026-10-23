import { Readable } from "node:stream";
import type { ServerResponse } from "node:http";
import { StreamableFile } from "@nestjs/common";
import { diagnosticLine } from "@joint/database/diagnostics";

export function streamDownload(
  response: ServerResponse,
  signal: AbortController,
  chunks: AsyncGenerator<Uint8Array>,
): StreamableFile {
  const stream = Readable.from(chunks, { objectMode: false, highWaterMark: 1 });
  response.once("close", () => {
    signal.abort();
    stream.destroy();
  });
  return new StreamableFile(stream, {
    type: "text/csv; charset=utf-8",
    disposition: 'attachment; filename="joint-export.csv"',
  })
    .setErrorHandler(() => {
      // Ending a response here would make a truncated CSV look successful.
      // Destroy the connection without exposing the underlying database error.
      process.stderr.write(diagnosticLine({ code: "EXPORT_STREAM_FAILED" }));
      signal.abort();
      response.destroy();
    })
    .setErrorLogger(() => {
      process.stderr.write(diagnosticLine({ code: "EXPORT_STREAM_FAILED" }));
    });
}

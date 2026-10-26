/** @module Web-stream adapter for Bun child-process stdin. */

interface WritableSink {
  end(): void
  write(chunk: Uint8Array): number | Promise<number>
}

export const stdinWritableStream = (sink: WritableSink): WritableStream<Uint8Array> =>
  new WritableStream<Uint8Array>({
    abort: () => sink.end(),
    close: () => sink.end(),
    write: async (chunk) => {
      await sink.write(chunk)
    }
  })

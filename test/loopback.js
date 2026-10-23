// An in-memory stand-in for a WebRTC connection: two ends that deliver JSON to each other.
// Messages are cloned (like real serialisation) and delivered asynchronously, in order.

export function loopbackPair() {
  const a = end();
  const b = end();
  a.other = b;
  b.other = a;
  return [a, b];
}

function end() {
  return {
    onmessage: null,
    onclose: null,
    open: true,
    other: null,
    sent: [],
    send(msg) {
      if (!this.open) return;
      const copy = JSON.parse(JSON.stringify(msg));
      this.sent.push(copy);
      queueMicrotask(() => this.other.open && this.other.onmessage?.(JSON.parse(JSON.stringify(copy))));
    },
    close() {
      if (!this.open) return;
      this.open = false;
      queueMicrotask(() => {
        this.onclose?.();
        if (this.other.open) {
          this.other.open = false;
          this.other.onclose?.();
        }
      });
    },
  };
}

/** Wait for queued messages to be delivered (and anything they trigger). */
export const flush = async () => {
  for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r));
};

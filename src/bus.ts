type Handler = (payload: any) => void;

class Bus {
  private handlers = new Map<string, Set<Handler>>();
  on(evt: string, fn: Handler): () => void {
    if (!this.handlers.has(evt)) this.handlers.set(evt, new Set());
    this.handlers.get(evt)!.add(fn);
    return () => this.handlers.get(evt)?.delete(fn);
  }
  emit(evt: string, payload?: unknown) {
    this.handlers.get(evt)?.forEach((fn) => fn(payload));
  }
}

export const bus = new Bus();

export function toast(msg: string, kind: 'info' | 'good' | 'bad' | 'warn' = 'info') {
  bus.emit('toast', { msg, kind });
}

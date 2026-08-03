/** Small observable revision used by presentation registries. */
export class RevisionStore {
  private readonly listeners = new Set<() => void>();
  private value = 0;

  get revision(): number {
    return this.value;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  changed(): void {
    this.value += 1;
    [...this.listeners].forEach((listener) => listener());
  }

  clear(): void {
    this.listeners.clear();
  }
}

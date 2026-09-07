export class DailyBudget {
  private used = 0;

  constructor(readonly limit: number) {
    if (!Number.isInteger(limit) || limit <= 0) throw new Error('Budget limit must be a positive integer');
  }

  consume(units = 1): void {
    if (!Number.isInteger(units) || units <= 0) throw new Error('Units must be a positive integer');
    if (this.used + units > this.limit) {
      throw new Error(`Daily budget exceeded: ${this.used + units}/${this.limit}`);
    }
    this.used += units;
  }

  snapshot() {
    return { used: this.used, remaining: this.limit - this.used, limit: this.limit };
  }
}

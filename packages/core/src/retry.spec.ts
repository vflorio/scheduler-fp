import { describe, expect, it } from "vitest";
import { capDelay, concat, constantDelay, exponentialBackoff, initialStatus, limitRetries, type Status } from "./retry";

const status = (iteration: number, previousDelay: number | null = null): Status => ({
  iteration,
  previousDelay,
});

// -------------------------------------------------------------------------------------
// Primitives
// -------------------------------------------------------------------------------------

describe("constantDelay", () => {
  it("ritorna sempre lo stesso delay", () => {
    const policy = constantDelay(1000);
    expect(policy(status(0))).toBe(1000);
    expect(policy(status(5))).toBe(1000);
    expect(policy(status(100))).toBe(1000);
  });
});

describe("limitRetries", () => {
  it("ritorna 0 finche' ci sono tentativi, null quando esauriti", () => {
    const policy = limitRetries(3);
    expect(policy(status(0))).toBe(0);
    expect(policy(status(1))).toBe(0);
    expect(policy(status(2))).toBe(0);
    expect(policy(status(3))).toBe(null);
    expect(policy(status(4))).toBe(null);
  });
});

describe("exponentialBackoff", () => {
  it("raddoppia il delay ad ogni iterazione", () => {
    const policy = exponentialBackoff(100);
    expect(policy(status(0))).toBe(100);
    expect(policy(status(1))).toBe(200);
    expect(policy(status(2))).toBe(400);
    expect(policy(status(3))).toBe(800);
  });
});

describe("initialStatus", () => {
  it("parte da iterazione 0 senza delay precedente", () => {
    expect(initialStatus.iteration).toBe(0);
    expect(initialStatus.previousDelay).toBe(null);
  });
});

// -------------------------------------------------------------------------------------
// Combinators
// -------------------------------------------------------------------------------------

describe("capDelay", () => {
  it("limita il delay massimo", () => {
    const policy = capDelay(500)(exponentialBackoff(100));
    expect(policy(status(0))).toBe(100);
    expect(policy(status(1))).toBe(200);
    expect(policy(status(2))).toBe(400);
    expect(policy(status(3))).toBe(500); // 800 -> cap a 500
    expect(policy(status(10))).toBe(500);
  });

  it("propaga null quando la policy termina", () => {
    const policy = capDelay(500)(limitRetries(1));
    expect(policy(status(0))).toBe(0);
    expect(policy(status(1))).toBe(null);
  });
});

describe("concat", () => {
  it("continua solo se entrambe le policy continuano, usa il delay maggiore", () => {
    // exponential + limit: backoff esponenziale con massimo 3 tentativi
    const policy = concat(limitRetries(3))(constantDelay(100));
    expect(policy(status(0))).toBe(100); // max(100, 0)
    expect(policy(status(2))).toBe(100);
    expect(policy(status(3))).toBe(null); // limitRetries dice basta
  });

  it("ritorna null se una qualsiasi delle due policy termina", () => {
    const policy = concat(limitRetries(0))(constantDelay(100));
    expect(policy(status(0))).toBe(null);
  });

  it("composizione di exponential + limit + cap", () => {
    const policy = capDelay(1000)(concat(limitRetries(5))(exponentialBackoff(100)));
    expect(policy(status(0))).toBe(100);
    expect(policy(status(1))).toBe(200);
    expect(policy(status(2))).toBe(400);
    expect(policy(status(3))).toBe(800);
    expect(policy(status(4))).toBe(1000); // cap
    expect(policy(status(5))).toBe(null); // limit
  });
});

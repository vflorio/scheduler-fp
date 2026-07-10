import * as E from "fp-ts/Either";
import { describe, expect, it } from "vitest";
import { decode, type PolicyJson } from "./policy-codec";
import type { Status } from "./retry";

const status = (iteration: number): Status => ({ iteration, previousDelay: null });

describe("decodePolicy", () => {
  it("decodifica constantDelay", () => {
    const json: PolicyJson = [["constantDelay", 30000]];
    const result = decode(json);
    expect(E.isRight(result)).toBe(true);
    if (E.isRight(result)) {
      expect(result.right(status(0))).toBe(30000);
      expect(result.right(status(100))).toBe(30000);
    }
  });

  it("decodifica exponentialBackoff + capDelay + limitRetries", () => {
    const json: PolicyJson = [
      ["exponentialBackoff", 100],
      ["capDelay", 1000],
      ["limitRetries", 3],
    ];
    const result = decode(json);
    expect(E.isRight(result)).toBe(true);
    if (E.isRight(result)) {
      expect(result.right(status(0))).toBe(100);
      expect(result.right(status(1))).toBe(200);
      expect(result.right(status(2))).toBe(400);
      // iteration 3: limitRetries esaurito
      expect(result.right(status(3))).toBe(null);
    }
  });

  it("decodifica composizione constantDelay + limitRetries", () => {
    const json: PolicyJson = [
      ["constantDelay", 5000],
      ["limitRetries", 2],
    ];
    const result = decode(json);
    expect(E.isRight(result)).toBe(true);
    if (E.isRight(result)) {
      expect(result.right(status(0))).toBe(5000);
      expect(result.right(status(1))).toBe(5000);
      expect(result.right(status(2))).toBe(null);
    }
  });

  it("errore per policy vuota", () => {
    const result = decode([]);
    expect(E.isLeft(result)).toBe(true);
  });

  it("errore per nome sconosciuto", () => {
    const result = decode([["unknownPolicy", 100]]);
    expect(E.isLeft(result)).toBe(true);
  });

  it("errore per capDelay senza policy precedente", () => {
    const result = decode([["capDelay", 1000]]);
    expect(E.isLeft(result)).toBe(true);
  });
});

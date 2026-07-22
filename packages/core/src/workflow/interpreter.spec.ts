import * as E from "fp-ts/Either";
import * as TE from "fp-ts/TaskEither";
import { describe, expect, it } from "vitest";
import * as Interpreter from "./interpreter";
import type * as Workflow from "./workflow";

//  fixtures

const noopEnv = (log: string[] = []): Interpreter.WorkflowEnv => ({
  scripts: [],
  logger: {
    debug: (msg) => () => log.push(`[DEBUG] ${msg}`),
    info: (msg) => () => log.push(`[INFO] ${msg}`),
    warn: (msg) => () => log.push(`[WARN] ${msg}`),
    error: (msg) => () => log.push(`[ERROR] ${msg}`),
    logNetwork: (msg) => () => log.push(`[NETWORK] ${msg}`),
  },
  capabilities: {
    restartApp: () => TE.right(undefined),
    ensureActivity: () => TE.right(undefined),
    openUrl: () => TE.right(undefined),
    openDeveloperSettings: () => TE.right(undefined),
    reboot: () => TE.right(undefined),
    wakeUp: () => TE.right(undefined),
    inputTap: () => TE.right(undefined),
    waitForDevice: () => TE.right(undefined),
    waitForActivity: () => TE.right(undefined),
  },
});

const failingEnv = (failCount: number): { env: Interpreter.WorkflowEnv; calls: string[] } => {
  let attempts = 0;
  const calls: string[] = [];
  return {
    calls,
    env: {
      scripts: [],
      logger: {
        debug: () => () => {},
        info: () => () => {},
        warn: () => () => {},
        error: () => () => {},
        logNetwork: () => () => {},
      },
      capabilities: {
        restartApp: (pkg) => {
          calls.push(`restartApp:${pkg}`);
          attempts++;
          return attempts <= failCount
            ? TE.left({ type: "WorkflowError", message: `fail #${attempts}` })
            : TE.right(undefined);
        },
        ensureActivity: () => TE.right(undefined),
        openUrl: () => TE.right(undefined),
        openDeveloperSettings: () => TE.right(undefined),
        reboot: () => TE.right(undefined),
        wakeUp: () => TE.right(undefined),
        inputTap: () => TE.right(undefined),
        waitForDevice: () => TE.right(undefined),
        waitForActivity: () => TE.right(undefined),
      },
    },
  };
};

describe("workflow interpreter", () => {
  it("executes a simple workflow successfully", async () => {
    const log: string[] = [];
    const env = noopEnv(log);

    const workflow: Workflow.Workflow = {
      name: "test-wf",
      strategies: [
        {
          commands: [{ type: "restartApp", packageId: "com.example.app" }, { type: "waitForDevice" }],
          policy: [
            ["constantDelay", "10ms"],
            ["limitRetries", 3],
          ],
        },
      ],
    };

    const result = await Interpreter.interpretWorkflow(workflow)(env)();
    expect(E.isRight(result)).toBe(true);
  });

  it("retries a failing strategy with policy", async () => {
    const { env, calls } = failingEnv(2);

    const workflow: Workflow.Workflow = {
      name: "retry-wf",
      strategies: [
        {
          commands: [{ type: "restartApp", packageId: "com.example.app" }],
          policy: [
            ["constantDelay", "10ms"],
            ["limitRetries", 5],
          ],
        },
      ],
    };

    const result = await Interpreter.interpretWorkflow(workflow)(env)();
    expect(E.isRight(result)).toBe(true);
    expect(calls.length).toBe(3); // 2 failures + 1 success
  });

  it("escalates to secondary strategy when primary exhausted", async () => {
    const calls: string[] = [];
    const env: Interpreter.WorkflowEnv = {
      scripts: [],
      logger: {
        debug: () => () => {},
        info: () => () => {},
        warn: () => () => {},
        error: () => () => {},
        logNetwork: () => () => {},
      },
      capabilities: {
        restartApp: () => {
          calls.push("restartApp");
          return TE.left({ type: "WorkflowError", message: "always fails" });
        },
        ensureActivity: () => TE.right(undefined),
        openUrl: () => TE.right(undefined),
        openDeveloperSettings: () => TE.right(undefined),
        reboot: () => {
          calls.push("reboot");
          return TE.right(undefined);
        },
        wakeUp: () => TE.right(undefined),
        inputTap: () => TE.right(undefined),
        waitForDevice: () => {
          calls.push("waitForDevice");
          return TE.right(undefined);
        },
        waitForActivity: () => TE.right(undefined),
      },
    };

    const workflow: Workflow.Workflow = {
      name: "escalation-wf",
      strategies: [
        {
          commands: [{ type: "restartApp", packageId: "com.example.app" }],
          policy: [
            ["constantDelay", "10ms"],
            ["limitRetries", 2],
          ],
        },
        {
          commands: [{ type: "reboot" }, { type: "waitForDevice" }],
          policy: [
            ["constantDelay", "10ms"],
            ["limitRetries", 1],
          ],
        },
      ],
    };

    const result = await Interpreter.interpretWorkflow(workflow)(env)();
    expect(E.isRight(result)).toBe(true);
    // Primary: 3 attempts (initial + 2 retries), then secondary succeeds
    expect(calls.filter((c) => c === "restartApp").length).toBe(3);
    expect(calls).toContain("reboot");
    expect(calls).toContain("waitForDevice");
  });

  it("resolves script references via 'run' command", async () => {
    const tapCalls: Array<{ x: number; y: number }> = [];
    const env: Interpreter.WorkflowEnv = {
      scripts: [{ name: "my-script", commands: [{ type: "inputTap", coords: { x: 0.5, y: 0.5 } }] }],
      logger: {
        debug: () => () => {},
        info: () => () => {},
        warn: () => () => {},
        error: () => () => {},
        logNetwork: () => () => {},
      },
      capabilities: {
        restartApp: () => TE.right(undefined),
        ensureActivity: () => TE.right(undefined),
        openUrl: () => TE.right(undefined),
        openDeveloperSettings: () => TE.right(undefined),
        reboot: () => TE.right(undefined),
        wakeUp: () => TE.right(undefined),
        inputTap: (coords) => {
          tapCalls.push(coords);
          return TE.right(undefined);
        },
        waitForDevice: () => TE.right(undefined),
        waitForActivity: () => TE.right(undefined),
      },
    };

    const workflow: Workflow.Workflow = {
      name: "script-wf",
      strategies: [
        {
          commands: [{ type: "run", scriptName: "my-script" }],
          policy: [
            ["constantDelay", "10ms"],
            ["limitRetries", 1],
          ],
        },
      ],
    };

    const result = await Interpreter.interpretWorkflow(workflow)(env)();
    expect(E.isRight(result)).toBe(true);
    expect(tapCalls).toEqual([{ x: 0.5, y: 0.5 }]);
  });

  it("fails when all strategies are exhausted", async () => {
    const env: Interpreter.WorkflowEnv = {
      scripts: [],
      logger: {
        debug: () => () => {},
        info: () => () => {},
        warn: () => () => {},
        error: () => () => {},
        logNetwork: () => () => {},
      },
      capabilities: {
        restartApp: () => TE.left({ type: "WorkflowError", message: "nope" }),
        ensureActivity: () => TE.left({ type: "WorkflowError", message: "nope" }),
        openUrl: () => TE.right(undefined),
        openDeveloperSettings: () => TE.right(undefined),
        reboot: () => TE.left({ type: "WorkflowError", message: "nope" }),
        wakeUp: () => TE.right(undefined),
        inputTap: () => TE.right(undefined),
        waitForDevice: () => TE.right(undefined),
        waitForActivity: () => TE.right(undefined),
      },
    };

    const workflow: Workflow.Workflow = {
      name: "fail-wf",
      strategies: [
        {
          commands: [{ type: "restartApp", packageId: "pkg" }],
          policy: [
            ["constantDelay", "10ms"],
            ["limitRetries", 1],
          ],
        },
        {
          commands: [{ type: "reboot" }],
          policy: [
            ["constantDelay", "10ms"],
            ["limitRetries", 1],
          ],
        },
      ],
    };

    const result = await Interpreter.interpretWorkflow(workflow)(env)();
    expect(E.isLeft(result)).toBe(true);
    if (E.isLeft(result)) {
      expect(result.left.message).toContain("all strategies exhausted");
    }
  });
});

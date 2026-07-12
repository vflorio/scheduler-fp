import * as E from "fp-ts/Either";
import { describe, expect, it } from "vitest";
import * as Workflow from "./workflow";
import * as WorkflowCodec from "./workflow-codec";

describe("workflow codec", () => {
  it("decodes a valid recovery config", () => {
    const raw = {
      scripts: [
        [
          "suitest-connect",
          [
            ["inputTap", { x: 0.9, y: 0.1 }],
            ["inputTap", { x: 0.5, y: 0.5 }],
          ],
        ],
      ],
      workflows: [
        [
          "android-camera",
          {
            primary: {
              commands: [
                ["restartApp", "com.example.app"],
                ["run", "suitest-connect"],
              ],
              policy: [
                ["constantDelay", "500ms"],
                ["limitRetries", 3],
              ],
            },
            secondary: {
              commands: [["reboot"], ["waitForDevice"]],
              policy: [
                ["constantDelay", "30s"],
                ["limitRetries", 2],
              ],
            },
          },
        ],
      ],
    };

    const result = WorkflowCodec.decode(raw);
    expect(E.isRight(result)).toBe(true);
    if (E.isRight(result)) {
      expect(result.right.scripts).toHaveLength(1);
      expect(result.right.scripts[0]!.name).toBe("suitest-connect");
      expect(result.right.scripts[0]!.commands).toHaveLength(2);
      expect(result.right.workflows).toHaveLength(1);
      expect(result.right.workflows[0]!.name).toBe("android-camera");
      expect(result.right.workflows[0]!.strategies).toHaveLength(2);
    }
  });

  it("fails on invalid script format", () => {
    const raw = { scripts: [["missing-commands"]], workflows: [] };
    const result = WorkflowCodec.decode(raw);
    expect(E.isLeft(result)).toBe(true);
  });

  it("finds a script by name", () => {
    const scripts: Workflow.Script[] = [
      { name: "s1", commands: [{ type: "inputTap", coords: { x: 0.1, y: 0.2 } }] },
      { name: "s2", commands: [{ type: "reboot" }] },
    ];
    expect(E.isRight(Workflow.findScript(scripts, "s1"))).toBe(true);
    expect(E.isLeft(Workflow.findScript(scripts, "unknown"))).toBe(true);
  });
});

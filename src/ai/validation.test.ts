import { describe, it, expect } from "vitest";
import { newModel } from "../camera/repository";
import { makeProject } from "../project/data";
import { defaultConstraints } from "../autoDeploy/constraints";
import { parseIntentResponse } from "./intentSchema";
import { validateExplanation } from "./kimi";
describe("untrusted AI outputs", () => {
  const m = newModel(),
    c = defaultConstraints(makeProject().schemes[0]);
  it("accepts only constraints for review without changing the source", () => {
    const parsed = parseIntentResponse(
      '{"boundary":[20,12,6],"countMode":"exact","count":32}',
      c,
      [m],
    );
    expect(parsed.boundary).toEqual([20, 12, 6]);
    expect(parsed.count).toBe(32);
    expect(c.count).toBe(16);
  });
  it.each([
    '{"cameras":[1]}',
    '{"coverage":99}',
    '{"markerDiameter":-1}',
    '{"modelIds":["invented-model"]}',
    '{"layers":0}',
    '{"__proto__":{}}',
    '{"activity":[-1,20]}',
    '{"boundary":[1,2]}',
    "null",
    "[]",
    '{"seed":42}',
  ])("rejects unsafe or invented fields: %s", (raw) => {
    expect(() => parseIntentResponse(raw, c, [m])).toThrow("aiInvalidResponse");
  });
  it("only renders verified facts and rejects invented metrics or duplicate facts", () => {
    const facts = [
      { id: "a", text: "Coverage 82.1%" },
      { id: "b", text: "Best effort" },
    ];
    expect(validateExplanation('{"factIds":["b","a"]}', facts)).toEqual([
      "Best effort",
      "Coverage 82.1%",
    ]);
    for (const raw of [
      '{"factIds":["invented"]}',
      '{"factIds":["a","a"]}',
      '{"factIds":["a"],"coverage":100}',
    ])
      expect(() => validateExplanation(raw, facts)).toThrow("aiInvalidResponse");
  });
});

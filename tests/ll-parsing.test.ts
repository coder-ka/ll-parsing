import assert from "node:assert";
import test from "node:test";
import { createLLParser, parseError } from "../src";

test("ll-parsing", async () => {
  const S = Symbol("S");
  const $ = Symbol("$");
  const llparser = createLLParser<{ value: string }>(
    {
      [S]: ([token], { index, line, inlineIndex }, state) => {
        if (token === "a") {
          state.value = "a" + state.value;
          return ["a", S];
        } else if (token === "b") {
          return ["b", S];
        } else if (token === "c") {
          state.value = "c" + state.value;
          return ["c"];
        } else {
          return [
            parseError({
              message: `Unexpected token: '${token}'.`,
              token,
              index,
              line,
              inlineIndex,
            }),
          ];
        }
      },
    },
    () => [S, $]
  );

  const lexer = (async function* () {
    yield {
      tokens: ["a"],
      index: 1,
      line: 0,
      inlineIndex: 1,
    };
    yield {
      tokens: ["b"],
      index: 2,
      line: 0,
      inlineIndex: 2,
    };
    yield {
      tokens: ["c"],
      index: 3,
      line: 0,
      inlineIndex: 3,
    };
  });

  const parsed = await llparser.parse(
    lexer(),
    { value: "" }
  );
  assert.deepStrictEqual(parsed.stack, [$]);
  assert.deepStrictEqual(parsed.errors, []);
  assert.strictEqual(parsed.state.value, "ca");
});

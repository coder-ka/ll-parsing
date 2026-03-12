import assert from "node:assert";
import test from "node:test";
import { createLLParser, parseError, createSimpleLexer } from "../src";

test("ipv4", async () => {
  const ipv4SegmentRegex = /\d+/;
  const S = Symbol("S");
  const SEG = Symbol("SEG");
  const DOT = Symbol("DOT")
  const $ = Symbol("$");
  const ipv4Parser = createLLParser<{ value: string[] }>(
    {
      [S]() {
        return [SEG, DOT, SEG, DOT, SEG, DOT, SEG]
      },
      [SEG]: ([token], { index, line, inlineIndex }, state) => {
        if (ipv4SegmentRegex.test(token)) {
          state.value.push(token);
          return [token];
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
      [DOT]: ([token], { index, line, inlineIndex }) => {
        if (token === ".") {
          return [token];
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

  const lexer = createSimpleLexer({
    separatorRegex: /\./,
  })

  const inputBuffer = lexer(async function* () {
    yield "127.0.0.1";
  }());


  const parsed = await ipv4Parser.parse(
    inputBuffer,
    {
      value: []
    }
  );

  assert.deepStrictEqual(parsed.stack, [$]);
  assert.deepStrictEqual(parsed.errors, []);
  assert.deepStrictEqual(parsed.state.value, [
    "127",
    "0",
    "0",
    "1",
  ]);
});

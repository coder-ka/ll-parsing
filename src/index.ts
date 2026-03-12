import type { Readable } from "stream";
import type { ReadStream } from "fs";
import type { ReadableStream } from "stream/web";

export type TokenPosition = {
  index: number;
  line: number;
  inlineIndex: number;
};
export type InputBufferItem = {
  tokens: string[];
} & TokenPosition;
export type InputBeffer = AsyncIterable<InputBufferItem>;
export type Stack = (symbol | string | ParseError)[];
export type ParseOptions = {
  onError: "stop" | "throw" | "continue";
  debug?: boolean;
};
export function createLLParser<TState, TStack extends Stack = Stack>(
  rules: Record<
    symbol,
    (tokens: string[], position: TokenPosition, state: TState) => TStack
  >,
  initStack: () => TStack
) {
  return {
    async parse(
      inputBuffer: InputBeffer,
      state: TState,
      options: ParseOptions = {
        onError: "stop",
      }
    ): Promise<{
      stack: TStack;
      errors: ParseError[];
      state: TState;
      index: number;
    }> {
      const stack = initStack();
      const errors: ParseError[] = [];
      let lastIndex = 0;
      try {
        for await (const { tokens, index, line, inlineIndex } of inputBuffer) {
          let tos;
          while ((tos = stack.shift()) && typeof tos === "symbol") {
            if (options.debug) {
              console.log(
                `${tos.toString()}: '${tokens[0] === "\n"
                  ? "\\n"
                  : tokens[0] === "\r"
                    ? "\\r"
                    : tokens[0]
                }'`
              );
            }
            const rule = rules[tos];
            if (!rule) throw new Error(`No rule for ${tos.toString()}.`);
            stack.unshift(
              ...rule(
                tokens,
                {
                  index,
                  line,
                  inlineIndex,
                },
                state
              )
            );
          }

          if (typeof tos === "string") {
            if (tos !== tokens[0]) {
              tos = parseError({
                message: `Expected '${tos}' but got '${tokens[0]}'.`,
                index,
                line,
                inlineIndex,
                token: tokens[0],
              })
            }
          }

          if (isParseError(tos)) {
            const error = tos;
            if (options.onError === "stop") {
              errors.push(error);
              return {
                stack,
                errors,
                state,
                index,
              };
            } else if (options.onError === "throw") {
              throw new Error(error.message);
            }
          }
          lastIndex = index;
        }

        return {
          stack,
          errors,
          state,
          index: lastIndex,
        };
      } catch (error) {
        console.error(errors);
        throw error;
      }
    },
  };
}

export const parseErrorSym = Symbol("parseError");
export type ParseError = {
  [parseErrorSym]: true;
  message: string;
  token: string;
  index: number;
  line: number;
  inlineIndex: number;
};

export function parseError(
  x: Omit<ParseError, typeof parseErrorSym>
): ParseError {
  return {
    [parseErrorSym]: true,
    ...x,
  };
}

export function isParseError(x: any): x is ParseError {
  return x && x[parseErrorSym];
}

const defaultNewlineRegex = /^\r?\n$/;

export function createSimpleLexer({
  separatorRegex,
  newlineRegex,
}: {
  separatorRegex: RegExp;
  newlineRegex?: RegExp;
}) {
  newlineRegex = newlineRegex || defaultNewlineRegex;

  return async function* (
    stream:
      | ReadStream
      | ReadableStream
      | Readable
      | AsyncIterable<string | Buffer>
  ): InputBeffer {
    let token = "";
    let index = 0;
    let line = 0;
    let inlineIndex = 0;

    for await (const buf of stream) {
      const chunk: string = buf.toString("utf-8");
      for (let i = 0, imax = chunk.length; i < imax; i++) {
        index++;
        inlineIndex++;

        const char = chunk[i];

        if (separatorRegex.test(char)) {
          if (token !== "") {
            yield {
              tokens: [token],
              index: index - 1,
              line,
              inlineIndex: inlineIndex - 1,
            };
            token = "";
          }

          yield { tokens: [char], index, line, inlineIndex };
        } else {
          token += char;
        }

        if (newlineRegex.test(char)) {
          line++;
          inlineIndex = 0;
        }
      }

      if (token !== "") {
        yield { tokens: [token], index, line, inlineIndex };
      }
    }
  };
}

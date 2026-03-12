# ll-parsing

> [!NOTE]
> This README has been machine-translated. For the original Japanese version, please refer to [README_ja.md](./README_ja.md).

ll-parsing is a lightweight library for creating LL(k) parsers.

## Features

- **Lightweight**: Implemented with simple loops instead of recursive calls to ensure lightweight operation.
- **Streaming Support**: Does not strain memory; can take any stream that produces strings as input.
- **Flexible**: Allows for flexible conversion processes and error handling, making it suitable for purposes beyond AST generation.
- **Zero Dependencies**: Fast installation and more secure.
- **Simple Implementation**: The core functionality is around 150 lines, and even with utility functions, it's about 200 lines—shorter than this document.

## Installation

```bash
npm install @coder-ka/ll-parsing
```

## Getting Started

The following is an example of parsing an IPv4 address.

```ts
import { createLLParser, parseError, createSimpleLexer } from "@coder-ka/ll-parsing";

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

console.log(parsed.state.value); // ["127", "0", "0", "1"]
```

It might seem like overkill for just an IPv4 address, but by understanding the basics through this code, you'll be able to implement parsers for much larger codebases concisely.

First, as a pre-parsing step, you need to convert the string stream into a token stream using a lexer.

In this case, we pass the input string stream to the lexer as follows:

```ts
const inputBuffer = lexer(async function* () {
  yield "127.0.0.1";
}());
```

The lexer is created using the `createSimpleLexer` utility function like this:

```ts
const lexer = createSimpleLexer({
  separatorRegex: /\./,
})
```

This lexer generates a token stream like the following (it actually includes line and inline index information):

```ts
[
    ["127"],
    ["."],
    ["0"],
    ["."],
    ["0"],
    ["."],
    ["1"],
]
```

Since each element is an array of length 1, this is an LL(1) parser.

While details are provided later, you can also support LL(k) by implementing your own lexer.

With the input stream created, defined the parser using a stack and a rule table.

The following code shows the stack initialization:

```ts
() => [S, $]
```

`S` is the start symbol, and `$` is the end symbol. Parsing is successful if the input stream is fully consumed while only `$` remains on the stack.

The rule table is an object whose keys are symbol values representing markers and whose values are functions.

In the previous code, symbols are defined as follows:

```ts
const S = Symbol("S");
const SEG = Symbol("SEG");
const DOT = Symbol("DOT")
const $ = Symbol("$");
```

Now, let's look at the rule table using these as keys.

The parsing process proceeds by looking at the stack array from the front. If a symbol value is present, it is removed from the stack, the corresponding function in the rule table is executed, and the return value is pushed onto the top of the stack.

With the stack initialized as mentioned above, the function corresponding to the start symbol `S` is called first.

```ts
{
  [S]() {
    return [SEG, DOT, SEG, DOT, SEG, DOT, SEG]
  },
}
```

After this function executes, the stack state transitions to:

```
[SEG, DOT, SEG, DOT, SEG, DOT, SEG, $]
```

Again, since there's a symbol `SEG` at the top of the stack, a state transition using the rule table occurs.

```ts
{
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
}
```

The symbol `SEG` corresponds to each segment (numeric part) of the IPv4 address.

Therefore, it first validates whether the current token is a numeric part using `ipv4SegmentRegex` (`/\d+/`).

If validation succeeds, it adds the token to the parsing state array `state.value` and returns an array.

As mentioned earlier, the returned array is pushed onto the top of the stack.

So, it transitions to the following state:

```
["127", DOT, SEG, DOT, SEG, DOT, SEG, $]
```

This time, a string instead of a symbol value is at the top of the stack.

In this case, the parser consumes a token matching the string from the input stream and removes the string from the stack.

That is, the current value of the input stream and the stack will be:

```
Stack: [DOT, SEG, DOT, SEG, DOT, SEG, $]
Current input stream value: ["."]
```

This process repeats until the input stream is fully consumed, at which point parsing ends.

The state is stored in the return value of the `parse` method.

```ts
parsed.stack // [$]
parsed.state // { value: ["127", "0", "0", "1"] }
parsed.errors // []
```

It might seem complex, but you can see a definite pattern.

First, the function for the start symbol indicates that an IPv4 address is a fixed sequence of symbols shown in the return array.

```ts
{
  [S]() {
    return [SEG, DOT, SEG, DOT, SEG, DOT, SEG]
  },
}
```

And when validating a token and advancing the input stream, you need to return the token string.

```ts
{
    [SEG]: ([token], { index, line, inlineIndex }, state) => {
      if (ipv4SegmentRegex.test(token)) {
        state.value.push(token);
        return [token];
      } else {
        // ...omitted
      }
    },
}
```

If the next symbol changes depending on the token, you might return something like `[token, SOME_SYMBOL]`.

The key is that you can advance the input stream with strings, and the symbol values on the stack represent what symbol should come next.

Thus, since the start symbol `S` function knows the exact sequence of symbols for an IPv4 address, it could push all symbols onto the stack at once, and subsequent processes only needed to perform string checks and token consumption.

Parsing more complex languages requires more processing, but since it's proportional to the rules and the number of lookahead tokens (i.e., *k*) rather than the scale or complexity of the code itself, simple languages lead to simple implementations.

For more specific examples, please refer to the [ontype implementation](https://github.com/coder-ka/ontype/blob/main/src/index.ts).

## API

The main APIs in ll-parsing are the `createLLParser` function and the `parse` method of the object it returns.

Additionally, the `createSimpleLexer` utility function is provided.

Let's look at each.

### `createLLParser` Function

`createLLParser` is a function that creates an LL parser, which proceeds completely synchronously.

As seen in the earlier example, it takes an object (the table) where symbol values are keys and functions are values as its first argument, and it initializes the stack with its second argument.

The returned parser object has only the `parse` method.

Thus, the signature can be simply expressed as:

```
createLLParser(rules, initStack): { parse }
```

First, `initStack` is a function that returns the initial value of the stack.

```ts
createLLParser(
  rules,
  () => [S, $]
)
```

The stack is just an array, and in the above example, it contains two symbols: `S` and `$`.

`S` and `$` are not special symbols provided by ll-parsing; they are defined by the user.

Usually, you'll start with these two, but there might be cases where you restore from a saved state.

Next, let's look at `rules`.

```ts
createLLParser(
  rules: {
    [S]([token], { index, line, inlineIndex }, state) {
      return [];
    }
  },
  () => [S, $],
)
```

As explained earlier, `rules` is an object.

Keys are symbol values representing markers.

Values are functions where the first argument is an array of lookahead tokens (for LL(1), an array of length 1), the second argument is information about the token's position in the source, and the third argument is a state object for including information such as an AST.

The number of lookahead tokens is determined by the lexer implementation. Lexers are explained later.

Information about the position in the source includes these three, each starting from 0:

- `index`: The index of the token within the source, including newlines.
- `line`: The line position of the token within the source.
- `inlineIndex`: The index within the line where the token is located.

For example, the `return` token in the following source:

```
fn add(a, b) {
  return a + b
}
```

has the following position information:

```json
{
  "index": 17,
  "line": 1,
  "inlineIndex": 2
}
```

These are useful for error reporting.

The state object can be any shape you choose. For example, it can be `{ ast: YourLangAST }`.

Next, let's look at the `parse` method of the returned parser object.

#### `parse` Method

`createLLParser` creates a parser object. The parser object has only the `parse` method.

The `parse` method performs actual parsing based on the table and initial stack specified in the `createLLParser` arguments.

Here is a simplified signature:

```ts
const { parse } = createLLParser(...);

parse(lexed, state, options);
```

`lexed` (the first argument) is the object output by the lexer. Details are provided later.

The second argument is the initial value of the state object. As mentioned before, the contents of the state object are modified during parsing.

The third argument is options for adjusting behavior. Its signature is:

```ts
type ParseOptions = {
  onError: "stop" | "throw" | "continue";
  debug?: boolean;
}
```

The `onError` option can take three values:

- `stop`: Halts parsing without throwing an exception if an error occurs (default).
- `throw`: Throws an exception if an error occurs.
- `continue`: Continues processing even if an error occurs.

The `debug` option, if specified, outputs useful information for debugging during parsing.

The `parse` method returns:

```ts
Promise<{
  stack: TStack;
  errors: ParseError[];
  state: TState;
  index: number;
}>
```

- `stack`: The final stack.
- `errors`: A list of errors that occurred. If the `onError` option is not `continue`, there will be at most one.
- `state`: The state object.
- `index`: The final index position.

You can use this information to see if parsing succeeded or to retrieve the AST.

For example, you can check whether only the end symbol remains in the `stack`, whether `errors` is empty, and whether `index` matches the length of the source code.

Next, let's look at the lexer.

### `createSimpleLexer` Function

First, let me explain what a lexer is.

A lexer in ll-parsing is a function that creates an async generator that `yield`s data related to tokens.

For example:

```ts
const lexer = (async function* () {
  yield {
    tokens: ["a"],
    token: "a",
    index: 1,
    line: 0,
    inlineIndex: 1,
  };
  yield {
    tokens: ["b"],
    token: "b",
    index: 2,
    line: 0,
    inlineIndex: 2,
  };
  yield {
    tokens: ["c"],
    token: "c",
    index: 3,
    line: 0,
    inlineIndex: 3,
  };
});
```

While hardcoded here, the source imagined from this code would be the string `abc`.

The type of object that can be `yield`ed is:

```ts
type LexedItem = {
  tokens: string[];
  index: number;
  line: number;
  inlineIndex: number;
}
```

- `tokens`: An array of strings. The length of this array corresponds to the lookahead number *k*.
- `index`: The index indicating the token's position.
- `line`: The line the token belongs to.
- `inlineIndex`: The index within the line.

The `parse` method takes the async generator as its first argument.

```ts
parse(
  lexer(),
  {...}
)
```

While you can implement a lexer however you like, for LL(1) where the input is a string stream, which covers most cases, the `createSimpleLexer` function is helpful.

Here is a simplified signature:

```ts
const lexer = createSimpleLexer({
  separatorRegex,
  newlineRegex,
})
```

- `separatorRegex`: A regular expression to identify separator characters.
- `newlineRegex`: A regular expression representing newlines. The default is `/^\r?\n$/`.

The separator characters themselves are also streamed as tokens.

For example:

```ts
const lexer = createSimpleLexer({
  separatorRegex: /\./,
})

const inputBuffer = lexer(async function* () {
  yield "127.0.0.1";
}());
```

will stream tokens like this:

```ts
[
  ["127"],
  ["."],
  ["0"],
  ["."],
  ["0"],
  ["."],
  ["1"],
]
```

For most common LL(1) languages, `createSimpleLexer` should provide the desired tokenization.

## License

MIT

# ll-parsing

ll-parsingは、LL(k) パーサーを作成するための軽量ライブラリです。

## 特徴

- **軽量**な動作を保証するために、再帰呼び出しを利用しない単純なループによって実装しています。
- **ストリーミング対応**によりメモリを圧迫せず、文字列を生み出すあらゆるストリームを入力にできます。
- **柔軟**な変換処理やエラーハンドリングを組むことができるため、AST生成に限らない用途に使うことができます。
- **依存関係がゼロ**であるため、インストール速度が速く、よりセキュアに利用できます。
- **シンプルな実装**において、コア機能は150行程度、ユーティリティ関数を含めても200行程度で、このドキュメントより短いです。

## インストール

```bash
npm install @coder-ka/ll-parsing
```

## Getting Started

以下は IPv4 アドレスをパースする例です。

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

たかがIPV4 アドレスをパースするには大仰なコードかもしれませんが、このコードを通して基礎を理解することで、より大きなコードのパーサーを簡潔に実装できるようになるでしょう。

まず、パースの前段階としてレキサーによる文字列ストリームからトークンストリームへの変換が必要になります。

今回の場合は、以下のように入力ストリームとなる文字列ストリームをlexerに渡しています。

```ts
const inputBuffer = lexer(async function* () {
  yield "127.0.0.1";
}());
```

lexerは以下のようにcreateSimpleLexerユーティリティ関数によって作られています。

```ts
const lexer = createSimpleLexer({
  separatorRegex: /\./,
})
```

このレキサーによって、以下のようなトークンストリームが生成されます。（実際は行やインラインインデックスの情報が含まれます）

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

各要素が長さ１の配列であるため、これはLL(1)となります。

詳細は後述しますが、自分でレキサーを実装することでLL(k)に対応させることもできます。

入力ストリームを作った上で、パーサーをスタックとルール表によって定義します。

以下のコードがスタックの初期化を示します。

```
() => [S, $]
```

Sは開始記号、$は終端記号です。最終的に$だけがスタックに存在する状態で入力ストリームを消費しきれば、パージングは成功となるわけです。

ルール表は、記号を示すシンボル値をキーとして、関数を値とするオブジェクトです。

先ほどのコードだと記号は以下のように定義してあります。

```ts
const S = Symbol("S");
const SEG = Symbol("SEG");
const DOT = Symbol("DOT")
const $ = Symbol("$");
```

さて、ではこれらをキーにしたルール表を見ていきましょう。

パージングのプロセスは、スタック配列の先頭から順に見ていき、記号（シンボル値）があれば、スタックから取り除いた上でルール表の中の対応する関数を実行し、戻り値をスタックの先頭に積みます。

前述のスタック初期化がされた場合、最初にある開始記号Sに対応する関数がまず呼ばれます。

```ts
{
  [S]() {
    return [SEG, DOT, SEG, DOT, SEG, DOT, SEG]
  },
}
```

この関数が実行された後、スタックの状態は以下に遷移します。

```
[SEG, DOT, SEG, DOT, SEG, DOT, SEG, $]
```

またもやスタックの先頭には記号SEGがあるため、ルール表を使った状態遷移がなされます。

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

記号SEGは、IPv4 アドレスの各セグメント（数値部）と対応しています。

よって、ipv4SegmentRegex（`/\d+`）によって、現在のトークンが数値部であるかをまず検証します。

検証に成功した場合、パース結果の配列 state.value にトークンを追加し、配列を返します。

先ほど言った通り、配列はスタックの先頭に積まれます。

よって、以下の状態に遷移します。

```
["127", DOT, SEG, DOT, SEG, DOT, SEG, $]
```

今度はシンボル値ではなく文字列がスタックの先頭に積まれています。

この場合、パーサーは文字列と一致するトークンを入力ストリームから消費し、文字列をスタックから取り除きます。

つまり、入力ストリームの現在値とスタックは以下のようになります。

```
スタック： [DOT, SEG, DOT, SEG, DOT, SEG, $]
入力ストリームの現在値： ["."]
```

このプロセスが繰り返され、最終的に入力ストリームを消費しきったときにパースは終了します。

結果は、parseメソッドの戻り値に格納されます。

```ts
parsed.stack // [$]
parsed.state // { value: ["127", "0", "0", "1"] }
parsed.errors // []
```

複雑に思えるかもしれませんが、一定のパターンがあることがお分かりいただけたでしょう。

まず、開始記号の関数が示すことは、IPv4 アドレスが戻り値の配列が示す固定の記号のシーケンスであるということです。

```ts
{
  [S]() {
    return [SEG, DOT, SEG, DOT, SEG, DOT, SEG]
  },
}
```

そして、トークンを判定して入力ストリームを進めていく場合は、トークン文字列を戻り値として返す必要があるということです。

```ts
{
    [SEG]: ([token], { index, line, inlineIndex }, state) => {
      if (ipv4SegmentRegex.test(token)) {
        state.value.push(token);
        return [token];
      } else {
        // ...省略
      }
    },
}
```

トークン次第で次に来るべき記号が変わる場合は、`[token, SOME_SYMBOL]`というように返すこともあります。

重要なことは、文字列で入力ストリームを進めることができ、スタックに積まれているシンボル値は次に来るべき記号を表しているということです。

よって、最初に開始記号Sの関数はIPV4 アドレスとして来るべき記号が固定で分かっているからこそ、すべての記号をスタックに積むことができ、あとのプロセスでは文字列チェックとトークン消費だけで済みました。

より複雑な言語のパージングの場合はより多くの処理が必要になりますが、コード自体の規模や複雑さではなくルールや先読みトークン数（つまり、k）に比例するため、シンプルな言語であるほど処理系はシンプルになります。

さらに具体的な例が必要な場合は、[ontypeの処理](https://github.com/coder-ka/ontype/blob/main/src/index.ts)を参考にしてください。

## API

ll-parsingにおける主要なAPIは`createLLParser`関数とその戻り値であるオブジェクトが持つ`parse`メソッドのみです。

また、ユーティリティ関数として`createSimpleLexer`関数を公開しています。

それぞれについて解説していきます。

### `createLLParser`関数

`createLLParser`関数は、名前の通りLLパーサーを作る関数で、完全に同期的に進みます。

先ほどの例にもある通り、シンボル値をキーに持ち、関数を値に持つオブジェクトである表を第1引数に持ち、第2引数でスタックを初期化します。

戻り値のパーサーオブジェクトは、`parse`メソッドのみを持ちます。

よって、シグネチャは以下のように簡易的に示すことができます。

```
createLLParser(rules, initStack): { parse }
```

まず先に`initStack`を説明すると、スタックの初期値を返す関数です。

```
createLLParser(
  rules,
  () => [S, $]
)
```

スタックは単なる配列であり、上記の例だとSと$の2つの記号が入っています。

Sと$はll-parsingが提供する特別なシンボル値ではなく、ユーザーが定義するものです。

通常、この2つから始めることになると思われますが、場合によっては保存された状態から復元するケースもあるかもしれません。

では次に、`rules`を解説します。

```
createLLParser(
  rules: {
    [S]([token], { index, line, inlineIndex }, state) {
      return [];
    }
  },
  () => [S, $],
)
```

先ほど説明した通り、`rules`はオブジェクトです。

キーには記号を示すシンボル値が入ります。

値は関数で、第1引数は先読みトークンの配列（LL(1)なら長さ1の配列）、第2引数はトークンのソース上の位置を表す情報、第3引数はASTなどの情報を含める為の状態オブジェクトです。

先読みトークンの数はレキサーの実装によって決まります。レキサーについては後で説明します。

ソース上の位置を表す情報は、以下の3つがあり、それぞれが0から始まります。

- `index`: 改行も含めたソース内におけるトークンのインデックス
- `line`: ソース内におけるトークンの行位置
- `inlineIndex`: トークンが位置する行内のインデックス

例えば、以下のようなソース内における`return`トークンは、

```
fn add(a, b) {
  return a + b
}
```

以下のように位置情報を持ちます。

```
{
  index: 17,
  line: 1,
  inlineIndex: 2
}
```

これらはエラーの情報として役に立ちます。

状態オブジェクトは、ユーザーが自由に形を決めることができます。例えば、`{ ast: YourLangAST }`という形で指定できます。

次は、戻り値のパーサーオブジェクトの`parse`メソッドについて解説します。

#### `parse`メソッド

`createLLParser`はパーサーオブジェクトを作ります。パーサーオブジェクトは唯一、`parse`メソッドのみを持ちます。

`parse`メソッドは、`createLLParser`の引数で指定された表と初期スタックに基づいて、実際のパージングを行います。

こちらも簡易的にシグネチャを記載します。

```
const { parse } = createLLParser(...);

parse(lexed, state, options);
```

第1引数の`lexed`とはレキサーの出力であるオブジェクトです。詳細は後述します。

第2引数は、状態オブジェクトの初期値です。先ほど書いたように、状態オブジェクトの中身はパージングの過程で変更されていきます。

第3引数は挙動を調整するためのオプションです。オプションは以下のシグネチャを持ちます。

```ts
type ParseOptions = {
  onError: "stop" | "throw" | "continue";
  debug?: boolean;
}
```

`onError`オプションは、上記の3つの値を指定でき、意味は以下の通りです。

- `stop`: エラーが発生した場合は例外を発生させずにパージングを停止します
- `throw`: エラーが発生した場合は、例外を発生させます
- `continue`: エラーが発生しても処理を続行します

デフォルト値は`stop`です。

`debug`オプションは、指定することでパージング中にデバッグに有用な情報を出力します。

`parse`メソッドの戻り値は、以下の通りです。

```
Promise<{
  stack: TStack;
  errors: ParseError[];
  state: TState;
  index: number;
}>
```

- `stack`: 最終的なスタックです
- `errors`: 発生したエラーのリストです。`onError`オプションが`continue`以外の場合は、最大1件になります
- `state`: 状態オブジェクトです
- `index`: 最終的なインデックス位置です

これらの情報を利用して、パージングが上手く行ったかどうかを確かめたり、ASTを取得します。

例えば、`stack`に終了記号だけが残っていることを確認したり、`errors`が0件であること、`index`がソースコードの長さと一致することなどを確認することで、うまく行ったかどうかをチェックすることができます。

次はレキサーについて解説します。

### `createSimpleLexer`関数

説明のために、まずはレキサーについて説明します。

ll-parsingにおけるレキサーとは、トークンに関するデータを`yield`する非同期ジェネレータを作る関数です。

例えば、以下のような関数です。

```ts
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
```

ハードコードされていますが、このコードから想像されるソースは`abc`という文字列です。

`yield`可能なオブジェクトの型は以下の通りです。

```ts
type LexedItem = {
  tokens: string[];
  index: number;
  line: number;
  inlineIndex: number;
}
```

- `tokens`は文字列の配列です。この配列の長さが先読みトークンの数kと対応します。
- `index`はトークンの位置を示すインデックスです。
- `line`はトークンが属する行です。
- `inlineIndex`はトークンの行の中でのインデックスです。

`parse`メソッドは、第1引数に非同期ジェネレータを受け取ります。

つまり、先ほどの関数の戻り値です。

```
parse(
  lexer(),
  {...}
)
```

レキサーの詳細は自由に作ることができますが、LL(1)で入力が文字列ストリームの場合、つまり大抵の場合は`createSimpleLexer`関数を活用できます。

こちらも簡単にシグネチャを記載します。

```ts
const lexer = createSimpleLexer({
  separatorRegex,
  newlineRegex,
})
```

- `separatorRegex`: セパレータとなる文字を特定するための正規表現です
- `newlineRegex`: 改行を表す正規表現です。デフォルト値は`/^\r?\n$/`です。

セパレータの文字自体もトークンとしてストリームに流れます。

つまり、以下のようにした場合は、

```ts
const lexer = createSimpleLexer({
  separatorRegex: /\./,
})

const inputBuffer = lexer(async function* () {
  yield "127.0.0.1";
}());
```

以下のようにトークンが流れます。

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

一般的なLL(1)の言語であれば、`createSimpleLexer`のみで望んだトークン化が実現できるでしょう。

## License

MIT

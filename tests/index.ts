import { llParsingTest } from "./ll-parsing.test";

(async () => {
  await Promise.all(
    [llParsingTest].map(async (test) => {
      console.log(`TESTSTART: ${test.description}`);
      await test.content();
      console.log(`TESTEND: ${test.description}`);
    })
  );
})();

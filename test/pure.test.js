"use strict";

const assert = require("assert");
const path = require("path");
const { buildHtml, escapeHtml } = require("../src/lib/build-html");
const { inlineLocalImages } = require("../src/lib/inline-images");

async function main() {
  assert.strictEqual(escapeHtml('<a href="x&y">'), "&lt;a href=&quot;x&amp;y&quot;&gt;");

  const page = buildHtml({
    title: "Test <Page>",
    css: "body { color: red; }",
    tocJs: "console.log('toc');",
    body: "<h1>Hello</h1>",
  });
  assert.ok(page.includes("<title>Test &lt;Page&gt;</title>"));
  assert.ok(page.includes("<h1>Hello</h1>"));
  assert.ok(page.includes("console.log('toc')"));

  const fixtureDir = path.join(__dirname, "fixtures");
  const inlined = await inlineLocalImages(
    '<p><img src="figure.svg" alt="figure"></p>',
    fixtureDir
  );
  assert.ok(inlined.includes("data:image/svg+xml;base64,"));

  const untouched = await inlineLocalImages(
    '<p><img src="https://example.com/x.png"></p>',
    fixtureDir
  );
  assert.ok(untouched.includes("https://example.com/x.png"));

  console.log("pure tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

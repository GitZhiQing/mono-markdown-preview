"use strict";

const assert = require("assert");
const path = require("path");
const fs = require("fs");
const { buildHtml, escapeHtml } = require("../src/lib/build-html");
const { inlineLocalImages } = require("../src/lib/inline-images");

async function main() {
  assert.strictEqual(escapeHtml('<a href="x&y">'), "&lt;a href=&quot;x&amp;y&quot;&gt;");

  const page = buildHtml({
    title: "Test <Page>",
    css: "body { color: red; }",
    tocJs: "console.log('toc');",
    codeJs: "console.log('code');",
    body: "<h1>Hello</h1>",
  });
  assert.ok(page.includes("<title>Test &lt;Page&gt;</title>"));
  assert.ok(page.includes("<h1>Hello</h1>"));
  assert.ok(page.includes("console.log('toc')"));
  assert.ok(page.includes("console.log('code')"));

  const mediaDir = path.join(__dirname, "..", "media");
  const katexCss = fs.readFileSync(path.join(mediaDir, "katex.css"), "utf8");
  assert.ok(katexCss.includes("data:font/woff2;base64,"));
  assert.ok(!katexCss.includes("url(fonts/"));

  const codeJs = fs.readFileSync(path.join(mediaDir, "code-blocks.js"), "utf8");
  assert.ok(codeJs.includes("mono-code-lang"));
  assert.ok(codeJs.includes("mono-code-icon"));
  assert.ok(codeJs.includes("mono-code-break"));

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

/*
 * Exercise the local export service with a mocked VS Code API.
 * Usage: node test/export-server.test.js
 */
const path = require("path");
const fs = require("fs/promises");
const { pathToFileURL, fileURLToPath } = require("url");
const Module = require("module");

process.env.MONO_EXPORT_PORT = "48766";

const projectRoot = path.resolve(__dirname, "..");
const sourcePath = path.resolve(__dirname, "fixtures", "sample.md");
const sourceUri = pathToFileURL(sourcePath).href;
const exportUrl =
  "http://127.0.0.1:48766/export?token=mono-4d7c9a&source=" +
  encodeURIComponent(sourceUri);

const sampleHtml = `<h1 id="quiet-power">安静的力量</h1>
<h2 id="principles">设计原则</h2>
<p>正文 <code>inline</code></p>
<p><img src="figure.svg" alt="figure"></p>`;

const mockVscode = {
  Uri: {
    joinPath(base, ...parts) {
      const fsPath = path.join(base.fsPath, ...parts);
      return { fsPath, toString: () => pathToFileURL(fsPath).href };
    },
    parse(value) {
      const url = new URL(value);
      return {
        scheme: url.protocol.replace(":", ""),
        fsPath: url.protocol === "file:" ? fileURLToPath(url) : "",
        toString: () => value,
      };
    },
    file(value) {
      return {
        scheme: "file",
        fsPath: value,
        toString: () => pathToFileURL(value).href,
      };
    },
  },
  workspace: {
    fs: {
      async readFile(uri) {
        return fs.readFile(uri.fsPath);
      },
    },
    async openTextDocument(uri) {
      return {
        uri,
        languageId: "markdown",
        fsPath: uri.fsPath,
        getText: () => fs.readFile(uri.fsPath, "utf8"),
      };
    },
  },
  commands: {
    registerCommand() {
      return { dispose() {} };
    },
    async executeCommand(command, document) {
      if (command === "markdown.api.render") return sampleHtml;
      throw new Error("unexpected command: " + command);
    },
  },
  window: {
    showWarningMessage: (...args) => console.log("WARN", ...args),
    showErrorMessage: (...args) => console.log("ERROR", ...args),
    setStatusBarMessage: (...args) => console.log("STATUS", ...args),
  },
  env: {
    async openExternal() {
      return true;
    },
  },
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "vscode") return mockVscode;
  return originalLoad.call(this, request, parent, isMain);
};

const extension = require(path.join(projectRoot, "src", "extension.js"));
const context = {
  extensionUri: { fsPath: projectRoot },
  subscriptions: [],
};

async function main() {
  extension.activate(context);
  await new Promise((resolve) => setTimeout(resolve, 300));

  const response = await fetch(exportUrl);
  const html = await response.text();
  console.log(
    "export:",
    response.status,
    "title:",
    html.includes("<title>sample</title>"),
    "image:",
    html.includes("data:image/svg+xml;base64,"),
    "toc:",
    html.includes("mono-toc-root")
  );

  const denied = await fetch(
    "http://127.0.0.1:48766/export?source=" + encodeURIComponent(sourceUri)
  );
  console.log("no-token:", denied.status);

  for (const disposable of context.subscriptions) {
    try {
      disposable.dispose();
    } catch (error) {
      // ignore
    }
  }
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

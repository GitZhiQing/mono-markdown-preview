"use strict";

const vscode = require("vscode");
const fs = require("fs/promises");
const path = require("path");
const http = require("http");
const { buildHtml } = require("./lib/build-html");
const { inlineLocalImages } = require("./lib/inline-images");

const CSS_FILES = [
  "vscode-markdown.css",
  "vscode-highlight.css",
  "mono.css",
  "toc.css",
  "highlight-mono.css",
  "code-blocks.css",
];
const KATEX_CSS_FILE = "katex.css";

// Local-only export service used by the globe button in the preview.
// Keep these values in sync with media/toc.js in production.
const EXPORT_PORT = Number(process.env.MONO_EXPORT_PORT) || 48765;
const EXPORT_TOKEN = process.env.MONO_EXPORT_TOKEN || "mono-4d7c9a";

let cachedCss = "";
let cachedTocJs = "";
let cachedCodeJs = "";
let cachedKatexCss = "";
let exportServer = null;

function exportUrl(uri) {
  return (
    `http://127.0.0.1:${EXPORT_PORT}/export?token=${EXPORT_TOKEN}&source=` +
    encodeURIComponent(uri.toString())
  );
}

async function readMedia(context, name) {
  const uri = vscode.Uri.joinPath(context.extensionUri, "media", name);
  const data = await vscode.workspace.fs.readFile(uri);
  return Buffer.from(data).toString("utf8");
}

async function loadAssets(context, options = {}) {
  if (!cachedCss) {
    cachedCss = (
      await Promise.all(CSS_FILES.map((name) => readMedia(context, name)))
    ).join("\n\n");
    cachedTocJs = await readMedia(context, "toc.js");
    cachedCodeJs = await readMedia(context, "code-blocks.js");
  }
  if (options.math && !cachedKatexCss) {
    cachedKatexCss = await readMedia(context, KATEX_CSS_FILE);
  }
  return {
    css: cachedCss + (options.math ? "\n\n" + cachedKatexCss : ""),
    tocJs: cachedTocJs,
    codeJs: cachedCodeJs,
  };
}

function containsMath(html) {
  return (
    /class="[^"]*\bkatex\b/.test(html) ||
    html.includes("katex-display") ||
    html.includes("katex-error")
  );
}

function isMarkdownDocument(document) {
  return (
    document.languageId === "markdown" ||
    /\.(md|markdown|mdown|mkdn|mkd|mdx|rmd|qmd)$/i.test(
      document.uri.fsPath
    )
  );
}

function targetUriFrom(arg) {
  if (Array.isArray(arg)) return arg[0];
  if (arg instanceof vscode.Uri) return arg;
  const editor = vscode.window.activeTextEditor;
  return editor ? editor.document.uri : undefined;
}

async function renderMarkdown(document) {
  try {
    return await vscode.commands.executeCommand(
      "markdown.api.render",
      document
    );
  } catch (firstError) {
    // Older builds may not accept a TextDocument; fall back to the text.
    return await vscode.commands.executeCommand(
      "markdown.api.render",
      document.getText()
    );
  }
}

async function openInBrowser(context, arg) {
  const uri = targetUriFrom(arg);
  if (!uri) {
    vscode.window.showErrorMessage("Mono: 请先打开一个 Markdown 文件。");
    return;
  }
  if (uri.scheme !== "file") {
    vscode.window.showErrorMessage("Mono: 目前只支持本地 Markdown 文件。");
    return;
  }

  let document;
  try {
    document = await vscode.workspace.openTextDocument(uri);
  } catch (error) {
    vscode.window.showErrorMessage("Mono: 无法打开 Markdown 文件。");
    return;
  }
  if (!isMarkdownDocument(document)) {
    vscode.window.showErrorMessage("Mono: 当前文件不是 Markdown。");
    return;
  }

  // Prefer the local export service so this command does not depend on
  // opening a file through the OS default handler.
  if (exportServer && exportServer.listening) {
    const opened = await vscode.env.openExternal(
      vscode.Uri.parse(exportUrl(uri))
    );
    if (opened) {
      vscode.window.setStatusBarMessage(
        "Mono: 已在浏览器打开 HTML",
        3000
      );
      return;
    }
  }

  let rendered;
  try {
    rendered = await renderMarkdown(document);
  } catch (error) {
    vscode.window.showErrorMessage(
      "Mono: 无法调用 VS Code 内置 Markdown 渲染器，请确认内置 Markdown 扩展已启用。"
    );
    return;
  }
  if (typeof rendered !== "string") {
    vscode.window.showErrorMessage("Mono: Markdown 渲染结果为空。");
    return;
  }

  const sourcePath = document.uri.fsPath;
  try {
    rendered = await inlineLocalImages(rendered, path.dirname(sourcePath));
  } catch (error) {
    // Keep the rendered HTML if an individual image cannot be read.
  }

  let assets;
  try {
    assets = await loadAssets(context, { math: containsMath(rendered) });
  } catch (error) {
    vscode.window.showErrorMessage("Mono: 读取样式文件失败。");
    return;
  }

  const baseName = path.basename(sourcePath, path.extname(sourcePath));
  const safeName =
    baseName.replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").trim() || "document";
  const htmlPath = path.join(
    path.dirname(sourcePath),
    `${safeName}.mono.html`
  );
  const html = buildHtml({
    title: baseName,
    css: assets.css,
    tocJs: assets.tocJs,
    codeJs: assets.codeJs,
    body: rendered,
  });

  try {
    await fs.writeFile(htmlPath, html, "utf8");
  } catch (error) {
    vscode.window.showErrorMessage(
      "Mono: 无法写入 HTML 文件。请检查目录权限。"
    );
    return;
  }

  const opened = await vscode.env.openExternal(vscode.Uri.file(htmlPath));
  if (!opened) {
    const action = await vscode.window.showWarningMessage(
      `Mono: HTML 已生成，但浏览器未能自动打开：${htmlPath}`,
      "在文件管理器中显示"
    );
    if (action) {
      await vscode.commands.executeCommand(
        "revealFileInOS",
        vscode.Uri.file(htmlPath)
      );
    }
    return;
  }

  vscode.window.setStatusBarMessage(
    `Mono: 已生成并在浏览器打开 ${path.basename(htmlPath)}`,
    4000
  );
}

function send(res, status, contentType, body) {
  res.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(body);
}

async function handleExportRequest(context, req, res) {
  if (req.method !== "GET") {
    send(res, 405, "text/plain; charset=utf-8", "Method not allowed");
    return;
  }

  const url = new URL(req.url, `http://127.0.0.1:${EXPORT_PORT}`);
  if (url.pathname !== "/export") {
    send(res, 404, "text/plain; charset=utf-8", "Not found");
    return;
  }
  if (url.searchParams.get("token") !== EXPORT_TOKEN) {
    send(res, 403, "text/plain; charset=utf-8", "Forbidden");
    return;
  }

  const source = url.searchParams.get("source");
  if (!source) {
    send(res, 400, "text/plain; charset=utf-8", "Missing source");
    return;
  }

  let uri;
  try {
    uri = vscode.Uri.parse(source);
  } catch (error) {
    send(res, 400, "text/plain; charset=utf-8", "Invalid source");
    return;
  }
  if (uri.scheme !== "file") {
    send(res, 400, "text/plain; charset=utf-8", "Only local files are supported");
    return;
  }

  let document;
  try {
    document = await vscode.workspace.openTextDocument(uri);
  } catch (error) {
    send(res, 404, "text/plain; charset=utf-8", "Markdown file not found");
    return;
  }
  if (!isMarkdownDocument(document)) {
    send(res, 400, "text/plain; charset=utf-8", "Not a Markdown file");
    return;
  }

  let rendered;
  try {
    rendered = await renderMarkdown(document);
    rendered = await inlineLocalImages(rendered, path.dirname(uri.fsPath));
  } catch (error) {
    send(
      res,
      500,
      "text/plain; charset=utf-8",
      "Failed to render Markdown"
    );
    return;
  }

  let assets;
  try {
    assets = await loadAssets(context, { math: containsMath(rendered) });
  } catch (error) {
    send(res, 500, "text/plain; charset=utf-8", "Failed to read styles");
    return;
  }

  const title = path.basename(uri.fsPath, path.extname(uri.fsPath));
  const page = buildHtml({
    title,
    css: assets.css,
    tocJs: assets.tocJs,
    codeJs: assets.codeJs,
    body: rendered,
  });
  send(res, 200, "text/html; charset=utf-8", page);
}

function startExportServer(context) {
  const server = http.createServer((req, res) => {
    handleExportRequest(context, req, res).catch((error) => {
      console.error("Mono export server:", error);
      if (!res.headersSent) {
        send(res, 500, "text/plain; charset=utf-8", "Mono export failed");
      } else {
        res.end();
      }
    });
  });

  server.on("error", (error) => {
    exportServer = null;
    vscode.window.showWarningMessage(
      `Mono: 本地导出服务启动失败（${error.message}）。预览页的地球图标不可用，请使用编辑器标题栏的浏览器图标。`
    );
  });

  server.listen(EXPORT_PORT, "127.0.0.1");
  exportServer = server;
  context.subscriptions.push({
    dispose: () => {
      try {
        server.close();
      } catch (error) {
        // ignore
      }
    },
  });
}

function activate(context) {
  startExportServer(context);

  context.subscriptions.push(
    vscode.commands.registerCommand("monoMarkdown.openInBrowser", (arg) =>
      openInBrowser(context, arg)
    )
  );
}

function deactivate() {}

module.exports = { activate, deactivate };

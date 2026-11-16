/*
 * Code block enhancements for the Mono preview and exported HTML.
 *
 * Adds logical line numbers, a per-block wrap toggle, and a copy button.
 * The original highlighted spans are preserved; only the text nodes are
 * split at newlines. Hidden newline spans keep code.textContent identical,
 * which VS Code's preview scroll sync relies on.
 */
(function () {
  "use strict";

  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window.__monoCodeBlocksLoaded) return;
  window.__monoCodeBlocksLoaded = true;

  var BLOCK_CLASS = "mono-code-block";
  var TOOLBAR_CLASS = "mono-code-toolbar";
  var LINE_CLASS = "mono-code-line";
  var BREAK_CLASS = "mono-code-break";
  var LABEL_ICON =
    '<svg class="mono-code-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<polyline points="8 7 3.5 12 8 17"></polyline>' +
    '<polyline points="16 7 20.5 12 16 17"></polyline>' +
    '<line x1="13.5" y1="5" x2="10.5" y2="19"></line>' +
    "</svg>";

  var LANGUAGE_NAMES = {
    js: "JavaScript",
    javascript: "JavaScript",
    jsx: "JSX",
    ts: "TypeScript",
    typescript: "TypeScript",
    tsx: "TSX",
    html: "HTML",
    xml: "XML",
    svg: "SVG",
    css: "CSS",
    scss: "SCSS",
    sass: "Sass",
    less: "Less",
    json: "JSON",
    jsonc: "JSON with Comments",
    yaml: "YAML",
    yml: "YAML",
    toml: "TOML",
    md: "Markdown",
    markdown: "Markdown",
    mdx: "MDX",
    bash: "Shell",
    sh: "Shell",
    shell: "Shell",
    zsh: "Shell",
    fish: "Shell",
    powershell: "PowerShell",
    ps1: "PowerShell",
    bat: "Batch",
    cmd: "Batch",
    python: "Python",
    py: "Python",
    java: "Java",
    kotlin: "Kotlin",
    kt: "Kotlin",
    c: "C",
    h: "C",
    cpp: "C++",
    "c++": "C++",
    csharp: "C#",
    cs: "C#",
    go: "Go",
    rust: "Rust",
    rs: "Rust",
    php: "PHP",
    ruby: "Ruby",
    rb: "Ruby",
    swift: "Swift",
    sql: "SQL",
    graphql: "GraphQL",
    gql: "GraphQL",
    dockerfile: "Dockerfile",
    diff: "Diff",
    patch: "Diff",
    ini: "INI",
    nginx: "Nginx",
    lua: "Lua",
    perl: "Perl",
    r: "R",
    scala: "Scala",
    dart: "Dart",
    elixir: "Elixir",
    erlang: "Erlang",
    tex: "LaTeX",
    latex: "LaTeX",
    mermaid: "Mermaid",
    text: "Text",
    txt: "Text",
    plaintext: "Text",
    "no-highlight": "Text",
  };

  function languageName(code) {
    var node = code;
    var raw = "";
    while (node && node !== document.body) {
      var className =
        typeof node.className === "string" ? node.className : "";
      var match = className.match(/(?:^|\s)language-([\w-]+)/);
      if (match) {
        raw = match[1].toLowerCase();
        break;
      }
      node = node.parentElement;
    }
    if (!raw) return "Code";
    if (LANGUAGE_NAMES[raw]) return LANGUAGE_NAMES[raw];
    return raw
      .replace(/[-_]+/g, " ")
      .replace(/\b[a-z]/g, function (ch) {
        return ch.toUpperCase();
      });
  }

  function copyText(text) {
    // Prefer the synchronous selection-based copy: it works inside the VS Code
    // webview and from file:// without prompting for clipboard permission.
    if (legacyCopy(text)) return Promise.resolve(true);
    if (
      window.isSecureContext &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === "function"
    ) {
      return Promise.race([
        navigator.clipboard.writeText(text).then(
          function () {
            return true;
          },
          function () {
            return false;
          }
        ),
        new Promise(function (resolve) {
          setTimeout(function () {
            resolve(false);
          }, 1200);
        }),
      ]);
    }
    return Promise.resolve(false);
  }

  function legacyCopy(text) {
    var area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "0";
    area.style.left = "-9999px";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.focus();
    area.select();
    var ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (error) {
      ok = false;
    }
    area.remove();
    return ok;
  }

  /*
   * Split a code element's children into one fragment per logical line.
   * Highlight spans that cross a newline are cloned at the start of the next
   * line, so token colors survive the split.
   */
  function splitLines(code) {
    var lines = [];
    var line = document.createDocumentFragment();
    var stack = [];

    function currentParent() {
      return stack.length ? stack[stack.length - 1] : line;
    }

    function startLine() {
      lines.push(line);
      line = document.createDocumentFragment();
      var nextStack = [];
      var parent = line;
      for (var i = 0; i < stack.length; i++) {
        var clone = stack[i].cloneNode(false);
        parent.appendChild(clone);
        nextStack.push(clone);
        parent = clone;
      }
      stack = nextStack;
    }

    function walk(node) {
      if (node.nodeType === 3) {
        var parts = node.nodeValue.split("\n");
        for (var i = 0; i < parts.length; i++) {
          if (parts[i]) currentParent().appendChild(document.createTextNode(parts[i]));
          if (i < parts.length - 1) startLine();
        }
        return;
      }
      if (node.nodeType !== 1) return;
      var clone = node.cloneNode(false);
      currentParent().appendChild(clone);
      stack.push(clone);
      var children = node.childNodes;
      for (var j = 0; j < children.length; j++) walk(children[j]);
      stack.pop();
    }

    var children = code.childNodes;
    for (var i = 0; i < children.length; i++) walk(children[i]);
    lines.push(line);
    return lines;
  }

  function ensureWrapper(pre) {
    var parent = pre.parentElement;
    if (parent && parent.classList.contains(BLOCK_CLASS)) return parent;
    if (!pre.parentNode) return null;
    var wrapper = document.createElement("div");
    wrapper.className = BLOCK_CLASS;
    pre.parentNode.insertBefore(wrapper, pre);
    wrapper.appendChild(pre);
    return wrapper;
  }

  function teardown(pre) {
    var wrapper = pre.parentElement;
    if (wrapper && wrapper.classList.contains(BLOCK_CLASS)) {
      var toolbar = wrapper.querySelector("." + TOOLBAR_CLASS);
      if (toolbar) toolbar.remove();
      wrapper.parentNode.insertBefore(pre, wrapper);
      wrapper.remove();
    }
    pre.removeAttribute("data-mono-code");
  }

  function makeButton(text, label) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "mono-code-action";
    button.textContent = text;
    button.setAttribute("aria-label", label);
    button.setAttribute("title", label);
    return button;
  }

  function attachToolbar(pre, code, originalText) {
    var wrapper = ensureWrapper(pre);
    if (!wrapper) return;

    var previous = wrapper.querySelector("." + TOOLBAR_CLASS);
    if (previous) previous.remove();

    var toolbar = document.createElement("div");
    toolbar.className = TOOLBAR_CLASS;
    toolbar.setAttribute("role", "group");
    toolbar.setAttribute("aria-label", "代码块操作");

    var meta = document.createElement("div");
    meta.className = "mono-code-meta";
    meta.innerHTML = LABEL_ICON;
    var label = document.createElement("span");
    label.className = "mono-code-lang";
    label.textContent = languageName(code);
    label.title = label.textContent;
    meta.appendChild(label);

    var actions = document.createElement("div");
    actions.className = "mono-code-actions";

    var copy = makeButton("复制", "复制代码");
    var wrap = makeButton("折行", "切换自动折行");
    var wrapOn =
      pre.classList.contains("mono-code-wrap") ||
      (document.body.classList.contains("wordWrap") &&
        !pre.classList.contains("mono-code-nowrap"));

    function refreshWrap() {
      wrap.textContent = wrapOn ? "不折行" : "折行";
      wrap.setAttribute("aria-pressed", wrapOn ? "true" : "false");
    }

    refreshWrap();

    copy.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      copyText(originalText).then(
        function (ok) {
          copy.textContent = ok ? "已复制" : "复制失败";
          clearTimeout(copy.__monoTimer);
          copy.__monoTimer = setTimeout(function () {
            copy.textContent = "复制";
          }, 1600);
        },
        function () {
          copy.textContent = "复制失败";
          clearTimeout(copy.__monoTimer);
          copy.__monoTimer = setTimeout(function () {
            copy.textContent = "复制";
          }, 1600);
        }
      );
    });

    wrap.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      wrapOn = !wrapOn;
      pre.classList.toggle("mono-code-wrap", wrapOn);
      pre.classList.toggle("mono-code-nowrap", !wrapOn);
      refreshWrap();
    });

    toolbar.addEventListener("click", function (event) {
      event.stopPropagation();
    });

    toolbar.appendChild(meta);
    toolbar.appendChild(actions);
    actions.appendChild(copy);
    actions.appendChild(wrap);
    wrapper.appendChild(toolbar);
  }

  function enhance(pre) {
    if (!pre || pre.closest(".code-chunk")) return;
    var code = pre.querySelector("code");
    if (!code) return;

    var wrapper =
      pre.parentElement && pre.parentElement.classList.contains(BLOCK_CLASS)
        ? pre.parentElement
        : null;
    var hasLines = !!pre.querySelector("." + LINE_CLASS);
    var hasToolbar = !!(wrapper && wrapper.querySelector("." + TOOLBAR_CLASS));

    if (hasLines && hasToolbar) {
      if (!wrapper.querySelector(".mono-code-meta")) {
        var existingText = pre.__monoOriginalText;
        attachToolbar(
          pre,
          code,
          typeof existingText === "string" ? existingText : code.textContent
        );
      }
      pre.setAttribute("data-mono-code", "1");
      return;
    }

    if (hasLines) {
      var stored = pre.__monoOriginalText;
      attachToolbar(
        pre,
        code,
        typeof stored === "string" ? stored : code.textContent
      );
      pre.setAttribute("data-mono-code", "1");
      return;
    }

    if (pre.getAttribute("data-mono-code") === "1") {
      teardown(pre);
    }

    var originalText = code.textContent;
    pre.__monoOriginalText = originalText;

    var lines = splitLines(code);
    var trailingNewline =
      lines.length > 1 && lines[lines.length - 1].textContent === "";
    if (trailingNewline) lines.pop();

    while (code.firstChild) code.removeChild(code.firstChild);
    for (var i = 0; i < lines.length; i++) {
      var line = document.createElement("span");
      line.className = LINE_CLASS;
      line.appendChild(lines[i]);
      code.appendChild(line);
      if (i < lines.length - 1 || trailingNewline) {
        var lineBreak = document.createElement("span");
        lineBreak.className = BREAK_CLASS;
        lineBreak.textContent = "\n";
        code.appendChild(lineBreak);
      }
    }

    attachToolbar(pre, code, originalText);
    pre.setAttribute("data-mono-code", "1");
  }

  function enhanceAll() {
    var blocks = document.querySelectorAll(".markdown-body pre");
    for (var i = 0; i < blocks.length; i++) enhance(blocks[i]);
  }

  function init() {
    if (!document.body) {
      document.addEventListener("DOMContentLoaded", init);
      return;
    }

    enhanceAll();

    var timer = 0;
    function schedule() {
      if (timer) return;
      timer = setTimeout(function () {
        timer = 0;
        enhanceAll();
      }, 80);
    }

    var observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("vscode.markdown.updateContent", schedule);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

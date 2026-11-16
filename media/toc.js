/* Floating table of contents for the Mono Markdown preview and exported HTML. */
(function () {
  "use strict";

  if (window.__monoMarkdownTocLoaded && document.getElementById("mono-toc-root")) {
    return;
  }
  window.__monoMarkdownTocLoaded = true;

  var ROOT_ID = "mono-toc-root";
  var STORAGE_KEY = "mono-markdown-toc-open";
  var lastSignature = "";
  var buildTimer = 0;
  var activeFrame = 0;
  var headings = [];
  var links = [];
  var root = null;
  var panel = null;
  var button = null;

  function slugify(text) {
    return (
      (text || "")
        .trim()
        .toLowerCase()
        .replace(/[^\w\u4e00-\u9fff\- ]+/g, "")
        .replace(/\s+/g, "-")
        .replace(/^-+|-+$/g, "") || "section"
    );
  }

  function uniqueId(base, used) {
    var id = base;
    var i = 2;
    while (used.has(id)) {
      id = base + "-" + i;
      i++;
    }
    used.add(id);
    return id;
  }

  function collectHeadings() {
    var container = document.querySelector(".markdown-body");
    if (!container) return [];
    var nodes = container.querySelectorAll("h1, h2, h3, h4");
    var list = [];
    for (var i = 0; i < nodes.length; i++) {
      var h = nodes[i];
      var text = (h.textContent || "").replace(/\s+/g, " ").trim();
      if (text) list.push(h);
    }
    return list;
  }

  function previewSource() {
    var meta = document.getElementById("vscode-markdown-preview-data");
    if (!meta) return "";
    try {
      var settings = JSON.parse(meta.getAttribute("data-settings") || "{}");
      return settings && settings.source ? settings.source : "";
    } catch (e) {
      return "";
    }
  }

  function ensureRoot() {
    var existing = document.getElementById(ROOT_ID);
    if (existing) {
      root = existing;
      panel = root.querySelector(".mono-toc-panel");
      button = root.querySelector(".mono-toc-button");
      return root;
    }

    root = document.createElement("div");
    root.id = ROOT_ID;
    root.className = "mono-toc";
    root.innerHTML =
      '<div class="mono-toc-actions">' +
      '<button type="button" class="mono-toc-button" aria-label="目录" aria-expanded="false">目录</button>' +
      '<a class="mono-toc-browser" href="#" title="在浏览器打开 HTML" aria-label="在浏览器打开 HTML">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="9"></circle>' +
      '<path d="M3 12h18"></path>' +
      '<path d="M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"></path>' +
      "</svg>" +
      "</a>" +
      "</div>" +
      '<nav class="mono-toc-panel" aria-label="目录">' +
      '<div class="mono-toc-header"><span>目录</span><button type="button" class="mono-toc-close" aria-label="关闭目录">×</button></div>' +
      '<ol class="mono-toc-list"></ol>' +
      "</nav>";
    document.body.appendChild(root);

    button = root.querySelector(".mono-toc-button");
    panel = root.querySelector(".mono-toc-panel");

    var browser = root.querySelector(".mono-toc-browser");
    var source = previewSource();
    if (browser && source) {
      browser.href =
        "http://127.0.0.1:48765/export?token=mono-4d7c9a&source=" +
        encodeURIComponent(source);
    } else if (browser) {
      browser.style.display = "none";
    }

    button.addEventListener("click", function () {
      setOpen(!root.classList.contains("mono-toc-open"));
    });
    root.querySelector(".mono-toc-close").addEventListener("click", function () {
      setOpen(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") setOpen(false);
    });
    document.addEventListener("click", function (e) {
      if (root.classList.contains("mono-toc-open") && !root.contains(e.target)) {
        setOpen(false);
      }
    });

    try {
      if (window.localStorage && localStorage.getItem(STORAGE_KEY) === "1") {
        setOpen(true, true);
      }
    } catch (e) {}

    return root;
  }

  function setOpen(open, silent) {
    if (!root) return;
    root.classList.toggle("mono-toc-open", !!open);
    document.body.classList.toggle("mono-toc-open", !!open);
    if (button) button.setAttribute("aria-expanded", open ? "true" : "false");
    if (!silent) {
      try {
        localStorage.setItem(STORAGE_KEY, open ? "1" : "0");
      } catch (e) {}
    }
  }

  function build() {
    if (!document.body) return;
    root = ensureRoot();
    headings = collectHeadings();

    if (headings.length < 2) {
      root.style.display = "none";
      return;
    }
    root.style.display = "";

    var used = new Set();
    var allIds = document.querySelectorAll("[id]");
    for (var i = 0; i < allIds.length; i++) used.add(allIds[i].id);

    var minLevel = 9;
    for (var j = 0; j < headings.length; j++) {
      var h = headings[j];
      var level = parseInt(h.tagName.charAt(1), 10) || 1;
      if (level < minLevel) minLevel = level;
      if (!h.id) {
        h.id = uniqueId(slugify(h.textContent), used);
      } else {
        used.add(h.id);
      }
    }

    var signature = headings
      .map(function (h) {
        return h.tagName + "|" + h.id + "|" + (h.textContent || "").trim();
      })
      .join("::");
    if (signature === lastSignature) {
      updateActive();
      return;
    }
    lastSignature = signature;

    var list = root.querySelector(".mono-toc-list");
    while (list.firstChild) list.removeChild(list.firstChild);
    links = [];

    // Build a real nested outline so each level can have its own guide line.
    var tree = { level: minLevel - 1, children: [] };
    var stack = [tree];
    headings.forEach(function (h) {
      var level = parseInt(h.tagName.charAt(1), 10) || 1;
      while (stack.length > 1 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }
      var parent = stack[stack.length - 1];
      var node = { heading: h, level: level, children: [] };
      parent.children.push(node);
      stack.push(node);
    });

    function renderNodes(nodes, container) {
      nodes.forEach(function (node) {
        var h = node.heading;
        var li = document.createElement("li");
        li.className = "mono-toc-item";

        var a = document.createElement("a");
        a.href = "#" + h.id;
        a.textContent = (h.textContent || "").replace(/\s+/g, " ").trim();
        a.setAttribute("data-target", h.id);
        a.addEventListener("click", function (e) {
          e.preventDefault();
          var target = document.getElementById(h.id);
          if (target) {
            target.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        });

        li.appendChild(a);
        if (node.children.length) {
          var sub = document.createElement("ol");
          sub.className = "mono-toc-sub";
          renderNodes(node.children, sub);
          li.appendChild(sub);
        }
        container.appendChild(li);
        links.push(a);
      });
    }

    renderNodes(tree.children, list);
    updateActive();
  }

  function updateActive() {
    if (!headings.length || !links.length) return;
    var current = headings[0];
    for (var i = 0; i < headings.length; i++) {
      if (headings[i].getBoundingClientRect().top <= 120) {
        current = headings[i];
      } else {
        break;
      }
    }
    for (var j = 0; j < links.length; j++) {
      links[j].classList.toggle(
        "active",
        links[j].getAttribute("data-target") === current.id
      );
    }
  }

  function scheduleBuild() {
    clearTimeout(buildTimer);
    buildTimer = setTimeout(build, 120);
  }

  function scheduleActive() {
    if (activeFrame) return;
    activeFrame = requestAnimationFrame(function () {
      activeFrame = 0;
      updateActive();
    });
  }

  function init() {
    if (!document.body) {
      document.addEventListener("DOMContentLoaded", init);
      return;
    }
    ensureRoot();
    build();

    var observer = new MutationObserver(scheduleBuild);
    observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener("scroll", scheduleActive, {
      passive: true,
      capture: true,
    });
    document.addEventListener("scroll", scheduleActive, {
      passive: true,
      capture: true,
    });
    window.addEventListener("resize", scheduleActive, { passive: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

"use strict";

const fs = require("fs/promises");
const path = require("path");
const { fileURLToPath } = require("url");

const MIME_BY_EXT = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".ogg": "video/ogg",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};

const IMG_RE = /<img\b[^>]*\bsrc=(['"])([^'"]+)\1[^>]*>/gi;

async function inlineLocalImages(html, sourceDir) {
  const tags = [...html.matchAll(IMG_RE)];
  let output = html;

  for (const match of tags) {
    const tag = match[0];
    const rawSrc = match[2].replace(/&amp;/g, "&");

    if (/^(data:|https?:|\/\/|#)/i.test(rawSrc)) continue;

    let filePath;
    try {
      if (rawSrc.startsWith("file:")) {
        filePath = fileURLToPath(rawSrc);
      } else {
        // Root-relative and UNC paths are left untouched for safety.
        if (
          rawSrc.startsWith("/") ||
          rawSrc.startsWith("\\") ||
          /^[a-z]:[\\/]/i.test(rawSrc)
        ) {
          continue;
        }
        const clean = rawSrc.split(/[?#]/)[0];
        filePath = path.resolve(sourceDir, decodeURIComponent(clean));
      }
    } catch (error) {
      continue;
    }

    const mime = MIME_BY_EXT[path.extname(filePath).toLowerCase()];
    if (!mime) continue;

    try {
      const data = await fs.readFile(filePath);
      const dataUri = `data:${mime};base64,${data.toString("base64")}`;
      output = output.replace(tag, tag.replace(match[2], dataUri));
    } catch (error) {
      // Leave the original src in place.
    }
  }

  return output;
}

module.exports = { inlineLocalImages };

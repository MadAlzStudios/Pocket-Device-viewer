/**
 * POCKET — Device Preview
 * Local-only: upload ZIP / folder / HTML and preview across device frames.
 * Relative assets (CSS, JS, images, fonts) are rewritten to blob URLs.
 */

const DEVICE_GROUPS = [
  {
    label: "Phones",
    devices: [
      { id: "iphone16pro", name: "iPhone 16 Pro", w: 393, h: 852, notch: "dynamic-island", home: true, chrome: "phone" },
      { id: "iphone15", name: "iPhone 15", w: 393, h: 852, notch: "dynamic-island", home: true, chrome: "phone" },
      { id: "iphone14", name: "iPhone 14", w: 390, h: 844, notch: "iphone", home: true, chrome: "phone" },
      { id: "iphonese", name: "iPhone SE", w: 375, h: 667, notch: "none", home: false, chrome: "phone" },
      { id: "pixel9", name: "Pixel 9", w: 412, h: 915, notch: "android", home: false, chrome: "android" },
      { id: "galaxys24", name: "Galaxy S24", w: 360, h: 780, notch: "android", home: false, chrome: "android" },
      { id: "fold", name: "Galaxy Z Fold", w: 280, h: 653, notch: "android", home: false, chrome: "fold" },
    ],
  },
  {
    label: "Tablets",
    devices: [
      { id: "ipadpro", name: "iPad Pro 12.9", w: 1024, h: 1366, notch: "none", home: false, chrome: "tablet" },
      { id: "ipadair", name: "iPad Air", w: 820, h: 1180, notch: "none", home: false, chrome: "tablet" },
      { id: "ipadmini", name: "iPad mini", w: 744, h: 1133, notch: "none", home: false, chrome: "tablet" },
      { id: "surface", name: "Surface Pro", w: 912, h: 1368, notch: "none", home: false, chrome: "tablet" },
    ],
  },
  {
    label: "Laptops",
    devices: [
      { id: "mba13", name: "MacBook Air 13″", w: 1280, h: 832, notch: "none", home: false, chrome: "laptop" },
      { id: "mbp14", name: "MacBook Pro 14″", w: 1512, h: 982, notch: "none", home: false, chrome: "laptop" },
      { id: "laptop1366", name: "Laptop 1366", w: 1366, h: 768, notch: "none", home: false, chrome: "laptop" },
      { id: "laptop1920", name: "Laptop 1920", w: 1920, h: 1080, notch: "none", home: false, chrome: "laptop" },
    ],
  },
  {
    label: "Desktops",
    devices: [
      { id: "desktop1440", name: "Desktop 1440", w: 1440, h: 900, notch: "none", home: false, chrome: "desktop" },
      { id: "desktop1920", name: "Desktop 1920", w: 1920, h: 1080, notch: "none", home: false, chrome: "desktop" },
      { id: "desktop2560", name: "Desktop 2560", w: 2560, h: 1440, notch: "none", home: false, chrome: "desktop" },
      { id: "desktop4k", name: "4K UHD", w: 3840, h: 2160, notch: "none", home: false, chrome: "desktop" },
    ],
  },
  {
    label: "Watch",
    devices: [
      { id: "watch", name: "Apple Watch", w: 198, h: 242, notch: "none", home: false, chrome: "watch" },
    ],
  },
];

const ALL_DEVICES = DEVICE_GROUPS.flatMap((g) => g.devices);

let currentDevice = ALL_DEVICES[0];
let isLandscape = false;
let scale = 0.65;
/** @type {string | null} */
let localBlobUrl = null;
/** @type {string[]} */
let localAssetUrls = [];

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function init() {
  renderDeviceGroups();
  bindEvents();
  applyDevice(currentDevice);

  // Keep large devices fitted when the stage is resized
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => fitToViewport(), 80);
  });

  // Also re-fit when entering/exiting fullscreen on the stage
  document.addEventListener("fullscreenchange", () => {
    requestAnimationFrame(() => fitToViewport());
  });
}

function renderDeviceGroups() {
  const root = $("#device-groups");
  root.innerHTML = DEVICE_GROUPS.map(
    (group) => `
    <div class="device-group">
      <div class="device-group-label">${group.label}</div>
      <div class="device-grid">
        ${group.devices
          .map(
            (d) => `
          <button type="button" class="device-btn ${d.id === currentDevice.id ? "active" : ""}" data-id="${d.id}">
            <span class="name">${d.name}</span>
            <span class="size">${d.w} × ${d.h}</span>
          </button>`
          )
          .join("")}
      </div>
    </div>`
  ).join("");
}

function bindEvents() {
  $("#upload-zip-btn").addEventListener("click", () => {
    const input = $("#file-input");
    input.accept = ".zip,application/zip";
    input.onchange = onZipOrHtmlSelected;
    input.click();
  });

  $("#upload-html-btn").addEventListener("click", () => {
    const input = $("#file-input");
    input.accept = ".html,.htm,text/html";
    input.onchange = onZipOrHtmlSelected;
    input.click();
  });

  const folderBtn = $("#upload-folder-btn");
  if (folderBtn) {
    folderBtn.addEventListener("click", () => {
      const input = $("#folder-input");
      input.onchange = onFolderSelected;
      input.click();
    });
  }

  $("#clear-local").addEventListener("click", () => {
    clearLocalPreview();
    $("#file-input").value = "";
    $("#folder-input").value = "";
    showEmptyState();
    toast("Project cleared");
  });

  $("#device-groups").addEventListener("click", (e) => {
    const btn = e.target.closest(".device-btn");
    if (!btn) return;
    const device = ALL_DEVICES.find((d) => d.id === btn.dataset.id);
    if (!device) return;
    currentDevice = device;
    $$(".device-btn").forEach((b) => b.classList.toggle("active", b.dataset.id === device.id));
    applyDevice(device);
  });

  $("#orient-portrait").addEventListener("click", () => setOrientation(false));
  $("#orient-landscape").addEventListener("click", () => setOrientation(true));

  $("#scale-slider").addEventListener("input", (e) => {
    scale = Number(e.target.value) / 100;
    $("#scale-label").textContent = `${e.target.value}%`;
    e.target.setAttribute("aria-valuenow", e.target.value);
    updateScale();
  });

  $("#apply-custom").addEventListener("click", () => {
    const w = Number($("#custom-w").value);
    const h = Number($("#custom-h").value);
    if (w < 100 || h < 100) {
      toast("Minimum size is 100 × 100");
      return;
    }
    currentDevice = {
      id: "custom",
      name: "Custom",
      w,
      h,
      notch: "none",
      home: false,
      chrome: "phone",
    };
    $$(".device-btn").forEach((b) => b.classList.remove("active"));
    applyDevice(currentDevice);
  });

  $("#reload-btn").addEventListener("click", () => {
    const frame = $("#preview-frame");
    if (localBlobUrl) frame.src = localBlobUrl;
  });

  $("#fullscreen-btn").addEventListener("click", () => {
    const wrap = $("#viewport-wrap");
    if (!document.fullscreenElement) wrap.requestFullscreen?.();
    else document.exitFullscreen?.();
  });

  // Drag & drop on stage / upload zone (and whole main area)
  const dropTargets = [$("#upload-zone"), $("#viewport-wrap"), $("#stage"), $(".main")].filter(Boolean);
  dropTargets.forEach((el) => {
    el.addEventListener("dragenter", (e) => {
      e.preventDefault();
      el.classList.add("drag-over");
    });
    el.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      el.classList.add("drag-over");
    });
    el.addEventListener("dragleave", (e) => {
      if (!el.contains(e.relatedTarget)) el.classList.remove("drag-over");
    });
    el.addEventListener("drop", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropTargets.forEach((t) => t.classList.remove("drag-over"));
      const items = e.dataTransfer.items;
      const files = e.dataTransfer.files;
      if (items && items.length) {
        // Prefer folder entry if available
        const entry = items[0].webkitGetAsEntry?.();
        if (entry && entry.isDirectory) {
          try {
            const fileMap = await readDirectoryEntry(entry);
            await loadFromFileMap(fileMap, entry.name);
          } catch (err) {
            console.error(err);
            toast(err.message || "Failed to read folder");
          }
          return;
        }
      }
      if (files && files.length === 1) {
        await handleSingleFile(files[0]);
      } else if (files && files.length > 1) {
        // Multi-file drop (folder contents without directory entry)
        const map = new Map();
        for (const f of files) {
          const path = f.webkitRelativePath || f.name;
          map.set(normalizePath(path), f);
        }
        await loadFromFileMap(map, "dropped files");
      }
    });
  });
}

function setOrientation(landscape) {
  isLandscape = landscape;
  $("#orient-portrait").classList.toggle("active", !landscape);
  $("#orient-landscape").classList.toggle("active", landscape);
  applyDevice(currentDevice);
}

function getDims() {
  if (isLandscape) return { w: currentDevice.h, h: currentDevice.w };
  return { w: currentDevice.w, h: currentDevice.h };
}

function applyDevice(device) {
  const frame = $("#device-frame");
  const screen = frame.querySelector(".screen");
  const notch = $("#notch");
  const home = $("#home-indicator");

  frame.dataset.device = device.id;
  frame.dataset.chrome = device.chrome || "phone";

  const { w, h } = getDims();
  screen.style.width = `${w}px`;
  screen.style.height = `${h}px`;

  notch.className = "notch " + (device.notch || "none");
  home.classList.toggle("hidden", !device.home || isLandscape);

  $("#device-name").textContent = device.name + (isLandscape ? " · Landscape" : "");
  $("#device-dims").textContent = `${w} × ${h}`;

  $("#custom-w").value = device.w;
  $("#custom-h").value = device.h;

  // Auto-fit large frames so they stay fully visible in the stage
  requestAnimationFrame(() => fitToViewport());
}

/**
 * Apply current `scale` so the layout box matches the visual size.
 * Shell is sized to naturalSize * scale; frame is transform-scaled inside it
 * (transform-origin: top left). This prevents large devices from overflowing
 * the stage even when scale < 1.
 */
function updateScale() {
  const frame = $("#device-frame");
  const shell = $("#device-scale-shell");
  if (!frame || !shell) return;

  // Measure natural size (no transform)
  frame.style.transform = "none";
  shell.style.width = "";
  shell.style.height = "";

  const wasHidden = shell.hidden;
  if (wasHidden) shell.hidden = false;
  const fw = frame.offsetWidth;
  const fh = frame.offsetHeight;
  if (wasHidden) shell.hidden = true;

  if (fw <= 0 || fh <= 0) {
    shell.style.width = "";
    shell.style.height = "";
    frame.style.transform = `scale(${scale})`;
    return;
  }

  const sw = Math.round(fw * scale);
  const sh = Math.round(fh * scale);
  shell.style.width = `${sw}px`;
  shell.style.height = `${sh}px`;
  frame.style.transform = `scale(${scale})`;
}

/**
 * Choose a scale so the device frame fits inside the stage.
 * Clamped to the slider range (20%–120%). Called on device / orientation
 * change, project load, and window resize. Manual slider still overrides.
 */
function fitToViewport() {
  const frame = $("#device-frame");
  const shell = $("#device-scale-shell");
  const wrap = $("#viewport-wrap");
  if (!frame || !shell || !wrap || shell.hidden) {
    updateScale();
    return;
  }

  // Natural size
  frame.style.transform = "none";
  shell.style.width = "";
  shell.style.height = "";
  const fw = frame.offsetWidth;
  const fh = frame.offsetHeight;

  const pad = 48;
  const availW = wrap.clientWidth - pad * 2;
  const availH = wrap.clientHeight - pad * 2;
  if (fw <= 0 || fh <= 0 || availW <= 0 || availH <= 0) {
    updateScale();
    return;
  }

  let fit = Math.min(availW / fw, availH / fh);
  fit = Math.max(0.2, Math.min(1.2, fit));
  scale = fit;

  const pct = Math.round(scale * 100);
  const slider = $("#scale-slider");
  if (slider) {
    slider.value = pct;
    slider.setAttribute("aria-valuenow", pct);
  }
  const label = $("#scale-label");
  if (label) label.textContent = `${pct}%`;

  updateScale();
}

function showEmptyState() {
  $("#empty-state").hidden = false;
  const shell = $("#device-scale-shell");
  if (shell) shell.hidden = true;
  $("#preview-frame").removeAttribute("src");
}

function showDeviceFrame() {
  $("#empty-state").hidden = true;
  const shell = $("#device-scale-shell");
  if (shell) shell.hidden = false;
  requestAnimationFrame(() => fitToViewport());
}

/* ——— Local project loading ——— */

function clearLocalPreview() {
  if (localBlobUrl) {
    URL.revokeObjectURL(localBlobUrl);
    localBlobUrl = null;
  }
  localAssetUrls.forEach((u) => URL.revokeObjectURL(u));
  localAssetUrls = [];
  $("#local-status").hidden = true;
  $("#local-name").textContent = "";
}

function showLocalStatus(label) {
  $("#local-name").textContent = label;
  $("#local-status").hidden = false;
}

async function onZipOrHtmlSelected(e) {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;
  await handleSingleFile(file);
}

async function handleSingleFile(file) {
  clearLocalPreview();
  const name = file.name.toLowerCase();
  try {
    if (name.endsWith(".html") || name.endsWith(".htm")) {
      await loadHtmlFile(file);
    } else if (name.endsWith(".zip") || file.type === "application/zip" || file.type === "application/x-zip-compressed") {
      await loadZipFile(file);
    } else {
      toast("Use a .html file or a .zip of your site");
    }
  } catch (err) {
    console.error(err);
    toast(err.message || "Failed to load project");
    showEmptyState();
  }
}

async function onFolderSelected(e) {
  const files = Array.from(e.target.files || []);
  e.target.value = "";
  if (!files.length) return;
  clearLocalPreview();
  try {
    const map = new Map();
    for (const f of files) {
      const path = f.webkitRelativePath || f.name;
      map.set(normalizePath(path), f);
    }
    const rootLabel = files[0].webkitRelativePath?.split("/")[0] || "folder";
    await loadFromFileMap(map, rootLabel);
  } catch (err) {
    console.error(err);
    toast(err.message || "Failed to load folder");
    showEmptyState();
  }
}

async function loadHtmlFile(file) {
  const text = await file.text();
  const blob = new Blob([text], { type: "text/html;charset=utf-8" });
  localBlobUrl = URL.createObjectURL(blob);
  $("#preview-frame").src = localBlobUrl;
  showLocalStatus(file.name);
  showDeviceFrame();
  toast("Loaded " + file.name);
}

async function loadZipFile(file) {
  if (typeof JSZip === "undefined") {
    throw new Error("JSZip failed to load. Check network access for the CDN.");
  }
  const zip = await JSZip.loadAsync(file);
  const map = new Map(); // path → { asyncText, asyncBlob, isText }
  for (const path of Object.keys(zip.files)) {
    const entry = zip.files[path];
    if (entry.dir) continue;
    const norm = normalizePath(path);
    map.set(norm, {
      path: norm,
      asyncText: () => entry.async("string"),
      asyncBlob: (mime) => entry.async("blob").then((b) => new Blob([b], { type: mime })),
    });
  }
  await loadFromVirtualMap(map, file.name);
}

/**
 * @param {Map<string, File>} fileMap path → File
 */
async function loadFromFileMap(fileMap, label) {
  const map = new Map();
  for (const [path, file] of fileMap) {
    const norm = normalizePath(path);
    map.set(norm, {
      path: norm,
      asyncText: () => file.text(),
      asyncBlob: (mime) =>
        file.arrayBuffer().then((buf) => new Blob([buf], { type: mime || file.type || "application/octet-stream" })),
    });
  }
  await loadFromVirtualMap(map, label);
}

/**
 * Shared pipeline: find index.html, build blob URL map for every file,
 * rewrite HTML + CSS so relative links point at those blobs, then load.
 */
async function loadFromVirtualMap(map, label) {
  // Strip a single common top-level folder if present (zip of a folder)
  const paths = [...map.keys()];
  const stripped = stripCommonRoot(paths);
  if (stripped) {
    const next = new Map();
    for (const [p, v] of map) {
      const np = normalizePath(p.replace(stripped.prefix, "") || p);
      next.set(np, { ...v, path: np });
    }
    map = next;
  }

  const entryPath = findIndexHtml([...map.keys()]);
  if (!entryPath) {
    throw new Error("No index.html (or .html file) found in the project");
  }

  // MIME by extension
  const mimeFor = (p) => {
    const lower = p.toLowerCase();
    if (/\.html?$/.test(lower)) return "text/html;charset=utf-8";
    if (/\.css$/.test(lower)) return "text/css;charset=utf-8";
    if (/\.js$/.test(lower) || /\.mjs$/.test(lower)) return "text/javascript;charset=utf-8";
    if (/\.json$/.test(lower)) return "application/json";
    if (/\.svg$/.test(lower)) return "image/svg+xml";
    if (/\.png$/.test(lower)) return "image/png";
    if (/\.jpe?g$/.test(lower)) return "image/jpeg";
    if (/\.gif$/.test(lower)) return "image/gif";
    if (/\.webp$/.test(lower)) return "image/webp";
    if (/\.ico$/.test(lower)) return "image/x-icon";
    if (/\.woff2$/.test(lower)) return "font/woff2";
    if (/\.woff$/.test(lower)) return "font/woff";
    if (/\.ttf$/.test(lower)) return "font/ttf";
    if (/\.otf$/.test(lower)) return "font/otf";
    if (/\.mp4$/.test(lower)) return "video/mp4";
    if (/\.webm$/.test(lower)) return "video/webm";
    if (/\.mp3$/.test(lower)) return "audio/mpeg";
    return "application/octet-stream";
  };

  // First pass: materialize every file as a blob URL (text files get rewritten later if CSS)
  /** @type {Map<string, string>} path → blob URL */
  const urlMap = new Map();
  /** @type {Map<string, string>} path → raw text for html/css */
  const textCache = new Map();

  for (const [path, entry] of map) {
    const mime = mimeFor(path);
    const isText =
      mime.startsWith("text/") ||
      mime === "application/json" ||
      mime === "image/svg+xml";

    if (isText) {
      const text = await entry.asyncText();
      textCache.set(path, text);
      // Temporary blob; CSS will be replaced after rewrite
      const blob = new Blob([text], { type: mime });
      const url = URL.createObjectURL(blob);
      urlMap.set(path, url);
      localAssetUrls.push(url);
    } else {
      const blob = await entry.asyncBlob(mime);
      const url = URL.createObjectURL(blob);
      urlMap.set(path, url);
      localAssetUrls.push(url);
    }
  }

  // Rewrite CSS files (url() and @import) and replace their blob URLs
  for (const [path, text] of textCache) {
    if (!/\.css$/i.test(path)) continue;
    const baseDir = dirOf(path);
    const rewritten = rewriteCss(text, baseDir, urlMap);
    // Revoke old CSS blob and publish new one
    const oldUrl = urlMap.get(path);
    if (oldUrl) {
      URL.revokeObjectURL(oldUrl);
      const idx = localAssetUrls.indexOf(oldUrl);
      if (idx >= 0) localAssetUrls.splice(idx, 1);
    }
    const blob = new Blob([rewritten], { type: "text/css;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    urlMap.set(path, url);
    localAssetUrls.push(url);
  }

  // Rewrite entry HTML
  let html = textCache.get(entryPath);
  if (html == null) {
    throw new Error("Could not read " + entryPath);
  }
  const baseDir = dirOf(entryPath);
  html = rewriteHtml(html, baseDir, urlMap);

  const outBlob = new Blob([html], { type: "text/html;charset=utf-8" });
  localBlobUrl = URL.createObjectURL(outBlob);
  $("#preview-frame").src = localBlobUrl;
  showLocalStatus(`${label} → ${entryPath}`);
  showDeviceFrame();
  toast("Loaded " + entryPath);
}

function findIndexHtml(paths) {
  const exact = paths.find((p) => p === "index.html" || p === "index.htm");
  if (exact) return exact;
  const nested = paths.find((p) => /(^|\/)index\.html?$/i.test(p));
  if (nested) return nested;
  return paths.find((p) => /\.html?$/i.test(p)) || null;
}

/** If every path shares the same first segment, return { prefix } to strip. */
function stripCommonRoot(paths) {
  if (!paths.length) return null;
  const firstSeg = (p) => p.split("/")[0];
  const seg = firstSeg(paths[0]);
  if (!seg || !paths.every((p) => p === seg || p.startsWith(seg + "/"))) return null;
  // Only strip if it looks like a folder (has children)
  if (!paths.some((p) => p.includes("/"))) return null;
  return { prefix: seg + "/" };
}

function normalizePath(p) {
  return p.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
}

function dirOf(path) {
  const i = path.lastIndexOf("/");
  return i >= 0 ? path.slice(0, i + 1) : "";
}

function resolvePath(baseDir, rel) {
  // Strip query/hash
  const clean = rel.split("#")[0].split("?")[0];
  if (!clean || clean.startsWith("data:") || clean.startsWith("blob:") || /^[a-z]+:/i.test(clean)) {
    return null;
  }
  // Absolute path from site root
  if (clean.startsWith("/")) {
    return normalizePath(clean.slice(1));
  }
  const parts = (baseDir + clean).split("/");
  const out = [];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

function lookupUrl(baseDir, rel, urlMap) {
  const resolved = resolvePath(baseDir, rel);
  if (!resolved) return null;
  if (urlMap.has(resolved)) return urlMap.get(resolved);
  // Fallback: basename only
  const base = resolved.split("/").pop();
  if (base && urlMap.has(base)) return urlMap.get(base);
  // Try case-insensitive
  const lower = resolved.toLowerCase();
  for (const [k, v] of urlMap) {
    if (k.toLowerCase() === lower) return v;
  }
  return null;
}

function rewriteHtml(html, baseDir, urlMap) {
  // href, src, data, poster, action (relative only)
  html = html.replace(
    /\b(href|src|data|poster|action)=["']([^"']+)["']/gi,
    (match, attr, path) => {
      if (/^(https?:|data:|blob:|\/\/|#|mailto:|tel:|javascript:)/i.test(path)) return match;
      const url = lookupUrl(baseDir, path, urlMap);
      if (!url) return match;
      return `${attr}="${url}"`;
    }
  );

  // srcset: "a.jpg 1x, b.jpg 2x"
  html = html.replace(/\bsrcset=["']([^"']+)["']/gi, (match, value) => {
    const parts = value.split(",").map((part) => {
      const trimmed = part.trim();
      const m = trimmed.match(/^(\S+)(\s+.+)?$/);
      if (!m) return part;
      const path = m[1];
      const desc = m[2] || "";
      if (/^(https?:|data:|blob:|\/\/)/i.test(path)) return part;
      const url = lookupUrl(baseDir, path, urlMap);
      return url ? url + desc : part;
    });
    return `srcset="${parts.join(", ")}"`;
  });

  // Inline style url(...)
  html = html.replace(/\bstyle=["']([^"']*)["']/gi, (match, style) => {
    const next = rewriteCssUrls(style, baseDir, urlMap);
    return `style="${next}"`;
  });

  return html;
}

function rewriteCss(css, baseDir, urlMap) {
  // @import "..." or @import url(...)
  css = css.replace(/@import\s+(?:url\(\s*)?["']?([^"')\s]+)["']?\s*\)?/gi, (match, path) => {
    if (/^(https?:|data:|blob:|\/\/)/i.test(path)) return match;
    const url = lookupUrl(baseDir, path, urlMap);
    return url ? `@import url("${url}")` : match;
  });
  return rewriteCssUrls(css, baseDir, urlMap);
}

function rewriteCssUrls(css, baseDir, urlMap) {
  return css.replace(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi, (match, path) => {
    const trimmed = path.trim();
    if (/^(https?:|data:|blob:|\/\/|#)/i.test(trimmed)) return match;
    const url = lookupUrl(baseDir, trimmed, urlMap);
    return url ? `url("${url}")` : match;
  });
}

/** Read a dropped DirectoryEntry into path → File map */
async function readDirectoryEntry(dirEntry, base = "") {
  const map = new Map();
  const reader = dirEntry.createReader();

  const readAll = () =>
    new Promise((resolve, reject) => {
      const entries = [];
      const pump = () => {
        reader.readEntries(
          (batch) => {
            if (!batch.length) resolve(entries);
            else {
              entries.push(...batch);
              pump();
            }
          },
          reject
        );
      };
      pump();
    });

  const entries = await readAll();
  for (const entry of entries) {
    const path = normalizePath(base ? `${base}/${entry.name}` : entry.name);
    if (entry.isFile) {
      const file = await new Promise((res, rej) => entry.file(res, rej));
      map.set(path, file);
    } else if (entry.isDirectory) {
      const nested = await readDirectoryEntry(entry, path);
      for (const [k, v] of nested) map.set(k, v);
    }
  }
  return map;
}

function toast(msg, ms = 3000) {
  const el = $("#toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    el.hidden = true;
  }, ms);
}

init();

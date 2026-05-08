/**
 * purify.ts — central DOMPurify gateway.
 *
 * EVERY agent-emitted HTML/SVG MUST pass through this module before reaching
 * the DOM. Server-side bleach/nh3 already runs once; this is the second
 * defense layer (CSP + DOMPurify) for the browser.
 *
 * Constraints:
 *  - No `<script>`, no inline event handlers, no `javascript:` URLs.
 *  - SVG sandbox: only structural + drawing tags. No `<foreignObject>`.
 *  - `target="_blank"` links get `rel="noopener noreferrer"`.
 */
import DOMPurify from "dompurify";

const HTML_BASE_CONFIG: DOMPurify.Config = {
  USE_PROFILES: { html: true },
  ALLOWED_TAGS: [
    "a", "abbr", "address", "article", "aside", "b", "blockquote", "br",
    "button", "caption", "cite", "code", "col", "colgroup", "dd", "details",
    "dfn", "div", "dl", "dt", "em", "figcaption", "figure", "footer",
    "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "i", "img", "kbd",
    "li", "main", "mark", "nav", "ol", "p", "pre", "q", "s", "samp",
    "section", "small", "span", "strong", "sub", "summary", "sup", "table",
    "tbody", "td", "tfoot", "th", "thead", "time", "tr", "u", "ul", "var",
    "video", "source", "picture",
  ],
  ALLOWED_ATTR: [
    "href", "src", "srcset", "alt", "title", "id", "class", "style", "role",
    "aria-label", "aria-describedby", "aria-hidden", "aria-live", "aria-current",
    "data-section", "data-field", "data-block", "loading", "decoding",
    "width", "height", "type", "rel", "target", "controls", "poster",
    "media", "sizes", "colspan", "rowspan", "scope",
  ],
  ALLOW_DATA_ATTR: false,
  ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp|data:image\/(?:png|jpeg|gif|webp|svg\+xml));)|(?:^[^a-z]+(?:[/.#?]|$))/i,
  KEEP_CONTENT: true,
  WHOLE_DOCUMENT: false,
};

const SVG_CONFIG: DOMPurify.Config = {
  USE_PROFILES: { svg: true, svgFilters: false },
  FORBID_TAGS: ["script", "foreignObject", "iframe", "image"],
  FORBID_ATTR: ["onload", "onerror", "onclick", "onmouseover", "xlink:href"],
  KEEP_CONTENT: true,
};

DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node instanceof HTMLAnchorElement) {
    if (node.target === "_blank") {
      node.setAttribute("rel", "noopener noreferrer");
    }
    const href = node.getAttribute("href") ?? "";
    if (href.toLowerCase().startsWith("javascript:")) {
      node.removeAttribute("href");
    }
  }
  if (node instanceof HTMLImageElement && !node.getAttribute("loading")) {
    node.setAttribute("loading", "lazy");
    node.setAttribute("decoding", "async");
  }
});

export function purifyHTML(dirty: string): string {
  if (!dirty) return "";
  return DOMPurify.sanitize(dirty, HTML_BASE_CONFIG) as unknown as string;
}

export function purifySVG(dirty: string): string {
  if (!dirty) return "";
  return DOMPurify.sanitize(dirty, SVG_CONFIG) as unknown as string;
}

/**
 * For iframe srcDoc: wraps purified body with strict CSP meta + reset CSS.
 * Sandbox attribute is enforced at the iframe element level (allow-forms only).
 */
export function buildSandboxedDoc(html: string, css: string = ""): string {
  const safeHTML = purifyHTML(html);
  const safeCSS = css.replace(/<\/?(script|iframe|object|embed)[^>]*>/gi, "");
  const csp = [
    "default-src 'none'",
    "img-src 'self' data: https:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'none'",
    "frame-src 'none'",
    "form-action 'self'",
    "base-uri 'none'",
  ].join("; ");
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<meta name="referrer" content="no-referrer" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>html,body{margin:0;padding:0;background:#09090B;color:#E4E4E7;font-family:Geist,system-ui,sans-serif;}*{box-sizing:border-box;}${safeCSS}</style>
</head><body>${safeHTML}</body></html>`;
}

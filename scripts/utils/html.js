/**
 * utils/html.js
 *
 * Small, dependency-free string/HTML helpers shared across fetchers.
 * Nothing here talks to the network — pure text munging only.
 */

export function stripHtml(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function decodeHtmlEntities(text) {
  if (!text) return "";

  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCharCode(parseInt(code, 16))
    )
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

export function normalizeTitle(title) {
  return decodeHtmlEntities(title)
    .replace(/[–—]/g, "-")
    .replace(/\s*-\s*/g, " - ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractTag(xml, tag) {
  const cdataOpen = `<${tag}><![CDATA[`;
  const cdataClose = `]]></${tag}>`;
  let start = xml.indexOf(cdataOpen);
  if (start !== -1) {
    start += cdataOpen.length;
    const end = xml.indexOf(cdataClose, start);
    if (end !== -1) return xml.slice(start, end).trim();
  }
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  start = xml.indexOf(open);
  if (start === -1) return "";
  start += open.length;
  const end = xml.indexOf(close, start);
  if (end === -1) return "";
  return xml.slice(start, end).trim();
}

export function splitItems(xml) {
  const items = [];
  let pos = 0;
  while (true) {
    const start = xml.indexOf("<item>", pos);
    if (start === -1) break;
    const end = xml.indexOf("</item>", start);
    if (end === -1) break;
    items.push(xml.slice(start, end + "</item>".length));
    pos = end + 1;
  }
  return items;
}

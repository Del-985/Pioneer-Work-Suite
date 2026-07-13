// apps/web/src/utils/documentText.ts

interface DocumentStatistics {
  words: number;
  characters: number;
  charactersWithoutSpaces: number;
  readingMinutes: number;
  paragraphs: number;
  lines: number;
}

export function htmlToPlainText(html: string): string {
  if (!html) {
    return "";
  }

  if (typeof document === "undefined") {
    return html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<li[^>]*>/gi, "• ")
      .replace(/<\/li>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .trim();
  }

  const container = document.createElement("div");
  container.innerHTML = html;

  return (container.innerText || container.textContent || "")
    .replace(/\u00a0/g, " ")
    .replace(/\r\n/g, "\n")
    .trim();
}

export function calculateDocumentStatistics(
  html: string
): DocumentStatistics {
  const plainText = htmlToPlainText(html);
  const words = plainText
    ? plainText.split(/\s+/).filter(Boolean).length
    : 0;

  const normalizedLines = plainText
    ? plainText.split("\n")
    : [];

  const paragraphs = normalizedLines.filter(
    (line) => line.trim().length > 0
  ).length;

  return {
    words,
    characters: plainText.length,
    charactersWithoutSpaces: plainText.replace(/\s/g, "").length,
    readingMinutes: words === 0 ? 0 : Math.max(1, Math.ceil(words / 200)),
    paragraphs,
    lines: normalizedLines.length,
  };
}

export function sanitizeFilename(
  value: string,
  fallback: string = "document"
): string {
  const sanitized = value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/\.+$/g, "")
    .slice(0, 120);

  return sanitized || fallback;
}

function downloadBlob(filename: string, blob: Blob): void {
  if (typeof document === "undefined") {
    return;
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function exportDocumentAsText(
  title: string,
  html: string
): void {
  const filename = `${sanitizeFilename(title)}.txt`;
  const plainText = htmlToPlainText(html);
  const body = title.trim()
    ? `${title.trim()}\n${"=".repeat(Math.min(title.trim().length, 80))}\n\n${plainText}`
    : plainText;

  downloadBlob(
    filename,
    new Blob([body], {
      type: "text/plain;charset=utf-8",
    })
  );
}

export function exportDocumentAsHtml(
  title: string,
  html: string
): void {
  const safeTitle = escapeHtml(title.trim() || "Untitled document");
  const filename = `${sanitizeFilename(title)}.html`;
  const documentHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  <style>
    body {
      max-width: 820px;
      margin: 48px auto;
      padding: 0 24px;
      color: #171a2b;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 16px;
      line-height: 1.65;
    }
    img { max-width: 100%; height: auto; }
    blockquote {
      margin-left: 0;
      padding-left: 16px;
      border-left: 3px solid #aab2d5;
      color: #545d7d;
    }
    pre {
      overflow-x: auto;
      padding: 16px;
      border-radius: 8px;
      background: #f1f3f8;
    }
    .ql-align-center { text-align: center; }
    .ql-align-right { text-align: right; }
    .ql-align-justify { text-align: justify; }
  </style>
</head>
<body>
  <h1>${safeTitle}</h1>
  ${html || "<p></p>"}
</body>
</html>`;

  downloadBlob(
    filename,
    new Blob([documentHtml], {
      type: "text/html;charset=utf-8",
    })
  );
}

export function formatDocumentDate(
  raw?: string | null,
  includeTime: boolean = false
): string {
  if (!raw) {
    return "Unknown";
  }

  const value = new Date(raw);

  if (Number.isNaN(value.getTime())) {
    return "Unknown";
  }

  return value.toLocaleString(
    undefined,
    includeTime
      ? {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }
      : {
          month: "short",
          day: "numeric",
          year: "numeric",
        }
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


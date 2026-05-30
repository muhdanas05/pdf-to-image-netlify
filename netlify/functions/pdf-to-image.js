const mupdf = require("mupdf");

const MAX_PDF_BYTES = 5 * 1024 * 1024; // 5 MB — under Netlify's 6 MB sync body limit
const MAX_PAGES = 100;
const MIN_SCALE = 0.25;
const MAX_SCALE = 4;

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") {
      return cors(204, "");
    }
    if (event.httpMethod !== "POST") {
      return json(405, { error: "method_not_allowed", message: "Use POST." });
    }

    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return json(400, { error: "invalid_json", message: "Request body is not valid JSON." });
    }

    const { pdf, scale } = body;
    if (typeof pdf !== "string" || !pdf) {
      return json(400, { error: "missing_pdf", message: "Body must include 'pdf' as a base64 string." });
    }

    let buffer;
    try {
      const cleaned = pdf.replace(/^data:application\/pdf;base64,/, "");
      buffer = Buffer.from(cleaned, "base64");
    } catch {
      return json(400, { error: "invalid_base64", message: "Could not decode 'pdf' as base64." });
    }
    if (buffer.length === 0) {
      return json(400, { error: "empty_pdf", message: "Decoded PDF is empty." });
    }
    if (buffer.length > MAX_PDF_BYTES) {
      return json(413, {
        error: "pdf_too_large",
        message: `PDF exceeds ${MAX_PDF_BYTES} bytes.`,
        size: buffer.length,
      });
    }
    if (buffer.slice(0, 4).toString("ascii") !== "%PDF") {
      return json(400, { error: "not_a_pdf", message: "File does not start with %PDF header." });
    }

    let renderScale = Number(scale);
    if (!Number.isFinite(renderScale) || renderScale <= 0) renderScale = 2;
    renderScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, renderScale));

    let doc;
    try {
      doc = mupdf.Document.openDocument(buffer, "application/pdf");
    } catch (err) {
      return json(422, {
        error: "pdf_open_failed",
        message: "mupdf could not open the PDF (corrupt or password-protected).",
        detail: errMsg(err),
      });
    }

    let pageCount;
    try {
      pageCount = doc.countPages();
    } catch (err) {
      safeDestroy(doc);
      return json(422, { error: "page_count_failed", message: errMsg(err) });
    }

    if (pageCount === 0) {
      safeDestroy(doc);
      return json(422, { error: "no_pages", message: "PDF has no pages." });
    }
    if (pageCount > MAX_PAGES) {
      safeDestroy(doc);
      return json(413, {
        error: "too_many_pages",
        message: `PDF has ${pageCount} pages; max ${MAX_PAGES}.`,
        pageCount,
      });
    }

    const matrix = mupdf.Matrix.scale(renderScale, renderScale);
    const pages = [];
    const failures = [];

    for (let i = 0; i < pageCount; i++) {
      let page, pixmap;
      try {
        page = doc.loadPage(i);
        pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false, true);
        const png = pixmap.asPNG();
        pages.push(Buffer.from(png).toString("base64"));
      } catch (err) {
        pages.push(null);
        failures.push({ page: i, message: errMsg(err) });
      } finally {
        safeDestroy(pixmap);
        safeDestroy(page);
      }
    }

    safeDestroy(doc);

    const status = failures.length === 0 ? 200 : failures.length === pageCount ? 500 : 207;
    return json(status, {
      ok: failures.length === 0,
      pageCount,
      rendered: pageCount - failures.length,
      mimeType: "image/png",
      scale: renderScale,
      pages,
      failures: failures.length ? failures : undefined,
    });
  } catch (err) {
    console.error("pdf-to-image unhandled error:", err);
    return json(500, {
      error: "internal_error",
      message: "Unexpected failure.",
      detail: errMsg(err),
    });
  }
};

function json(statusCode, payload) {
  return cors(statusCode, JSON.stringify(payload), { "content-type": "application/json" });
}

function cors(statusCode, body, extra = {}) {
  return {
    statusCode,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
      ...extra,
    },
    body,
  };
}

function safeDestroy(obj) {
  if (obj && typeof obj.destroy === "function") {
    try { obj.destroy(); } catch { /* ignore */ }
  }
}

function errMsg(err) {
  if (!err) return "unknown error";
  if (err instanceof Error) return err.message;
  try { return String(err); } catch { return "unstringifiable error"; }
}

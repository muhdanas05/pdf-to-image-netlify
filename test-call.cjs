// Minimal valid 1-page PDF written by hand, then POSTed to the deployed function.
const fs = require("fs");

const pdfSource = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length 55>>stream
BT /F1 24 Tf 50 80 Td (Hello PDF -> PNG) Tj ET
endstream
endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000053 00000 n
0000000098 00000 n
0000000183 00000 n
0000000286 00000 n
trailer<</Size 6/Root 1 0 R>>
startxref
345
%%EOF
`;

const pdfBytes = Buffer.from(pdfSource, "binary");
fs.writeFileSync("sample.pdf", pdfBytes);
const b64 = pdfBytes.toString("base64");

(async () => {
  const url = "https://pdftoimage-anas.netlify.app/.netlify/functions/pdf-to-image";
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pdf: b64, scale: 2 }),
  });
  const text = await res.text();
  console.log("STATUS:", res.status);
  let parsed;
  try { parsed = JSON.parse(text); } catch { console.log("RAW:", text.slice(0, 500)); return; }
  const summary = {
    ...parsed,
    pages: Array.isArray(parsed.pages)
      ? parsed.pages.map((p, i) => p ? `<base64 PNG page ${i + 1}, ${p.length} chars>` : null)
      : parsed.pages,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (Array.isArray(parsed.pages) && parsed.pages[0]) {
    fs.writeFileSync("page-1.png", Buffer.from(parsed.pages[0], "base64"));
    console.log("Saved page-1.png");
  }
})().catch((e) => { console.error("FETCH ERROR:", e); process.exit(1); });

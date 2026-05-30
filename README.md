# PDF → Image Netlify Function

A single Netlify Function that converts a PDF into base64-encoded PNG images, one per page. Uses [`mupdf`](https://www.npmjs.com/package/mupdf) (WASM), so it runs on the Netlify Functions Lambda runtime with no native binaries.

## Install & run locally

```bash
npm install
npx netlify dev
```

## Endpoint

`POST /.netlify/functions/pdf-to-image`

### Request body

```json
{
  "pdf": "<base64-encoded PDF bytes>",
  "scale": 2
}
```

- `pdf` — required. Base64 string. A `data:application/pdf;base64,` prefix is accepted and stripped.
- `scale` — optional. Render scale factor (default `2` ≈ 144 DPI). Higher = larger images.

### Response

```json
{
  "pageCount": 3,
  "mimeType": "image/png",
  "pages": ["<base64 PNG page 1>", "<base64 PNG page 2>", "<base64 PNG page 3>"]
}
```

## Example (curl)

```bash
base64 -w 0 sample.pdf > sample.b64
curl -X POST http://localhost:8888/.netlify/functions/pdf-to-image \
  -H "content-type: application/json" \
  -d "{\"pdf\":\"$(cat sample.b64)\"}"
```

## Notes

- Netlify's synchronous function limits apply: 6 MB request body, 10 s default execution. For large PDFs use background functions or chunk by page.
- The `included_files` entry in `netlify.toml` ensures mupdf's `.wasm` is bundled into the deployed function.

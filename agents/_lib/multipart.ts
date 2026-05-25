/**
 * Lightweight multipart/form-data parser.
 *
 * EdgeOne Pages Functions' Node runtime only returns a raw Buffer for multipart body,
 * and does not provide request.formData(). Here we manually parse boundaries and extract file fields.
 */

export interface ParsedFile {
  fieldName: string;
  fileName: string;
  contentType: string;
  data: Buffer;
}

export interface MultipartResult {
  files: ParsedFile[];
  fields: Record<string, string>;
}

/**
 * Extract boundary from the content-type header
 */
function extractBoundary(contentType: string): string | null {
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^\s;]+))/i);
  return match ? (match[1] ?? match[2] ?? null) : null;
}

/**
 * Parse multipart/form-data Buffer
 */
export function parseMultipart(body: Buffer, contentType: string): MultipartResult {
  const boundary = extractBoundary(contentType);
  if (!boundary) {
    throw new Error("Missing boundary in Content-Type header");
  }

  const result: MultipartResult = { files: [], fields: {} };
  const boundaryBuf = Buffer.from(`--${boundary}`);
  const endBuf = Buffer.from(`--${boundary}--`);

  // Split by boundary
  let pos = 0;
  const parts: Buffer[] = [];

  // Find first boundary
  const firstIdx = body.indexOf(boundaryBuf, pos);
  if (firstIdx === -1) return result;
  pos = firstIdx + boundaryBuf.length;

  // Skip CRLF after first boundary
  if (body[pos] === 0x0d && body[pos + 1] === 0x0a) pos += 2;

  while (pos < body.length) {
    // Find next boundary
    const nextIdx = body.indexOf(boundaryBuf, pos);
    if (nextIdx === -1) break;

    // Content is between pos and nextIdx (minus trailing CRLF before boundary)
    let endPos = nextIdx;
    if (endPos >= 2 && body[endPos - 2] === 0x0d && body[endPos - 1] === 0x0a) {
      endPos -= 2;
    }

    const part = body.subarray(pos, endPos);
    parts.push(part);

    // Move past boundary
    pos = nextIdx + boundaryBuf.length;
    // Check if this is the end boundary
    if (body[pos] === 0x2d && body[pos + 1] === 0x2d) break; // "--"
    // Skip CRLF
    if (body[pos] === 0x0d && body[pos + 1] === 0x0a) pos += 2;
  }

  // Parse each part
  for (const part of parts) {
    // Find header/body separator (double CRLF)
    const sepIdx = findDoubleCRLF(part);
    if (sepIdx === -1) continue;

    const headerBuf = part.subarray(0, sepIdx);
    const bodyBuf = part.subarray(sepIdx + 4); // skip \r\n\r\n

    const headers = headerBuf.toString("utf-8");
    const disposition = headers.match(
      /Content-Disposition:\s*form-data;\s*([^\r\n]+)/i,
    );
    if (!disposition) continue;

    const nameMatch = disposition[1]!.match(/name="([^"]+)"/);
    const fileNameMatch = disposition[1]!.match(/filename="([^"]+)"/);
    const ctMatch = headers.match(/Content-Type:\s*([^\r\n]+)/i);

    const fieldName = nameMatch?.[1] ?? "unknown";

    if (fileNameMatch) {
      result.files.push({
        fieldName,
        fileName: fileNameMatch[1]!,
        contentType: ctMatch?.[1]?.trim() ?? "application/octet-stream",
        data: Buffer.from(bodyBuf),
      });
    } else {
      result.fields[fieldName] = bodyBuf.toString("utf-8");
    }
  }

  return result;
}

function findDoubleCRLF(buf: Buffer): number {
  for (let i = 0; i < buf.length - 3; i++) {
    if (
      buf[i] === 0x0d &&
      buf[i + 1] === 0x0a &&
      buf[i + 2] === 0x0d &&
      buf[i + 3] === 0x0a
    ) {
      return i;
    }
  }
  return -1;
}

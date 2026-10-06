// Minimal multipart/form-data parser (no external deps). Handles standard browser-generated
// multipart bodies: text fields + file fields, single boundary, no nested multipart.

function parseMultipart(buffer, contentType) {
  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/.exec(contentType || '');
  if (!boundaryMatch) throw new Error('No multipart boundary found');
  const boundary = '--' + (boundaryMatch[1] || boundaryMatch[2]).trim();
  const boundaryBuf = Buffer.from(boundary, 'utf8');

  const parts = [];
  let start = buffer.indexOf(boundaryBuf);
  while (start !== -1) {
    const next = buffer.indexOf(boundaryBuf, start + boundaryBuf.length);
    if (next === -1) break;
    // part content is between end of this boundary line and start of next boundary,
    // trimmed of the leading \r\n and trailing \r\n
    let partStart = start + boundaryBuf.length;
    // skip possible "--" (end marker) or \r\n
    if (buffer.slice(partStart, partStart + 2).toString() === '--') break;
    if (buffer.slice(partStart, partStart + 2).toString() === '\r\n') partStart += 2;
    let partEnd = next;
    if (buffer.slice(partEnd - 2, partEnd).toString() === '\r\n') partEnd -= 2;
    const partBuf = buffer.slice(partStart, partEnd);
    parts.push(partBuf);
    start = next;
  }

  const fields = {};
  const files = [];

  for (const part of parts) {
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;
    const headerText = part.slice(0, headerEnd).toString('utf8');
    const body = part.slice(headerEnd + 4);

    const nameMatch = /name="([^"]+)"/.exec(headerText);
    const filenameMatch = /filename="([^"]*)"/.exec(headerText);
    const ctMatch = /Content-Type:\s*([^\r\n]+)/i.exec(headerText);
    const fieldName = nameMatch ? nameMatch[1] : null;
    if (!fieldName) continue;

    if (filenameMatch) {
      files.push({
        fieldName,
        filename: filenameMatch[1],
        contentType: ctMatch ? ctMatch[1].trim() : 'application/octet-stream',
        data: body,
      });
    } else {
      fields[fieldName] = body.toString('utf8');
    }
  }

  return { fields, files };
}

module.exports = { parseMultipart };

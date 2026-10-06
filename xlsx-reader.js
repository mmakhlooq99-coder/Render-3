// From-scratch .xlsx (Office Open XML) reader using only Node built-ins (zlib + buffers).
// .xlsx is a ZIP of XML files. We parse the ZIP central directory ourselves, inflate the two
// files we need (shared strings + first worksheet), and extract cell values with light regex
// parsing (no XML DOM library available).
const zlib = require('node:zlib');

function readZipEntries(buf) {
  // Locate End Of Central Directory record (scan from end; comment field is usually empty).
  const EOCD_SIG = 0x06054b50;
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65536); i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) throw new Error('Not a valid .xlsx file (ZIP EOCD not found)');

  const cdOffset = buf.readUInt32LE(eocdOffset + 16);
  const cdEntryCount = buf.readUInt16LE(eocdOffset + 10);

  const entries = {};
  let ptr = cdOffset;
  const CD_SIG = 0x02014b50;
  for (let i = 0; i < cdEntryCount; i++) {
    if (buf.readUInt32LE(ptr) !== CD_SIG) break;
    const compMethod = buf.readUInt16LE(ptr + 10);
    const compSize = buf.readUInt32LE(ptr + 20);
    const uncompSize = buf.readUInt32LE(ptr + 24);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localHeaderOffset = buf.readUInt32LE(ptr + 42);
    const name = buf.toString('utf8', ptr + 46, ptr + 46 + nameLen);
    entries[name] = { compMethod, compSize, uncompSize, localHeaderOffset };
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function readZipFile(buf, entries, name) {
  const entry = entries[name];
  if (!entry) return null;
  const LFH_SIG = 0x04034b50;
  const off = entry.localHeaderOffset;
  if (buf.readUInt32LE(off) !== LFH_SIG) throw new Error('Bad local file header for ' + name);
  const nameLen = buf.readUInt16LE(off + 26);
  const extraLen = buf.readUInt16LE(off + 28);
  const dataStart = off + 30 + nameLen + extraLen;
  const compressed = buf.subarray(dataStart, dataStart + entry.compSize);
  if (entry.compMethod === 0) return compressed; // stored
  if (entry.compMethod === 8) return zlib.inflateRawSync(compressed); // deflate
  throw new Error('Unsupported compression method ' + entry.compMethod + ' for ' + name);
}

function decodeXmlEntities(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, '&');
}

function parseSharedStrings(xml) {
  if (!xml) return [];
  const text = xml.toString('utf8');
  const strings = [];
  const siRegex = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = siRegex.exec(text))) {
    const inner = m[1];
    const tRegex = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let tm;
    let combined = '';
    let found = false;
    while ((tm = tRegex.exec(inner))) {
      combined += decodeXmlEntities(tm[1]);
      found = true;
    }
    strings.push(found ? combined : '');
  }
  return strings;
}

function colLetterToIndex(letters) {
  let idx = 0;
  for (let i = 0; i < letters.length; i++) {
    idx = idx * 26 + (letters.charCodeAt(i) - 64);
  }
  return idx - 1; // 0-based
}

function parseSheet(xml, sharedStrings) {
  const text = xml.toString('utf8');
  const rows = [];
  const rowRegex = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rm;
  while ((rm = rowRegex.exec(text))) {
    const rowInner = rm[1];
    const cellRegex = /<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g;
    const rowCells = [];
    let cm;
    while ((cm = cellRegex.exec(rowInner))) {
      const attrs = cm[1] !== undefined ? cm[1] : cm[3];
      const inner = cm[2] || '';
      const refMatch = /r="([A-Z]+)(\d+)"/.exec(attrs);
      const colIdx = refMatch ? colLetterToIndex(refMatch[1]) : rowCells.length;
      const typeMatch = /t="([^"]+)"/.exec(attrs);
      const type = typeMatch ? typeMatch[1] : 'n';

      let value = '';
      if (type === 's') {
        const vMatch = /<v>([\s\S]*?)<\/v>/.exec(inner);
        const idx = vMatch ? parseInt(vMatch[1], 10) : -1;
        value = sharedStrings[idx] !== undefined ? sharedStrings[idx] : '';
      } else if (type === 'inlineStr') {
        const tMatch = /<t[^>]*>([\s\S]*?)<\/t>/.exec(inner);
        value = tMatch ? decodeXmlEntities(tMatch[1]) : '';
      } else if (type === 'str' || type === 'n' || !typeMatch) {
        const vMatch = /<v>([\s\S]*?)<\/v>/.exec(inner);
        value = vMatch ? decodeXmlEntities(vMatch[1]) : '';
      } else {
        const vMatch = /<v>([\s\S]*?)<\/v>/.exec(inner);
        value = vMatch ? decodeXmlEntities(vMatch[1]) : '';
      }
      rowCells[colIdx] = value;
    }
    // fill gaps with empty strings
    for (let i = 0; i < rowCells.length; i++) if (rowCells[i] === undefined) rowCells[i] = '';
    rows.push(rowCells);
  }
  return rows;
}

function parseXlsxBuffer(buf) {
  const entries = readZipEntries(buf);
  const sheetName =
    Object.keys(entries).find((n) => n === 'xl/worksheets/sheet1.xml') ||
    Object.keys(entries).find((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  if (!sheetName) throw new Error('No worksheet found in .xlsx file');

  const sharedStringsBuf = readZipFile(buf, entries, 'xl/sharedStrings.xml');
  const sheetBuf = readZipFile(buf, entries, sheetName);

  const sharedStrings = parseSharedStrings(sharedStringsBuf);
  const rows = parseSheet(sheetBuf, sharedStrings);
  return rows;
}

module.exports = { parseXlsxBuffer };

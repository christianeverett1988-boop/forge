// Minimal zip reader for the Apple Health "Export All Health Data" file. It finds export.xml in the zip's
// directory (reading only the end of the file) and streams that one entry out, decompressed, without ever
// holding the zip (often 1 GB or more) in memory. Nothing is uploaded: this all happens on the phone.
// Handles stored and deflate entries, and zip64 (big exports).

const u16 = (v, o) => v.getUint16(o, true);
const u32 = (v, o) => v.getUint32(o, true);
const u64 = (v, o) => Number(v.getBigUint64(o, true));

async function bytes(file, start, end) {
  return new DataView(await file.slice(start, end).arrayBuffer());
}

/** The central directory: [{ name, method, csize, usize, offset }]. */
export async function listEntries(file) {
  const tailLen = Math.min(file.size, 66000);
  const tail = await bytes(file, file.size - tailLen, file.size);
  let e = -1;
  for (let i = tailLen - 22; i >= 0; i--) if (u32(tail, i) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('That doesn’t look like a zip file.');
  let count = u16(tail, e + 10);
  let cdSize = u32(tail, e + 12);
  let cdOffset = u32(tail, e + 16);
  if (cdOffset === 0xffffffff || cdSize === 0xffffffff || count === 0xffff) {
    // zip64: the locator sits right before the end record and points at the zip64 end record
    if (e < 20 || u32(tail, e - 20) !== 0x07064b50) throw new Error('This zip file is damaged.');
    const z = await bytes(file, u64(tail, e - 20 + 8), u64(tail, e - 20 + 8) + 56);
    if (u32(z, 0) !== 0x06064b50) throw new Error('This zip file is damaged.');
    count = u64(z, 32);
    cdSize = u64(z, 40);
    cdOffset = u64(z, 48);
  }
  const cd = await bytes(file, cdOffset, cdOffset + cdSize);
  const dec = new TextDecoder();
  const out = [];
  let p = 0;
  for (let n = 0; n < count && p + 46 <= cd.byteLength; n++) {
    if (u32(cd, p) !== 0x02014b50) throw new Error('This zip file is damaged.');
    const method = u16(cd, p + 10);
    let csize = u32(cd, p + 20);
    let usize = u32(cd, p + 24);
    const nameLen = u16(cd, p + 28);
    const extraLen = u16(cd, p + 30);
    const commentLen = u16(cd, p + 32);
    let offset = u32(cd, p + 42);
    const name = dec.decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nameLen));
    // zip64 extra field: only the fields that were 0xFFFFFFFF are present, in this order
    let x = p + 46 + nameLen;
    const xEnd = x + extraLen;
    while (x + 4 <= xEnd) {
      const id = u16(cd, x);
      const len = u16(cd, x + 2);
      if (id === 0x0001) {
        let q = x + 4;
        if (usize === 0xffffffff) { usize = u64(cd, q); q += 8; }
        if (csize === 0xffffffff) { csize = u64(cd, q); q += 8; }
        if (offset === 0xffffffff) offset = u64(cd, q);
      }
      x += 4 + len;
    }
    out.push({ name, method, csize, usize, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** Is this entry the main export file (not export_cda.xml, not the ECG or route files)? */
export const isExportXml = (name) => /(^|\/)export\.xml$/i.test(name);

/** A stream of the entry's bytes, decompressed. onProgress(0..1) reports how much of it has been read. */
export async function entryStream(file, entry, onProgress = () => {}) {
  const head = await bytes(file, entry.offset, entry.offset + 30);
  if (u32(head, 0) !== 0x04034b50) throw new Error('This zip file is damaged.');
  const start = entry.offset + 30 + u16(head, 26) + u16(head, 28);
  let read = 0;
  const counter = new TransformStream({
    transform(chunk, ctl) {
      read += chunk.byteLength;
      onProgress(Math.min(1, read / Math.max(1, entry.csize)));
      ctl.enqueue(chunk);
    },
  });
  const raw = file.slice(start, start + entry.csize).stream().pipeThrough(counter);
  if (entry.method === 0) return raw;
  if (entry.method !== 8) throw new Error('This zip uses a compression Forge can’t read.');
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser can’t unzip files. Update iOS, or unzip the file in Files and choose export.xml.');
  return raw.pipeThrough(new DecompressionStream('deflate-raw'));
}

/** Text chunks of export.xml from a zip file, or from a plain export.xml picked directly. */
export async function exportTextStream(file, onProgress) {
  if (/\.xml$/i.test(file.name || '')) {
    let read = 0;
    const counter = new TransformStream({ transform(c, ctl) { read += c.byteLength; onProgress && onProgress(Math.min(1, read / Math.max(1, file.size))); ctl.enqueue(c); } });
    return file.stream().pipeThrough(counter).pipeThrough(new TextDecoderStream());
  }
  const entries = await listEntries(file);
  const entry = entries.find((x) => isExportXml(x.name));
  if (!entry) throw new Error('I couldn’t find export.xml inside that zip. Choose the file from Health → your profile → Export All Health Data.');
  return (await entryStream(file, entry, onProgress)).pipeThrough(new TextDecoderStream());
}

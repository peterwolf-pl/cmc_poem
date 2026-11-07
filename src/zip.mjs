/** Dependency-free, standards-compliant ZIP (stored entries, CRC32, UTF-8 names). */
function crc32(data) {
  let crc = 0xffffffff;
  for (const b of data) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
const encode = text => new TextEncoder().encode(text);
export function packZip(files) {
  if (!Array.isArray(files) || files.length > 600 || !files.length)
    throw new Error('Archiwum ZIP wymaga od 1 do 600 plików.');
  const entries = [];
  let localSize = 0, centralSize = 0;
  for (const f of files) {
    if (!f || typeof f.name !== 'string' || !f.name || /[\\]/.test(f.name) || f.name.includes('..'))
      throw new Error('Nieprawidłowa nazwa pliku ZIP.');
    const name = encode(f.name), data = encode(f.content);
    if (name.length > 65535 || data.length > 1e8) throw new Error('Plik za duży do ZIP.');
    const crc = crc32(data);
    entries.push({name,data,crc,localOffset:localSize});
    localSize += 30 + name.length + data.length;
    centralSize += 46 + name.length;
  }
  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);
  let pos = 0;
  const u16 = v => {view.setUint16(pos,v,true);pos+=2;};
  const u32 = v => {view.setUint32(pos,v,true);pos+=4;};
  const bytes = b => {out.set(b,pos);pos+=b.length;};
  for (const e of entries) {
    u32(0x04034b50);u16(20);u16(0x0800);u16(0);u16(0);u16(0);
    u32(e.crc);u32(e.data.length);u32(e.data.length);u16(e.name.length);u16(0);
    bytes(e.name);bytes(e.data);
  }
  const cdStart=pos;
  for (const e of entries) {
    u32(0x02014b50);u16(20);u16(20);u16(0x0800);u16(0);u16(0);u16(0);
    u32(e.crc);u32(e.data.length);u32(e.data.length);
    u16(e.name.length);u16(0);u16(0);u16(0);u16(0);u32(0);u32(e.localOffset);
    bytes(e.name);
  }
  u32(0x06054b50);u16(0);u16(0);u16(entries.length);u16(entries.length);
  u32(pos-cdStart);u32(cdStart);u16(0);
  return out;
}

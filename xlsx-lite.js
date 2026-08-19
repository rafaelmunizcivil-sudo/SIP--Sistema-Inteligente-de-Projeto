// Leitor mínimo de .xlsx no browser (sem libs externas): descompacta o zip via
// DecompressionStream nativo e faz parse manual do XML da primeira planilha.
// Uso: const rows = await parseXlsxFile(file); // rows: [{numero, valor}, ...]

function readUint32LE(b, o) { return b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24); }
function readUint16LE(b, o) { return b[o] | (b[o + 1] << 8); }

function parseSharedStrings(xml) {
  const items = [];
  const siRegex = /<si>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = siRegex.exec(xml))) {
    const content = m[1];
    const tRegex = /<t[^>]*>([\s\S]*?)<\/t>/g;
    let text = '';
    let tm;
    while ((tm = tRegex.exec(content))) text += tm[1];
    text = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
    items.push(text);
  }
  return items;
}

async function unzip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x05 && buf[i + 3] === 0x06) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Arquivo não parece ser um .xlsx válido.');
  const cdOffset = readUint32LE(buf, eocd + 16);
  const cdCount = readUint16LE(buf, eocd + 10);
  const entries = [];
  let p = cdOffset;
  for (let i = 0; i < cdCount; i++) {
    const method = readUint16LE(buf, p + 10);
    const compSize = readUint32LE(buf, p + 20);
    const nameLen = readUint16LE(buf, p + 28);
    const extraLen = readUint16LE(buf, p + 30);
    const commentLen = readUint16LE(buf, p + 32);
    const localHeaderOffset = readUint32LE(buf, p + 42);
    const name = new TextDecoder('utf-8').decode(buf.slice(p + 46, p + 46 + nameLen));
    entries.push({ name, method, compSize, localHeaderOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  async function extract(name) {
    const e = entries.find(x => x.name === name);
    if (!e) return null;
    const lp = e.localHeaderOffset;
    const nameLen = readUint16LE(buf, lp + 26);
    const extraLen = readUint16LE(buf, lp + 28);
    const dataStart = lp + 30 + nameLen + extraLen;
    const compData = buf.slice(dataStart, dataStart + e.compSize);
    let outBuf;
    if (e.method === 0) {
      outBuf = compData;
    } else {
      const ds = new DecompressionStream('deflate-raw');
      const writer = ds.writable.getWriter();
      writer.write(compData);
      writer.close();
      const resp = new Response(ds.readable);
      outBuf = new Uint8Array(await resp.arrayBuffer());
    }
    return new TextDecoder('utf-8').decode(outBuf);
  }
  return extract;
}

function parseSheetRows(sheetXml, sst) {
  const rows = [];
  const rowRegex = /<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  let rm;
  while ((rm = rowRegex.exec(sheetXml))) {
    const rowNum = parseInt(rm[1]);
    const rowContent = rm[2];
    const cellRegex = /<c ([^>]*)>([\s\S]*?)<\/c>/g;
    let cm;
    const rowData = {};
    while ((cm = cellRegex.exec(rowContent))) {
      const attrs = cm[1];
      const inner = cm[2];
      const rMatch = /r="([A-Z]+)(\d+)"/.exec(attrs);
      if (!rMatch) continue;
      const col = rMatch[1];
      const tMatch = /\st="([^"]*)"/.exec(attrs);
      const type = tMatch ? tMatch[1] : null;
      let text;
      if (type === 's') {
        const vm = /<v>([\s\S]*?)<\/v>/.exec(inner);
        text = vm ? sst[parseInt(vm[1])] : '';
      } else if (type === 'inlineStr') {
        const vm = /<t[^>]*>([\s\S]*?)<\/t>/.exec(inner);
        text = vm ? vm[1] : '';
      } else {
        const vm = /<v>([\s\S]*?)<\/v>/.exec(inner);
        text = vm ? vm[1] : undefined;
      }
      rowData[col] = text;
    }
    rows.push({ rowNum, data: rowData });
  }
  return rows;
}

// Espera colunas: A = Item (número), B = Descrição (só referência, ignorada),
// C = Valor Medido no Mês (R$). Linha 1 = cabeçalho.
export async function parseXlsxFile(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const extract = await unzip(buf);
  const sharedStringsXml = (await extract('xl/sharedStrings.xml')) || '';
  const sheetXml = await extract('xl/worksheets/sheet1.xml');
  if (!sheetXml) throw new Error('Não encontrei a planilha dentro do arquivo.');
  const sst = parseSharedStrings(sharedStringsXml);
  const rows = parseSheetRows(sheetXml, sst);
  const out = [];
  for (const r of rows) {
    if (r.rowNum === 1) continue; // cabeçalho
    const numero = parseInt(r.data.A);
    const valorRaw = r.data.C;
    if (!numero || valorRaw === undefined || valorRaw === '') continue;
    const valor = parseFloat(valorRaw);
    if (isNaN(valor)) continue;
    out.push({ numero, valor });
  }
  return out;
}

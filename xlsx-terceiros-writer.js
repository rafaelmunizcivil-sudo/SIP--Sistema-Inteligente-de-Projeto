// Gerador de .xlsx real a partir do modelo "Gestão Orçamentária e Controle de Terceiros":
// baixa o modelo, preenche só as colunas de entrada (mantendo fórmulas, validação e
// formatação intactas) e devolve um Blob para download. Sem libs externas.

function readU32(b, o) { return b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24); }
function readU16(b, o) { return b[o] | (b[o + 1] << 8); }

async function unzipAll(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x05 && buf[i + 3] === 0x06) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Modelo .xlsx inválido.');
  const cdOffset = readU32(buf, eocd + 16);
  const cdCount = readU16(buf, eocd + 10);
  const entries = [];
  let p = cdOffset;
  for (let i = 0; i < cdCount; i++) {
    const method = readU16(buf, p + 10);
    const compSize = readU32(buf, p + 20);
    const nameLen = readU16(buf, p + 28);
    const extraLen = readU16(buf, p + 30);
    const commentLen = readU16(buf, p + 32);
    const localHeaderOffset = readU32(buf, p + 42);
    const name = new TextDecoder('utf-8').decode(buf.slice(p + 46, p + 46 + nameLen));
    entries.push({ name, method, compSize, localHeaderOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  const out = {};
  for (const e of entries) {
    const lp = e.localHeaderOffset;
    const nameLen = readU16(buf, lp + 26);
    const extraLen = readU16(buf, lp + 28);
    const dataStart = lp + 30 + nameLen + extraLen;
    const compData = buf.slice(dataStart, dataStart + e.compSize);
    let outBuf;
    if (e.method === 0) outBuf = compData;
    else {
      const ds = new DecompressionStream('deflate-raw');
      const writer = ds.writable.getWriter();
      writer.write(compData); writer.close();
      outBuf = new Uint8Array(await new Response(ds.readable).arrayBuffer());
    }
    out[e.name] = outBuf;
  }
  return out;
}

function crc32(bytes) {
  let table = crc32._table;
  if (!table) {
    table = crc32._table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// Zip "store" (sem compressão) — suficiente e válido para .xlsx.
function zipStore(files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  const enc = new TextEncoder();
  for (const name of Object.keys(files)) {
    const data = files[name];
    const nameBytes = enc.encode(name);
    const crc = crc32(data);
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const dv = new DataView(localHeader.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 0, true);
    dv.setUint16(8, 0, true);
    dv.setUint16(10, 0, true);
    dv.setUint16(12, 0, true);
    dv.setUint32(14, crc, true);
    dv.setUint32(18, data.length, true);
    dv.setUint32(22, data.length, true);
    dv.setUint16(26, nameBytes.length, true);
    dv.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);
    chunks.push(localHeader, data);
    const cdHeader = new Uint8Array(46 + nameBytes.length);
    const cdv = new DataView(cdHeader.buffer);
    cdv.setUint32(0, 0x02014b50, true);
    cdv.setUint16(4, 20, true);
    cdv.setUint16(6, 20, true);
    cdv.setUint16(8, 0, true);
    cdv.setUint16(10, 0, true);
    cdv.setUint16(12, 0, true);
    cdv.setUint16(14, 0, true);
    cdv.setUint32(16, crc, true);
    cdv.setUint32(20, data.length, true);
    cdv.setUint32(24, data.length, true);
    cdv.setUint16(28, nameBytes.length, true);
    cdv.setUint16(30, 0, true);
    cdv.setUint16(32, 0, true);
    cdv.setUint16(34, 0, true);
    cdv.setUint16(36, 0, true);
    cdv.setUint32(38, 0, true);
    cdv.setUint32(42, offset, true);
    cdHeader.set(nameBytes, 46);
    central.push(cdHeader);
    offset += localHeader.length + data.length;
  }
  const cdStart = offset;
  let cdSize = 0;
  for (const c of central) cdSize += c.length;
  const eocd = new Uint8Array(22);
  const edv = new DataView(eocd.buffer);
  edv.setUint32(0, 0x06054b50, true);
  edv.setUint16(4, 0, true);
  edv.setUint16(6, 0, true);
  edv.setUint16(8, central.length, true);
  edv.setUint16(10, central.length, true);
  edv.setUint32(12, cdSize, true);
  edv.setUint32(16, cdStart, true);
  edv.setUint16(20, 0, true);
  const all = [...chunks, ...central, eocd];
  const total = all.reduce((s, a) => s + a.length, 0);
  const result = new Uint8Array(total);
  let pos = 0;
  for (const a of all) { result.set(a, pos); pos += a.length; }
  return result;
}

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Substitui/limpa uma célula <c r="COLn" .../> preservando o estilo (s="..") original.
function setCell(rowXml, ref, spec) {
  const re = new RegExp('<c r="' + ref + '"([^>]*?)(?:/>|>[\\s\\S]*?</c>)');
  const m = rowXml.match(re);
  const styleAttr = m ? (m[1].match(/\ss="(\d+)"/) || [])[1] : null;
  const sPart = styleAttr ? ' s="' + styleAttr + '"' : '';
  let newCell;
  if (spec == null || spec.value == null || spec.value === '') {
    newCell = '<c r="' + ref + '"' + sPart + '/>';
  } else if (spec.type === 'n') {
    newCell = '<c r="' + ref + '"' + sPart + '><v>' + spec.value + '</v></c>';
  } else {
    newCell = '<c r="' + ref + '"' + sPart + ' t="inlineStr"><is><t xml:space="preserve">' + escapeXml(spec.value) + '</t></is></c>';
  }
  if (m) return rowXml.replace(re, newCell);
  return rowXml + newCell; // não deveria ocorrer no modelo esperado, mas evita perder dado
}

// items: [{ seq, item, descricao, unidade, qtdContrato, precoUnitContrato, empresa,
//           qtdTerceiro, precoUnitTerceiro }], no máximo 25 (linhas 7..31 do modelo).
// descricoes: lista (strings) vinda da Medição do projeto — vira a aba ListaDescricoes.
// i0/iref: índice de reajuste global (mesmos valores usados no dashboard).
export async function buildTerceirosXlsx(templateUrl, { items, descricoes, i0, iref }) {
  const resp = await fetch(templateUrl);
  const buf = new Uint8Array(await resp.arrayBuffer());
  const files = await unzipAll(buf);
  const dec = new TextDecoder('utf-8'), enc = new TextEncoder();

  // 1) Índice de reajuste global (I3/I4).
  let sheet1 = dec.decode(files['xl/worksheets/sheet1.xml']);
  const row3 = sheet1.match(/<row r="3"[^>]*>([\s\S]*?)<\/row>/)[0];
  const row4 = sheet1.match(/<row r="4"[^>]*>([\s\S]*?)<\/row>/)[0];
  sheet1 = sheet1.replace(row3, setCell(row3, 'I3', { type: 'n', value: i0 }));
  sheet1 = sheet1.replace(row4, setCell(row4, 'I4', { type: 'n', value: iref }));

  // 2) Linhas de itens (7..31 — 25 linhas fixas do modelo).
  for (let i = 0; i < 25; i++) {
    const rowNum = 7 + i;
    const it = items[i];
    const rowMatch = sheet1.match(new RegExp('<row r="' + rowNum + '"[^>]*>[\\s\\S]*?</row>'));
    if (!rowMatch) continue;
    let rowXml = rowMatch[0];
    const R = (col) => col + rowNum;
    if (it) {
      rowXml = setCell(rowXml, R('A'), { type: 'n', value: it.seq });
      rowXml = setCell(rowXml, R('B'), { type: 'n', value: it.item });
      rowXml = setCell(rowXml, R('C'), { type: 's', value: it.descricao });
      rowXml = setCell(rowXml, R('D'), { type: 's', value: it.unidade });
      rowXml = setCell(rowXml, R('E'), { type: 'n', value: it.qtdContrato });
      rowXml = setCell(rowXml, R('F'), { type: 'n', value: it.precoUnitContrato });
      rowXml = setCell(rowXml, R('J'), { type: 's', value: it.empresa });
      rowXml = setCell(rowXml, R('K'), it.qtdTerceiro != null ? { type: 'n', value: it.qtdTerceiro } : null);
      rowXml = setCell(rowXml, R('L'), it.precoUnitTerceiro != null ? { type: 'n', value: it.precoUnitTerceiro } : null);
      // N (Valor Pago ao terceiro), R/S/T (datas e nº de medição) — não existem no nosso
      // modelo de dados hoje; ficam em branco (nunca inventar valor).
    }
    sheet1 = sheet1.replace(rowMatch[0], rowXml);
  }
  files['xl/worksheets/sheet1.xml'] = enc.encode(sheet1);

  // 3) Lista de descrições (ListaDescricoes) — espelha a Medição do projeto, fonte única.
  let sheet2 = dec.decode(files['xl/worksheets/sheet2.xml']);
  const sheetDataMatch = sheet2.match(/<sheetData>[\s\S]*?<\/sheetData>/);
  const headerRowMatch = sheet2.match(/<row r="1"[^>]*>[\s\S]*?<\/row>/);
  const sampleCellStyle = (sheet2.match(/<row r="2"[^>]*><c r="A2"([^>]*?)(?:\/>|>)/) || [])[1] || '';
  const sPart = (sampleCellStyle.match(/\ss="(\d+)"/) || [])[0] || '';
  const uniqueDescricoes = [...new Set(descricoes.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const rowsXml = headerRowMatch[0] + uniqueDescricoes.map((d, i) =>
    '<row r="' + (i + 2) + '"><c r="A' + (i + 2) + '"' + sPart + ' t="inlineStr"><is><t xml:space="preserve">' + escapeXml(d) + '</t></is></c></row>'
  ).join('');
  sheet2 = sheet2.replace(sheetDataMatch[0], '<sheetData>' + rowsXml + '</sheetData>');
  files['xl/worksheets/sheet2.xml'] = enc.encode(sheet2);

  // 4) Força recálculo das fórmulas ao abrir (senão ficam com o valor em cache, zerado).
  let wb = dec.decode(files['xl/workbook.xml']);
  wb = wb.replace(/<calcPr /, '<calcPr fullCalcOnLoad="true" ');
  files['xl/workbook.xml'] = enc.encode(wb);

  const zipped = zipStore(files);
  return new Blob([zipped], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

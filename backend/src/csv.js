// Parser de CSV simples e robusto (lida com campos entre aspas, vírgulas e
// quebras de linha dentro de aspas). Evita dependência externa.

export function parseCsv(text) {
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++; // aspas escapadas ("")
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c === '\r') {
      // ignora; a quebra vem no \n
    } else {
      field += c;
    }
  }

  // último campo/linha (se o arquivo não terminar com \n)
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

// Converte o CSV em uma lista de objetos usando a primeira linha como cabeçalho.
export function csvToObjects(text) {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];

  const header = rows[0].map((h) => h.trim());
  const out = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    // ignora linhas totalmente vazias
    if (r.length === 1 && r[0].trim() === '') continue;
    const obj = {};
    header.forEach((key, idx) => {
      obj[key] = r[idx] ?? '';
    });
    out.push(obj);
  }

  return out;
}

// Gera CSV a partir de uma lista de objetos e uma ordem de colunas.
export function objectsToCsv(items, columns) {
  const escape = (v) => {
    const s = v == null ? '' : String(v);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const head = columns.map(escape).join(',');
  const body = items
    .map((item) => columns.map((col) => escape(item[col])).join(','))
    .join('\n');
  return head + '\n' + body + '\n';
}

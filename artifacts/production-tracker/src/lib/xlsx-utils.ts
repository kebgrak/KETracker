import ExcelJS from "exceljs";

export async function exportToXlsx(
  sheets: Array<{
    name: string;
    rows: Record<string, unknown>[];
    colWidths?: number[];
  }>,
  filename: string
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  for (const { name, rows, colWidths } of sheets) {
    const ws = wb.addWorksheet(name);
    if (rows.length > 0) {
      const keys = Object.keys(rows[0]);
      ws.columns = keys.map((key, i) => ({
        header: key,
        key,
        width: colWidths?.[i] ?? 16,
      }));
      ws.addRows(rows);
    }
  }
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function parseCSVText(text: string): Record<string, unknown>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return [];

  function splitCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  }

  const headers = splitCSVLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = splitCSVLine(line);
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      obj[h] = values[i] ?? "";
    });
    return obj;
  });
}

export async function importFromFile(
  file: File
): Promise<Record<string, unknown>[]> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

  if (ext === "csv") {
    const text = await file.text();
    return parseCSVText(text);
  }

  if (ext === "xlsx") {
    const data = await file.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(data);
    const ws = wb.worksheets[0];
    if (!ws) return [];
    const headers: string[] = [];
    const rows: Record<string, unknown>[] = [];
    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        row.eachCell({ includeEmpty: true }, (cell) => {
          headers.push(String(cell.value ?? ""));
        });
      } else {
        const obj: Record<string, unknown> = {};
        headers.forEach((header, i) => {
          const cell = row.getCell(i + 1);
          obj[header] = cell.value ?? "";
        });
        rows.push(obj);
      }
    });
    return rows;
  }

  throw new Error(`Unsupported file format ".${ext}". Please use .xlsx or .csv.`);
}

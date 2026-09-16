import type { ScheduleRow } from './types'

/**
 * Reading a payroll schedule out of a CSV file.
 *
 * Every MDA exports a slightly different one. Column names vary, the order
 * varies, some quote and some do not, and the file that arrives is whatever the
 * payroll system produced rather than whatever the spec asked for. So this
 * finds columns by name rather than by position, accepts the names those systems
 * actually use, and says exactly which line it could not read.
 *
 * It is deliberately small. A CSV library would handle embedded newlines in
 * quoted fields, which no payroll export produces and which would be the only
 * thing it bought — against a dependency parsing a file full of L3 data.
 */

/** What a column might be called, in rough order of how often it is. */
const COLUMNS = {
  serviceNo: ['service_no', 'serviceno', 'service number', 'staff_no', 'staffno', 'staff number', 'ippis_no', 'employee_no'],
  name: ['name', 'full_name', 'fullname', 'staff_name', 'employee_name', 'surname_firstname'],
  amount: ['amount', 'deduction', 'amount_ngn', 'deduction_amount', 'premium', 'monthly_amount'],
}

export interface ParseResult {
  rows: ScheduleRow[]
  /** Lines that could not be read, with the line number a spreadsheet shows. */
  problems: { line: number; reason: string }[]
  /** Which header each field was taken from, so an officer can check the guess. */
  usedColumns: { serviceNo: string; name: string; amount: string }
}

export class CsvError extends Error {}

export function parseSchedule(text: string): ParseResult {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '')
  if (lines.length < 2) {
    throw new CsvError('That file has a header and no rows.')
  }

  const header = splitLine(lines[0]).map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ''))
  const find = (names: string[], label: string) => {
    const index = header.findIndex((h) => names.includes(h) || names.includes(h.replace(/\s+/g, '_')))
    if (index === -1) {
      throw new CsvError(
        `No ${label} column. Looked for ${names.slice(0, 3).join(', ')} and found ${header.join(', ')}.`,
      )
    }
    return index
  }

  const at = {
    serviceNo: find(COLUMNS.serviceNo, 'service number'),
    name: find(COLUMNS.name, 'name'),
    amount: find(COLUMNS.amount, 'amount'),
  }

  const rows: ScheduleRow[] = []
  const problems: ParseResult['problems'] = []

  for (let i = 1; i < lines.length; i++) {
    // The line number a spreadsheet shows, so "line 4,412" means the same thing
    // to the officer looking at the file as it does to us.
    const line = i + 1
    const cells = splitLine(lines[i])
    const serviceNo = (cells[at.serviceNo] ?? '').trim()
    const name = (cells[at.name] ?? '').trim()
    const rawAmount = (cells[at.amount] ?? '').trim()

    if (!serviceNo) {
      problems.push({ line, reason: 'No service number' })
      continue
    }

    /*
     * Naira in the file, kobo on the wire.
     *
     * Payroll systems write "2,500" or "2500.00" or "₦2,500.00" and mean the
     * same thing. Parsing to a float and multiplying by 100 puts 250000.00000001
     * on the wire for some values, so the decimal part is taken as written.
     */
    const cleaned = rawAmount.replace(/[₦,\s]/g, '')
    const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned)
    if (!match) {
      problems.push({ line, reason: `"${rawAmount}" is not an amount` })
      continue
    }
    const kobo = Number(match[1]) * 100 + Number((match[2] ?? '0').padEnd(2, '0'))
    if (kobo <= 0) {
      problems.push({ line, reason: 'Amount is zero' })
      continue
    }

    rows.push({ serviceNo, name, amountMinor: kobo })
  }

  return {
    rows,
    problems,
    usedColumns: {
      serviceNo: header[at.serviceNo],
      name: header[at.name],
      amount: header[at.amount],
    },
  }
}

/**
 * One line into cells.
 *
 * Handles quoted fields containing commas, because "OKAFOR, ADAEZE N" is how
 * half of these files write a name, and splitting on every comma turns one
 * member into two columns and every column after it into the wrong one.
 */
function splitLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let quoted = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      // A doubled quote inside a quoted field is one literal quote.
      if (quoted && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        quoted = !quoted
      }
    } else if (ch === ',' && !quoted) {
      cells.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  cells.push(current)
  return cells
}

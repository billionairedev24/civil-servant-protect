// With the extension, because tests/csv.mjs imports this module directly under
// node's type stripping and node resolves what is written rather than guessing.
// tsconfig allows it and Vite follows it.
import { TIER_CODES } from '../data/member.ts'
import type { NewMember, ScheduleRow, Tier } from './types'

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

/**
 * The header row, and a way to ask it where a field is.
 *
 * Shared by both parsers because the awkward part is the same for a staff list
 * as for a schedule: the column is called whatever the system that exported it
 * calls it, and the answer to "which column is the name" has to come from the
 * header rather than from a position somebody assumed.
 */
function headerOf(text: string) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '')
  if (lines.length < 2) {
    throw new CsvError('That file has a header and no rows.')
  }

  const header = splitLine(lines[0]).map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ''))
  const at = (names: string[]) =>
    header.findIndex((h) => names.includes(h) || names.includes(h.replace(/\s+/g, '_')))

  return {
    lines,
    header,
    /** Where a column is, or -1. For anything the file need not carry. */
    optional: at,
    /** Where a column is, or a message naming what was looked for and what is there. */
    required: (names: string[], label: string) => {
      const index = at(names)
      if (index === -1) {
        throw new CsvError(
          `No ${label} column. Looked for ${names.slice(0, 3).join(', ')} and found ${header.join(', ')}.`,
        )
      }
      return index
    },
  }
}

export function parseSchedule(text: string): ParseResult {
  const { lines, header, required } = headerOf(text)

  const at = {
    serviceNo: required(COLUMNS.serviceNo, 'service number'),
    name: required(COLUMNS.name, 'name'),
    amount: required(COLUMNS.amount, 'amount'),
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

// ── A staff list ─────────────────────────────────────────────────────────────

/** What a staff-list column might be called. */
const STAFF_COLUMNS = {
  nin: ['nin', 'national_id', 'nin_no', 'national_identity_number', 'nimc'],
  name: COLUMNS.name,
  dateOfBirth: ['dob', 'date_of_birth', 'birth_date', 'birthdate', 'date of birth'],
  msisdn: ['phone', 'msisdn', 'phone_number', 'mobile', 'mobile_no', 'telephone', 'gsm'],
  serviceNo: COLUMNS.serviceNo,
  grade: ['grade', 'grade_level', 'gl', 'level', 'salary_grade'],
  tier: ['tier', 'plan', 'cover', 'cover_tier', 'package'],
}

export interface StaffListResult {
  rows: NewMember[]
  problems: { line: number; reason: string }[]
  /** Which header each field came from, so an officer can check the guess. */
  usedColumns: Record<string, string>
}

/**
 * Reading a list of new starters out of a CSV file.
 *
 * <p>Stricter than the schedule parser, and deliberately so. A bad row in a
 * schedule is a deduction that does not match; a bad row here creates a person,
 * texts a phone number to say they are covered, and spends a NIMC verification
 * doing it. So anything that is not plainly right is held back with its line
 * number rather than sent up and rejected at the far end.
 *
 * <p>Nothing is checked against NIMC here — that is the server's job and it is
 * the only place it can be done. This checks shape: eleven digits, a phone
 * number that can be dialled, a date that exists.
 */
export function parseStaffList(text: string, defaultTier: Tier = 'standard'): StaffListResult {
  const { lines, header, required, optional } = headerOf(text)

  const at = {
    nin: required(STAFF_COLUMNS.nin, 'NIN'),
    name: required(STAFF_COLUMNS.name, 'name'),
    dateOfBirth: required(STAFF_COLUMNS.dateOfBirth, 'date of birth'),
    msisdn: required(STAFF_COLUMNS.msisdn, 'phone number'),
    serviceNo: optional(STAFF_COLUMNS.serviceNo),
    grade: optional(STAFF_COLUMNS.grade),
    tier: optional(STAFF_COLUMNS.tier),
  }

  const rows: NewMember[] = []
  const problems: StaffListResult['problems'] = []

  for (let i = 1; i < lines.length; i++) {
    const line = i + 1
    const cells = splitLine(lines[i])
    const cell = (index: number) => (index === -1 ? '' : (cells[index] ?? '').trim())

    const nin = cell(at.nin).replace(/\D/g, '')
    const name = cell(at.name)
    const rawDob = cell(at.dateOfBirth)
    const rawPhone = cell(at.msisdn)

    if (nin.length !== 11) {
      // Not the digits themselves. A NIN in a log or an error message is the
      // thing this whole system encrypts at rest, so the line number has to be
      // enough to find it.
      problems.push({ line, reason: nin ? 'NIN is not eleven digits' : 'No NIN' })
      continue
    }
    if (name.length < 3) {
      problems.push({ line, reason: 'No name' })
      continue
    }

    const dateOfBirth = isoDate(rawDob)
    if (!dateOfBirth) {
      problems.push({ line, reason: `"${rawDob}" is not a date` })
      continue
    }

    const msisdn = msisdnOf(rawPhone)
    if (!msisdn) {
      problems.push({ line, reason: `"${rawPhone}" is not a phone number` })
      continue
    }

    const rawTier = cell(at.tier).toLowerCase()
    const tier = (TIER_CODES as readonly string[]).includes(rawTier)
      ? (rawTier as Tier)
      : rawTier === ''
        ? defaultTier
        : null
    if (tier === null) {
      problems.push({ line, reason: `"${cell(at.tier)}" is not a plan` })
      continue
    }

    rows.push({
      nin,
      fullName: name,
      dateOfBirth,
      msisdn,
      serviceNo: cell(at.serviceNo) || undefined,
      grade: cell(at.grade) || undefined,
      tier,
    })
  }

  const used: Record<string, string> = {}
  for (const [field, index] of Object.entries(at)) {
    if (index !== -1) used[field] = header[index]
  }

  return { rows, problems, usedColumns: used }
}

/**
 * A date as somebody's payroll export writes it, into the ISO the API takes.
 *
 * <p>Day-first when it is ambiguous, because these files are Nigerian and
 * 03/04/1985 is the third of April. An American reading, silently applied, moves
 * a birthday by nine months and fails a NIMC match for a reason nobody can see.
 */
function isoDate(given: string): string | null {
  const text = given.trim()
  if (!text) return null

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  const slashed = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text)

  let year: number
  let month: number
  let day: number
  if (iso) {
    ;[year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])]
  } else if (slashed) {
    ;[day, month, year] = [Number(slashed[1]), Number(slashed[2]), Number(slashed[3])]
  } else {
    return null
  }

  // Constructed rather than trusted: 31/02/1985 parses out of the regex and is
  // not a day. Date would roll it forward to the 3rd of March and enrol
  // somebody with a birthday they do not have.
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * A Nigerian mobile number in whatever form, as +234 and ten digits.
 *
 * <p>The forms are 08031234567, 8031234567, +2348031234567 and 2348031234567,
 * with spaces and dashes anywhere. All four mean one phone, and this is the only
 * credential the member will ever have — a number normalised wrongly sends the
 * invitation to a stranger, so anything that is not one of those shapes is held
 * back rather than guessed at.
 */
export function msisdnOf(given: string): string | null {
  const digits = given.replace(/[\s()-]/g, '')
  const local = /^0(\d{10})$/.exec(digits)
  const bare = /^(\d{10})$/.exec(digits)
  const international = /^\+?234(\d{10})$/.exec(digits)
  const national = local ?? bare ?? international
  return national ? `+234${national[1]}` : null
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

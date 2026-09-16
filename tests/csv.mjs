/**
 * The schedule CSV parser.
 *
 * The only pure-logic test in this suite, and it earns its place: this code
 * reads a file produced by somebody else's payroll system and turns it into an
 * instruction that changes what eight thousand people are paid. Everything it
 * gets wrong is silent — a column read as the wrong one, a comma inside a name
 * shifting every field after it, a rounding error on a naira amount.
 *
 * Run with node's type stripping, so the test imports the real module rather
 * than a copy of it. A test against a transpiled duplicate is a test of the
 * duplicate.
 */
import { parseSchedule, CsvError } from '../src/api/csv.ts'

let passed = 0
const failures = []

function check(name, fn) {
  try {
    fn()
    passed++
  } catch (e) {
    failures.push(`${name} — ${e.message}`)
  }
}

function eq(actual, expected, what) {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  if (a !== b) throw new Error(`${what}: ${a} != ${b}`)
}

check('reads a plain file', () => {
  const r = parseSchedule('service_no,name,amount\n4471208,Adaeze Okafor,2500\n')
  eq(r.rows, [{ serviceNo: '4471208', name: 'Adaeze Okafor', amountMinor: 250000 }], 'rows')
})

check('a comma inside a quoted name does not become a column', () => {
  // "OKAFOR, ADAEZE N" is how half of these files write a name. Splitting on
  // every comma turns one member into two columns and shifts the amount.
  const r = parseSchedule('service_no,name,amount\n4471208,"OKAFOR, ADAEZE N",2500\n')
  eq(r.rows[0].name, 'OKAFOR, ADAEZE N', 'name')
  eq(r.rows[0].amountMinor, 250000, 'amount')
})

check('naira decorations and decimals', () => {
  // 2500.5 through a float multiply gives 250049.99999999997.
  const r = parseSchedule('staff_no,full_name,deduction\n1,A,"₦2,500.00"\n2,B,1500\n3,C,2500.5\n')
  eq(r.rows.map((x) => x.amountMinor), [250000, 150000, 250050], 'amounts')
})

check('columns are found by name, in any order', () => {
  const r = parseSchedule('AMOUNT,Staff Number,Employee_Name\n2500,4471208,Adaeze\n')
  eq(r.rows[0], { serviceNo: '4471208', name: 'Adaeze', amountMinor: 250000 }, 'row')
})

check('a bad line is reported with its spreadsheet line number, not dropped', () => {
  const r = parseSchedule('service_no,name,amount\n1,A,2500\n2,B,not-a-number\n3,C,2500\n')
  eq(r.rows.length, 2, 'good rows')
  eq(r.problems, [{ line: 3, reason: '"not-a-number" is not an amount' }], 'problems')
})

check('a missing column says what it looked for', () => {
  let thrown = null
  try {
    parseSchedule('a,b,c\n1,2,3\n')
  } catch (e) {
    thrown = e
  }
  if (!(thrown instanceof CsvError)) throw new Error('expected a CsvError')
  if (!thrown.message.includes('service number')) throw new Error(thrown.message)
})

check('a header with no rows is refused', () => {
  let thrown = null
  try {
    parseSchedule('service_no,name,amount\n')
  } catch (e) {
    thrown = e
  }
  if (!(thrown instanceof CsvError)) throw new Error('expected a CsvError')
})

check('windows line endings', () => {
  const r = parseSchedule('service_no,name,amount\r\n4471208,Adaeze,2500\r\n')
  eq(r.rows.length, 1, 'rows')
  eq(r.rows[0].serviceNo, '4471208', 'service no')
})

check('a doubled quote is one literal quote', () => {
  const r = parseSchedule('service_no,name,amount\n1,"A ""B"" C",2500\n')
  eq(r.rows[0].name, 'A "B" C', 'name')
})

check('a zero amount is refused rather than sent', () => {
  const r = parseSchedule('service_no,name,amount\n1,A,0\n')
  eq(r.rows.length, 0, 'rows')
  eq(r.problems[0].reason, 'Amount is zero', 'reason')
})

check('a row with no service number cannot be matched, so it is not sent', () => {
  const r = parseSchedule('service_no,name,amount\n,A,2500\n4471208,B,2500\n')
  eq(r.rows.length, 1, 'rows')
  eq(r.problems[0], { line: 2, reason: 'No service number' }, 'problem')
})

console.log()
if (failures.length > 0) {
  console.log(`✗ ${failures.length} of ${passed + failures.length} CSV assertions failed:`)
  for (const f of failures) console.log(`  ${f}`)
  process.exit(1)
}
console.log(`✓ ${passed} CSV assertions passed — the schedule parser reads what payroll sends`)

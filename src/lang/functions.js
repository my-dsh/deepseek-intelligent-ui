/**
 * Built-in `@functions` of openui-lang v1 and the value helpers they share with the
 * evaluator.
 *
 * Every implementation is pure, never mutates its arguments, and reports unusable
 * arguments by throwing an internal `FxArgumentError`. `callFunction` is the only public
 * entry point: it converts that error into `null` plus one diagnostic through the
 * caller-supplied reporter, so a bad program never throws.
 *
 * @module src/lang/functions
 */

/** @typedef {{ severity: 'error'|'warning', message: string, line?: number }} Diagnostic */

/** Raised inside a built-in when its arguments cannot be used. */
class FxArgumentError extends Error {
  /**
   * @param {string} message - what is wrong with the arguments.
   */
  constructor(message) {
    super(message)
    this.name = 'FxArgumentError'
  }
}

/**
 * Abort the current built-in call with a readable message.
 * @param {string} message - what is wrong with the arguments.
 * @returns {never} never returns.
 */
function fxBad(message) {
  throw new FxArgumentError(message)
}

/**
 * True for a plain data object (not null, not an array, not a descriptor).
 * @param {unknown} value - candidate.
 * @returns {boolean} whether the value is a plain object.
 */
export function fxIsPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Coerce to an array. `null` and `undefined` are treated as an empty list.
 * @param {unknown} value - candidate list.
 * @param {string} name - built-in name, for the error message.
 * @returns {any[]} the list.
 */
function fxList(value, name) {
  if (value === null || value === undefined) return []
  if (Array.isArray(value)) return value
  fxBad(`${name} expects an array`)
}

/**
 * Normalise a `field` argument: `""`/null mean "the item itself".
 * @param {unknown} value - the field argument.
 * @returns {string} the field name.
 */
function fxKey(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

/**
 * Read one field of an item; `field` of `""` returns the item itself.
 * @param {any} item - array item.
 * @param {string} field - field name.
 * @returns {any} the field value, or null when absent.
 */
function fxField(item, field) {
  if (!field) return item
  if (item === null || item === undefined) return null
  if (fxIsPlainObject(item)) return Object.prototype.hasOwnProperty.call(item, field) ? item[field] : null
  if (Array.isArray(item)) {
    const index = Number(field)
    if (!Number.isInteger(index)) return null
    const at = index < 0 ? item.length + index : index
    return at >= 0 && at < item.length ? item[at] : null
  }
  return null
}

/**
 * Numeric coercion used by comparisons and arithmetic: `null`/`""` are 0, non-numeric
 * strings are `NaN`.
 * @param {unknown} value - candidate.
 * @returns {number} the number, or NaN.
 */
export function fxToNumber(value) {
  if (typeof value === 'number') return value
  if (typeof value === 'boolean') return value ? 1 : 0
  if (value === null || value === undefined) return 0
  if (typeof value === 'string') {
    const text = value.trim()
    if (text === '') return 0
    return Number(text)
  }
  return NaN
}

/**
 * Numeric coercion for aggregate inputs: a missing value (`null`, `undefined`, `""`)
 * is *absent*, not zero, so `@Avg`, `@Min`, `@Max`, `@Stats` and the grouping helpers
 * skip it instead of quietly counting it as 0. Non-numeric text is `NaN` as well.
 * @param {unknown} value - candidate.
 * @returns {number} the number, or NaN when the value is missing or not numeric.
 */
export function fxMaybeNumber(value) {
  if (value === null || value === undefined) return NaN
  if (typeof value === 'string' && value.trim() === '') return NaN
  return fxToNumber(value)
}

/**
 * Strict numeric coercion for built-in arguments.
 * @param {unknown} value - candidate.
 * @param {string} name - built-in name, for the error message.
 * @returns {number} the number.
 */
function fxNumber(value, name) {
  const number = fxToNumber(value)
  if (Number.isNaN(number)) fxBad(`${name} expects a number`)
  return number
}

/**
 * Validate an enumerable argument, so a typo becomes a diagnostic instead of a silent
 * fallback. Synonyms are normalised to the documented value.
 * @param {string} name - built-in name, for the error message.
 * @param {unknown} value - the argument value.
 * @param {string[]} allowed - accepted (already normalised) values.
 * @param {Record<string, string>} [aliases] - synonym -> allowed value.
 * @returns {string} the normalised value.
 */
function fxEnum(name, value, allowed, aliases) {
  const text = value === null || value === undefined ? '' : String(value).trim().toLowerCase()
  if (aliases && Object.prototype.hasOwnProperty.call(aliases, text)) return aliases[text]
  if (allowed.includes(text)) return text
  fxBad(`${name} expects ${allowed.map(entry => JSON.stringify(entry)).join(', ')}`)
}

/**
 * Text form of a value, used by `+`, `@Join`, `@Format` and friends.
 * @param {unknown} value - any value.
 * @returns {string} human-readable text.
 */
export function fxText(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (Array.isArray(value)) return value.map(item => fxText(item)).join(', ')
  if (fxIsPlainObject(value)) {
    try {
      return JSON.stringify(value)
    } catch (error) {
      return ''
    }
  }
  return String(value)
}

/**
 * Truthiness used by `!`, `&&`, `||` and `@Default` guards.
 * @param {unknown} value - any value.
 * @returns {boolean} whether the value counts as true.
 */
export function fxTruthy(value) {
  if (value === null || value === undefined || value === false) return false
  if (value === true) return true
  if (typeof value === 'number') return value !== 0 && !Number.isNaN(value)
  if (typeof value === 'string') return value !== ''
  return true
}

/**
 * Structural equality used by `==`, `@Includes`, `@Find`, `@Remove` and friends.
 * @param {unknown} left - first value.
 * @param {unknown} right - second value.
 * @returns {boolean} whether the values are equal.
 */
export function fxDeepEqual(left, right) {
  if (left === right) return true
  if (typeof left === 'number' && typeof right === 'number') return Number.isNaN(left) && Number.isNaN(right)
  if ((left === null || left === undefined) && (right === null || right === undefined)) return true
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return false
    for (let index = 0; index < left.length; index += 1) {
      if (!fxDeepEqual(left[index], right[index])) return false
    }
    return true
  }
  if (fxIsPlainObject(left) && fxIsPlainObject(right)) {
    const leftKeys = Object.keys(left)
    const rightKeys = Object.keys(right)
    if (leftKeys.length !== rightKeys.length) return false
    for (const key of leftKeys) {
      if (!Object.prototype.hasOwnProperty.call(right, key)) return false
      if (!fxDeepEqual(left[key], right[key])) return false
    }
    return true
  }
  return false
}

/**
 * Order two values: numbers numerically, text lexically, everything else as text.
 * @param {any} left - first value.
 * @param {any} right - second value.
 * @returns {number} negative, zero or positive.
 */
export function fxCompareValues(left, right) {
  if (typeof left === 'number' && typeof right === 'number') return left - right
  if (typeof left === 'string' && typeof right === 'string') {
    const leftNumber = fxToNumber(left)
    const rightNumber = fxToNumber(right)
    if (left.trim() !== '' && right.trim() !== '' && !Number.isNaN(leftNumber) && !Number.isNaN(rightNumber)) {
      return leftNumber - rightNumber
    }
    return left < right ? -1 : left > right ? 1 : 0
  }
  const leftNumber = fxToNumber(left)
  const rightNumber = fxToNumber(right)
  if (!Number.isNaN(leftNumber) && !Number.isNaN(rightNumber)) return leftNumber - rightNumber
  const leftText = fxText(left)
  const rightText = fxText(right)
  return leftText < rightText ? -1 : leftText > rightText ? 1 : 0
}

/**
 * Comparator for `@Sort`: like `fxCompareValues` but nulls sort last.
 * @param {any} left - first value.
 * @param {any} right - second value.
 * @returns {number} negative, zero or positive.
 */
function fxOrder(left, right) {
  const leftEmpty = left === null || left === undefined
  const rightEmpty = right === null || right === undefined
  if (leftEmpty && rightEmpty) return 0
  if (leftEmpty) return 1
  if (rightEmpty) return -1
  return fxCompareValues(left, right)
}

/**
 * Evaluate one `@Filter` operator.
 * @param {any} left - the field value.
 * @param {string} operator - `== != > < >= <= contains`.
 * @param {any} right - the compared value.
 * @returns {boolean} whether the row matches.
 */
function fxMatches(left, operator, right) {
  switch (operator) {
    case '==':
      return fxDeepEqual(left, right)
    case '!=':
      return !fxDeepEqual(left, right)
    case '>':
    case '<':
    case '>=':
    case '<=': {
      // A missing field is not 0: ordering comparisons only match present values.
      if (left === null || left === undefined || left === '') return false
      if (right === null || right === undefined || right === '') return false
      const order = fxCompareValues(left, right)
      if (operator === '>') return order > 0
      if (operator === '<') return order < 0
      if (operator === '>=') return order >= 0
      return order <= 0
    }
    case 'contains':
      if (Array.isArray(left)) return left.some(item => fxDeepEqual(item, right))
      if (typeof left === 'string') return left.includes(fxText(right))
      return false
    default:
      return fxBad(`@Filter does not know the operator ${JSON.stringify(operator)}`)
  }
}

/**
 * Combine one group of values with an aggregation name.
 * @param {string} aggregation - `sum avg count min max`.
 * @param {number[]} values - numeric values of the group.
 * @param {number} count - number of rows in the group.
 * @returns {number | null} the aggregated value.
 */
function fxAggregate(aggregation, values, count) {
  const name = aggregation || 'sum'
  if (name === 'count') return count
  if (name === 'sum') {
    let total = 0
    for (const value of values) total += value
    return total
  }
  if (name === 'avg') {
    if (values.length === 0) return 0
    let total = 0
    for (const value of values) total += value
    return total / values.length
  }
  if (name === 'min') {
    if (values.length === 0) return null
    let result = values[0]
    for (const value of values) if (value < result) result = value
    return result
  }
  if (name === 'max') {
    if (values.length === 0) return null
    let result = values[0]
    for (const value of values) if (value > result) result = value
    return result
  }
  return fxBad(`unknown aggregation ${JSON.stringify(aggregation)}`)
}

/**
 * Map key used to group equal key values, including objects and null.
 * @param {any} value - the key value.
 * @returns {string} a stable string key.
 */
function fxGroupKey(value) {
  if (value === null || value === undefined) return '\u0000null'
  if (typeof value === 'object') {
    try {
      return `\u0000${JSON.stringify(value)}`
    } catch (error) {
      return '\u0000object'
    }
  }
  return `${typeof value}:${String(value)}`
}

/**
 * Pad a number to two digits.
 * @param {number} value - the number.
 * @returns {string} two digits.
 */
function fxPad2(value) {
  return String(Math.abs(Math.trunc(value))).padStart(2, '0')
}

/**
 * Parse a date-ish value: `YYYY-MM-DD`, an ISO string or a timestamp.
 * @param {any} value - the value.
 * @returns {Date | null} local date, or null when unreadable.
 */
function fxDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value === 'number' && Number.isFinite(value)) {
    const fromNumber = new Date(value)
    return Number.isNaN(fromNumber.getTime()) ? null : fromNumber
  }
  if (typeof value === 'string') {
    const text = value.trim()
    if (text === '') return null
    const match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text)
    if (match) {
      const fromParts = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
      return Number.isNaN(fromParts.getTime()) ? null : fromParts
    }
    const parsed = new Date(text)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  return null
}

/**
 * Format a local date as `YYYY-MM-DD`.
 * @param {Date} date - the date.
 * @returns {string} the formatted date.
 */
function fxDateIso(date) {
  return `${date.getFullYear()}-${fxPad2(date.getMonth() + 1)}-${fxPad2(date.getDate())}`
}

/**
 * Start of the week (Monday) for a date.
 * @param {Date} date - the date.
 * @returns {Date} a new date at the same time on Monday.
 */
function fxWeekStart(date) {
  const offset = (date.getDay() + 6) % 7
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - offset)
}

/**
 * Bucket key of a date for `@Bucket`.
 * @param {Date} date - the date.
 * @param {'day'|'week'|'month'} unit - bucket size.
 * @returns {string} `YYYY-MM-DD` or `YYYY-MM`.
 */
function fxBucketKey(date, unit) {
  if (unit === 'month') return `${date.getFullYear()}-${fxPad2(date.getMonth() + 1)}`
  if (unit === 'week') return fxDateIso(fxWeekStart(date))
  return fxDateIso(date)
}

/**
 * Next bucket start after a date.
 * @param {Date} date - current bucket start.
 * @param {'day'|'week'|'month'} unit - bucket size.
 * @returns {Date} the next bucket start.
 */
function fxBucketNext(date, unit) {
  if (unit === 'month') return new Date(date.getFullYear(), date.getMonth() + 1, 1)
  if (unit === 'week') return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 7)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
}

/** Unit conversion families, each a map from unit name to its factor to the base unit. */
const fxUnitFamilies = [
  { units: { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344 } },
  { units: { mg: 0.001, g: 1, kg: 1000, oz: 28.349523125, lb: 453.59237, st: 6350.29318 } },
  { units: { ml: 0.001, l: 1, tsp: 0.00492892159375, tbsp: 0.01478676478125, floz: 0.0295735295625, cup: 0.2365882365, pt: 0.473176473, qt: 0.946352946, gal: 3.785411784 } },
  { units: { 'm/s': 1, 'km/h': 1 / 3.6, mph: 0.44704, kn: 0.5144444444444445 } },
  { units: { m2: 1, km2: 1000000, ft2: 0.09290304, ha: 10000, acre: 4046.8564224 } },
]

/** Temperature units handled separately from the multiplicative families. */
const fxTemperatureUnits = new Set(['c', 'f', 'k'])

/**
 * Convert a temperature to Celsius.
 * @param {number} value - the value.
 * @param {string} unit - `c`, `f` or `k`.
 * @returns {number} the value in Celsius.
 */
function fxToCelsius(value, unit) {
  if (unit === 'f') return (value - 32) * (5 / 9)
  if (unit === 'k') return value - 273.15
  return value
}

/**
 * Convert Celsius to a temperature unit.
 * @param {number} celsius - the value in Celsius.
 * @param {string} unit - `c`, `f` or `k`.
 * @returns {number} the converted value.
 */
function fxFromCelsius(celsius, unit) {
  if (unit === 'f') return celsius * (9 / 5) + 32
  if (unit === 'k') return celsius + 273.15
  return celsius
}

/**
 * Parse `#rgb` or `#rrggbb`.
 * @param {any} value - the colour text.
 * @returns {{ r: number, g: number, b: number } | null} channels, or null.
 */
function fxParseHex(value) {
  const match = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(String(value).trim())
  if (!match) return null
  let hex = match[1]
  if (hex.length === 3) hex = `${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  }
}

/**
 * Render RGB channels as `#rrggbb`.
 * @param {{ r: number, g: number, b: number }} channels - the channels.
 * @returns {string} the hex colour.
 */
function fxToHex(channels) {
  return `#${[channels.r, channels.g, channels.b]
    .map(channel => Math.round(Math.max(0, Math.min(255, channel))).toString(16).padStart(2, '0'))
    .join('')}`
}

/**
 * Bounded cache of `Intl` formatters. Constructing an `Intl.NumberFormat` costs ~15 µs,
 * so a per-row `@Format` in an `@Each` template dominated evaluation time (300 rows with
 * two `@Format` calls took 10.9 ms; reusing the formatter takes under 1 ms). Keys are
 * `locale + JSON options`; the locale is fixed to `en-US` so host and client output stay
 * deterministic, and at most `fxFormatterLimit` entries are kept per kind.
 */
const fxFormatterLimit = 64
/** @type {Map<string, Intl.NumberFormat | null>} */
const fxNumberFormatters = new Map()
/** @type {Map<string, Intl.DateTimeFormat | null>} */
const fxDateFormatters = new Map()

/**
 * Get (or build once) a formatter from a bounded cache.
 * @param {Map<string, any>} cache - the per-kind cache.
 * @param {string} locale - locale passed to `Intl`.
 * @param {object} options - `Intl` options.
 * @param {(locale: string, options: object) => any} factory - constructor for the formatter.
 * @returns {any} the formatter, or null when `Intl` rejects the options.
 */
function fxCachedFormatter(cache, locale, options, factory) {
  const key = `${locale}|${JSON.stringify(options)}`
  if (cache.has(key)) return cache.get(key)
  let formatter = null
  try {
    formatter = factory(locale, options)
  } catch (error) {
    formatter = null
  }
  if (cache.size < fxFormatterLimit) cache.set(key, formatter)
  return formatter
}

/**
 * Format with a cached `Intl.NumberFormat`.
 * @param {number} value - the number.
 * @param {object} options - `Intl.NumberFormat` options.
 * @returns {string | null} the formatted text, or null when `Intl` rejected the options.
 */
function fxFormatWith(value, options) {
  const formatter = fxCachedFormatter(fxNumberFormatters, 'en-US', options, (locale, opts) => new Intl.NumberFormat(locale, opts))
  if (formatter === null) return null
  try {
    return formatter.format(value)
  } catch (error) {
    return null
  }
}

/**
 * Format a number with `Intl`, falling back to plain text.
 * @param {number} value - the number.
 * @param {object} options - `Intl.NumberFormat` options.
 * @returns {string} the formatted text.
 */
function fxFormatNumber(value, options) {
  const text = fxFormatWith(value, options)
  return text === null ? String(value) : text
}

/**
 * Round a number to a number of decimals without `toFixed` range surprises.
 * @param {number} value - the number.
 * @param {number} decimals - decimal places.
 * @returns {number} the rounded number.
 */
function fxRoundTo(value, decimals) {
  const places = Math.max(0, Math.min(12, Math.trunc(decimals)))
  const factor = Math.pow(10, places)
  return Math.round(value * factor) / factor
}

/** Implementations of every v1 `@function`, keyed by bare name. */
const fxImplementations = {
  Count(args) {
    const value = args[0]
    if (Array.isArray(value) || typeof value === 'string') return value.length
    if (value === null || value === undefined) return 0
    if (fxIsPlainObject(value)) return Object.keys(value).length
    return fxBad('@Count expects an array')
  },

  First(args) {
    const list = fxList(args[0], '@First')
    return list.length > 0 ? list[0] : null
  },

  Last(args) {
    const list = fxList(args[0], '@Last')
    return list.length > 0 ? list[list.length - 1] : null
  },

  Sum(args) {
    const list = fxList(args[0], '@Sum')
    let total = 0
    for (const item of list) {
      const number = fxMaybeNumber(item)
      if (!Number.isNaN(number)) total += number
    }
    return total
  },

  Avg(args) {
    const list = fxList(args[0], '@Avg')
    let total = 0
    let count = 0
    for (const item of list) {
      const number = fxMaybeNumber(item)
      if (!Number.isNaN(number)) {
        total += number
        count += 1
      }
    }
    return count > 0 ? total / count : 0
  },

  Min(args) {
    const list = fxList(args[0], '@Min')
    let result = null
    for (const item of list) {
      const number = fxMaybeNumber(item)
      if (Number.isNaN(number)) continue
      if (result === null || number < result) result = number
    }
    return result
  },

  Max(args) {
    const list = fxList(args[0], '@Max')
    let result = null
    for (const item of list) {
      const number = fxMaybeNumber(item)
      if (Number.isNaN(number)) continue
      if (result === null || number > result) result = number
    }
    return result
  },

  Sort(args) {
    const list = fxList(args[0], '@Sort')
    const field = args.length > 1 ? fxKey(args[1]) : ''
    const requested = args.length > 2 && args[2] !== null && args[2] !== undefined ? args[2] : 'asc'
    const direction = fxEnum('@Sort', requested, ['asc', 'desc'], { ascending: 'asc', descending: 'desc' })
    const sign = direction === 'desc' ? -1 : 1
    return list
      .map((item, index) => ({ item, index }))
      .sort((left, right) => {
        const order = fxOrder(fxField(left.item, field), fxField(right.item, field))
        return order !== 0 ? sign * order : left.index - right.index
      })
      .map(entry => entry.item)
  },

  Filter(args) {
    if (args.length < 4) fxBad('@Filter needs a list, a field, an operator and a value')
    const list = fxList(args[0], '@Filter')
    const field = fxKey(args[1])
    const operator = String(args[2])
    const value = args[3]
    return list.filter(item => fxMatches(fxField(item, field), operator, value))
  },

  Round(args) {
    const value = fxNumber(args[0], '@Round')
    const decimals = args.length > 1 && args[1] !== null && args[1] !== undefined ? fxNumber(args[1], '@Round') : 0
    return fxRoundTo(value, decimals)
  },

  Abs(args) {
    return Math.abs(fxNumber(args[0], '@Abs'))
  },

  Floor(args) {
    return Math.floor(fxNumber(args[0], '@Floor'))
  },

  Ceil(args) {
    return Math.ceil(fxNumber(args[0], '@Ceil'))
  },

  Append(args) {
    if (args.length < 2) fxBad('@Append needs a list and an item')
    return fxList(args[0], '@Append').concat([args[1]])
  },

  Prepend(args) {
    if (args.length < 2) fxBad('@Prepend needs a list and an item')
    return [args[1]].concat(fxList(args[0], '@Prepend'))
  },

  Concat(args) {
    if (args.length < 2) fxBad('@Concat needs two lists')
    return fxList(args[0], '@Concat').concat(fxList(args[1], '@Concat'))
  },

  Remove(args) {
    if (args.length < 3) fxBad('@Remove needs a list, a field and a value')
    const list = fxList(args[0], '@Remove')
    const field = fxKey(args[1])
    const value = args[2]
    return list.filter(item => !fxDeepEqual(fxField(item, field), value))
  },

  RemoveAt(args) {
    if (args.length < 2) fxBad('@RemoveAt needs a list and an index')
    const list = fxList(args[0], '@RemoveAt')
    const raw = Math.trunc(fxNumber(args[1], '@RemoveAt'))
    const index = raw < 0 ? list.length + raw : raw
    if (index < 0 || index >= list.length) return list.slice()
    return list.slice(0, index).concat(list.slice(index + 1))
  },

  Update(args) {
    if (args.length < 5) fxBad('@Update needs a list, a field, a value, a field to set and its value')
    const list = fxList(args[0], '@Update')
    const field = fxKey(args[1])
    const value = args[2]
    const setField = fxKey(args[3])
    const setValue = args[4]
    return list.map((item) => {
      if (!fxDeepEqual(fxField(item, field), value)) return item
      if (!fxIsPlainObject(item) || setField === '') return item
      const copy = { ...item }
      copy[setField] = setValue
      return copy
    })
  },

  Toggle(args) {
    if (args.length < 2) fxBad('@Toggle needs a list and an item')
    const list = fxList(args[0], '@Toggle')
    const item = args[1]
    if (list.some(entry => fxDeepEqual(entry, item))) return list.filter(entry => !fxDeepEqual(entry, item))
    return list.concat([item])
  },

  Includes(args) {
    if (args.length < 2) fxBad('@Includes needs a list or text and an item')
    const container = args[0]
    const item = args[1]
    if (typeof container === 'string') return container.includes(fxText(item))
    if (Array.isArray(container)) return container.some(entry => fxDeepEqual(entry, item))
    if (container === null || container === undefined) return false
    return fxBad('@Includes expects an array or a string')
  },

  Find(args) {
    if (args.length < 3) fxBad('@Find needs a list, a field and a value')
    const list = fxList(args[0], '@Find')
    const field = fxKey(args[1])
    const value = args[2]
    for (const item of list) {
      if (fxDeepEqual(fxField(item, field), value)) return item
    }
    return null
  },

  IndexOf(args) {
    if (args.length < 2) fxBad('@IndexOf needs a list and an item')
    const container = args[0]
    const item = args[1]
    if (typeof container === 'string') return container.indexOf(fxText(item))
    const list = fxList(container, '@IndexOf')
    for (let index = 0; index < list.length; index += 1) {
      if (fxDeepEqual(list[index], item)) return index
    }
    return -1
  },

  Take(args) {
    if (args.length < 2) fxBad('@Take needs a list and a count')
    const list = fxList(args[0], '@Take')
    const count = Math.trunc(fxNumber(args[1], '@Take'))
    return count >= 0 ? list.slice(0, count) : list.slice(count)
  },

  Slice(args) {
    if (args.length < 2) fxBad('@Slice needs a value and a start index')
    const value = args[0]
    const start = Math.trunc(fxNumber(args[1], '@Slice'))
    const hasEnd = args.length > 2 && args[2] !== null && args[2] !== undefined
    const end = hasEnd ? Math.trunc(fxNumber(args[2], '@Slice')) : undefined
    if (typeof value === 'string' || Array.isArray(value)) {
      const length = value.length
      const from = start < 0 ? Math.max(0, length + start) : Math.min(start, length)
      const to = end === undefined ? length : end < 0 ? Math.max(0, length + end) : Math.min(end, length)
      return value.slice(from, Math.max(from, to))
    }
    return fxBad('@Slice expects an array or a string')
  },

  Unique(args) {
    const list = fxList(args[0], '@Unique')
    // Primitives are deduplicated through a Set (O(n)); only objects and arrays need the
    // structural comparison, which keeps the common `@Unique(numbers)` fast.
    const seenPrimitives = new Set()
    const seenContainers = []
    const out = []
    for (const item of list) {
      if (item !== null && typeof item === 'object') {
        if (seenContainers.some(entry => fxDeepEqual(entry, item))) continue
        seenContainers.push(item)
        out.push(item)
        continue
      }
      const key = item === null || item === undefined ? '\u0000nullish' : `${typeof item}:${String(item)}`
      if (seenPrimitives.has(key)) continue
      seenPrimitives.add(key)
      out.push(item)
    }
    return out
  },

  Reverse(args) {
    return fxList(args[0], '@Reverse').slice().reverse()
  },

  Range(args) {
    if (args.length < 2) fxBad('@Range needs a start and an end')
    const start = fxNumber(args[0], '@Range')
    const end = fxNumber(args[1], '@Range')
    const step = args.length > 2 && args[2] !== null && args[2] !== undefined ? fxNumber(args[2], '@Range') : 1
    if (step === 0 || Number.isNaN(step)) fxBad('@Range needs a step other than 0')
    const out = []
    const limit = 100000
    if (step > 0) {
      for (let value = start; value < end; value += step) {
        if (out.length >= limit) fxBad('@Range produced too many numbers')
        out.push(fxRoundTo(value, 10))
      }
    } else {
      for (let value = start; value > end; value += step) {
        if (out.length >= limit) fxBad('@Range produced too many numbers')
        out.push(fxRoundTo(value, 10))
      }
    }
    return out
  },

  Pick(args) {
    const list = fxList(args[0], '@Pick')
    if (list.length === 0) return null
    return list[Math.floor(Math.random() * list.length)]
  },

  Shuffle(args) {
    const list = fxList(args[0], '@Shuffle').slice()
    for (let index = list.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1))
      const value = list[index]
      list[index] = list[swap]
      list[swap] = value
    }
    return list
  },

  Flatten(args) {
    const list = fxList(args[0], '@Flatten')
    const out = []
    for (const item of list) {
      if (Array.isArray(item)) out.push(...item)
      else out.push(item)
    }
    return out
  },

  Chunk(args) {
    if (args.length < 2) fxBad('@Chunk needs a list and a size')
    const list = fxList(args[0], '@Chunk')
    const size = Math.trunc(fxNumber(args[1], '@Chunk'))
    if (size < 1) fxBad('@Chunk needs a size of at least 1')
    const out = []
    for (let index = 0; index < list.length; index += size) out.push(list.slice(index, index + size))
    return out
  },

  Pow(args) {
    if (args.length < 2) fxBad('@Pow needs a base and an exponent')
    const result = Math.pow(fxNumber(args[0], '@Pow'), fxNumber(args[1], '@Pow'))
    return Number.isNaN(result) ? null : result
  },

  Sqrt(args) {
    const value = fxNumber(args[0], '@Sqrt')
    return value < 0 ? null : Math.sqrt(value)
  },

  Random(args) {
    if (args.length < 2) fxBad('@Random needs a minimum and a maximum')
    const min = fxNumber(args[0], '@Random')
    const max = fxNumber(args[1], '@Random')
    const integer = fxTruthy(args[2])
    if (integer) {
      const low = Math.ceil(min)
      const high = Math.floor(max)
      if (high < low) return low
      return low + Math.floor(Math.random() * (high - low + 1))
    }
    return min + Math.random() * (max - min)
  },

  Clamp(args) {
    if (args.length < 3) fxBad('@Clamp needs a value, a minimum and a maximum')
    const value = fxNumber(args[0], '@Clamp')
    const min = fxNumber(args[1], '@Clamp')
    const max = fxNumber(args[2], '@Clamp')
    return Math.min(Math.max(value, Math.min(min, max)), Math.max(min, max))
  },

  Percent(args) {
    if (args.length < 2) fxBad('@Percent needs a part and a total')
    const part = fxNumber(args[0], '@Percent')
    const total = fxNumber(args[1], '@Percent')
    return total === 0 ? 0 : (part / total) * 100
  },

  Lerp(args) {
    if (args.length < 3) fxBad('@Lerp needs two numbers and a fraction')
    const from = fxNumber(args[0], '@Lerp')
    const to = fxNumber(args[1], '@Lerp')
    const fraction = fxNumber(args[2], '@Lerp')
    return from + (to - from) * fraction
  },

  Allocate(args) {
    if (args.length < 2) fxBad('@Allocate needs a total and a list of weights')
    const total = fxNumber(args[0], '@Allocate')
    const weights = fxList(args[1], '@Allocate').map(weight => fxToNumber(weight))
    const decimals = args.length > 2 && args[2] !== null && args[2] !== undefined ? fxNumber(args[2], '@Allocate') : 2
    if (weights.length === 0) return []
    let sum = 0
    for (const weight of weights) sum += Number.isNaN(weight) ? 0 : weight
    const share = weights.map(weight => (sum > 0 ? (Number.isNaN(weight) ? 0 : weight) / sum : 1 / weights.length))
    const parts = share.map(part => fxRoundTo(part * total, decimals))
    let assigned = 0
    for (const part of parts) assigned += part
    parts[0] = fxRoundTo(parts[0] + (total - assigned), decimals)
    return parts
  },

  Payment(args) {
    if (args.length < 3) fxBad('@Payment needs a principal, a rate and a number of periods')
    const principal = fxNumber(args[0], '@Payment')
    const rate = fxNumber(args[1], '@Payment')
    const periods = fxNumber(args[2], '@Payment')
    if (periods <= 0) fxBad('@Payment needs a positive number of periods')
    if (rate === 0) return principal / periods
    const perPeriod = rate / 100
    return (principal * perPeriod) / (1 - Math.pow(1 + perPeriod, -periods))
  },

  Convert(args) {
    if (args.length < 3) fxBad('@Convert needs a value and two units')
    const value = fxNumber(args[0], '@Convert')
    const from = String(args[1]).trim().toLowerCase()
    const to = String(args[2]).trim().toLowerCase()
    if (from === to) return value
    if (fxTemperatureUnits.has(from) && fxTemperatureUnits.has(to)) {
      return fxFromCelsius(fxToCelsius(value, from), to)
    }
    for (const family of fxUnitFamilies) {
      if (Object.prototype.hasOwnProperty.call(family.units, from) && Object.prototype.hasOwnProperty.call(family.units, to)) {
        return (value * family.units[from]) / family.units[to]
      }
    }
    return fxBad(`@Convert cannot convert ${JSON.stringify(from)} to ${JSON.stringify(to)}`)
  },

  Format(args) {
    const value = args[0]
    if (value === null || value === undefined || value === '') return ''
    const requested = args.length > 1 && args[1] !== null && args[1] !== undefined ? args[1] : 'number'
    const kind = fxEnum('@Format', requested, ['number', 'currency', 'percent', 'compact'])
    const decimals = args.length > 2 && args[2] !== null && args[2] !== undefined ? Math.max(0, Math.min(20, Math.trunc(fxNumber(args[2], '@Format')))) : null
    const currency = args.length > 3 && args[3] !== null && args[3] !== undefined ? String(args[3]).toUpperCase() : null
    const number = fxToNumber(value)
    if (Number.isNaN(number)) return fxText(value)

    if (kind === 'currency') {
      const code = currency || 'USD'
      const digits = decimals === null ? 2 : decimals
      const formatted = fxFormatWith(number, {
        style: 'currency',
        currency: code,
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })
      if (formatted !== null) return formatted
      return `${code} ${fxFormatNumber(number, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`
    }
    if (kind === 'percent') {
      const options = decimals === null ? { maximumFractionDigits: 2 } : { minimumFractionDigits: decimals, maximumFractionDigits: decimals }
      return `${fxFormatNumber(number, options)}%`
    }
    if (kind === 'compact') {
      const digits = decimals === null ? 1 : decimals
      if (currency) {
        const formatted = fxFormatWith(number, {
          style: 'currency',
          currency,
          notation: 'compact',
          maximumFractionDigits: digits,
        })
        if (formatted !== null) return formatted
        return `${currency} ${fxFormatNumber(number, { notation: 'compact', maximumFractionDigits: digits })}`
      }
      return fxFormatNumber(number, { notation: 'compact', maximumFractionDigits: digits })
    }
    const options = decimals === null ? { maximumFractionDigits: 3 } : { minimumFractionDigits: decimals, maximumFractionDigits: decimals }
    return fxFormatNumber(number, options)
  },

  Join(args) {
    const value = args[0]
    if (typeof value === 'string') return value
    const list = fxList(value, '@Join')
    const separator = args.length > 1 && args[1] !== null && args[1] !== undefined ? fxText(args[1]) : ', '
    const field = args.length > 2 ? fxKey(args[2]) : ''
    const parts = []
    for (const item of list) {
      const entry = field ? fxField(item, field) : item
      if (entry === null || entry === undefined) continue
      parts.push(fxText(entry))
    }
    return parts.join(separator)
  },

  Plural(args) {
    if (args.length < 2) fxBad('@Plural needs a count and a word')
    const count = fxNumber(args[0], '@Plural')
    const word = fxText(args[1])
    const plural = args.length > 2 && args[2] !== null && args[2] !== undefined ? fxText(args[2]) : `${word}s`
    return `${fxText(count)} ${count === 1 ? word : plural}`
  },

  Pad(args) {
    if (args.length < 2) fxBad('@Pad needs a value and a length')
    const text = fxText(args[0])
    const length = Math.trunc(fxNumber(args[1], '@Pad'))
    const fill = args.length > 2 && args[2] !== null && args[2] !== undefined ? fxText(args[2]) : '0'
    if (fill === '' || length <= text.length) return text
    let out = text
    let guard = 0
    while (out.length < length && guard < 1000) {
      out = fill + out
      guard += 1
    }
    return out.length > length ? out.slice(out.length - length) : out
  },

  Upper(args) {
    return fxText(args[0]).toUpperCase()
  },

  Lower(args) {
    return fxText(args[0]).toLowerCase()
  },

  Trim(args) {
    return fxText(args[0]).trim()
  },

  Capitalize(args) {
    return fxText(args[0])
      .split(' ')
      .map(word => (word === '' ? word : word[0].toUpperCase() + word.slice(1)))
      .join(' ')
  },

  Split(args) {
    const text = fxText(args[0])
    const separator = args.length > 1 && args[1] !== null && args[1] !== undefined ? fxText(args[1]) : ','
    const parts = separator === '' ? Array.from(text) : text.split(separator)
    return parts.map(part => part.trim()).filter(part => part !== '')
  },

  Replace(args) {
    if (args.length < 3) fxBad('@Replace needs text, a search and a replacement')
    const text = fxText(args[0])
    const find = fxText(args[1])
    if (find === '') return text
    return text.split(find).join(fxText(args[2]))
  },

  Duration(args) {
    const seconds = Math.max(0, Math.round(fxNumber(args[0], '@Duration')))
    const requested = args.length > 1 && args[1] !== null && args[1] !== undefined ? args[1] : 'short'
    const style = fxEnum('@Duration', requested, ['short', 'clock'])
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const rest = seconds % 60
    if (style === 'clock') {
      if (hours > 0) return `${hours}:${fxPad2(minutes)}:${fxPad2(rest)}`
      return `${minutes}:${fxPad2(rest)}`
    }
    if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
    if (minutes > 0) return `${minutes}m ${fxPad2(rest)}s`
    return `${rest}s`
  },

  Default(args) {
    if (args.length < 2) fxBad('@Default needs a value and a fallback')
    const value = args[0]
    if (value === null || value === undefined || value === '') return args[1]
    if (typeof value === 'number' && Number.isNaN(value)) return args[1]
    return value
  },

  MixColor(args) {
    if (args.length < 3) fxBad('@MixColor needs two colours and a fraction')
    const from = fxParseHex(args[0])
    const to = fxParseHex(args[1])
    if (!from || !to) return fxBad('@MixColor expects hex colours like "#0285ff"')
    const fraction = fxNumber(args[2], '@MixColor')
    return fxToHex({
      r: from.r + (to.r - from.r) * fraction,
      g: from.g + (to.g - from.g) * fraction,
      b: from.b + (to.b - from.b) * fraction,
    })
  },

  Now() {
    return new Date().toISOString()
  },

  Today() {
    return fxDateIso(new Date())
  },

  FormatDate(args) {
    const date = fxDate(args[0])
    if (!date) return fxBad('@FormatDate expects a date like "2026-10-09", an ISO string or a timestamp')
    const style = args.length > 1 && args[1] !== null && args[1] !== undefined ? String(args[1]) : 'date'
    if (style === 'iso') return fxDateIso(date)
    const styles = {
      date: { month: 'short', day: 'numeric', year: 'numeric' },
      short: { month: 'short', day: 'numeric' },
      long: { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' },
      weekday: { weekday: 'short' },
      month: { month: 'short', year: 'numeric' },
      time: { hour: 'numeric', minute: '2-digit' },
      datetime: { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' },
    }
    const options = styles[style]
    if (!options) fxBad(`@FormatDate does not know the style ${JSON.stringify(style)}`)
    const formatter = fxCachedFormatter(fxDateFormatters, 'en-US', options, (locale, opts) => new Intl.DateTimeFormat(locale, opts))
    if (formatter === null) return fxDateIso(date)
    try {
      return formatter.format(date)
    } catch (error) {
      return fxDateIso(date)
    }
  },

  AddDays(args) {
    if (args.length < 2) fxBad('@AddDays needs a date and a number of days')
    const date = fxDate(args[0])
    if (!date) fxBad('@AddDays expects a date like "2026-10-09"')
    const days = Math.trunc(fxNumber(args[1], '@AddDays'))
    return fxDateIso(new Date(date.getFullYear(), date.getMonth(), date.getDate() + days))
  },

  AddMonths(args) {
    if (args.length < 2) fxBad('@AddMonths needs a date and a number of months')
    const date = fxDate(args[0])
    if (!date) fxBad('@AddMonths expects a date like "2026-10-09"')
    const months = Math.trunc(fxNumber(args[1], '@AddMonths'))
    const target = new Date(date.getFullYear(), date.getMonth() + months, 1)
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
    target.setDate(Math.min(date.getDate(), lastDay))
    return fxDateIso(target)
  },

  DaysBetween(args) {
    if (args.length < 2) fxBad('@DaysBetween needs two dates')
    const from = fxDate(args[0])
    const to = fxDate(args[1])
    if (!from || !to) fxBad('@DaysBetween expects dates like "2026-10-09"')
    const start = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())
    const end = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate())
    return Math.round((end - start) / 86400000)
  },

  MonthsBetween(args) {
    if (args.length < 2) fxBad('@MonthsBetween needs two dates')
    const from = fxDate(args[0])
    const to = fxDate(args[1])
    if (!from || !to) fxBad('@MonthsBetween expects dates like "2026-10-09"')
    let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
    if (to.getDate() < from.getDate()) months -= 1
    return months
  },

  StartOf(args) {
    if (args.length < 2) fxBad('@StartOf needs a date and a unit')
    const date = fxDate(args[0])
    if (!date) fxBad('@StartOf expects a date like "2026-10-09"')
    const unit = String(args[1])
    if (unit === 'week') return fxDateIso(fxWeekStart(date))
    if (unit === 'month') return fxDateIso(new Date(date.getFullYear(), date.getMonth(), 1))
    if (unit === 'year') return fxDateIso(new Date(date.getFullYear(), 0, 1))
    return fxBad('@StartOf expects "week", "month" or "year"')
  },

  GroupBy(args) {
    if (args.length < 2) fxBad('@GroupBy needs rows and a key field')
    const rows = fxList(args[0], '@GroupBy')
    const key = fxKey(args[1])
    const field = args.length > 2 ? fxKey(args[2]) : ''
    const aggregation = args.length > 3 && args[3] !== null && args[3] !== undefined ? String(args[3]) : 'sum'
    const groups = new Map()
    const order = []
    for (const row of rows) {
      const keyValue = fxField(row, key)
      const mapKey = fxGroupKey(keyValue)
      let group = groups.get(mapKey)
      if (!group) {
        group = { key: keyValue, values: [], count: 0 }
        groups.set(mapKey, group)
        order.push(group)
      }
      group.count += 1
      if (field) {
        const number = fxMaybeNumber(fxField(row, field))
        if (!Number.isNaN(number)) group.values.push(number)
      }
    }
    return order.map(group => ({ key: group.key, value: field ? fxAggregate(aggregation, group.values, group.count) : group.count }))
  },

  Pivot(args) {
    if (args.length < 3) fxBad('@Pivot needs rows, a row key and a column key')
    const rows = fxList(args[0], '@Pivot')
    const rowKey = fxKey(args[1])
    const columnKey = fxKey(args[2])
    const field = args.length > 3 ? fxKey(args[3]) : ''
    const aggregation = args.length > 4 && args[4] !== null && args[4] !== undefined ? String(args[4]) : 'sum'
    const rowOrder = []
    const columnOrder = []
    const columnValues = new Map()
    const cells = new Map()
    for (const row of rows) {
      const rowValue = fxField(row, rowKey)
      const columnValue = fxField(row, columnKey)
      const rowMapKey = fxGroupKey(rowValue)
      const columnMapKey = fxGroupKey(columnValue)
      if (!columnValues.has(columnMapKey)) {
        columnValues.set(columnMapKey, columnValue === null || columnValue === undefined ? 'null' : String(columnValue))
        columnOrder.push(columnMapKey)
      }
      if (!cells.has(rowMapKey)) {
        cells.set(rowMapKey, { value: rowValue, columns: new Map() })
        rowOrder.push(rowMapKey)
      }
      const entry = cells.get(rowMapKey)
      if (!entry.columns.has(columnMapKey)) {
        entry.columns.set(columnMapKey, { values: [], count: 0 })
      }
      const cell = entry.columns.get(columnMapKey)
      cell.count += 1
      if (field) {
        const number = fxMaybeNumber(fxField(row, field))
        if (!Number.isNaN(number)) cell.values.push(number)
      }
    }
    // Column labels are the stringified column-key values, but "key" is the row-label
    // column: a colliding or duplicate label gets a numeric suffix instead of silently
    // overwriting another column (or the row key itself).
    const columnLabels = new Map()
    const usedLabels = new Set(['key'])
    for (const columnMapKey of columnOrder) {
      const base = columnValues.get(columnMapKey)
      let label = base
      let suffix = 2
      while (usedLabels.has(label)) {
        label = `${base} (${suffix})`
        suffix += 1
      }
      usedLabels.add(label)
      columnLabels.set(columnMapKey, label)
    }
    return rowOrder.map((rowMapKey) => {
      const entry = cells.get(rowMapKey)
      const out = { key: entry.value }
      for (const columnMapKey of columnOrder) {
        const label = columnLabels.get(columnMapKey)
        const cell = entry.columns.get(columnMapKey)
        out[label] = cell
          ? (field ? fxAggregate(aggregation, cell.values, cell.count) : cell.count)
          : 0
      }
      return out
    })
  },

  Top(args) {
    if (args.length < 3) fxBad('@Top needs rows, a field and a count')
    const rows = fxList(args[0], '@Top')
    const field = fxKey(args[1])
    const count = Math.max(0, Math.trunc(fxNumber(args[2], '@Top')))
    const requested = args.length > 3 && args[3] !== null && args[3] !== undefined ? args[3] : 'desc'
    const direction = fxEnum('@Top', requested, ['asc', 'desc'], { ascending: 'asc', descending: 'desc' })
    const sign = direction === 'asc' ? 1 : -1
    return rows
      .map((row, index) => ({ row, index }))
      .sort((left, right) => {
        const order = fxOrder(fxField(left.row, field), fxField(right.row, field))
        return order !== 0 ? sign * order : left.index - right.index
      })
      .slice(0, count)
      .map(entry => entry.row)
  },

  Between(args) {
    if (args.length < 2) fxBad('@Between needs rows and a field')
    const rows = fxList(args[0], '@Between')
    const field = fxKey(args[1])
    const min = args.length > 2 ? args[2] : null
    const max = args.length > 3 ? args[3] : null
    const hasMin = min !== null && min !== undefined
    const hasMax = max !== null && max !== undefined
    return rows.filter((row) => {
      const value = fxField(row, field)
      if (value === null || value === undefined) return false
      if (hasMin && fxCompareValues(value, min) < 0) return false
      if (hasMax && fxCompareValues(value, max) > 0) return false
      return true
    })
  },

  Bucket(args) {
    if (args.length < 3) fxBad('@Bucket needs rows, a date field and a unit')
    const rows = fxList(args[0], '@Bucket')
    const dateField = fxKey(args[1])
    const unit = String(args[2])
    if (unit !== 'day' && unit !== 'week' && unit !== 'month') fxBad('@Bucket expects "day", "week" or "month"')
    const field = args.length > 3 ? fxKey(args[3]) : ''
    const aggregation = args.length > 4 && args[4] !== null && args[4] !== undefined ? String(args[4]) : 'sum'
    const buckets = new Map()
    for (const row of rows) {
      const date = fxDate(fxField(row, dateField))
      if (!date) continue
      const key = fxBucketKey(date, unit)
      let bucket = buckets.get(key)
      if (!bucket) {
        bucket = { date, values: [], count: 0 }
        buckets.set(key, bucket)
      }
      bucket.count += 1
      if (field) {
        const number = fxMaybeNumber(fxField(row, field))
        if (!Number.isNaN(number)) bucket.values.push(number)
      }
    }
    if (buckets.size === 0) return []
    const ordered = [...buckets.entries()].sort((left, right) => left[1].date.getTime() - right[1].date.getTime())
    const out = []
    let cursor = ordered[0][1].date
    const end = ordered[ordered.length - 1][1].date
    let guard = 0
    while (cursor.getTime() <= end.getTime() && guard < 10000) {
      const key = fxBucketKey(cursor, unit)
      const bucket = buckets.get(key)
      out.push({ key, value: bucket ? fxAggregate(aggregation, bucket.values, bucket.count) : fxAggregate(aggregation, [], 0) })
      cursor = fxBucketNext(cursor, unit)
      guard += 1
    }
    return out
  },

  Cumulative(args) {
    const rows = fxList(args[0], '@Cumulative')
    const field = args.length > 1 ? fxKey(args[1]) : ''
    let total = 0
    if (field === '') {
      return rows.map((value) => {
        const number = fxMaybeNumber(value)
        if (!Number.isNaN(number)) total += number
        return total
      })
    }
    return rows.map((row) => {
      const number = fxMaybeNumber(fxField(row, field))
      if (!Number.isNaN(number)) total += number
      if (!fxIsPlainObject(row)) return total
      const copy = { ...row }
      copy[field] = total
      return copy
    })
  },

  MovingAvg(args) {
    if (args.length < 3) fxBad('@MovingAvg needs rows, a field and a window')
    const rows = fxList(args[0], '@MovingAvg')
    const field = fxKey(args[1])
    const window = Math.max(1, Math.trunc(fxNumber(args[2], '@MovingAvg')))
    const recent = []
    return rows.map((row) => {
      const source = field === '' ? row : fxField(row, field)
      const number = fxMaybeNumber(source)
      if (!Number.isNaN(number)) {
        recent.push(number)
        if (recent.length > window) recent.shift()
      }
      let total = 0
      for (const value of recent) total += value
      const average = recent.length > 0 ? total / recent.length : 0
      if (field === '' || !fxIsPlainObject(row)) return average
      const copy = { ...row }
      copy[field] = average
      return copy
    })
  },

  Change(args) {
    if (args.length < 2) fxBad('@Change needs a current and a previous value')
    const current = fxNumber(args[0], '@Change')
    const previous = fxNumber(args[1], '@Change')
    if (previous === 0) return null
    return ((current - previous) / Math.abs(previous)) * 100
  },

  Histogram(args) {
    if (args.length < 2) fxBad('@Histogram needs values and a bin count')
    const list = fxList(args[0], '@Histogram')
    const bins = Math.trunc(fxNumber(args[1], '@Histogram'))
    if (bins < 1) fxBad('@Histogram needs at least one bin')
    const values = []
    for (const item of list) {
      const number = fxMaybeNumber(item)
      if (!Number.isNaN(number)) values.push(number)
    }
    if (values.length === 0) return []
    let low = args.length > 2 && args[2] !== null && args[2] !== undefined ? fxNumber(args[2], '@Histogram') : values[0]
    let high = args.length > 3 && args[3] !== null && args[3] !== undefined ? fxNumber(args[3], '@Histogram') : values[0]
    if (!(args.length > 2 && args[2] !== null && args[2] !== undefined)) {
      for (const value of values) if (value < low) low = value
    }
    if (!(args.length > 3 && args[3] !== null && args[3] !== undefined)) {
      for (const value of values) if (value > high) high = value
    }
    if (!(high > low)) high = low + 1
    const width = (high - low) / bins
    const counts = new Array(bins).fill(0)
    for (const value of values) {
      if (value < low || value > high) continue
      let index = Math.floor((value - low) / width)
      if (index >= bins) index = bins - 1
      if (index < 0) index = 0
      counts[index] += 1
    }
    return counts.map((count, index) => {
      const start = low + index * width
      const end = start + width
      return { key: `${fxRoundTo(start, 4)}–${fxRoundTo(end, 4)}`, value: count, start, end }
    })
  },

  Stats(args) {
    const list = fxList(args[0], '@Stats')
    const values = []
    for (const item of list) {
      const number = fxMaybeNumber(item)
      if (!Number.isNaN(number)) values.push(number)
    }
    if (values.length === 0) return { count: 0, min: 0, max: 0, mean: 0, median: 0, stdev: 0 }
    const sorted = values.slice().sort((left, right) => left - right)
    let total = 0
    for (const value of sorted) total += value
    const mean = total / sorted.length
    const middle = Math.floor(sorted.length / 2)
    const median = sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
    let variance = 0
    for (const value of sorted) variance += (value - mean) * (value - mean)
    variance /= sorted.length
    return {
      count: sorted.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      mean,
      median,
      stdev: Math.sqrt(variance),
    }
  },
}

/**
 * Wrap every implementation so a direct call with unusable arguments returns `null`
 * instead of throwing. Diagnostics are reported only through `callFunction`.
 * @returns {Record<string, (args: any[]) => any>} the public function table.
 */
function fxWrapImplementations() {
  const table = {}
  for (const name of Object.keys(fxImplementations)) {
    const implementation = fxImplementations[name]
    table[name] = function (args) {
      try {
        return implementation(Array.isArray(args) ? args : [])
      } catch (error) {
        return null
      }
    }
  }
  return table
}

/** Every built-in `@function`, keyed by its bare name (without the `@`). */
export const FUNCTIONS = fxWrapImplementations()

/**
 * Call one built-in by name.
 * @param {string} name - bare function name, without `@`.
 * @param {any[]} args - already-unwrapped argument values.
 * @param {(message: string, severity?: 'error'|'warning') => void} [report] - diagnostic sink.
 * @returns {any} the value, or `null` when the name is unknown or an argument is unusable.
 */
export function callFunction(name, args, report) {
  const notify = typeof report === 'function' ? report : null
  const implementation = Object.prototype.hasOwnProperty.call(fxImplementations, name) ? fxImplementations[name] : null
  if (typeof implementation !== 'function') {
    if (notify) notify(`unknown function "@${String(name)}"; use only the @functions in the prompt`, 'error')
    return null
  }
  try {
    return implementation(Array.isArray(args) ? args : [])
  } catch (error) {
    const message = error instanceof FxArgumentError
      ? error.message
      : `@${String(name)} could not use these arguments`
    if (notify) notify(message, 'error')
    return null
  }
}

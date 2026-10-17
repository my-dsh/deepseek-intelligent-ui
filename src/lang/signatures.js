/**
 * The frozen component and `@function` library taught to the model.
 *
 * `COMPONENT_SIGNATURES` is the authority for `docs/INTERFACES.md` §6.4: exactly those 48
 * component names, in that order, with positional argument names in the frozen order.
 * `required` is `true` for the leading `min` arguments of each component.
 *
 * `FUNCTION_SIGNATURES` lists the 71 built-ins of §5.4 plus `@Each`, which the evaluator
 * implements directly.
 *
 * @module src/lang/signatures
 */

/**
 * Build the argument list of a component signature.
 * @param {string[]} specs - `name:type` strings, in positional order.
 * @param {number} min - number of required leading arguments.
 * @returns {{ name: string, type: string, required: boolean }[]} argument descriptors.
 */
function signatureArgs(specs, min) {
  return specs.map((spec, index) => {
    const colon = spec.indexOf(':')
    return {
      name: colon === -1 ? spec : spec.slice(0, colon),
      type: colon === -1 ? 'any' : spec.slice(colon + 1),
      required: index < min,
    }
  })
}

/**
 * Build one component signature entry.
 * @param {string} name - component name.
 * @param {string} group - prompt group (`Layout`, `Text`, `Drawing`, `Inputs`, `Media and data`, `Play`).
 * @param {number} min - number of required leading arguments.
 * @param {string[]} args - `name:type` strings, in positional order.
 * @param {string} description - one short line teaching the component.
 * @returns {{ name: string, group: string, args: object[], description: string }} signature entry.
 */
function componentSignature(name, group, min, args, description) {
  return { name, group, args: signatureArgs(args, min), description }
}

/** Every component the language supports, in prompt order. */
export const COMPONENT_SIGNATURES = [
  componentSignature('Col', 'Layout', 1, ['children:Node[]', 'gap:number', 'align:"start" | "center" | "end" | "stretch"'], 'Vertical stack; without gap it spaces blocks like an article.'),
  componentSignature('Row', 'Layout', 1, ['children:Node[]', 'gap:number', 'align:"start" | "center" | "end" | "stretch"', 'justify:"start" | "center" | "end" | "between"', 'wrap:boolean'], 'Horizontal row; items are vertically centered.'),
  componentSignature('Box', 'Layout', 0, ['children:Node[]', 'direction:"row" | "col"', 'gap:number', 'padding:number', 'background:Color', 'radius:Radius', 'border:boolean', 'width:Length', 'height:Length', 'flex:number', 'align:"start" | "center" | "end" | "stretch"', 'justify:"start" | "center" | "end" | "between"', 'wrap:boolean'], 'Flex container, a column by default; radius also clips content.'),
  componentSignature('Grid', 'Layout', 1, ['children:Node[]', 'columns:number', 'minChildWidth:number', 'gap:number'], 'Equal columns (2 by default); minChildWidth drops columns when narrow.'),
  componentSignature('Card', 'Layout', 1, ['children:Node[]', 'variant:"soft" | "outlined" | "elevated"', 'padding:number', 'gap:number'], 'Panel; outlined is border-only, soft a filled panel, elevated a raised panel.'),
  componentSignature('Carousel', 'Layout', 1, ['children:Node[]', 'itemWidth:number', 'gap:number'], 'Scrolling, snapping row; each child is itemWidth px wide.'),
  componentSignature('Popover', 'Layout', 2, ['trigger:string | Node[]', 'content:string | Node[]'], 'Shows content in a small panel when the trigger is clicked.'),
  componentSignature('Divider', 'Layout', 0, [], 'Thin horizontal rule between blocks.'),
  componentSignature('Spacer', 'Layout', 0, [], 'Fills the free space in a Row.'),

  componentSignature('Title', 'Text', 1, ['text:string', 'size:"sm" | "md" | "lg" | "xl" | "2xl" | "3xl"', 'color:Color'], 'Heading; lg for a card title, 2xl for a big number.'),
  componentSignature('Text', 'Text', 1, ['text:string | Node[]', 'size:"xs" | "sm" | "md" | "lg" | "xl" | "2xl"', 'color:Color', 'weight:"normal" | "medium" | "semibold"', 'italic:boolean', 'lineThrough:boolean', 'tabularNums:boolean', 'maxLines:number'], 'Paragraph; text may be a list mixing strings and inline components.'),
  componentSignature('Caption', 'Text', 1, ['text:string', 'color:Color'], 'Small secondary text.'),
  componentSignature('Label', 'Text', 1, ['text:string'], 'Field or group label.'),
  componentSignature('Badge', 'Text', 1, ['text:string', 'color:"info" | "success" | "warning" | "danger" | "purple" | "pink"'], 'Small status pill.'),
  componentSignature('Link', 'Text', 2, ['text:string', 'url:string'], 'Opens an http(s) URL in a new tab.'),
  componentSignature('List', 'Text', 1, ['items:(string | ListItem)[]', 'marker:"bullet" | "number" | "dash" | "check" | "none"', 'timeline:boolean'], 'Bulleted list; timeline joins the markers with a line.'),
  componentSignature('ListItem', 'Text', 1, ['title:string', 'description:string', 'marker:string', 'children:Node[]'], 'List row; marker replaces the bullet or number.'),
  componentSignature('Quote', 'Text', 1, ['text:string', 'cite:string'], 'Quotation or callout with a side rule.'),
  componentSignature('Code', 'Text', 1, ['code:string', 'language:string'], 'Code block with a copy button.'),

  componentSignature('Svg', 'Drawing', 2, ['children:Node[]', 'viewBox:string', 'width:Length', 'height:Length'], 'Scaled drawing; viewBox like "0 0 240 160".'),
  componentSignature('G', 'Drawing', 1, ['children:Node[]', 'transform:string', 'opacity:number'], 'Group; transform like "rotate(30 50 50)".'),
  componentSignature('Circle', 'Drawing', 3, ['cx:number', 'cy:number', 'r:number', 'fill:Color', 'stroke:Color', 'strokeWidth:number', 'opacity:number'], 'Circle at (cx, cy) with radius r.'),
  componentSignature('Ellipse', 'Drawing', 4, ['cx:number', 'cy:number', 'rx:number', 'ry:number', 'fill:Color', 'stroke:Color', 'strokeWidth:number', 'opacity:number'], 'Ellipse at (cx, cy) with radii rx and ry.'),
  componentSignature('Rect', 'Drawing', 4, ['x:number', 'y:number', 'width:number', 'height:number', 'fill:Color', 'stroke:Color', 'strokeWidth:number', 'opacity:number', 'rx:number'], 'Rectangle, optionally with rounded corners (rx).'),
  componentSignature('Line', 'Drawing', 4, ['x1:number', 'y1:number', 'x2:number', 'y2:number', 'stroke:Color', 'strokeWidth:number', 'opacity:number'], 'Straight line between two points.'),
  componentSignature('Path', 'Drawing', 1, ['d:string', 'fill:Color', 'stroke:Color', 'strokeWidth:number', 'opacity:number'], 'SVG path; d like "M 0 0 L 10 10".'),
  componentSignature('Polyline', 'Drawing', 1, ['points:string', 'stroke:Color', 'strokeWidth:number', 'fill:Color', 'opacity:number'], 'Open polyline; points like "0,0 10,5 20,0".'),
  componentSignature('Polygon', 'Drawing', 1, ['points:string', 'fill:Color', 'stroke:Color', 'strokeWidth:number', 'opacity:number'], 'Closed polygon; points like "0,0 10,5 20,0".'),
  componentSignature('SvgText', 'Drawing', 3, ['text:string', 'x:number', 'y:number', 'size:number', 'fill:Color', 'anchor:"start" | "middle" | "end"', 'weight:"normal" | "medium" | "semibold"'], 'Text inside an Svg drawing.'),

  componentSignature('Button', 'Inputs', 1, ['label:string', 'action:Action', 'variant:"primary" | "secondary" | "ghost" | "outline" | "danger"', 'color:"primary" | "danger" | "success"', 'size:"sm" | "md" | "lg"', 'icon:string', 'disabled:boolean', 'block:boolean'], 'Button; without an action it sends its label to the assistant.'),
  componentSignature('IconButton', 'Inputs', 1, ['icon:string', 'action:Action', 'label:string', 'variant:"primary" | "secondary" | "ghost" | "outline" | "danger"'], 'Round icon-only button; label is read aloud.'),
  componentSignature('Pressable', 'Inputs', 1, ['children:Node[]', 'action:Action', 'selected:boolean', 'padding:number', 'background:Color', 'radius:Radius'], 'Makes any content clickable, such as a tile or a swatch.'),
  componentSignature('Input', 'Inputs', 1, ['value:$binding<string | number>', 'label:string', 'type:"text" | "number"', 'placeholder:string'], 'Text or number field; a number field stores numbers.'),
  componentSignature('TextArea', 'Inputs', 1, ['value:$binding<string>', 'label:string', 'placeholder:string', 'rows:number'], 'Multi-line text field.'),
  componentSignature('Select', 'Inputs', 2, ['value:$binding<string>', 'options:(string | {value, label})[]', 'label:string', 'placeholder:string'], 'Dropdown, for long option lists.'),
  componentSignature('SegmentedControl', 'Inputs', 2, ['value:$binding<string>', 'options:(string | {value, label})[]', 'block:boolean'], 'Two to four short choices in a row.'),
  componentSignature('Slider', 'Inputs', 3, ['value:$binding<number>', 'min:number', 'max:number', 'step:number', 'label:string', 'unit:string', 'marks:{value, label}[]'], 'Range slider; unit like "%" or "$" formats the value.'),
  componentSignature('Checkbox', 'Inputs', 2, ['checked:$binding<boolean>', 'label:string', 'lineThrough:boolean'], 'Checkbox; lineThrough strikes the label when checked.'),
  componentSignature('RadioGroup', 'Inputs', 2, ['value:$binding<string>', 'options:(string | {value, label, description})[]', 'label:string', 'variant:"list" | "cards"'], 'Radio choices; cards add a description line.'),
  componentSignature('DatePicker', 'Inputs', 1, ['value:$binding<string>', 'label:string', 'min:string', 'max:string'], 'Date field; dates are "YYYY-MM-DD".'),
  componentSignature('Timer', 'Inputs', 1, ['seconds:$binding<number>', 'label:string'], 'Countdown with start, pause and reset; it counts the bound seconds down.'),
  componentSignature('Form', 'Inputs', 1, ['children:Node[]'], 'Groups fields; their values travel with an @ToAssistant inside.'),

  componentSignature('Image', 'Media and data', 2, ['src:string', 'alt:string', 'aspectRatio:number', 'radius:Radius', 'fit:"cover" | "contain"'], 'Photo from a URL the user or a tool gave.'),
  componentSignature('Icon', 'Media and data', 1, ['name:string', 'size:"sm" | "md" | "lg" | "xl"', 'color:Color'], 'Lucide icon by name, e.g. "map-pin".'),
  componentSignature('Table', 'Media and data', 2, ['columns:string[]', 'rows:any[][]'], 'Rows of cells in column order; a cell may be a component.'),
  componentSignature('Chart', 'Media and data', 2, ['type:"bar" | "line" | "area" | "pie" | "donut" | "scatter"', 'data:Record<string, string | number>[]', 'x:string', 'series:string[]', 'format:"number" | "currency" | "percent"', 'currency:string', 'stacked:boolean', 'height:number'], 'Chart of row objects; x is the category key, series the value keys.'),

  componentSignature('Flashcard', 'Play', 2, ['front:string | Node[]', 'back:string | Node[]', 'hint:string'], 'Card that flips between front and back when tapped.'),
  componentSignature('Celebration', 'Play', 1, ['when:boolean'], 'Bursts confetti when its condition turns true.'),
]

/**
 * Build one `@function` signature entry.
 * @param {string} name - function name without `@`.
 * @param {string} signature - compact signature taught in the prompt.
 * @param {string} description - one line of detail.
 * @returns {{ name: string, signature: string, description: string }} signature entry.
 */
function functionSignature(name, signature, description) {
  return { name, signature, description }
}

/** Every built-in `@function`, plus `@Each`, in prompt order. */
export const FUNCTION_SIGNATURES = [
  functionSignature('Count', '@Count(list)', 'Returns the number of items, or 0 for null.'),
  functionSignature('First', '@First(list)', 'First item, or null for an empty list.'),
  functionSignature('Last', '@Last(list)', 'Last item, or null for an empty list.'),
  functionSignature('Sum', '@Sum(nums)', 'Total of the numbers; null and blank entries are skipped.'),
  functionSignature('Avg', '@Avg(nums)', 'Mean of the numbers, skipping null and blank; 0 when none.'),
  functionSignature('Min', '@Min(nums)', 'Smallest number, skipping null and blank; null when none.'),
  functionSignature('Max', '@Max(nums)', 'Largest number, skipping null and blank; null when none.'),
  functionSignature('Sort', '@Sort(list,field,dir?)', 'Copy sorted by field; direction "asc" (default) or "desc" (ascending/descending also accepted).'),
  functionSignature('Filter', '@Filter(list,field,op,value)', 'Rows whose field matches; operator == != > < >= <= contains, field "" for the item itself; a missing field never matches > < >= <=.'),
  functionSignature('Round', '@Round(num,dec?)', 'Rounds to N decimal places (default 0).'),
  functionSignature('Abs', '@Abs(num)', 'Absolute value.'),
  functionSignature('Floor', '@Floor(num)', 'Rounds down to the nearest integer.'),
  functionSignature('Ceil', '@Ceil(num)', 'Rounds up to the nearest integer.'),

  functionSignature('Append', '@Append(list,item)', 'Copy of the list with item at the end.'),
  functionSignature('Prepend', '@Prepend(list,item)', 'Copy of the list with item at the start.'),
  functionSignature('Concat', '@Concat(list,more)', 'Joins two lists.'),
  functionSignature('Remove', '@Remove(list,field,value)', 'Copy without the items whose field equals value; field "" compares the items themselves.'),
  functionSignature('RemoveAt', '@RemoveAt(list,index)', 'Copy without the item at index (negative counts from the end).'),
  functionSignature('Update', '@Update(list,field,value,setField,setValue)', 'Copy where matching items get setField set to setValue.'),
  functionSignature('Toggle', '@Toggle(list,item)', 'Adds item when missing, removes it when present.'),
  functionSignature('Includes', '@Includes(list,item)', 'True when the list has item, or the text contains it.'),
  functionSignature('Find', '@Find(list,field,value)', 'First item whose field equals value, or null.'),
  functionSignature('IndexOf', '@IndexOf(list,item)', 'Index of item, or -1.'),
  functionSignature('Take', '@Take(list,n)', 'First n items; a negative n takes the last n.'),
  functionSignature('Slice', '@Slice(list,start,end?)→list | string', 'Items, or characters, from start up to end; negative counts from the end.'),

  functionSignature('Unique', '@Unique(list)', 'Distinct items in first-seen order.'),
  functionSignature('Reverse', '@Reverse(list)', 'Copy in reverse order.'),
  functionSignature('Range', '@Range(start,end,step?)', 'Numbers from start up to end, by step (default 1).'),
  functionSignature('Pick', '@Pick(list)', 'A random item, or null when empty; draws anew each time, so call it inside @Set.'),
  functionSignature('Shuffle', '@Shuffle(list)', 'Copy in random order; call it inside @Set.'),
  functionSignature('Flatten', '@Flatten(list)', 'One list from a list of lists.'),
  functionSignature('Chunk', '@Chunk(list,size)→list[]', 'The list cut into lists of size items.'),

  functionSignature('Pow', '@Pow(base,exp)', 'Base raised to exponent.'),
  functionSignature('Sqrt', '@Sqrt(num)', 'Square root; null for a negative number.'),
  functionSignature('Random', '@Random(min,max,int?)', 'Random number from min to max; call it inside @Set.'),
  functionSignature('Clamp', '@Clamp(num,min,max)', 'Number kept between min and max.'),
  functionSignature('Percent', '@Percent(part,total)', 'part / total * 100; 0 when total is 0.'),
  functionSignature('Lerp', '@Lerp(a,b,t)', 'Value a fraction t of the way from a to b.'),
  functionSignature('Allocate', '@Allocate(total,weights,dec?)', 'Splits total in proportion to weights so the parts add up to exactly total.'),
  functionSignature('Payment', '@Payment(principal,rate,periods)', 'Payment per period at rate percent per period.'),
  functionSignature('Convert', '@Convert(value,from,to)', 'Unit conversion: length, mass, volume, speed, area and c/f/k.'),

  functionSignature('Format', '@Format(value,kind?,dec?,currency?)', 'Number as text: "number" (default), "currency", "percent" (45 → 45%) or "compact" (1.2M); any other kind is an error.'),
  functionSignature('Join', '@Join(list,sep?,field?)', 'Joins the items, or their field, skipping nulls; separator defaults to ", ".'),
  functionSignature('Plural', '@Plural(n,word,plural?)', 'Count and word: @Plural(1, "guest") is "1 guest".'),
  functionSignature('Pad', '@Pad(value,length,char?)', 'Pads the start of value to length with char (default "0").'),
  functionSignature('Upper', '@Upper(text)', 'Text in upper case.'),
  functionSignature('Lower', '@Lower(text)', 'Text in lower case.'),
  functionSignature('Trim', '@Trim(text)', 'Text without spaces at the start and end.'),
  functionSignature('Capitalize', '@Capitalize(text)', 'Each word with a capital first letter.'),
  functionSignature('Split', '@Split(text,sep?)→string[]', 'Parts of text between separator (default ","), trimmed, empty parts dropped.'),
  functionSignature('Replace', '@Replace(text,find,with)', 'Text with every find replaced.'),
  functionSignature('Duration', '@Duration(seconds,style?)', 'Seconds as text: "short" (default) 1h 20m or 4m 05s, "clock" 4:05; any other style is an error.'),
  functionSignature('Default', '@Default(value,fallback)', 'Value, or fallback when the value is null, "" or NaN.'),
  functionSignature('MixColor', '@MixColor(from,to,t)', 'The hex colour a fraction t of the way from one hex colour to another.'),

  functionSignature('Now', '@Now()', 'The current date and time as an ISO string.'),
  functionSignature('Today', '@Today()', "Today's date in the viewer's time zone, as \"YYYY-MM-DD\"."),
  functionSignature('FormatDate', '@FormatDate(date,style?)', 'A date as text: "date", "short", "long", "weekday", "month", "time", "datetime" or "iso".'),
  functionSignature('AddDays', '@AddDays(date,days)', 'The date days later (negative: earlier) as "YYYY-MM-DD".'),
  functionSignature('AddMonths', '@AddMonths(date,months)', 'The date months later, kept within the month, as "YYYY-MM-DD".'),
  functionSignature('DaysBetween', '@DaysBetween(from,to)', 'Calendar days from one date to another.'),
  functionSignature('MonthsBetween', '@MonthsBetween(from,to)', 'Whole months from one date to another.'),
  functionSignature('StartOf', '@StartOf(date,unit)', 'First day of the "week" (Monday), "month" or "year", as "YYYY-MM-DD".'),

  functionSignature('GroupBy', '@GroupBy(rows,key,field?,agg?)→{key,value}[]', 'One row per distinct key in first-seen order; agg is sum (default), avg, count (counts rows), min or max; without field it counts rows.'),
  functionSignature('Pivot', '@Pivot(rows,rowKey,colKey,field?,agg?)→object[]', 'One row per rowKey value with a "key" column and one column per colKey value; a label colliding with "key" or an earlier column gets a " (2)" suffix.'),
  functionSignature('Top', '@Top(rows,field,n,dir?)', 'The n rows with the largest field ("asc"/"ascending": the smallest).'),
  functionSignature('Between', '@Between(rows,field,min?,max?)', 'Rows whose field is from min to max, both included; null leaves an open end; a missing field never matches.'),
  functionSignature('Bucket', '@Bucket(rows,dateField,unit,field?,agg?)→{key,value}[]', 'Rows per "day", "week" (from Monday) or "month" of dateField, in date order, missing periods filled with 0 for sum/avg/count and null for min/max.'),
  functionSignature('Cumulative', '@Cumulative(rows,field)', 'Copy of the rows with field replaced by its running total; field "" for a list of numbers.'),
  functionSignature('MovingAvg', '@MovingAvg(rows,field,window)', 'Copy of the rows with field replaced by the average of its last window numeric values; missing values are skipped.'),
  functionSignature('Change', '@Change(now,before)', 'Percent change from previous to current, relative to |previous|; null when previous is 0.'),
  functionSignature('Histogram', '@Histogram(values,bins,min?,max?)→{key,value,start,end}[]', 'Counts numbers into equal-width bins, skipping null and blank; min and max fix the range.'),
  functionSignature('Stats', '@Stats(values)→{count,min,max,mean,median,stdev}', 'Summary of the numbers, skipping null and blank; all zeros for an empty list.'),

  functionSignature('Each', '@Each(list,"varName",template)', 'Evaluates template for every item with the loop variable bound to it, and concatenates the results.'),
]

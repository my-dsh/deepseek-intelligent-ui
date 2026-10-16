/**
 * Dictionary of the `intelligent-ui` locale namespace.
 *
 * The key set is frozen by docs/INTERFACES.md §6.6: it is exactly these keys in
 * both `en` and `zh`, and components may use no others. `90-apply.js` registers
 * this dictionary with `ctx.locale.register('intelligent-ui', { en, zh })`.
 *
 * @module dsh-intelligent-ui/client/locales
 */

/** English dictionary of the `intelligent-ui` namespace. */
const en = {
  'row.title': 'Intelligent UI',
  'row.preparing': 'Preparing interface…',
  'row.copy': 'Copy',
  'row.copied': 'Copied',
  'row.inspect': 'Inspect',
  'error.title': 'This interface could not be rendered',
  'error.empty': 'The program is empty.',
  'error.invalid': 'The program is not valid openui-lang.',
  'timer.start': 'Start',
  'timer.pause': 'Pause',
  'timer.reset': 'Reset',
  'image.failed': 'Image failed to load',
  'chart.empty': 'No data',
  'unknown.component': 'Unknown component',
}

/** Chinese dictionary of the `intelligent-ui` namespace. */
const zh = {
  'row.title': '智能 UI',
  'row.preparing': '正在准备界面…',
  'row.copy': '复制',
  'row.copied': '已复制',
  'row.inspect': '查看',
  'error.title': '无法渲染这个界面',
  'error.empty': '程序为空。',
  'error.invalid': '程序不是有效的 openui-lang。',
  'timer.start': '开始',
  'timer.pause': '暂停',
  'timer.reset': '重置',
  'image.failed': '图片加载失败',
  'chart.empty': '暂无数据',
  'unknown.component': '未知组件',
}

/**
 * English fallback for a namespace miss; `99-diagnostics.js` publishes it as
 * `IUI.text` for the case where no locale service is reachable.
 *
 * @param {string} key - dictionary key.
 * @returns {string} translation, or the key itself when unknown.
 */
function iuiFallbackText(key) {
  return Object.prototype.hasOwnProperty.call(en, key) ? en[key] : String(key)
}

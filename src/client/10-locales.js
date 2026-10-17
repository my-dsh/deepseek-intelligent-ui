/**
 * Dictionary of the `intelligent-ui` namespace.
 *
 * The §6.6 key set is the contract: both dictionaries define exactly the same keys, and
 * components may use no others. The keys after `unknown.component` are the screen-reader
 * names and truncation copy the renderer itself needs, kept in the namespace instead of
 * hard-coded English. `90-apply.js` registers this dictionary with
 * `ctx.locale.register('intelligent-ui', { en, zh })`.
 *
 * @module @my-dsh/dsh-intelligent-ui/client/locales
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
  'carousel.previous': 'Previous',
  'carousel.next': 'Next',
  'carousel.slide': 'Slide',
  'popover.panel': 'Details',
  'chart.label': 'Chart',
  'chart.rows': 'rows',
  'notice.truncated': 'This interface is too large, so part of it was not rendered.',
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
  'carousel.previous': '上一张',
  'carousel.next': '下一张',
  'carousel.slide': '幻灯片',
  'popover.panel': '详情',
  'chart.label': '图表',
  'chart.rows': '行数据',
  'notice.truncated': '界面过大，部分内容未渲染。',
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

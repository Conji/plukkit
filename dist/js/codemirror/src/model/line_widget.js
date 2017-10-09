import { runInOp } from "../display/operations"
import { addToScrollTop } from "../display/scrolling"
import { regLineChange } from "../display/view_tracking"
import { heightAtLine, lineIsHidden } from "../line/spans"
import { lineNo, updateLineHeight } from "../line/utils_line"
import { widgetHeight } from "../measurement/widgets"
import { changeLine } from "./changes"
import { eventMixin } from "../util/event"
import { signalLater } from "../util/operation_group"

// Line widgets are block elements displayed above or below a line.

export var LineWidget = function LineWidget(doc, node, options) {
  var this$1 = this;

  if (options) { for (var opt in options) { if (options.hasOwnProperty(opt))
    { this$1[opt] = options[opt] } } }
  this.doc = doc
  this.node = node
};

LineWidget.prototype.clear = function clear () {
    var this$1 = this;

  var cm = this.doc.cm, ws = this.line.widgets, line = this.line, no = lineNo(line)
  if (no == null || !ws) { return }
  for (var i = 0; i < ws.length; ++i) { if (ws[i] == this$1) { ws.splice(i--, 1) } }
  if (!ws.length) { line.widgets = null }
  var height = widgetHeight(this)
  updateLineHeight(line, Math.max(0, line.height - height))
  if (cm) {
    runInOp(cm, function () {
      adjustScrollWhenAboveVisible(cm, line, -height)
      regLineChange(cm, no, "widget")
    })
    signalLater(cm, "lineWidgetCleared", cm, this, no)
  }
};

LineWidget.prototype.changed = function changed () {
    var this$1 = this;

  var oldH = this.height, cm = this.doc.cm, line = this.line
  this.height = null
  var diff = widgetHeight(this) - oldH
  if (!diff) { return }
  updateLineHeight(line, line.height + diff)
  if (cm) {
    runInOp(cm, function () {
      cm.curOp.forceUpdate = true
      adjustScrollWhenAboveVisible(cm, line, diff)
      signalLater(cm, "lineWidgetChanged", cm, this$1, lineNo(line))
    })
  }
};
eventMixin(LineWidget)

function adjustScrollWhenAboveVisible(cm, line, diff) {
  if (heightAtLine(line) < ((cm.curOp && cm.curOp.scrollTop) || cm.doc.scrollTop))
    { addToScrollTop(cm, diff) }
}

export function addLineWidget(doc, handle, node, options) {
  var widget = new LineWidget(doc, node, options)
  var cm = doc.cm
  if (cm && widget.noHScroll) { cm.display.alignWidgets = true }
  changeLine(doc, handle, "widget", function (line) {
    var widgets = line.widgets || (line.widgets = [])
    if (widget.insertAt == null) { widgets.push(widget) }
    else { widgets.splice(Math.min(widgets.length - 1, Math.max(0, widget.insertAt)), 0, widget) }
    widget.line = line
    if (cm && !lineIsHidden(doc, line)) {
      var aboveVisible = heightAtLine(line) < doc.scrollTop
      updateLineHeight(line, line.height + widgetHeight(widget))
      if (aboveVisible) { addToScrollTop(cm, widget.height) }
      cm.curOp.forceUpdate = true
    }
    return true
  })
  signalLater(cm, "lineWidgetAdded", cm, widget, typeof handle == "number" ? handle : lineNo(handle))
  return widget
}

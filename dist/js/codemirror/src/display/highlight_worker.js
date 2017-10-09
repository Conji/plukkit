import { getContextBefore, highlightLine, processLine } from "../line/highlight"
import { copyState } from "../modes"
import { bind } from "../util/misc"

import { runInOp } from "./operations"
import { regLineChange } from "./view_tracking"

// HIGHLIGHT WORKER

export function startWorker(cm, time) {
  if (cm.doc.highlightFrontier < cm.display.viewTo)
    { cm.state.highlight.set(time, bind(highlightWorker, cm)) }
}

function highlightWorker(cm) {
  var doc = cm.doc
  if (doc.highlightFrontier >= cm.display.viewTo) { return }
  var end = +new Date + cm.options.workTime
  var context = getContextBefore(cm, doc.highlightFrontier)
  var changedLines = []

  doc.iter(context.line, Math.min(doc.first + doc.size, cm.display.viewTo + 500), function (line) {
    if (context.line >= cm.display.viewFrom) { // Visible
      var oldStyles = line.styles
      var resetState = line.text.length > cm.options.maxHighlightLength ? copyState(doc.mode, context.state) : null
      var highlighted = highlightLine(cm, line, context, true)
      if (resetState) { context.state = resetState }
      line.styles = highlighted.styles
      var oldCls = line.styleClasses, newCls = highlighted.classes
      if (newCls) { line.styleClasses = newCls }
      else if (oldCls) { line.styleClasses = null }
      var ischange = !oldStyles || oldStyles.length != line.styles.length ||
        oldCls != newCls && (!oldCls || !newCls || oldCls.bgClass != newCls.bgClass || oldCls.textClass != newCls.textClass)
      for (var i = 0; !ischange && i < oldStyles.length; ++i) { ischange = oldStyles[i] != line.styles[i] }
      if (ischange) { changedLines.push(context.line) }
      line.stateAfter = context.save()
      context.nextLine()
    } else {
      if (line.text.length <= cm.options.maxHighlightLength)
        { processLine(cm, line.text, context) }
      line.stateAfter = context.line % 5 == 0 ? context.save() : null
      context.nextLine()
    }
    if (+new Date > end) {
      startWorker(cm, cm.options.workDelay)
      return true
    }
  })
  doc.highlightFrontier = context.line
  doc.modeFrontier = Math.max(doc.modeFrontier, context.line)
  if (changedLines.length) { runInOp(cm, function () {
    for (var i = 0; i < changedLines.length; i++)
      { regLineChange(cm, changedLines[i], "text") }
  }) }
}

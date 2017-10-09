import { Pos } from "../line/pos"
import { visualLine } from "../line/spans"
import { getLine } from "../line/utils_line"
import { charCoords, cursorCoords, displayWidth, paddingH, wrappedLineExtentChar } from "../measurement/position_measurement"
import { getOrder, iterateBidiSections } from "../util/bidi"
import { elt } from "../util/dom"

export function updateSelection(cm) {
  cm.display.input.showSelection(cm.display.input.prepareSelection())
}

export function prepareSelection(cm, primary) {
  if ( primary === void 0 ) primary = true;

  var doc = cm.doc, result = {}
  var curFragment = result.cursors = document.createDocumentFragment()
  var selFragment = result.selection = document.createDocumentFragment()

  for (var i = 0; i < doc.sel.ranges.length; i++) {
    if (!primary && i == doc.sel.primIndex) { continue }
    var range = doc.sel.ranges[i]
    if (range.from().line >= cm.display.viewTo || range.to().line < cm.display.viewFrom) { continue }
    var collapsed = range.empty()
    if (collapsed || cm.options.showCursorWhenSelecting)
      { drawSelectionCursor(cm, range.head, curFragment) }
    if (!collapsed)
      { drawSelectionRange(cm, range, selFragment) }
  }
  return result
}

// Draws a cursor for the given range
export function drawSelectionCursor(cm, head, output) {
  var pos = cursorCoords(cm, head, "div", null, null, !cm.options.singleCursorHeightPerLine)

  var cursor = output.appendChild(elt("div", "\u00a0", "CodeMirror-cursor"))
  cursor.style.left = pos.left + "px"
  cursor.style.top = pos.top + "px"
  cursor.style.height = Math.max(0, pos.bottom - pos.top) * cm.options.cursorHeight + "px"

  if (pos.other) {
    // Secondary cursor, shown when on a 'jump' in bi-directional text
    var otherCursor = output.appendChild(elt("div", "\u00a0", "CodeMirror-cursor CodeMirror-secondarycursor"))
    otherCursor.style.display = ""
    otherCursor.style.left = pos.other.left + "px"
    otherCursor.style.top = pos.other.top + "px"
    otherCursor.style.height = (pos.other.bottom - pos.other.top) * .85 + "px"
  }
}

function cmpCoords(a, b) { return a.top - b.top || a.left - b.left }

// Draws the given range as a highlighted selection
function drawSelectionRange(cm, range, output) {
  var display = cm.display, doc = cm.doc
  var fragment = document.createDocumentFragment()
  var padding = paddingH(cm.display), leftSide = padding.left
  var rightSide = Math.max(display.sizerWidth, displayWidth(cm) - display.sizer.offsetLeft) - padding.right

  function add(left, top, width, bottom) {
    if (top < 0) { top = 0 }
    top = Math.round(top)
    bottom = Math.round(bottom)
    fragment.appendChild(elt("div", null, "CodeMirror-selected", ("position: absolute; left: " + left + "px;\n                             top: " + top + "px; width: " + (width == null ? rightSide - left : width) + "px;\n                             height: " + (bottom - top) + "px")))
  }

  function drawForLine(line, fromArg, toArg) {
    var lineObj = getLine(doc, line)
    var lineLen = lineObj.text.length
    var start, end
    function coords(ch, bias) {
      return charCoords(cm, Pos(line, ch), "div", lineObj, bias)
    }

    var order = getOrder(lineObj, doc.direction)
    iterateBidiSections(order, fromArg || 0, toArg == null ? lineLen : toArg, function (from, to, dir, i) {
      var fromPos = coords(from, dir == "ltr" ? "left" : "right")
      var toPos = coords(to - 1, dir == "ltr" ? "right" : "left")
      if (dir == "ltr") {
        var fromLeft = fromArg == null && from == 0 ? leftSide : fromPos.left
        var toRight = toArg == null && to == lineLen ? rightSide : toPos.right
        if (toPos.top - fromPos.top <= 3) { // Single line
          add(fromLeft, toPos.top, toRight - fromLeft, toPos.bottom)
        } else { // Multiple lines
          add(fromLeft, fromPos.top, null, fromPos.bottom)
          if (fromPos.bottom < toPos.top) { add(leftSide, fromPos.bottom, null, toPos.top) }
          add(leftSide, toPos.top, toPos.right, toPos.bottom)
        }
      } else if (from < to) { // RTL
        var fromRight = fromArg == null && from == 0 ? rightSide : fromPos.right
        var toLeft = toArg == null && to == lineLen ? leftSide : toPos.left
        if (toPos.top - fromPos.top <= 3) { // Single line
          add(toLeft, toPos.top, fromRight - toLeft, toPos.bottom)
        } else { // Multiple lines
          var topLeft = leftSide
          if (i) {
            var topEnd = wrappedLineExtentChar(cm, lineObj, null, from).end
            // The coordinates returned for an RTL wrapped space tend to
            // be complete bogus, so try to skip that here.
            topLeft = coords(topEnd - (/\s/.test(lineObj.text.charAt(topEnd - 1)) ? 2 : 1), "left").left
          }
          add(topLeft, fromPos.top, fromRight - topLeft, fromPos.bottom)
          if (fromPos.bottom < toPos.top) { add(leftSide, fromPos.bottom, null, toPos.top) }
          var botWidth = null
          if (i < order.length  - 1 || true) {
            var botStart = wrappedLineExtentChar(cm, lineObj, null, to).begin
            botWidth = coords(botStart, "right").right - toLeft
          }
          add(toLeft, toPos.top, botWidth, toPos.bottom)
        }
      }

      if (!start || cmpCoords(fromPos, start) < 0) { start = fromPos }
      if (cmpCoords(toPos, start) < 0) { start = toPos }
      if (!end || cmpCoords(fromPos, end) < 0) { end = fromPos }
      if (cmpCoords(toPos, end) < 0) { end = toPos }
    })
    return {start: start, end: end}
  }

  var sFrom = range.from(), sTo = range.to()
  if (sFrom.line == sTo.line) {
    drawForLine(sFrom.line, sFrom.ch, sTo.ch)
  } else {
    var fromLine = getLine(doc, sFrom.line), toLine = getLine(doc, sTo.line)
    var singleVLine = visualLine(fromLine) == visualLine(toLine)
    var leftEnd = drawForLine(sFrom.line, sFrom.ch, singleVLine ? fromLine.text.length + 1 : null).end
    var rightStart = drawForLine(sTo.line, singleVLine ? 0 : null, sTo.ch).start
    if (singleVLine) {
      if (leftEnd.top < rightStart.top - 2) {
        add(leftEnd.right, leftEnd.top, null, leftEnd.bottom)
        add(leftSide, rightStart.top, rightStart.left, rightStart.bottom)
      } else {
        add(leftEnd.right, leftEnd.top, rightStart.left - leftEnd.right, leftEnd.bottom)
      }
    }
    if (leftEnd.bottom < rightStart.top)
      { add(leftSide, leftEnd.bottom, null, rightStart.top) }
  }

  output.appendChild(fragment)
}

// Cursor-blinking
export function restartBlink(cm) {
  if (!cm.state.focused) { return }
  var display = cm.display
  clearInterval(display.blinker)
  var on = true
  display.cursorDiv.style.visibility = ""
  if (cm.options.cursorBlinkRate > 0)
    { display.blinker = setInterval(function () { return display.cursorDiv.style.visibility = (on = !on) ? "" : "hidden"; },
      cm.options.cursorBlinkRate) }
  else if (cm.options.cursorBlinkRate < 0)
    { display.cursorDiv.style.visibility = "hidden" }
}

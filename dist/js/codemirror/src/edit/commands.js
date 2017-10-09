import { deleteNearSelection } from "./deleteNearSelection"
import { runInOp } from "../display/operations"
import { ensureCursorVisible } from "../display/scrolling"
import { endOfLine } from "../input/movement"
import { clipPos, Pos } from "../line/pos"
import { visualLine, visualLineEnd } from "../line/spans"
import { getLine, lineNo } from "../line/utils_line"
import { Range } from "../model/selection"
import { selectAll } from "../model/selection_updates"
import { countColumn, sel_dontScroll, sel_move, spaceStr } from "../util/misc"
import { getOrder } from "../util/bidi"

// Commands are parameter-less actions that can be performed on an
// editor, mostly used for keybindings.
export var commands = {
  selectAll: selectAll,
  singleSelection: function (cm) { return cm.setSelection(cm.getCursor("anchor"), cm.getCursor("head"), sel_dontScroll); },
  killLine: function (cm) { return deleteNearSelection(cm, function (range) {
    if (range.empty()) {
      var len = getLine(cm.doc, range.head.line).text.length
      if (range.head.ch == len && range.head.line < cm.lastLine())
        { return {from: range.head, to: Pos(range.head.line + 1, 0)} }
      else
        { return {from: range.head, to: Pos(range.head.line, len)} }
    } else {
      return {from: range.from(), to: range.to()}
    }
  }); },
  deleteLine: function (cm) { return deleteNearSelection(cm, function (range) { return ({
    from: Pos(range.from().line, 0),
    to: clipPos(cm.doc, Pos(range.to().line + 1, 0))
  }); }); },
  delLineLeft: function (cm) { return deleteNearSelection(cm, function (range) { return ({
    from: Pos(range.from().line, 0), to: range.from()
  }); }); },
  delWrappedLineLeft: function (cm) { return deleteNearSelection(cm, function (range) {
    var top = cm.charCoords(range.head, "div").top + 5
    var leftPos = cm.coordsChar({left: 0, top: top}, "div")
    return {from: leftPos, to: range.from()}
  }); },
  delWrappedLineRight: function (cm) { return deleteNearSelection(cm, function (range) {
    var top = cm.charCoords(range.head, "div").top + 5
    var rightPos = cm.coordsChar({left: cm.display.lineDiv.offsetWidth + 100, top: top}, "div")
    return {from: range.from(), to: rightPos }
  }); },
  undo: function (cm) { return cm.undo(); },
  redo: function (cm) { return cm.redo(); },
  undoSelection: function (cm) { return cm.undoSelection(); },
  redoSelection: function (cm) { return cm.redoSelection(); },
  goDocStart: function (cm) { return cm.extendSelection(Pos(cm.firstLine(), 0)); },
  goDocEnd: function (cm) { return cm.extendSelection(Pos(cm.lastLine())); },
  goLineStart: function (cm) { return cm.extendSelectionsBy(function (range) { return lineStart(cm, range.head.line); },
    {origin: "+move", bias: 1}
  ); },
  goLineStartSmart: function (cm) { return cm.extendSelectionsBy(function (range) { return lineStartSmart(cm, range.head); },
    {origin: "+move", bias: 1}
  ); },
  goLineEnd: function (cm) { return cm.extendSelectionsBy(function (range) { return lineEnd(cm, range.head.line); },
    {origin: "+move", bias: -1}
  ); },
  goLineRight: function (cm) { return cm.extendSelectionsBy(function (range) {
    var top = cm.cursorCoords(range.head, "div").top + 5
    return cm.coordsChar({left: cm.display.lineDiv.offsetWidth + 100, top: top}, "div")
  }, sel_move); },
  goLineLeft: function (cm) { return cm.extendSelectionsBy(function (range) {
    var top = cm.cursorCoords(range.head, "div").top + 5
    return cm.coordsChar({left: 0, top: top}, "div")
  }, sel_move); },
  goLineLeftSmart: function (cm) { return cm.extendSelectionsBy(function (range) {
    var top = cm.cursorCoords(range.head, "div").top + 5
    var pos = cm.coordsChar({left: 0, top: top}, "div")
    if (pos.ch < cm.getLine(pos.line).search(/\S/)) { return lineStartSmart(cm, range.head) }
    return pos
  }, sel_move); },
  goLineUp: function (cm) { return cm.moveV(-1, "line"); },
  goLineDown: function (cm) { return cm.moveV(1, "line"); },
  goPageUp: function (cm) { return cm.moveV(-1, "page"); },
  goPageDown: function (cm) { return cm.moveV(1, "page"); },
  goCharLeft: function (cm) { return cm.moveH(-1, "char"); },
  goCharRight: function (cm) { return cm.moveH(1, "char"); },
  goColumnLeft: function (cm) { return cm.moveH(-1, "column"); },
  goColumnRight: function (cm) { return cm.moveH(1, "column"); },
  goWordLeft: function (cm) { return cm.moveH(-1, "word"); },
  goGroupRight: function (cm) { return cm.moveH(1, "group"); },
  goGroupLeft: function (cm) { return cm.moveH(-1, "group"); },
  goWordRight: function (cm) { return cm.moveH(1, "word"); },
  delCharBefore: function (cm) { return cm.deleteH(-1, "char"); },
  delCharAfter: function (cm) { return cm.deleteH(1, "char"); },
  delWordBefore: function (cm) { return cm.deleteH(-1, "word"); },
  delWordAfter: function (cm) { return cm.deleteH(1, "word"); },
  delGroupBefore: function (cm) { return cm.deleteH(-1, "group"); },
  delGroupAfter: function (cm) { return cm.deleteH(1, "group"); },
  indentAuto: function (cm) { return cm.indentSelection("smart"); },
  indentMore: function (cm) { return cm.indentSelection("add"); },
  indentLess: function (cm) { return cm.indentSelection("subtract"); },
  insertTab: function (cm) { return cm.replaceSelection("\t"); },
  insertSoftTab: function (cm) {
    var spaces = [], ranges = cm.listSelections(), tabSize = cm.options.tabSize
    for (var i = 0; i < ranges.length; i++) {
      var pos = ranges[i].from()
      var col = countColumn(cm.getLine(pos.line), pos.ch, tabSize)
      spaces.push(spaceStr(tabSize - col % tabSize))
    }
    cm.replaceSelections(spaces)
  },
  defaultTab: function (cm) {
    if (cm.somethingSelected()) { cm.indentSelection("add") }
    else { cm.execCommand("insertTab") }
  },
  // Swap the two chars left and right of each selection's head.
  // Move cursor behind the two swapped characters afterwards.
  //
  // Doesn't consider line feeds a character.
  // Doesn't scan more than one line above to find a character.
  // Doesn't do anything on an empty line.
  // Doesn't do anything with non-empty selections.
  transposeChars: function (cm) { return runInOp(cm, function () {
    var ranges = cm.listSelections(), newSel = []
    for (var i = 0; i < ranges.length; i++) {
      if (!ranges[i].empty()) { continue }
      var cur = ranges[i].head, line = getLine(cm.doc, cur.line).text
      if (line) {
        if (cur.ch == line.length) { cur = new Pos(cur.line, cur.ch - 1) }
        if (cur.ch > 0) {
          cur = new Pos(cur.line, cur.ch + 1)
          cm.replaceRange(line.charAt(cur.ch - 1) + line.charAt(cur.ch - 2),
                          Pos(cur.line, cur.ch - 2), cur, "+transpose")
        } else if (cur.line > cm.doc.first) {
          var prev = getLine(cm.doc, cur.line - 1).text
          if (prev) {
            cur = new Pos(cur.line, 1)
            cm.replaceRange(line.charAt(0) + cm.doc.lineSeparator() +
                            prev.charAt(prev.length - 1),
                            Pos(cur.line - 1, prev.length - 1), cur, "+transpose")
          }
        }
      }
      newSel.push(new Range(cur, cur))
    }
    cm.setSelections(newSel)
  }); },
  newlineAndIndent: function (cm) { return runInOp(cm, function () {
    var sels = cm.listSelections()
    for (var i = sels.length - 1; i >= 0; i--)
      { cm.replaceRange(cm.doc.lineSeparator(), sels[i].anchor, sels[i].head, "+input") }
    sels = cm.listSelections()
    for (var i$1 = 0; i$1 < sels.length; i$1++)
      { cm.indentLine(sels[i$1].from().line, null, true) }
    ensureCursorVisible(cm)
  }); },
  openLine: function (cm) { return cm.replaceSelection("\n", "start"); },
  toggleOverwrite: function (cm) { return cm.toggleOverwrite(); }
}


function lineStart(cm, lineN) {
  var line = getLine(cm.doc, lineN)
  var visual = visualLine(line)
  if (visual != line) { lineN = lineNo(visual) }
  return endOfLine(true, cm, visual, lineN, 1)
}
function lineEnd(cm, lineN) {
  var line = getLine(cm.doc, lineN)
  var visual = visualLineEnd(line)
  if (visual != line) { lineN = lineNo(visual) }
  return endOfLine(true, cm, line, lineN, -1)
}
function lineStartSmart(cm, pos) {
  var start = lineStart(cm, pos.line)
  var line = getLine(cm.doc, start.line)
  var order = getOrder(line, cm.doc.direction)
  if (!order || order[0].level == 0) {
    var firstNonWS = Math.max(0, line.text.search(/\S/))
    var inWS = pos.line == start.line && pos.ch <= firstNonWS && pos.ch
    return Pos(start.line, inWS ? 0 : firstNonWS, start.sticky)
  }
  return start
}

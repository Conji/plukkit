import { operation, runInOp } from "../display/operations"
import { prepareSelection } from "../display/selection"
import { regChange } from "../display/view_tracking"
import { applyTextInput, copyableRanges, disableBrowserMagic, handlePaste, hiddenTextarea, lastCopied, setLastCopied } from "./input"
import { cmp, maxPos, minPos, Pos } from "../line/pos"
import { getBetween, getLine, lineNo } from "../line/utils_line"
import { findViewForLine, findViewIndex, mapFromLineView, nodeAndOffsetInLineMap } from "../measurement/position_measurement"
import { replaceRange } from "../model/changes"
import { simpleSelection } from "../model/selection"
import { setSelection } from "../model/selection_updates"
import { getBidiPartAt, getOrder } from "../util/bidi"
import { android, chrome, gecko, ie_version } from "../util/browser"
import { contains, range, removeChildrenAndAdd, selectInput } from "../util/dom"
import { on, signalDOMEvent } from "../util/event"
import { Delayed, lst, sel_dontScroll } from "../util/misc"

// CONTENTEDITABLE INPUT STYLE

var ContentEditableInput = function ContentEditableInput(cm) {
  this.cm = cm
  this.lastAnchorNode = this.lastAnchorOffset = this.lastFocusNode = this.lastFocusOffset = null
  this.polling = new Delayed()
  this.composing = null
  this.gracePeriod = false
  this.readDOMTimeout = null
};

ContentEditableInput.prototype.init = function init (display) {
    var this$1 = this;

  var input = this, cm = input.cm
  var div = input.div = display.lineDiv
  disableBrowserMagic(div, cm.options.spellcheck)

  on(div, "paste", function (e) {
    if (signalDOMEvent(cm, e) || handlePaste(e, cm)) { return }
    // IE doesn't fire input events, so we schedule a read for the pasted content in this way
    if (ie_version <= 11) { setTimeout(operation(cm, function () { return this$1.updateFromDOM(); }), 20) }
  })

  on(div, "compositionstart", function (e) {
    this$1.composing = {data: e.data, done: false}
  })
  on(div, "compositionupdate", function (e) {
    if (!this$1.composing) { this$1.composing = {data: e.data, done: false} }
  })
  on(div, "compositionend", function (e) {
    if (this$1.composing) {
      if (e.data != this$1.composing.data) { this$1.readFromDOMSoon() }
      this$1.composing.done = true
    }
  })

  on(div, "touchstart", function () { return input.forceCompositionEnd(); })

  on(div, "input", function () {
    if (!this$1.composing) { this$1.readFromDOMSoon() }
  })

  function onCopyCut(e) {
    if (signalDOMEvent(cm, e)) { return }
    if (cm.somethingSelected()) {
      setLastCopied({lineWise: false, text: cm.getSelections()})
      if (e.type == "cut") { cm.replaceSelection("", null, "cut") }
    } else if (!cm.options.lineWiseCopyCut) {
      return
    } else {
      var ranges = copyableRanges(cm)
      setLastCopied({lineWise: true, text: ranges.text})
      if (e.type == "cut") {
        cm.operation(function () {
          cm.setSelections(ranges.ranges, 0, sel_dontScroll)
          cm.replaceSelection("", null, "cut")
        })
      }
    }
    if (e.clipboardData) {
      e.clipboardData.clearData()
      var content = lastCopied.text.join("\n")
      // iOS exposes the clipboard API, but seems to discard content inserted into it
      e.clipboardData.setData("Text", content)
      if (e.clipboardData.getData("Text") == content) {
        e.preventDefault()
        return
      }
    }
    // Old-fashioned briefly-focus-a-textarea hack
    var kludge = hiddenTextarea(), te = kludge.firstChild
    cm.display.lineSpace.insertBefore(kludge, cm.display.lineSpace.firstChild)
    te.value = lastCopied.text.join("\n")
    var hadFocus = document.activeElement
    selectInput(te)
    setTimeout(function () {
      cm.display.lineSpace.removeChild(kludge)
      hadFocus.focus()
      if (hadFocus == div) { input.showPrimarySelection() }
    }, 50)
  }
  on(div, "copy", onCopyCut)
  on(div, "cut", onCopyCut)
};

ContentEditableInput.prototype.prepareSelection = function prepareSelection$1 () {
  var result = prepareSelection(this.cm, false)
  result.focus = this.cm.state.focused
  return result
};

ContentEditableInput.prototype.showSelection = function showSelection (info, takeFocus) {
  if (!info || !this.cm.display.view.length) { return }
  if (info.focus || takeFocus) { this.showPrimarySelection() }
  this.showMultipleSelections(info)
};

ContentEditableInput.prototype.showPrimarySelection = function showPrimarySelection () {
  var sel = window.getSelection(), cm = this.cm, prim = cm.doc.sel.primary()
  var from = prim.from(), to = prim.to()

  if (cm.display.viewTo == cm.display.viewFrom || from.line >= cm.display.viewTo || to.line < cm.display.viewFrom) {
    sel.removeAllRanges()
    return
  }

  var curAnchor = domToPos(cm, sel.anchorNode, sel.anchorOffset)
  var curFocus = domToPos(cm, sel.focusNode, sel.focusOffset)
  if (curAnchor && !curAnchor.bad && curFocus && !curFocus.bad &&
      cmp(minPos(curAnchor, curFocus), from) == 0 &&
      cmp(maxPos(curAnchor, curFocus), to) == 0)
    { return }

  var view = cm.display.view
  var start = (from.line >= cm.display.viewFrom && posToDOM(cm, from)) ||
      {node: view[0].measure.map[2], offset: 0}
  var end = to.line < cm.display.viewTo && posToDOM(cm, to)
  if (!end) {
    var measure = view[view.length - 1].measure
    var map = measure.maps ? measure.maps[measure.maps.length - 1] : measure.map
    end = {node: map[map.length - 1], offset: map[map.length - 2] - map[map.length - 3]}
  }

  if (!start || !end) {
    sel.removeAllRanges()
    return
  }

  var old = sel.rangeCount && sel.getRangeAt(0), rng
  try { rng = range(start.node, start.offset, end.offset, end.node) }
  catch(e) {} // Our model of the DOM might be outdated, in which case the range we try to set can be impossible
  if (rng) {
    if (!gecko && cm.state.focused) {
      sel.collapse(start.node, start.offset)
      if (!rng.collapsed) {
        sel.removeAllRanges()
        sel.addRange(rng)
      }
    } else {
      sel.removeAllRanges()
      sel.addRange(rng)
    }
    if (old && sel.anchorNode == null) { sel.addRange(old) }
    else if (gecko) { this.startGracePeriod() }
  }
  this.rememberSelection()
};

ContentEditableInput.prototype.startGracePeriod = function startGracePeriod () {
    var this$1 = this;

  clearTimeout(this.gracePeriod)
  this.gracePeriod = setTimeout(function () {
    this$1.gracePeriod = false
    if (this$1.selectionChanged())
      { this$1.cm.operation(function () { return this$1.cm.curOp.selectionChanged = true; }) }
  }, 20)
};

ContentEditableInput.prototype.showMultipleSelections = function showMultipleSelections (info) {
  removeChildrenAndAdd(this.cm.display.cursorDiv, info.cursors)
  removeChildrenAndAdd(this.cm.display.selectionDiv, info.selection)
};

ContentEditableInput.prototype.rememberSelection = function rememberSelection () {
  var sel = window.getSelection()
  this.lastAnchorNode = sel.anchorNode; this.lastAnchorOffset = sel.anchorOffset
  this.lastFocusNode = sel.focusNode; this.lastFocusOffset = sel.focusOffset
};

ContentEditableInput.prototype.selectionInEditor = function selectionInEditor () {
  var sel = window.getSelection()
  if (!sel.rangeCount) { return false }
  var node = sel.getRangeAt(0).commonAncestorContainer
  return contains(this.div, node)
};

ContentEditableInput.prototype.focus = function focus () {
  if (this.cm.options.readOnly != "nocursor") {
    if (!this.selectionInEditor())
      { this.showSelection(this.prepareSelection(), true) }
    this.div.focus()
  }
};
ContentEditableInput.prototype.blur = function blur () { this.div.blur() };
ContentEditableInput.prototype.getField = function getField () { return this.div };

ContentEditableInput.prototype.supportsTouch = function supportsTouch () { return true };

ContentEditableInput.prototype.receivedFocus = function receivedFocus () {
  var input = this
  if (this.selectionInEditor())
    { this.pollSelection() }
  else
    { runInOp(this.cm, function () { return input.cm.curOp.selectionChanged = true; }) }

  function poll() {
    if (input.cm.state.focused) {
      input.pollSelection()
      input.polling.set(input.cm.options.pollInterval, poll)
    }
  }
  this.polling.set(this.cm.options.pollInterval, poll)
};

ContentEditableInput.prototype.selectionChanged = function selectionChanged () {
  var sel = window.getSelection()
  return sel.anchorNode != this.lastAnchorNode || sel.anchorOffset != this.lastAnchorOffset ||
    sel.focusNode != this.lastFocusNode || sel.focusOffset != this.lastFocusOffset
};

ContentEditableInput.prototype.pollSelection = function pollSelection () {
  if (this.readDOMTimeout != null || this.gracePeriod || !this.selectionChanged()) { return }
  var sel = window.getSelection(), cm = this.cm
  // On Android Chrome (version 56, at least), backspacing into an
  // uneditable block element will put the cursor in that element,
  // and then, because it's not editable, hide the virtual keyboard.
  // Because Android doesn't allow us to actually detect backspace
  // presses in a sane way, this code checks for when that happens
  // and simulates a backspace press in this case.
  if (android && chrome && this.cm.options.gutters.length && isInGutter(sel.anchorNode)) {
    this.cm.triggerOnKeyDown({type: "keydown", keyCode: 8, preventDefault: Math.abs})
    this.blur()
    this.focus()
    return
  }
  if (this.composing) { return }
  this.rememberSelection()
  var anchor = domToPos(cm, sel.anchorNode, sel.anchorOffset)
  var head = domToPos(cm, sel.focusNode, sel.focusOffset)
  if (anchor && head) { runInOp(cm, function () {
    setSelection(cm.doc, simpleSelection(anchor, head), sel_dontScroll)
    if (anchor.bad || head.bad) { cm.curOp.selectionChanged = true }
  }) }
};

ContentEditableInput.prototype.pollContent = function pollContent () {
  if (this.readDOMTimeout != null) {
    clearTimeout(this.readDOMTimeout)
    this.readDOMTimeout = null
  }

  var cm = this.cm, display = cm.display, sel = cm.doc.sel.primary()
  var from = sel.from(), to = sel.to()
  if (from.ch == 0 && from.line > cm.firstLine())
    { from = Pos(from.line - 1, getLine(cm.doc, from.line - 1).length) }
  if (to.ch == getLine(cm.doc, to.line).text.length && to.line < cm.lastLine())
    { to = Pos(to.line + 1, 0) }
  if (from.line < display.viewFrom || to.line > display.viewTo - 1) { return false }

  var fromIndex, fromLine, fromNode
  if (from.line == display.viewFrom || (fromIndex = findViewIndex(cm, from.line)) == 0) {
    fromLine = lineNo(display.view[0].line)
    fromNode = display.view[0].node
  } else {
    fromLine = lineNo(display.view[fromIndex].line)
    fromNode = display.view[fromIndex - 1].node.nextSibling
  }
  var toIndex = findViewIndex(cm, to.line)
  var toLine, toNode
  if (toIndex == display.view.length - 1) {
    toLine = display.viewTo - 1
    toNode = display.lineDiv.lastChild
  } else {
    toLine = lineNo(display.view[toIndex + 1].line) - 1
    toNode = display.view[toIndex + 1].node.previousSibling
  }

  if (!fromNode) { return false }
  var newText = cm.doc.splitLines(domTextBetween(cm, fromNode, toNode, fromLine, toLine))
  var oldText = getBetween(cm.doc, Pos(fromLine, 0), Pos(toLine, getLine(cm.doc, toLine).text.length))
  while (newText.length > 1 && oldText.length > 1) {
    if (lst(newText) == lst(oldText)) { newText.pop(); oldText.pop(); toLine-- }
    else if (newText[0] == oldText[0]) { newText.shift(); oldText.shift(); fromLine++ }
    else { break }
  }

  var cutFront = 0, cutEnd = 0
  var newTop = newText[0], oldTop = oldText[0], maxCutFront = Math.min(newTop.length, oldTop.length)
  while (cutFront < maxCutFront && newTop.charCodeAt(cutFront) == oldTop.charCodeAt(cutFront))
    { ++cutFront }
  var newBot = lst(newText), oldBot = lst(oldText)
  var maxCutEnd = Math.min(newBot.length - (newText.length == 1 ? cutFront : 0),
                           oldBot.length - (oldText.length == 1 ? cutFront : 0))
  while (cutEnd < maxCutEnd &&
         newBot.charCodeAt(newBot.length - cutEnd - 1) == oldBot.charCodeAt(oldBot.length - cutEnd - 1))
    { ++cutEnd }
  // Try to move start of change to start of selection if ambiguous
  if (newText.length == 1 && oldText.length == 1 && fromLine == from.line) {
    while (cutFront && cutFront > from.ch &&
           newBot.charCodeAt(newBot.length - cutEnd - 1) == oldBot.charCodeAt(oldBot.length - cutEnd - 1)) {
      cutFront--
      cutEnd++
    }
  }

  newText[newText.length - 1] = newBot.slice(0, newBot.length - cutEnd).replace(/^\u200b+/, "")
  newText[0] = newText[0].slice(cutFront).replace(/\u200b+$/, "")

  var chFrom = Pos(fromLine, cutFront)
  var chTo = Pos(toLine, oldText.length ? lst(oldText).length - cutEnd : 0)
  if (newText.length > 1 || newText[0] || cmp(chFrom, chTo)) {
    replaceRange(cm.doc, newText, chFrom, chTo, "+input")
    return true
  }
};

ContentEditableInput.prototype.ensurePolled = function ensurePolled () {
  this.forceCompositionEnd()
};
ContentEditableInput.prototype.reset = function reset () {
  this.forceCompositionEnd()
};
ContentEditableInput.prototype.forceCompositionEnd = function forceCompositionEnd () {
  if (!this.composing) { return }
  clearTimeout(this.readDOMTimeout)
  this.composing = null
  this.updateFromDOM()
  this.div.blur()
  this.div.focus()
};
ContentEditableInput.prototype.readFromDOMSoon = function readFromDOMSoon () {
    var this$1 = this;

  if (this.readDOMTimeout != null) { return }
  this.readDOMTimeout = setTimeout(function () {
    this$1.readDOMTimeout = null
    if (this$1.composing) {
      if (this$1.composing.done) { this$1.composing = null }
      else { return }
    }
    this$1.updateFromDOM()
  }, 80)
};

ContentEditableInput.prototype.updateFromDOM = function updateFromDOM () {
    var this$1 = this;

  if (this.cm.isReadOnly() || !this.pollContent())
    { runInOp(this.cm, function () { return regChange(this$1.cm); }) }
};

ContentEditableInput.prototype.setUneditable = function setUneditable (node) {
  node.contentEditable = "false"
};

ContentEditableInput.prototype.onKeyPress = function onKeyPress (e) {
  if (e.charCode == 0) { return }
  e.preventDefault()
  if (!this.cm.isReadOnly())
    { operation(this.cm, applyTextInput)(this.cm, String.fromCharCode(e.charCode == null ? e.keyCode : e.charCode), 0) }
};

ContentEditableInput.prototype.readOnlyChanged = function readOnlyChanged (val) {
  this.div.contentEditable = String(val != "nocursor")
};

ContentEditableInput.prototype.onContextMenu = function onContextMenu () {};
ContentEditableInput.prototype.resetPosition = function resetPosition () {};

export default ContentEditableInput;

ContentEditableInput.prototype.needsContentAttribute = true

function posToDOM(cm, pos) {
  var view = findViewForLine(cm, pos.line)
  if (!view || view.hidden) { return null }
  var line = getLine(cm.doc, pos.line)
  var info = mapFromLineView(view, line, pos.line)

  var order = getOrder(line, cm.doc.direction), side = "left"
  if (order) {
    var partPos = getBidiPartAt(order, pos.ch)
    side = partPos % 2 ? "right" : "left"
  }
  var result = nodeAndOffsetInLineMap(info.map, pos.ch, side)
  result.offset = result.collapse == "right" ? result.end : result.start
  return result
}

function isInGutter(node) {
  for (var scan = node; scan; scan = scan.parentNode)
    { if (/CodeMirror-gutter-wrapper/.test(scan.className)) { return true } }
  return false
}

function badPos(pos, bad) { if (bad) { pos.bad = true; } return pos }

function domTextBetween(cm, from, to, fromLine, toLine) {
  var text = "", closing = false, lineSep = cm.doc.lineSeparator()
  function recognizeMarker(id) { return function (marker) { return marker.id == id; } }
  function close() {
    if (closing) {
      text += lineSep
      closing = false
    }
  }
  function addText(str) {
    if (str) {
      close()
      text += str
    }
  }
  function walk(node) {
    if (node.nodeType == 1) {
      var cmText = node.getAttribute("cm-text")
      if (cmText != null) {
        addText(cmText || node.textContent.replace(/\u200b/g, ""))
        return
      }
      var markerID = node.getAttribute("cm-marker"), range
      if (markerID) {
        var found = cm.findMarks(Pos(fromLine, 0), Pos(toLine + 1, 0), recognizeMarker(+markerID))
        if (found.length && (range = found[0].find(0)))
          { addText(getBetween(cm.doc, range.from, range.to).join(lineSep)) }
        return
      }
      if (node.getAttribute("contenteditable") == "false") { return }
      var isBlock = /^(pre|div|p)$/i.test(node.nodeName)
      if (isBlock) { close() }
      for (var i = 0; i < node.childNodes.length; i++)
        { walk(node.childNodes[i]) }
      if (isBlock) { closing = true }
    } else if (node.nodeType == 3) {
      addText(node.nodeValue)
    }
  }
  for (;;) {
    walk(from)
    if (from == to) { break }
    from = from.nextSibling
  }
  return text
}

function domToPos(cm, node, offset) {
  var lineNode
  if (node == cm.display.lineDiv) {
    lineNode = cm.display.lineDiv.childNodes[offset]
    if (!lineNode) { return badPos(cm.clipPos(Pos(cm.display.viewTo - 1)), true) }
    node = null; offset = 0
  } else {
    for (lineNode = node;; lineNode = lineNode.parentNode) {
      if (!lineNode || lineNode == cm.display.lineDiv) { return null }
      if (lineNode.parentNode && lineNode.parentNode == cm.display.lineDiv) { break }
    }
  }
  for (var i = 0; i < cm.display.view.length; i++) {
    var lineView = cm.display.view[i]
    if (lineView.node == lineNode)
      { return locateNodeInLineView(lineView, node, offset) }
  }
}

function locateNodeInLineView(lineView, node, offset) {
  var wrapper = lineView.text.firstChild, bad = false
  if (!node || !contains(wrapper, node)) { return badPos(Pos(lineNo(lineView.line), 0), true) }
  if (node == wrapper) {
    bad = true
    node = wrapper.childNodes[offset]
    offset = 0
    if (!node) {
      var line = lineView.rest ? lst(lineView.rest) : lineView.line
      return badPos(Pos(lineNo(line), line.text.length), bad)
    }
  }

  var textNode = node.nodeType == 3 ? node : null, topNode = node
  if (!textNode && node.childNodes.length == 1 && node.firstChild.nodeType == 3) {
    textNode = node.firstChild
    if (offset) { offset = textNode.nodeValue.length }
  }
  while (topNode.parentNode != wrapper) { topNode = topNode.parentNode }
  var measure = lineView.measure, maps = measure.maps

  function find(textNode, topNode, offset) {
    for (var i = -1; i < (maps ? maps.length : 0); i++) {
      var map = i < 0 ? measure.map : maps[i]
      for (var j = 0; j < map.length; j += 3) {
        var curNode = map[j + 2]
        if (curNode == textNode || curNode == topNode) {
          var line = lineNo(i < 0 ? lineView.line : lineView.rest[i])
          var ch = map[j] + offset
          if (offset < 0 || curNode != textNode) { ch = map[j + (offset ? 1 : 0)] }
          return Pos(line, ch)
        }
      }
    }
  }
  var found = find(textNode, topNode, offset)
  if (found) { return badPos(found, bad) }

  // FIXME this is all really shaky. might handle the few cases it needs to handle, but likely to cause problems
  for (var after = topNode.nextSibling, dist = textNode ? textNode.nodeValue.length - offset : 0; after; after = after.nextSibling) {
    found = find(after, after.firstChild, 0)
    if (found)
      { return badPos(Pos(found.line, found.ch - dist), bad) }
    else
      { dist += after.textContent.length }
  }
  for (var before = topNode.previousSibling, dist$1 = offset; before; before = before.previousSibling) {
    found = find(before, before.firstChild, -1)
    if (found)
      { return badPos(Pos(found.line, found.ch + dist$1), bad) }
    else
      { dist$1 += before.textContent.length }
  }
}

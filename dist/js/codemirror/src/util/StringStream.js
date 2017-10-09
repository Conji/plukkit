import { countColumn } from "./misc"

// STRING STREAM

// Fed to the mode parsers, provides helper functions to make
// parsers more succinct.

var StringStream = function StringStream(string, tabSize, lineOracle) {
  this.pos = this.start = 0
  this.string = string
  this.tabSize = tabSize || 8
  this.lastColumnPos = this.lastColumnValue = 0
  this.lineStart = 0
  this.lineOracle = lineOracle
};

StringStream.prototype.eol = function eol () {return this.pos >= this.string.length};
StringStream.prototype.sol = function sol () {return this.pos == this.lineStart};
StringStream.prototype.peek = function peek () {return this.string.charAt(this.pos) || undefined};
StringStream.prototype.next = function next () {
  if (this.pos < this.string.length)
    { return this.string.charAt(this.pos++) }
};
StringStream.prototype.eat = function eat (match) {
  var ch = this.string.charAt(this.pos)
  var ok
  if (typeof match == "string") { ok = ch == match }
  else { ok = ch && (match.test ? match.test(ch) : match(ch)) }
  if (ok) {++this.pos; return ch}
};
StringStream.prototype.eatWhile = function eatWhile (match) {
  var start = this.pos
  while (this.eat(match)){}
  return this.pos > start
};
StringStream.prototype.eatSpace = function eatSpace () {
    var this$1 = this;

  var start = this.pos
  while (/[\s\u00a0]/.test(this.string.charAt(this.pos))) { ++this$1.pos }
  return this.pos > start
};
StringStream.prototype.skipToEnd = function skipToEnd () {this.pos = this.string.length};
StringStream.prototype.skipTo = function skipTo (ch) {
  var found = this.string.indexOf(ch, this.pos)
  if (found > -1) {this.pos = found; return true}
};
StringStream.prototype.backUp = function backUp (n) {this.pos -= n};
StringStream.prototype.column = function column () {
  if (this.lastColumnPos < this.start) {
    this.lastColumnValue = countColumn(this.string, this.start, this.tabSize, this.lastColumnPos, this.lastColumnValue)
    this.lastColumnPos = this.start
  }
  return this.lastColumnValue - (this.lineStart ? countColumn(this.string, this.lineStart, this.tabSize) : 0)
};
StringStream.prototype.indentation = function indentation () {
  return countColumn(this.string, null, this.tabSize) -
    (this.lineStart ? countColumn(this.string, this.lineStart, this.tabSize) : 0)
};
StringStream.prototype.match = function match (pattern, consume, caseInsensitive) {
  if (typeof pattern == "string") {
    var cased = function (str) { return caseInsensitive ? str.toLowerCase() : str; }
    var substr = this.string.substr(this.pos, pattern.length)
    if (cased(substr) == cased(pattern)) {
      if (consume !== false) { this.pos += pattern.length }
      return true
    }
  } else {
    var match = this.string.slice(this.pos).match(pattern)
    if (match && match.index > 0) { return null }
    if (match && consume !== false) { this.pos += match[0].length }
    return match
  }
};
StringStream.prototype.current = function current (){return this.string.slice(this.start, this.pos)};
StringStream.prototype.hideFirstChars = function hideFirstChars (n, inner) {
  this.lineStart += n
  try { return inner() }
  finally { this.lineStart -= n }
};
StringStream.prototype.lookAhead = function lookAhead (n) {
  var oracle = this.lineOracle
  return oracle && oracle.lookAhead(n)
};

export default StringStream

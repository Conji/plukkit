function capitalize(input) {
    return input.charAt(0).toUpperCase() + input.slice(1);
}

function autoIndent(input, tabSize) {
  var lines = input.split('\n');
  var result = [];
  for (var i = 0; i < lines.length; i++) {
    lines[i] = convertSpacesToTab(lines[i], tabSize);
    var tabCount = getCharCountAtStart(lines[i], '\t');
    var newTabs = '';
    if (i > 0) {
      var previousTabCount = getCharCountAtStart(lines[i - 1], '\t');
      console.log('Current tab count: ' + tabCount + '; Previous tab count: ' + previousTabCount);
      if (previousTabCount == tabCount) {
        // apply the same indent as the previous line
        newTabs = String.fromChars('\t', getCharCountAtStart(result[i - 1], '\t'));
      } else if (previousTabCount > tabCount) {
        // apply one less tab than the previous line
        newTabs = String.fromChars('\t', getCharCountAtStart(result[i - 1], '\t') - 1);
      } else if (previousTabCount < tabCount) {
        // apply one more tab than the previous line
        newTabs = String.fromChars('\t', getCharCountAtStart(result[i - 1], '\t') + 1);
      }
    }
    result.push(newTabs + lines[i].substring(tabCount));
  }
  return result.join('\n');
}

function getCharCountAtStart(input, char) {
  var count = 0;
  while (input[count] == char) { count++; }
  return count;
}

function convertSpacesToTab(input, tabSize) {
  var spacesCount = getCharCountAtStart(input, ' ');
  // assuming space count per tab is 4
  var tabs = Math.ceil(spacesCount / tabSize);
  return String.fromChars('\t', tabs) + input.substring(spacesCount);
}

String.fromChars = function(char, count) {
  var result = '';
  for (var i = 0; i < count; i++) {
    result += char;
  }
  return result;
}

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseXml, XmlParseError } = require('../dist/index');

test('parses nested elements, attributes, and text', () => {
  const root = parseXml('<root a="1"><child>hello</child></root>');
  assert.equal(root.name, 'root');
  assert.equal(root.attributes.a, '1');
  assert.equal(root.children.length, 1);
  assert.equal(root.children[0].name, 'child');
  assert.equal(root.children[0].text, 'hello');
});

test('parses self-closing elements', () => {
  const root = parseXml('<root><child a="1"/></root>');
  assert.equal(root.children[0].children.length, 0);
  assert.equal(root.children[0].text, '');
});

test('decodes entities and CDATA sections in text', () => {
  const root = parseXml('<root>a &amp; b <![CDATA[<raw> & unescaped]]></root>');
  assert.equal(root.text, 'a & b <raw> & unescaped');
});

test('decodes numeric and hex character references', () => {
  const root = parseXml('<root>&#65;&#x42;</root>');
  assert.equal(root.text, 'AB');
});

test('skips comments, processing instructions, and DOCTYPE', () => {
  const root = parseXml(
    '<?xml version="1.0"?>\n<!DOCTYPE root>\n<!-- a comment --><root><!-- inner -->text</root>'
  );
  assert.equal(root.name, 'root');
  assert.equal(root.text, 'text');
});

test('records line and column of each element', () => {
  const root = parseXml('<root>\n  <child>x</child>\n</root>');
  const child = root.children[0];
  assert.equal(child.line, 2);
  assert.equal(child.column, 3);
});

test('rejects an empty document', () => {
  assert.throws(() => parseXml(''), (error) => {
    assert.ok(error instanceof XmlParseError);
    assert.match(error.message, /document has no root element/);
    return true;
  });
});

test('rejects content after the root element', () => {
  assert.throws(() => parseXml('<root></root><extra/>'), (error) => {
    assert.ok(error instanceof XmlParseError);
    assert.match(error.message, /unexpected content after the root element/);
    return true;
  });
});

test('rejects a mismatched closing tag', () => {
  assert.throws(() => parseXml('<root><child></wrong></root>'), (error) => {
    assert.ok(error instanceof XmlParseError);
    assert.match(error.message, /expected <\/child> but found <\/wrong>/);
    return true;
  });
});

test('rejects an unclosed element', () => {
  assert.throws(() => parseXml('<root><child></root>'), (error) => {
    assert.ok(error instanceof XmlParseError);
    assert.match(error.message, /never closed/);
    return true;
  });
});

test('rejects an unterminated attribute value', () => {
  assert.throws(() => parseXml('<root a="unterminated></root>'), (error) => {
    assert.ok(error instanceof XmlParseError);
    assert.match(error.message, /unterminated attribute value/);
    return true;
  });
});

test('rejects a missing = after an attribute name', () => {
  assert.throws(() => parseXml('<root a "1"></root>'), (error) => {
    assert.ok(error instanceof XmlParseError);
    assert.match(error.message, /expected '=' after attribute name 'a'/);
    return true;
  });
});

test('rejects a duplicate attribute', () => {
  assert.throws(() => parseXml('<root a="1" a="2"></root>'), (error) => {
    assert.ok(error instanceof XmlParseError);
    assert.match(error.message, /duplicate attribute 'a'/);
    return true;
  });
});

test('rejects an unknown entity reference', () => {
  assert.throws(() => parseXml('<root>&bogus;</root>'), (error) => {
    assert.ok(error instanceof XmlParseError);
    assert.match(error.message, /unknown entity reference '&bogus;'/);
    return true;
  });
});

test('rejects an unterminated comment', () => {
  assert.throws(() => parseXml('<root><!-- never closed</root>'), (error) => {
    assert.ok(error instanceof XmlParseError);
    assert.match(error.message, /unterminated comment/);
    return true;
  });
});

test('rejects an unterminated CDATA section', () => {
  assert.throws(() => parseXml('<root><![CDATA[never closed</root>'), (error) => {
    assert.ok(error instanceof XmlParseError);
    assert.match(error.message, /unterminated CDATA section/);
    return true;
  });
});

test('error messages include a source snippet with a caret', () => {
  try {
    parseXml('<root>\n  <child></wrong>\n</root>');
    assert.fail('expected parseXml to throw');
  } catch (error) {
    assert.match(error.message, /line 2, column 10/);
    assert.match(error.message, /2 \|   <child><\/wrong>/);
    assert.match(error.message, /\^/);
  }
});

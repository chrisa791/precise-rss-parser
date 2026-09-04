// A small hand-written XML parser. It does not aim for full XML 1.0
// conformance (no external entities, no full DTD support) - it aims to
// parse the XML that real-world RSS feeds actually contain, while tracking
// the line and column of every node so parse failures can point at the
// exact place they happened.

export interface XmlNode {
  readonly name: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: readonly XmlNode[];
  readonly text: string;
  readonly line: number;
  readonly column: number;
}

interface Position {
  readonly line: number;
  readonly column: number;
}

export abstract class ParseError extends Error {
  readonly line: number;
  readonly column: number;

  protected constructor(message: string, line: number, column: number, source?: string) {
    super(formatMessage(message, line, column, source));
    this.line = line;
    this.column = column;
  }
}

export class XmlParseError extends ParseError {
  constructor(message: string, line: number, column: number, source?: string) {
    super(message, line, column, source);
    this.name = 'XmlParseError';
  }
}

function formatMessage(message: string, line: number, column: number, source?: string): string {
  let result = `${message} (line ${line}, column ${column})`;
  const snippet = source === undefined ? null : renderSnippet(source, line, column);
  if (snippet !== null) {
    result += `\n${snippet}`;
  }
  return result;
}

function renderSnippet(source: string, line: number, column: number): string | null {
  const lineText = source.split('\n')[line - 1];
  if (lineText === undefined) {
    return null;
  }
  const prefix = `${line} | `;
  const caret = ' '.repeat(prefix.length + Math.max(column - 1, 0)) + '^';
  return `${prefix}${lineText}\n${caret}`;
}

class Scanner {
  private pos = 0;
  private line = 1;
  private column = 1;

  constructor(readonly source: string) {}

  get position(): Position {
    return { line: this.line, column: this.column };
  }

  eof(): boolean {
    return this.pos >= this.source.length;
  }

  peek(offset = 0): string {
    return this.source[this.pos + offset] ?? '';
  }

  startsWith(literal: string): boolean {
    return this.source.startsWith(literal, this.pos);
  }

  advance(): string {
    const ch = this.source[this.pos];
    if (ch === undefined) {
      throw this.error('unexpected end of input');
    }
    this.pos++;
    if (ch === '\n') {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    return ch;
  }

  skip(literal: string): void {
    for (let i = 0; i < literal.length; i++) {
      this.advance();
    }
  }

  error(message: string, at: Position = this.position): XmlParseError {
    return new XmlParseError(message, at.line, at.column, this.source);
  }
}

export function parseXml(source: string): XmlNode {
  const scanner = new Scanner(stripBom(source));
  skipMisc(scanner);
  if (scanner.eof()) {
    throw scanner.error('document has no root element');
  }
  const root = parseElement(scanner);
  skipMisc(scanner);
  if (!scanner.eof()) {
    throw scanner.error(`unexpected content after the root element </${root.name}>`);
  }
  return root;
}

function stripBom(source: string): string {
  return source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
}

function skipMisc(scanner: Scanner): void {
  while (true) {
    skipWhitespace(scanner);
    if (scanner.startsWith('<!--')) {
      skipComment(scanner);
      continue;
    }
    if (scanner.startsWith('<!DOCTYPE')) {
      skipDoctype(scanner);
      continue;
    }
    if (scanner.startsWith('<?')) {
      skipProcessingInstruction(scanner);
      continue;
    }
    break;
  }
}

function skipWhitespace(scanner: Scanner): void {
  while (!scanner.eof() && /\s/.test(scanner.peek())) {
    scanner.advance();
  }
}

function skipComment(scanner: Scanner): void {
  const start = scanner.position;
  scanner.skip('<!--');
  while (!scanner.startsWith('-->')) {
    if (scanner.eof()) {
      throw scanner.error('unterminated comment', start);
    }
    scanner.advance();
  }
  scanner.skip('-->');
}

function skipProcessingInstruction(scanner: Scanner): void {
  const start = scanner.position;
  scanner.skip('<?');
  while (!scanner.startsWith('?>')) {
    if (scanner.eof()) {
      throw scanner.error('unterminated processing instruction', start);
    }
    scanner.advance();
  }
  scanner.skip('?>');
}

function skipDoctype(scanner: Scanner): void {
  const start = scanner.position;
  scanner.skip('<!DOCTYPE');
  let bracketDepth = 0;
  while (true) {
    if (scanner.eof()) {
      throw scanner.error('unterminated DOCTYPE declaration', start);
    }
    const ch = scanner.peek();
    if (ch === '[') {
      bracketDepth++;
      scanner.advance();
      continue;
    }
    if (ch === ']') {
      bracketDepth--;
      scanner.advance();
      continue;
    }
    if (ch === '>' && bracketDepth <= 0) {
      scanner.advance();
      return;
    }
    scanner.advance();
  }
}

function isNameChar(ch: string): boolean {
  return ch !== '' && !/[\s=/<>"'?!]/.test(ch);
}

function readName(scanner: Scanner): string {
  const start = scanner.position;
  let name = '';
  while (!scanner.eof() && isNameChar(scanner.peek())) {
    name += scanner.advance();
  }
  if (name.length === 0) {
    throw scanner.error('expected an element or attribute name', start);
  }
  return name;
}

function readEntity(scanner: Scanner): string {
  const start = scanner.position;
  scanner.advance(); // '&'
  let name = '';
  while (!scanner.eof() && scanner.peek() !== ';') {
    if (name.length > 32) {
      throw scanner.error(`entity reference is too long or missing a terminating ';'`, start);
    }
    name += scanner.advance();
  }
  if (scanner.eof()) {
    throw scanner.error(`unterminated entity reference '&${name}'`, start);
  }
  scanner.advance(); // ';'
  switch (name) {
    case 'amp':
      return '&';
    case 'lt':
      return '<';
    case 'gt':
      return '>';
    case 'quot':
      return '"';
    case 'apos':
      return "'";
    default:
      break;
  }
  if (name.startsWith('#x') || name.startsWith('#X')) {
    const code = Number.parseInt(name.slice(2), 16);
    if (Number.isNaN(code)) {
      throw scanner.error(`invalid hexadecimal character reference '&${name};'`, start);
    }
    return String.fromCodePoint(code);
  }
  if (name.startsWith('#')) {
    const code = Number.parseInt(name.slice(1), 10);
    if (Number.isNaN(code)) {
      throw scanner.error(`invalid numeric character reference '&${name};'`, start);
    }
    return String.fromCodePoint(code);
  }
  throw scanner.error(
    `unknown entity reference '&${name};' (only amp, lt, gt, quot, apos and numeric references are supported)`,
    start
  );
}

function readCData(scanner: Scanner): string {
  const start = scanner.position;
  scanner.skip('<![CDATA[');
  let text = '';
  while (!scanner.startsWith(']]>')) {
    if (scanner.eof()) {
      throw scanner.error('unterminated CDATA section', start);
    }
    text += scanner.advance();
  }
  scanner.skip(']]>');
  return text;
}

function parseAttributeValue(scanner: Scanner): string {
  const quote = scanner.peek();
  if (quote !== '"' && quote !== "'") {
    throw scanner.error(`expected '"' or "'" to start an attribute value`);
  }
  scanner.advance();
  let value = '';
  while (true) {
    if (scanner.eof()) {
      throw scanner.error('unterminated attribute value');
    }
    const ch = scanner.peek();
    if (ch === quote) {
      scanner.advance();
      break;
    }
    if (ch === '&') {
      value += readEntity(scanner);
      continue;
    }
    if (ch === '<') {
      throw scanner.error(`'<' is not allowed inside an attribute value`);
    }
    value += scanner.advance();
  }
  return value;
}

function parseAttributes(scanner: Scanner): Record<string, string> {
  const attributes: Record<string, string> = {};
  while (true) {
    skipWhitespace(scanner);
    const ch = scanner.peek();
    if (ch === '' || ch === '>' || ch === '/') {
      break;
    }
    const attrStart = scanner.position;
    const name = readName(scanner);
    skipWhitespace(scanner);
    if (scanner.peek() !== '=') {
      throw scanner.error(`expected '=' after attribute name '${name}'`);
    }
    scanner.advance();
    skipWhitespace(scanner);
    const value = parseAttributeValue(scanner);
    if (Object.prototype.hasOwnProperty.call(attributes, name)) {
      throw scanner.error(`duplicate attribute '${name}'`, attrStart);
    }
    attributes[name] = value;
  }
  return attributes;
}

function parseContent(
  scanner: Scanner,
  tagName: string,
  openPos: Position
): { children: XmlNode[]; text: string } {
  const children: XmlNode[] = [];
  let text = '';
  while (true) {
    if (scanner.eof()) {
      throw scanner.error(`unexpected end of input: <${tagName}> opened here was never closed`, openPos);
    }
    if (scanner.startsWith('</')) {
      const closeStart = scanner.position;
      scanner.skip('</');
      const closeName = readName(scanner);
      skipWhitespace(scanner);
      if (scanner.peek() !== '>') {
        throw scanner.error(`expected '>' to close tag </${closeName}>`);
      }
      scanner.advance();
      if (closeName !== tagName) {
        throw scanner.error(
          `mismatched closing tag: expected </${tagName}> but found </${closeName}>`,
          closeStart
        );
      }
      break;
    }
    if (scanner.startsWith('<!--')) {
      skipComment(scanner);
      continue;
    }
    if (scanner.startsWith('<![CDATA[')) {
      text += readCData(scanner);
      continue;
    }
    if (scanner.startsWith('<?')) {
      skipProcessingInstruction(scanner);
      continue;
    }
    if (scanner.peek() === '<') {
      children.push(parseElement(scanner));
      continue;
    }
    if (scanner.peek() === '&') {
      text += readEntity(scanner);
      continue;
    }
    text += scanner.advance();
  }
  return { children, text };
}

function parseElement(scanner: Scanner): XmlNode {
  const start = scanner.position;
  if (scanner.peek() !== '<') {
    throw scanner.error(`expected '<' to start an element`);
  }
  scanner.advance();
  const name = readName(scanner);
  const attributes = parseAttributes(scanner);
  skipWhitespace(scanner);
  if (scanner.peek() === '/') {
    scanner.advance();
    if (scanner.peek() !== '>') {
      throw scanner.error(`expected '>' to close self-closing tag <${name}/>`);
    }
    scanner.advance();
    return { name, attributes, children: [], text: '', line: start.line, column: start.column };
  }
  if (scanner.peek() !== '>') {
    throw scanner.error(`expected '>' to close start tag <${name}>`);
  }
  scanner.advance();
  const { children, text } = parseContent(scanner, name, start);
  return { name, attributes, children, text, line: start.line, column: start.column };
}

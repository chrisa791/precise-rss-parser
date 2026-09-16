import { ParseError, XmlNode, parseXml } from './xml';

export class FeedParseError extends ParseError {
  constructor(message: string, line: number, column: number, source?: string) {
    super(message, line, column, source);
    this.name = 'FeedParseError';
  }
}

export interface RssEnclosure {
  readonly url: string;
  readonly type: string;
  readonly length: number;
}

export interface RssCategory {
  readonly name: string;
  readonly domain?: string;
}

export interface RssItem {
  readonly title?: string;
  readonly link?: string;
  readonly description?: string;
  readonly guid?: string;
  readonly pubDate?: string;
  readonly enclosure?: RssEnclosure;
  readonly categories: readonly RssCategory[];
}

export interface RssFeed {
  readonly title: string;
  readonly link: string;
  readonly description: string;
  readonly items: readonly RssItem[];
}

export function parseRss(source: string): RssFeed {
  const root = parseXml(source);
  if (root.name !== 'rss') {
    throw new FeedParseError(
      `expected the document's root element to be <rss>, found <${root.name}>`,
      root.line,
      root.column,
      source
    );
  }
  const channel = findChild(root, 'channel');
  if (!channel) {
    throw new FeedParseError(`<rss> element is missing a <channel> child`, root.line, root.column, source);
  }
  const title = requireChildText(channel, 'title', source);
  const link = requireChildText(channel, 'link', source);
  const description = requireChildText(channel, 'description', source);
  const items = channel.children
    .filter((child) => child.name === 'item')
    .map((item) => parseItem(item, source));
  return { title, link, description, items };
}

function parseItem(node: XmlNode, source: string): RssItem {
  return {
    title: optionalChildText(node, 'title'),
    link: optionalChildText(node, 'link'),
    description: optionalChildText(node, 'description'),
    guid: optionalChildText(node, 'guid'),
    pubDate: optionalChildText(node, 'pubDate'),
    enclosure: parseEnclosure(node, source),
    categories: parseCategories(node),
  };
}

function parseEnclosure(node: XmlNode, source: string): RssEnclosure | undefined {
  const enclosure = findChild(node, 'enclosure');
  if (!enclosure) {
    return undefined;
  }
  const url = enclosure.attributes.url;
  if (!url) {
    throw new FeedParseError(
      `<enclosure> is missing a required 'url' attribute`,
      enclosure.line,
      enclosure.column,
      source
    );
  }
  const type = enclosure.attributes.type;
  if (!type) {
    throw new FeedParseError(
      `<enclosure> is missing a required 'type' attribute`,
      enclosure.line,
      enclosure.column,
      source
    );
  }
  const lengthText = enclosure.attributes.length;
  if (!lengthText) {
    throw new FeedParseError(
      `<enclosure> is missing a required 'length' attribute`,
      enclosure.line,
      enclosure.column,
      source
    );
  }
  const length = Number(lengthText);
  if (!Number.isFinite(length)) {
    throw new FeedParseError(
      `<enclosure> has a non-numeric 'length' attribute: '${lengthText}'`,
      enclosure.line,
      enclosure.column,
      source
    );
  }
  return { url, type, length };
}

function parseCategories(node: XmlNode): readonly RssCategory[] {
  return node.children
    .filter((child) => child.name === 'category')
    .map((child) => (child.attributes.domain ? { name: child.text.trim(), domain: child.attributes.domain } : { name: child.text.trim() }));
}

function findChild(node: XmlNode, name: string): XmlNode | undefined {
  return node.children.find((child) => child.name === name);
}

function optionalChildText(node: XmlNode, name: string): string | undefined {
  const child = findChild(node, name);
  return child ? child.text.trim() : undefined;
}

function requireChildText(node: XmlNode, name: string, source: string): string {
  const child = findChild(node, name);
  if (!child) {
    throw new FeedParseError(
      `<${node.name}> is missing a required <${name}> element`,
      node.line,
      node.column,
      source
    );
  }
  return child.text.trim();
}

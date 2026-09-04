import { ParseError, XmlNode, parseXml } from './xml';

export class FeedParseError extends ParseError {
  constructor(message: string, line: number, column: number, source?: string) {
    super(message, line, column, source);
    this.name = 'FeedParseError';
  }
}

export interface RssItem {
  readonly title?: string;
  readonly link?: string;
  readonly description?: string;
  readonly guid?: string;
  readonly pubDate?: string;
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
  const items = channel.children.filter((child) => child.name === 'item').map(parseItem);
  return { title, link, description, items };
}

function parseItem(node: XmlNode): RssItem {
  return {
    title: optionalChildText(node, 'title'),
    link: optionalChildText(node, 'link'),
    description: optionalChildText(node, 'description'),
    guid: optionalChildText(node, 'guid'),
    pubDate: optionalChildText(node, 'pubDate'),
  };
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

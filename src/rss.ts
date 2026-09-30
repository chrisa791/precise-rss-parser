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

export interface RssMediaContent {
  readonly url: string;
  readonly type?: string;
  readonly medium?: string;
  readonly width?: number;
  readonly height?: number;
}

export interface RssMediaThumbnail {
  readonly url: string;
  readonly width?: number;
  readonly height?: number;
}

export interface RssMedia {
  readonly content: readonly RssMediaContent[];
  readonly thumbnails: readonly RssMediaThumbnail[];
}

export interface RssItem {
  readonly title?: string;
  readonly link?: string;
  readonly description?: string;
  readonly guid?: string;
  readonly pubDate?: string;
  readonly enclosure?: RssEnclosure;
  readonly categories: readonly RssCategory[];
  readonly contentEncoded?: string;
  readonly media: RssMedia;
}

const NS_CONTENT = 'http://purl.org/rss/1.0/modules/content/';
const NS_MEDIA = 'http://search.yahoo.com/mrss/';

// Prefix -> namespace URI, where '' is the default namespace. Feeds bind the
// same namespaces to different prefixes, so matching on the literal prefix
// would miss some of them.
type Scope = ReadonlyMap<string, string>;

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
  const channelScope = extendScope(extendScope(new Map(), root), channel);
  const items = channel.children
    .filter((child) => child.name === 'item')
    .map((item) => parseItem(item, extendScope(channelScope, item), source));
  return { title, link, description, items };
}

function extendScope(scope: Scope, node: XmlNode): Scope {
  let next: Map<string, string> | undefined;
  for (const [name, value] of Object.entries(node.attributes)) {
    let prefix: string;
    if (name === 'xmlns') {
      prefix = '';
    } else if (name.startsWith('xmlns:')) {
      prefix = name.slice('xmlns:'.length);
    } else {
      continue;
    }
    next ??= new Map(scope);
    next.set(prefix, value);
  }
  return next ?? scope;
}

function findNamespacedChildren(node: XmlNode, scope: Scope, uri: string, localName: string): XmlNode[] {
  return node.children.filter((child) => {
    const colon = child.name.indexOf(':');
    const prefix = colon < 0 ? '' : child.name.slice(0, colon);
    const local = colon < 0 ? child.name : child.name.slice(colon + 1);
    return local === localName && extendScope(scope, child).get(prefix) === uri;
  });
}

function parseMedia(item: XmlNode, scope: Scope, source: string): RssMedia {
  // <media:group> wraps alternative renditions of one item; flatten them.
  const containers = [
    { node: item, scope },
    ...findNamespacedChildren(item, scope, NS_MEDIA, 'group').map((group) => ({
      node: group,
      scope: extendScope(scope, group),
    })),
  ];
  const content = containers.flatMap((c) =>
    findNamespacedChildren(c.node, c.scope, NS_MEDIA, 'content').map((n) => parseMediaContent(n, source))
  );
  const thumbnails = containers.flatMap((c) =>
    findNamespacedChildren(c.node, c.scope, NS_MEDIA, 'thumbnail').map((n) => parseMediaThumbnail(n, source))
  );
  return { content, thumbnails };
}

function parseMediaContent(node: XmlNode, source: string): RssMediaContent {
  const url = requireAttribute(node, 'url', source);
  const { type, medium } = node.attributes;
  const width = optionalIntegerAttribute(node, 'width', source);
  const height = optionalIntegerAttribute(node, 'height', source);
  return {
    url,
    ...(type ? { type } : {}),
    ...(medium ? { medium } : {}),
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
  };
}

function parseMediaThumbnail(node: XmlNode, source: string): RssMediaThumbnail {
  const url = requireAttribute(node, 'url', source);
  const width = optionalIntegerAttribute(node, 'width', source);
  const height = optionalIntegerAttribute(node, 'height', source);
  return {
    url,
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
  };
}

function requireAttribute(node: XmlNode, name: string, source: string): string {
  const value = node.attributes[name];
  if (!value) {
    throw new FeedParseError(
      `<${node.name}> is missing a required '${name}' attribute`,
      node.line,
      node.column,
      source
    );
  }
  return value;
}

function optionalIntegerAttribute(node: XmlNode, name: string, source: string): number | undefined {
  const text = node.attributes[name];
  if (text === undefined) {
    return undefined;
  }
  const value = Number(text);
  if (text.trim() === '' || !Number.isInteger(value) || value < 0) {
    throw new FeedParseError(
      `<${node.name}> has an invalid '${name}' attribute: '${text}'`,
      node.line,
      node.column,
      source
    );
  }
  return value;
}

function parseItem(node: XmlNode, scope: Scope, source: string): RssItem {
  const encoded = findNamespacedChildren(node, scope, NS_CONTENT, 'encoded')[0];
  return {
    contentEncoded: encoded ? encoded.text.trim() : undefined,
    media: parseMedia(node, scope, source),
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

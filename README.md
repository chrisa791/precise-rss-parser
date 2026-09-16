# precise-rss-parser

A small TypeScript library for parsing RSS 2.0 feeds, with error messages that
point at exactly where a feed broke.

## Why

Real-world RSS feeds are frequently slightly broken: an unescaped `&` in a
description, a `</item>` that got left out, mismatched quotes around an
attribute. Run that through `DOMParser` or most XML libraries and you get
something like "not well-formed" with no indication of where. This library
tracks line and column through the whole parse, so errors read like compiler
output instead of a shrug.

## Install

Not published yet. Copy `src/` into your project, or clone this repo and
`npm run build`.

## Usage

```ts
import { parseRss } from 'precise-rss-parser';

const feed = parseRss(xmlString);

console.log(feed.title);
console.log(feed.items.length);

for (const item of feed.items) {
  console.log(item.title, item.link, item.pubDate);
}
```

### Error messages

```ts
import { parseRss, XmlParseError, FeedParseError } from 'precise-rss-parser';

try {
  parseRss(brokenXml);
} catch (error) {
  if (error instanceof XmlParseError || error instanceof FeedParseError) {
    console.error(error.message);
    console.error(error.line, error.column);
  } else {
    throw error;
  }
}
```

Given a feed where `<item>` is closed with a misspelled tag, the message
looks like this:

```
mismatched closing tag: expected </item> but found </itme> (line 14, column 3)
14 |   </itme>
       ^
```

## What's here

- `src/xml.ts` - a hand-written XML parser. It does not aim for full XML 1.0
  conformance (no external entities, no full DTD support), just enough to
  parse the XML that real feeds contain, while recording the line and column
  of every node and producing a readable error, with a source snippet, the
  moment something doesn't parse.
- `src/rss.ts` - walks the parsed XML tree and extracts an RSS 2.0 feed
  (`channel`, `item` elements) into plain objects.
- `src/index.ts` - public exports.
- `test/` - tests using Node's built-in test runner, including a set of
  malformed-feed fixtures under `test/fixtures/` for the errors that matter
  most: mismatched tags, unterminated comments, missing required elements,
  bad entities, duplicate attributes.

Run the tests with `npm test` (this builds first, then runs `node --test`
against the compiled output).

## Status

Early skeleton. Handles RSS 2.0 core fields: channel `title`/`link`/
`description`, and item `title`/`link`/`description`/`guid`/`pubDate`/
`enclosure`/`categories`. Namespaced extensions (`content:encoded`,
`media:*`) and Atom feeds are not handled yet.

## License

MIT

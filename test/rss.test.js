'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseRss, FeedParseError, XmlParseError } = require('../dist/index');
const { fixture } = require('./fixtures');

test('parses channel metadata and items from a well-formed feed', () => {
  const feed = parseRss(fixture('valid-minimal.xml'));
  assert.equal(feed.title, 'Example Feed');
  assert.equal(feed.link, 'https://example.com');
  assert.equal(feed.description, 'An example feed for tests.');
  assert.equal(feed.items.length, 2);

  const [first, second] = feed.items;
  assert.equal(first.title, 'First post');
  assert.equal(first.link, 'https://example.com/1');
  assert.equal(first.guid, 'https://example.com/1');
  assert.equal(first.pubDate, 'Mon, 01 Jan 2024 00:00:00 GMT');
  assert.deepEqual(first.enclosure, {
    url: 'https://example.com/1.mp3',
    type: 'audio/mpeg',
    length: 1024,
  });
  assert.deepEqual(first.categories, [
    { name: 'Tech' },
    { name: 'News', domain: 'https://example.com/categories' },
  ]);

  assert.equal(second.title, 'Second post');
  assert.equal(second.description, 'No link or guid, just a description.');
  assert.equal(second.link, undefined);
  assert.equal(second.guid, undefined);
  assert.equal(second.pubDate, undefined);
  assert.equal(second.enclosure, undefined);
  assert.deepEqual(second.categories, []);
});

test('reads content:encoded and media elements through any prefix', () => {
  const feed = parseRss(fixture('namespaced.xml'));
  const [clip, grouped] = feed.items;
  assert.equal(clip.contentEncoded, '<p>Full <b>body</b></p>');
  assert.deepEqual(clip.media.content, [
    { url: 'https://example.com/clip.mp4', type: 'video/mp4', medium: 'video', width: 640, height: 360 },
  ]);
  assert.deepEqual(clip.media.thumbnails, [{ url: 'https://example.com/clip.jpg', width: 120, height: 90 }]);

  assert.equal(grouped.contentEncoded, undefined);
  assert.deepEqual(grouped.media.content, [
    { url: 'https://example.com/a.mp4' },
    { url: 'https://example.com/b.mp4', type: 'video/mp4' },
  ]);
  assert.deepEqual(grouped.media.thumbnails, []);
});

test('ignores prefixed elements whose prefix is not bound to a known namespace', () => {
  const feed = parseRss(
    '<rss version="2.0"><channel><title>t</title><link>l</link><description>d</description>' +
      '<item><content:encoded>x</content:encoded><media:content url="u"/></item></channel></rss>'
  );
  assert.equal(feed.items[0].contentEncoded, undefined);
  assert.deepEqual(feed.items[0].media, { content: [], thumbnails: [] });
});

test('rejects a <media:content> without a url', () => {
  assert.throws(() => parseRss(fixture('bad-media-content.xml')), (error) => {
    assert.ok(error instanceof FeedParseError);
    assert.match(error.message, /<media:content> is missing a required 'url' attribute/);
    assert.equal(error.line, 7);
    assert.equal(error.column, 7);
    return true;
  });
});

test('rejects an <enclosure> missing a required attribute', () => {
  assert.throws(() => parseRss(fixture('bad-enclosure.xml')), (error) => {
    assert.ok(error instanceof FeedParseError);
    assert.match(error.message, /<enclosure> is missing a required 'length' attribute/);
    assert.equal(error.line, 9);
    assert.equal(error.column, 7);
    return true;
  });
});

test('rejects a document whose root element is not <rss>', () => {
  assert.throws(() => parseRss(fixture('wrong-root.xml')), (error) => {
    assert.ok(error instanceof FeedParseError);
    assert.match(error.message, /expected the document's root element to be <rss>, found <feed>/);
    assert.equal(error.line, 1);
    assert.equal(error.column, 1);
    return true;
  });
});

test('rejects an <rss> element with no <channel>', () => {
  assert.throws(() => parseRss(fixture('missing-channel.xml')), (error) => {
    assert.ok(error instanceof FeedParseError);
    assert.match(error.message, /<rss> element is missing a <channel> child/);
    assert.equal(error.line, 1);
    assert.equal(error.column, 1);
    return true;
  });
});

test('rejects a <channel> missing a required field', () => {
  assert.throws(() => parseRss(fixture('missing-title.xml')), (error) => {
    assert.ok(error instanceof FeedParseError);
    assert.match(error.message, /<channel> is missing a required <title> element/);
    assert.equal(error.line, 2);
    assert.equal(error.column, 3);
    return true;
  });
});

test('rejects a feed with a mismatched closing tag', () => {
  assert.throws(() => parseRss(fixture('mismatched-tag.xml')), (error) => {
    assert.ok(error instanceof XmlParseError);
    assert.match(error.message, /expected <\/item> but found <\/itme>/);
    assert.equal(error.line, 8);
    assert.equal(error.column, 5);
    return true;
  });
});

test('rejects a feed with an unescaped ampersand', () => {
  assert.throws(() => parseRss(fixture('bad-entity.xml')), (error) => {
    assert.ok(error instanceof XmlParseError);
    assert.match(error.message, /entity reference is too long or missing a terminating ';'/);
    assert.equal(error.line, 5);
    assert.equal(error.column, 24);
    return true;
  });
});

test('rejects a feed with an unterminated comment', () => {
  assert.throws(() => parseRss(fixture('unterminated-comment.xml')), (error) => {
    assert.ok(error instanceof XmlParseError);
    assert.match(error.message, /unterminated comment/);
    assert.equal(error.line, 6);
    assert.equal(error.column, 5);
    return true;
  });
});

test('rejects a feed with a duplicate attribute', () => {
  assert.throws(() => parseRss(fixture('duplicate-attribute.xml')), (error) => {
    assert.ok(error instanceof XmlParseError);
    assert.match(error.message, /duplicate attribute 'version'/);
    assert.equal(error.line, 1);
    assert.equal(error.column, 20);
    return true;
  });
});

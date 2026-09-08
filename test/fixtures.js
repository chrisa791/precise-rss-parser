'use strict';

const fs = require('node:fs');
const path = require('node:path');

function fixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
}

module.exports = { fixture };

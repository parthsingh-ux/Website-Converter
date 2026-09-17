import test from 'node:test';
import assert from 'node:assert/strict';
import { detectFavicon } from '../src/features/deploy/favicon-utils.js';

test('detects favicon from HTML <link rel="icon"> tag pointing to a jpg file', () => {
  const htmlMap = {
    'index.html': `
      <!DOCTYPE html>
      <html>
        <head>
          <link rel="icon" type="image/jpeg" href="assets/site-icon.jpg" />
        </head>
        <body><h1>Hello</h1></body>
      </html>
    `
  };
  const images = [
    { filename: 'assets/hero.jpg', name: 'hero.jpg' },
    { filename: 'assets/site-icon.jpg', name: 'site-icon.jpg' }
  ];

  const result = detectFavicon(htmlMap, images);
  assert.equal(result?.filename, 'assets/site-icon.jpg');
});

test('detects standard favicon.png when no HTML link tag is present', () => {
  const htmlMap = {
    'index.html': '<html><body>No favicon link</body></html>'
  };
  const images = [
    { filename: 'images/bg.png', name: 'bg.png' },
    { filename: 'favicon.png', name: 'favicon.png' }
  ];

  const result = detectFavicon(htmlMap, images);
  assert.equal(result?.filename, 'favicon.png');
});

test('detects favicon.jpg / favicon.jpeg when present in images', () => {
  const htmlMap = {
    'index.html': '<html><body>Test</body></html>'
  };
  const images = [
    { filename: 'images/banner.jpg', name: 'banner.jpg' },
    { filename: 'images/favicon.jpg', name: 'favicon.jpg' }
  ];

  const result = detectFavicon(htmlMap, images);
  assert.equal(result?.filename, 'images/favicon.jpg');
});

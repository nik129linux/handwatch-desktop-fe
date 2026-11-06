/* tests/design-lint.js — the design system as a check.
 * Usage: node tests/design-lint.js [css files...]   (default: every css/*.css but tokens.css)
 * Fails on: raw colors, legacy token names, tracked caps, mono outside code,
 * off-scale font sizes / spacing / radius, letter-spacing > 0.02em on small
 * text, `transition: all`, layout-property transitions, italic, weights > 600. */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var files = process.argv.slice(2);
if (!files.length) {
  files = fs.readdirSync(path.join(ROOT, 'css'))
    .filter(function (f) { return /\.css$/.test(f) && f !== 'tokens.css'; })
    .map(function (f) { return path.join('css', f); });
}

var LEGACY = [
  'bg-primary-500', 'bg-primary-300', 'bg-primary-200', 'bg-neutral-950', 'bg-neutral-900', 'bg-neutral-800',
  'bg-neutral-700', 'bg-neutral-600', 'bg-neutral-50', 'bg-black', 'text-primary-500', 'text-neutral-50',
  'text-neutral-100', 'text-neutral-400', 'text-neutral-600', 'text-black', 'text-inverse', 'text-paper',
  'text-primary', 'text-secondary', 'text-tertiary', 'border-primary-500', 'border-neutral-700',
  'border-neutral-600', 'border-neutral-400', 'border-neutral-50', 'border-card', 'border-subtle',
  'border-strong', 'border-focus', 'bg-stage', 'bg-card', 'bg-raised', 'bg-screen', 'bg-paper', 'lime-line',
  'state-primary-press', 'state-primary-dim', 'tint-primary-90', 'tint-primary-70', 'tint-primary-45',
  'tint-primary-30', 'tint-primary-18', 'wall-glow', 'wall-glow-b', 'wall-glow-c', 'text-micro',
  'leading-micro', 'tracking-micro', 'text-body', 'leading-body', 'tracking-body', 'text-display',
  'leading-display', 'tracking-display', 'font-display', 'font-body', 'sp-5', 'radius-card', 'radius-card-lg'
];
var FONT_PX = [12, 14, 16, 18, 20, 24, 30, 36, 48, 60, 72];
var SPACE_PX = [0, 1, 2, 4, 8, 12, 16, 24, 32, 40, 48, 64, 80, 96];
var RADIUS_PX = [0, 2, 4, 6, 8, 12, 16, 24, 32];
var SPACE_PROPS = /^(padding|margin|gap|row-gap|column-gap|padding-(top|right|bottom|left|inline|block)|margin-(top|right|bottom|left|inline|block)|inset|top|right|bottom|left)$/;

function stripComments(css) { return css.replace(/\/\*[\s\S]*?\*\//g, function (m) { return m.replace(/[^\n]/g, ' '); }); }

var problems = [];
function report(file, line, rule, text) { problems.push(file + ':' + line + '  [' + rule + ']  ' + text.trim().slice(0, 140)); }

files.forEach(function (rel) {
  var file = path.resolve(ROOT, rel);
  var css = stripComments(fs.readFileSync(file, 'utf8'));
  var lines = css.split('\n');
  var selector = '';
  lines.forEach(function (raw, i) {
    var ln = i + 1;
    var line = raw;
    var sel = /([^{};]+)\{/.exec(line);
    if (sel) selector = sel[1].trim();
    var isCode = /helper-cmd|\bcode\b|kbd/.test(selector);
    if (/#[0-9a-fA-F]{3,8}\b(?![\w-])/.test(line) && !/url\(#/.test(line) && !/\{[^}]*$/.test(line.split('#')[0] + '{x') ) {
      if (/:\s*[^;]*#[0-9a-fA-F]{3,8}\b/.test(line)) report(rel, ln, 'raw-color', line);
    }
    if (/\b(rgb|rgba|hsl|hsla|oklch)\(/.test(line)) report(rel, ln, 'raw-color', line);
    var legacy = line.match(/var\(--([a-z0-9-]+)\)/g) || [];
    legacy.forEach(function (v) {
      var name = v.slice(6, -1);
      if (LEGACY.indexOf(name) !== -1) report(rel, ln, 'legacy-token --' + name, line);
    });
    if (/text-transform:\s*uppercase/.test(line)) report(rel, ln, 'tracked-caps', line);
    if (/font-style:\s*italic/.test(line)) report(rel, ln, 'italic', line);
    if (/var\(--font-mono\)/.test(line) && !isCode) report(rel, ln, 'mono-costume (code only)', line);
    if (/transition:\s*all\b|transition-property:\s*all\b/.test(line)) report(rel, ln, 'transition-all', line);
    var tr = /transition(-property)?:\s*([^;]+)/.exec(line);
    if (tr && /(^|[\s,])(width|height|top|left|right|bottom|margin|padding)(\s|,|$)/.test(tr[2])) report(rel, ln, 'layout-transition', line);
    var fw = /font-weight:\s*(\d{3})/.exec(line);
    if (fw && parseInt(fw[1], 10) > 600) report(rel, ln, 'weight>600', line);
    var fsz = /font-size:\s*([\d.]+)px/.exec(line);
    if (fsz && FONT_PX.indexOf(parseFloat(fsz[1])) === -1) report(rel, ln, 'off-scale font-size', line);
    var ls = /letter-spacing:\s*([\d.]+)em/.exec(line);
    if (ls && parseFloat(ls[1]) > 0.02) report(rel, ln, 'tracking>0.02em', line);
    var decl = /^\s*([a-z-]+)\s*:\s*([^;]+)/.exec(line);
    if (decl && SPACE_PROPS.test(decl[1]) && !/calc|clamp|var\(/.test(decl[2])) {
      (decl[2].match(/-?[\d.]+px/g) || []).forEach(function (v) {
        if (SPACE_PX.indexOf(Math.abs(parseFloat(v))) === -1) report(rel, ln, 'off-scale spacing ' + v, line);
      });
    }
    if (decl && /^border(-[a-z-]+)?-radius$/.test(decl[1]) && !/var\(/.test(decl[2])) {
      (decl[2].match(/[\d.]+px/g) || []).forEach(function (v) {
        if (RADIUS_PX.indexOf(parseFloat(v)) === -1) report(rel, ln, 'off-scale radius ' + v, line);
      });
    }
  });
});

if (problems.length) {
  console.log(problems.join('\n'));
  console.log('\n' + problems.length + ' design-lint problems in ' + files.join(', '));
  process.exit(1);
}
console.log('design-lint: 0 problems in ' + files.join(', '));

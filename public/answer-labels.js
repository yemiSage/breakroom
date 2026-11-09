export const answerLabels = {
  alphabet: [
    { symbol: 'A', name: 'A' }, { symbol: 'B', name: 'B' },
    { symbol: 'C', name: 'C' }, { symbol: 'D', name: 'D' }
  ],
  shapes: [
    { name: 'Triangle', path: 'M10 1 19 19H1Z' },
    { name: 'Square', path: 'M1 1H19V19H1Z' },
    { name: 'Circle', path: 'M10 1a9 9 0 1 1 0 18 9 9 0 0 1 0-18Z' },
    { name: 'Star', path: 'M10 1 13 7 19 8 15 12 16 19 10 16 4 19 5 12 1 8 7 7Z' }
  ],
  emojis: [
    { symbol: '😀', name: 'Smile' }, { symbol: '🚀', name: 'Rocket' },
    { symbol: '🌈', name: 'Rainbow' }, { symbol: '🎉', name: 'Party' }
  ]
};

export function labelIcon(label) {
  if (!label.path) return label.symbol;
  return '<svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">' +
    '<path d="' + label.path + '"/></svg>';
}

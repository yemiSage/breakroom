export const answerLabels = {
  alphabet: [
    { symbol: 'A', name: 'A' }, { symbol: 'B', name: 'B' },
    { symbol: 'C', name: 'C' }, { symbol: 'D', name: 'D' }
  ],
  shapes: [
    { name: 'Triangle', color: 'pink', path: 'M10 1 19 19H1Z' },
    { name: 'Square', color: 'orange', path: 'M1 1H19V19H1Z' },
    { name: 'Circle', color: 'periwinkle', path: 'M10 1a9 9 0 1 1 0 18 9 9 0 0 1 0-18Z' },
    { name: 'Star', color: 'lime', path: 'M10 1 13 7 19 8 15 12 16 19 10 16 4 19 5 12 1 8 7 7Z' }
  ],
  emojis: [
    { emoji: '😀', name: 'Smile' }, { emoji: '🚀', name: 'Rocket' },
    { emoji: '🌈', name: 'Rainbow' }, { emoji: '🎉', name: 'Party' }
  ]
};

export function labelIcon(label) {
  if (label.emoji) return '<span class="answer-emoji" aria-hidden="true">' + label.emoji + '</span>';
  if (!label.path) return label.symbol;
  return '<svg class="answer-shape" width="38" height="38" viewBox="-1 -1 24 24" ' +
    'stroke="var(--ink)" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="' + label.path + '" transform="translate(2 2)" fill="var(--ink)"/>' +
    '<path d="' + label.path + '" fill="var(--' + label.color + ')"/></svg>';
}

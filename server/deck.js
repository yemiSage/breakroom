import { GameError } from './game.js';
import { questions } from './questions.js';

export const deckLimit = 12;
export const createPayloadLimit = 800 * 1024;
export const recordPayloadLimit = 900 * 1024;

const imageLimit = 110_000;
const deckImageLimit = 650_000;

export function readDeck(input) {
  if (input === undefined) return undefined;
  if (!Array.isArray(input) || !input.length || input.length > deckLimit) {
    throw new GameError(400, 'Add between 1 and 12 questions.');
  }
  let imageSize = 0;
  return input.map((question, index) => {
    const fail = message => { throw new GameError(400, 'Question ' + (index + 1) + '. ' + message); };
    if (!question || typeof question !== 'object') fail('Enter a question.');
    const { format, selection, correct, image } = question;
    const optionStyle = question.optionStyle ?? 'alphabet';
    if (format !== 'text' && format !== 'image') fail('Choose a question format.');
    if (selection !== 'single' && selection !== 'multiple') fail('Choose an answer type.');
    if (!['alphabet', 'shapes', 'emojis'].includes(optionStyle)) fail('Choose letters, shapes or emojis.');

    const text = typeof question.text === 'string' ? question.text.trim() : '';
    if (text.length > 240 || (format === 'text' && !text)) fail('Enter up to 240 characters for the question.');
    if (format === 'image') {
      if (typeof image !== 'string' || image.length > imageLimit || image.length % 4 ||
          !/^\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(image)) fail('Add a supported image.');
      imageSize += image.length;
      if (imageSize > deckImageLimit) fail('The quiz images are too large together. Remove an image and try again.');
    }

    const options = Array.isArray(question.options) ? question.options.map(value =>
      typeof value === 'string' ? value.trim() : '') : [];
    if (options.length < 2 || options.length > 4 || options.some(option => !option || option.length > 100)) {
      fail('Enter 2 to 4 answers, each up to 100 characters.');
    }
    const valid = choice => Number.isInteger(choice) && choice >= 0 && choice < options.length;
    if (selection === 'single' ? !valid(correct) : !Array.isArray(correct) || !correct.length ||
        correct.length > options.length || correct.some(choice => !valid(choice)) ||
        new Set(correct).size !== correct.length) {
      fail('Mark the correct answer or answers.');
    }

    return {
      category: 'Custom', text: text || 'Look at the image and choose your answer.', options, selection, optionStyle,
      correct: selection === 'single' ? correct : correct.slice().sort((a, b) => a - b),
      ...(format === 'image' && { image })
    };
  });
}

function shuffled(values) {
  const result = values.slice();
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

export function prepareDeck(input, settings, starterCount = questions.length) {
  let deck = readDeck(input);
  const { randomizeOptions = false, randomizeQuestions = false } = settings;
  if (typeof randomizeOptions !== 'boolean' || typeof randomizeQuestions !== 'boolean') {
    throw new GameError(400, 'Choose whether to shuffle questions and answers.');
  }
  if (!randomizeOptions && !randomizeQuestions) return deck;
  deck ??= questions.slice(0, starterCount);
  if (randomizeOptions) {
    deck = deck.map(question => {
      const order = shuffled(question.options.map((_, index) => index));
      const correct = Array.isArray(question.correct)
        ? question.correct.map(index => order.indexOf(index)).sort((a, b) => a - b)
        : order.indexOf(question.correct);
      return { ...question, options: order.map(index => question.options[index]), correct };
    });
  }
  return randomizeQuestions ? shuffled(deck) : deck;
}

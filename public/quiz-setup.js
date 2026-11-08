import { answerLabels } from './answer-labels.js';

const questionLimit = 12;

function questionFields(id) {
  const answers = answerLabels.alphabet.map((label, index) =>
    '<div class="setup-answer"><label class="field-label"><span data-answer-label>ANSWER ' + label.symbol + '</span>' +
    '<input name="answer" maxlength="100"' + (index < 2 ? ' required' : ' placeholder="Optional"') +
    '></label><label class="setup-correct"><input type="radio" name="correct-' + id +
    '" value="' + index + '"> Correct <span class="sr-only" data-correct-label>answer ' + label.name + '</span></label></div>').join('');
  return '<details class="setup-card" data-question open>' +
    '<summary class="setup-summary"><span data-question-label></span><span data-question-preview>Untitled question</span></summary>' +
    '<fieldset class="setup-content"><legend class="sr-only"></legend>' +
    '<label class="field-label setup-prompt"><span>QUESTION</span><input name="prompt" maxlength="240" required></label>' +
    '<button type="button" class="setup-ai" data-rephrase disabled>Rephrase with AI</button>' +
    '<p class="setup-ai-status" role="status"></p>' +
    '<label class="field-label setup-image" hidden>IMAGE<input name="image" type="file" accept="image/jpeg,image/png,image/webp" disabled></label>' +
    answers +
    '<div class="setup-types">' +
    '<label class="field-label">TYPE<select name="format"><option value="text">Text</option>' +
    '<option value="image">Image</option></select></label>' +
    '<label class="field-label">CORRECT<select name="selection"><option value="single">One</option>' +
    '<option value="multiple">Several</option></select></label>' +
    '<label class="field-label">LABELS<select name="optionStyle"><option value="alphabet">A B C D</option>' +
    '<option value="shapes">▲ ■ ● ★</option><option value="emojis">😀 🚀 🌈 🎉</option></select></label></div>' +
    '<button type="button" class="setup-remove" data-remove>Remove question</button></fieldset></details>';
}

async function encodeImage(file) {
  if (!file || file.size > 10 * 1024 * 1024) throw new Error('Use a JPG, PNG or WebP under 10 MB.');
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    let scale = Math.min(1, 840 / Math.max(bitmap.width, bitmap.height));
    for (let attempt = 0; attempt < 5; attempt++) {
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const base64 = canvas.toDataURL('image/jpeg', 0.78).split(',')[1];
      if (base64.length <= 110_000) return base64;
      scale *= 0.72;
    }
  } catch {
    throw new Error('Use a JPG, PNG or WebP image.');
  } finally {
    bitmap?.close();
  }
  throw new Error('Choose a smaller image.');
}

async function questionData(card) {
  const format = card.querySelector('[name=format]').value;
  const selection = card.querySelector('[name=selection]').value;
  const text = card.querySelector('[name=prompt]').value.trim();
  const answers = [...card.querySelectorAll('[name=answer]')].map(field => field.value.trim());
  const options = answers.filter(Boolean);
  const marked = [...card.querySelectorAll('.setup-correct input:checked')].map(field => Number(field.value));
  if (format === 'text' && !text) throw new Error('Enter the question text.');
  if (options.length < 2) throw new Error('Enter at least two answers.');
  if (!marked.length || marked.some(index => !answers[index])) throw new Error('Mark the correct answer.');
  const positions = marked.map(index => answers.slice(0, index).filter(Boolean).length);
  const optionStyle = card.querySelector('[name=optionStyle]').value;
  const question = { format, selection, text, options, optionStyle, correct: selection === 'single' ? positions[0] : positions };
  if (format === 'image') question.image = await encodeImage(card.querySelector('[name=image]').files[0]);
  return question;
}

export function openQuizSetup(app, createRoom, back, paraphraseQuestion) {
  app.innerHTML = '<section class="quiz-setup">' +
    '<h1>Write your quiz</h1>' +
    '<form id="quiz-form">' +
    '<div class="setup-questions"></div>' +
    '<button type="button" class="button" data-add><span aria-hidden="true">+</span> Add question</button>' +
    '<fieldset class="quiz-order"><legend>SHUFFLE</legend>' +
    '<label><input type="checkbox" name="randomizeOptions"> Answers</label>' +
    '<label><input type="checkbox" name="randomizeQuestions"> Questions</label></fieldset>' +
    '<div class="setup-actions"><button class="button primary" value="custom">Open lobby</button>' +
    '<button class="button" value="starter" formnovalidate>Use sample quiz</button>' +
    '<button class="setup-remove" type="button" data-back>Back</button></div>' +
    '<p class="notice" id="message" role="status"></p></form></section>';
  const form = app.querySelector('#quiz-form');
  const cards = form.querySelector('.setup-questions');
  const add = form.querySelector('[data-add]');
  const notice = form.querySelector('#message');
  let id = 0;
  let busy = false;

  function updateCards() {
    const all = [...cards.children];
    add.disabled = all.length >= questionLimit;
    all.forEach((card, index) => {
      const label = 'Question ' + (index + 1);
      card.querySelector('legend').textContent = label;
      card.querySelector('[data-question-label]').textContent = label;
      card.querySelector('[data-remove]').disabled = all.length === 1;
    });
  }

  function addQuestion() {
    if (cards.children.length >= questionLimit) return;
    for (const card of cards.children) card.open = false;
    cards.insertAdjacentHTML('beforeend', questionFields(++id));
    updateCards();
    if (!paraphraseQuestion) cards.lastElementChild.querySelector('[data-rephrase]').title = 'Needs Breakroom Online';
    cards.lastElementChild.querySelector('[name=prompt]').focus();
  }

  addQuestion();
  form.addEventListener('input', event => {
    if (event.target.name !== 'prompt') return;
    const card = event.target.closest('[data-question]');
    card.querySelector('[data-question-preview]').textContent = event.target.value.trim() || 'Untitled question';
    card.querySelector('[data-rephrase]').disabled = busy || !paraphraseQuestion || !event.target.value.trim();
  });
  form.addEventListener('invalid', event => {
    const card = event.target.closest('[data-question]');
    if (card) card.open = true;
  }, true);
  form.addEventListener('change', event => {
    const field = event.target;
    const card = field.closest('[data-question]');
    if (field.name === 'format') {
      const image = field.value === 'image';
      const prompt = card.querySelector('[name=prompt]');
      const file = card.querySelector('[name=image]');
      card.querySelector('.setup-image').hidden = !image;
      card.querySelector('.setup-prompt span').textContent = image ? 'CAPTION (OPTIONAL)' : 'QUESTION';
      prompt.required = !image;
      file.disabled = !image;
      file.required = image;
    } else if (field.name === 'optionStyle') {
      const labels = answerLabels[field.value];
      [...card.querySelectorAll('.setup-answer')].forEach((answer, index) => {
        answer.querySelector('[data-answer-label]').textContent = 'ANSWER ' + labels[index].symbol;
        answer.querySelector('[data-correct-label]').textContent = 'answer ' + labels[index].name;
      });
    } else if (field.name === 'selection') {
      const multiple = field.value === 'multiple';
      let kept = false;
      for (const answer of card.querySelectorAll('.setup-correct input')) {
        const checked = answer.checked;
        answer.type = multiple ? 'checkbox' : 'radio';
        answer.checked = checked && (multiple || !kept);
        kept ||= answer.checked;
      }
    }
  });

  form.addEventListener('click', async event => {
    const action = event.target.closest('[data-add], [data-remove], [data-back], [data-rephrase]');
    if (!action || busy) return;
    if (action.hasAttribute('data-rephrase')) {
      const card = action.closest('[data-question]');
      const prompt = card.querySelector('[name=prompt]');
      const original = prompt.value;
      const message = card.querySelector('.setup-ai-status');
      busy = true;
      action.disabled = true;
      action.textContent = 'Rephrasing…';
      message.textContent = '';
      try {
        const options = [...card.querySelectorAll('[name=answer]')].map(field => field.value.trim()).filter(Boolean);
        const { text } = await paraphraseQuestion({ text: original, options });
        const currentOptions = [...card.querySelectorAll('[name=answer]')].map(field => field.value.trim()).filter(Boolean);
        if (prompt.value === original && JSON.stringify(currentOptions) === JSON.stringify(options)) {
          prompt.value = text;
          card.querySelector('[data-question-preview]').textContent = text;
          message.textContent = 'Reworded. Give it a quick check.';
        } else {
          message.textContent = 'You edited the question. Try again.';
        }
      } catch (error) {
        message.textContent = error.message;
      } finally {
        busy = false;
        action.textContent = 'Rephrase with AI';
        for (const question of cards.children) {
          question.querySelector('[data-rephrase]').disabled = !paraphraseQuestion || !question.querySelector('[name=prompt]').value.trim();
        }
      }
    } else if (action.hasAttribute('data-add')) addQuestion();
    else if (action.hasAttribute('data-back')) back();
    else {
      const card = action.closest('[data-question]');
      const next = card.nextElementSibling || card.previousElementSibling;
      card.remove();
      updateCards();
      next.open = true;
      next.querySelector('[name=prompt]').focus();
    }
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    busy = true;
    notice.textContent = '';
    const buttons = [...form.querySelectorAll('button:not(:disabled)')];
    for (const button of buttons) button.disabled = true;
    try {
      let questions;
      if (event.submitter?.value !== 'starter') {
        questions = [];
        let totalImageSize = 0;
        for (const [index, card] of [...cards.children].entries()) {
          try {
            const question = await questionData(card);
            totalImageSize += question.image?.length ?? 0;
            if (totalImageSize > 650_000) throw new Error('Images are too large. Remove one.');
            questions.push(question);
          } catch (error) {
            card.open = true;
            throw new Error('Question ' + (index + 1) + ': ' + error.message);
          }
        }
      }
      await createRoom(questions, {
        randomizeOptions: form.elements.randomizeOptions.checked,
        randomizeQuestions: form.elements.randomizeQuestions.checked
      });
    } catch (error) {
      notice.textContent = error.message;
      notice.scrollIntoView({ block: 'nearest' });
    } finally {
      busy = false;
      for (const button of buttons) button.disabled = false;
    }
  });
}

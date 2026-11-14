import { answerLabels, labelIcon } from './answer-labels.js';
import { api } from './live.js';

const questionLimit = 12;
const answerTimes = [10, 15, 20, 30, 45, 60];
const escape = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

function questionFields(id) {
  const answers = answerLabels.alphabet.map((label, index) =>
    '<div class="setup-answer"><label class="field-label"><span data-answer-label>ANSWER ' + label.symbol + '</span>' +
    '<input name="answer" maxlength="100"' + (index < 2 ? ' required' : ' placeholder="Optional"') +
    '></label><label class="setup-correct"><input type="radio" name="correct-' + id +
    '" value="' + index + '"> Correct <span class="sr-only" data-correct-label>answer ' + label.name + '</span></label></div>').join('');
  return '<details class="setup-card" data-question open>' +
    '<summary class="setup-summary"><span data-question-label></span><span data-question-preview>Untitled question</span></summary>' +
    '<fieldset class="setup-content"><legend class="sr-only"></legend>' +
    '<div class="setup-prompt"><div class="setup-prompt-row"><label class="field-label" for="prompt-' + id + '">QUESTION</label>' +
    '<button type="button" class="setup-ai" data-rephrase disabled title="Rephrase the question">' +
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 8c.8 4.6 2.4 6.2 7 7-4.6.8-6.2 2.4-7 7-.8-4.6-2.4-6.2-7-7 4.6-.8 6.2-2.4 7-7Z"/><path fill="currentColor" stroke="none" d="M17.5 1c.6 3.6 1.9 4.9 5.5 5.5-3.6.6-4.9 1.9-5.5 5.5-.6-3.6-1.9-4.9-5.5-5.5 3.6-.6 4.9-1.9 5.5-5.5Z"/></svg>' +
    'Write with AI</button></div>' +
    '<input id="prompt-' + id + '" name="prompt" maxlength="240" required></div>' +
    '<p class="setup-ai-status" role="status"></p>' +
    '<label class="field-label setup-image" hidden>IMAGE<input name="image" type="file" accept="image/jpeg,image/png,image/webp" disabled></label>' +
    answers +
    '<div class="setup-types">' +
    '<label class="field-label">QUESTION TYPE<span class="setup-select"><select name="format"><option value="text">Text</option>' +
    '<option value="image">Image</option></select></span></label>' +
    '<label class="field-label">CORRECT<span class="setup-select"><select name="selection"><option value="single">One</option>' +
    '<option value="multiple">Several</option></select></span></label>' +
    '<label class="field-label">LABELS<span class="setup-select"><select name="optionStyle"><option value="alphabet">A B C D</option>' +
    '<option value="shapes">Shapes</option><option value="emojis">😀 🚀 🌈 🎉</option></select></span></label></div>' +
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
  // Sample questions keep their topic, and their fact until someone edits them.
  if (card.dataset.category) question.category = card.dataset.category;
  if (card.dataset.fact) question.fact = card.dataset.fact;
  if (format === 'image') question.image = await encodeImage(card.querySelector('[name=image]').files[0]);
  return question;
}

export function openQuizSetup(app, createRoom, back, paraphraseQuestion, topics = []) {
  app.innerHTML = '<section class="quiz-setup">' +
    '<h1>Write your quiz</h1>' +
    '<form id="quiz-form">' +
    '<div class="setup-questions"></div>' +
    '<div class="setup-add"><button type="button" class="button" data-add><span aria-hidden="true">+</span> Add question</button></div>' +
    '<fieldset class="game-settings"><legend class="game-settings-title">GAME SETTINGS</legend>' +
    '<div class="game-settings-body"><label class="field-label">ANSWER TIME<span class="setup-select"><select name="answerSeconds">' +
    answerTimes.map(seconds => '<option value="' + seconds + '"' + (seconds === 20 ? ' selected' : '') + '>' +
      seconds + ' seconds</option>').join('') + '</select></span></label>' +
    '<div class="quiz-order"><label><input type="checkbox" name="randomizeOptions"> Shuffle answers</label>' +
    '<label><input type="checkbox" name="randomizeQuestions"> Shuffle questions</label></div></div></fieldset>' +
    '<div class="setup-actions"><button class="button primary" value="custom">Open lobby</button>' +
    '<button class="button" type="button" data-samples aria-haspopup="dialog">Use sample quiz</button>' +
    '<button class="setup-remove" type="button" data-back>Back</button></div>' +
    '<p class="notice" id="message" role="status"></p></form>' +
    '<dialog class="topic-dialog" aria-labelledby="topic-title"><form method="dialog">' +
    '<div class="topic-heading"><h2 id="topic-title">Pick a topic</h2>' +
    '<button class="topic-close" value="cancel" aria-label="Close">×</button></div>' +
    '<p>Fills in 10 questions you can edit before opening the lobby.<span data-replace-note hidden> ' +
    'This replaces the questions you’ve written.</span></p>' +
    '<div class="topic-grid">' + topics.map(topic => '<button class="topic-option" value="' + escape(topic.id) + '">' +
      '<span class="topic-icon" aria-hidden="true">' + escape(topic.icon) + '</span>' + escape(topic.name) + '</button>').join('') +
    '</div></form></dialog></section>';
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

  function addQuestion(focus = true) {
    if (cards.children.length >= questionLimit) return;
    for (const card of cards.children) card.open = false;
    cards.insertAdjacentHTML('beforeend', questionFields(++id));
    updateCards();
    if (!paraphraseQuestion) cards.lastElementChild.querySelector('[data-rephrase]').title = 'Needs Breakroom Online';
    if (focus) cards.lastElementChild.querySelector('[name=prompt]').focus();
    return cards.lastElementChild;
  }

  function hasWriting() {
    return [...cards.querySelectorAll('[name=prompt], [name=answer]')].some(field => field.value.trim()) ||
      [...cards.querySelectorAll('[name=image]')].some(field => field.files.length);
  }

  // Replace the cards with a sample topic's questions, leaving only the last one open.
  function fillQuestions(questions) {
    cards.replaceChildren();
    for (const question of questions.slice(0, questionLimit)) {
      const card = addQuestion(false);
      card.querySelector('[name=prompt]').value = question.text;
      card.querySelector('[data-question-preview]').textContent = question.text;
      card.querySelector('[data-rephrase]').disabled = !paraphraseQuestion;
      card.querySelectorAll('[name=answer]').forEach((field, index) => { field.value = question.options[index] ?? ''; });
      const selection = card.querySelector('[name=selection]');
      selection.value = Array.isArray(question.correct) ? 'multiple' : 'single';
      selection.dispatchEvent(new Event('change', { bubbles: true }));
      for (const choice of [question.correct].flat()) card.querySelectorAll('.setup-correct input')[choice].checked = true;
      card.dataset.category = question.category;
      if (question.fact) card.dataset.fact = question.fact;
    }
    const last = cards.lastElementChild;
    last.open = true;
    last.scrollIntoView({ block: 'start' });
    last.querySelector('summary').focus({ preventScroll: true });
  }

  addQuestion();
  form.addEventListener('input', event => {
    // An edited sample question no longer matches its fact.
    const edited = event.target.closest('[data-question]');
    if (edited && ['prompt', 'answer'].includes(event.target.name)) delete edited.dataset.fact;
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
    if (card && event.isTrusted && field.name !== 'optionStyle') delete card.dataset.fact;
    if (field.name === 'format') {
      const image = field.value === 'image';
      const prompt = card.querySelector('[name=prompt]');
      const file = card.querySelector('[name=image]');
      card.querySelector('.setup-image').hidden = !image;
      card.querySelector('.setup-prompt label').textContent = image ? 'CAPTION (OPTIONAL)' : 'QUESTION';
      prompt.required = !image;
      file.disabled = !image;
      file.required = image;
    } else if (field.name === 'optionStyle') {
      const labels = answerLabels[field.value];
      [...card.querySelectorAll('.setup-answer')].forEach((answer, index) => {
        answer.querySelector('[data-answer-label]').innerHTML = 'ANSWER ' +
          (labels[index].path || labels[index].emoji ? '<span class="sr-only">' + labels[index].name + '</span>' : '') +
          labelIcon(labels[index]);
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
      action.setAttribute('aria-busy', 'true');
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
        action.removeAttribute('aria-busy');
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

  const dialog = app.querySelector('.topic-dialog');
  const samples = form.querySelector('[data-samples]');
  samples.disabled = !topics.length;
  samples.addEventListener('click', () => {
    dialog.querySelector('[data-replace-note]').hidden = !hasWriting();
    dialog.showModal();
  });
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close('cancel');
  });
  dialog.addEventListener('close', async () => {
    const topic = dialog.returnValue;
    dialog.returnValue = '';
    if (!topics.some(entry => entry.id === topic)) {
      samples.focus();
      return;
    }
    if (busy) return;
    busy = true;
    samples.disabled = true;
    notice.textContent = '';
    try {
      const { questions } = await api('/api/topics/' + encodeURIComponent(topic));
      fillQuestions(questions);
    } catch (error) {
      notice.textContent = error.message || 'Couldn’t load that topic. Try again.';
    } finally {
      busy = false;
      samples.disabled = false;
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
      const questions = [];
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
      await createRoom(questions, {
        randomizeOptions: form.elements.randomizeOptions.checked,
        randomizeQuestions: form.elements.randomizeQuestions.checked,
        answerSeconds: Number(form.elements.answerSeconds.value)
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

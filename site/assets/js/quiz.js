// "Check your understanding" questions and learning objectives for lesson pages.
// Data: site/data/quiz-<lesson-id>.json (signed like every dataset). core.js calls
// mountQuiz() on lesson pages; nothing renders when a lesson has no quiz file.
// Answers are remembered only in this browser (localStorage key "so.quiz").

import { h, clear } from './dom.js';
import { loadData, loadManifest } from './data.js';

const KEY = 'so.quiz';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const write = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode */ } };

export function quizScores() { return read(); }

// Turn "I_sc" or "E_{g}" into I<sub>sc</sub>, built as elements (never innerHTML).
const SUB = /([A-Za-z\u0370-\u03FF])_(\{[^}]+\}|[A-Za-z0-9]+)/g;
export function rich(text) {
  const out = []; let last = 0;
  for (const m of String(text).matchAll(SUB)) {
    out.push(text.slice(last, m.index), m[1], h('sub', {}, m[2].replace(/^\{|\}$/g, '')));
    last = m.index + m[0].length;
  }
  out.push(String(text).slice(last));
  return out;
}

const validate = (q) => q && q.data && Array.isArray(q.data.questions) && Array.isArray(q.data.objectives)
  && q.data.questions.every((x) => typeof x.prompt === 'string' && Array.isArray(x.choices)
    && Number.isInteger(x.answer) && x.answer >= 0 && x.answer < x.choices.length && typeof x.explain === 'string');

/** Load the quiz for a lesson, or null if it has none. */
export async function loadQuiz(lessonId) {
  const name = `quiz-${lessonId}.json`;
  const { manifest } = await loadManifest();
  if (!manifest.files[name]) return null;
  return (await loadData(name, validate)).data.data;
}

/**
 * Fill `slot` (a <section>) with the questions and `objectivesSlot` with the
 * learning objectives for lesson `lessonId`.
 */
export async function mountQuiz(lessonId, slot, objectivesSlot) {
  let quiz;
  try { quiz = await loadQuiz(lessonId); } catch (e) { console.error(e); return; }
  if (!quiz) { slot.remove(); objectivesSlot?.remove(); return; }

  if (objectivesSlot) {
    clear(objectivesSlot).append(
      h('summary', {}, 'What you will learn ', h('span', { class: 'muted' }, `(about ${quiz.minutes} minutes)`)),
      h('ul', {}, quiz.objectives.map((o) => h('li', {}, rich(o)))));
    objectivesSlot.hidden = false;
  }

  const saved = read()[lessonId] || {};
  const score = h('p', { class: 'quiz-score', 'aria-live': 'polite' });
  const updateScore = () => {
    const s = read()[lessonId] || {};
    const right = quiz.questions.filter((q) => s[q.id] === true).length;
    const tried = quiz.questions.filter((q) => q.id in s).length;
    score.textContent = tried ? `${right} of ${quiz.questions.length} answered correctly` : '';
  };

  const items = quiz.questions.map((q, n) => {
    const name = `quiz-${lessonId}-${q.id}`;
    const feedback = h('div', { class: 'quiz-feedback', 'aria-live': 'polite' });
    const inputs = q.choices.map((c, i) => h('input', { type: 'radio', name, value: String(i), id: `${name}-${i}` }));
    const check = h('button', { type: 'button', class: 'btn ghost' }, 'Check answer');
    const fieldset = h('fieldset', { class: 'quiz-q' },
      h('legend', {}, h('span', { class: 'quiz-n' }, `${n + 1}.`), ' ', rich(q.prompt)),
      h('div', { class: 'quiz-choices' }, q.choices.map((c, i) => h('label', { for: `${name}-${i}` }, inputs[i], h('span', {}, rich(c))))),
      h('div', { class: 'btn-row' }, check), feedback);

    const show = (picked) => {
      const ok = picked === q.answer;
      fieldset.dataset.state = ok ? 'right' : 'wrong';
      inputs.forEach((inp, i) => {
        inp.closest('label').dataset.mark = i === q.answer ? 'answer' : (i === picked ? 'picked' : '');
      });
      clear(feedback).append(
        h('strong', {}, ok ? 'Right. ' : ['Not quite. The answer is "', rich(q.choices[q.answer]), '". ']), rich(q.explain));
    };
    check.addEventListener('click', () => {
      const sel = inputs.findIndex((i) => i.checked);
      if (sel < 0) { clear(feedback).append('Pick an answer first.'); delete fieldset.dataset.state; return; }
      show(sel);
      const all = read(); all[lessonId] = { ...(all[lessonId] || {}), [q.id]: sel === q.answer }; write(all);
      updateScore();
    });
    if (q.id in saved) feedback.append(h('span', { class: 'muted' }, saved[q.id] ? 'You answered this correctly before.' : 'You tried this before.'));
    return fieldset;
  });

  const reset = h('button', { type: 'button', class: 'btn ghost' }, 'Clear my answers');
  reset.addEventListener('click', () => {
    const all = read(); delete all[lessonId]; write(all);
    slot.querySelectorAll('input[type=radio]').forEach((i) => { i.checked = false; i.closest('label').dataset.mark = ''; });
    slot.querySelectorAll('.quiz-q').forEach((f) => delete f.dataset.state);
    slot.querySelectorAll('.quiz-feedback').forEach((f) => clear(f));
    updateScore();
  });

  clear(slot).append(
    h('h2', { id: 'check-your-understanding' }, 'Check your understanding'),
    h('p', { class: 'muted' }, 'Answers are checked in your browser and never sent anywhere.'),
    ...items,
    h('div', { class: 'btn-row quiz-foot' }, score, reset));
  slot.hidden = false;
  updateScore();
}

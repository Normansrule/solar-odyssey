// Teachers' guide: objectives, timing and the question bank for every lesson,
// generated from the same signed quiz datasets the lesson pages use.
import { GROUPS, LESSONS } from './assets/js/sitemap.js';
import { h, clear } from './assets/js/dom.js';
import { loadQuiz, rich } from './assets/js/quiz.js';

const root = document.getElementById('teach-lessons');
const summary = document.getElementById('teach-summary');
const toggle = document.getElementById('show-answers');
const LETTERS = 'abcde';

const setAnswers = (on) => { document.body.classList.toggle('show-answers', on); toggle.checked = on; };
toggle.addEventListener('change', () => setAnswers(toggle.checked));
const status = document.getElementById('print-status');
const print = (answers) => {
  setAnswers(answers);
  status.textContent = answers ? 'Printing the question bank with answers.' : 'Printing the student copy, without answers.';
  window.print();
};
document.getElementById('print-student').addEventListener('click', () => print(false));
document.getElementById('print-teacher').addEventListener('click', () => print(true));

const quizzes = await Promise.all(LESSONS.map((l) => loadQuiz(l.id).catch((e) => { console.error(e); return null; })));
const byId = Object.fromEntries(LESSONS.map((l, i) => [l.id, quizzes[i]]));
let totalMin = 0; let totalQ = 0;

for (const g of GROUPS) {
  const lessons = LESSONS.filter((l) => l.group === g.id);
  if (!lessons.length) continue;
  const mins = lessons.reduce((s, l) => s + (byId[l.id]?.minutes ?? 0), 0);
  totalMin += mins;
  const section = h('section', { class: 'teach-group', 'aria-labelledby': `tg-${g.id}` },
    h('h2', { id: `tg-${g.id}` }, g.label, h('span', { class: 'teach-min' }, ` about ${Math.round(mins / 5) * 5} minutes`)));
  for (const l of lessons) {
    const q = byId[l.id];
    const art = h('article', { class: 'teach-lesson', id: `lesson-${l.id}` },
      h('h3', {}, h('a', { href: l.path }, l.title), q ? h('span', { class: 'teach-min' }, ` ${q.minutes} min`) : null),
      h('p', { class: 'muted' }, l.blurb));
    if (q) {
      totalQ += q.questions.length;
      art.append(h('h4', {}, 'Students will be able to'), h('ul', {}, q.objectives.map((o) => h('li', {}, rich(o)))),
        h('h4', {}, 'Questions'),
        h('ol', { class: 'teach-qs' }, q.questions.map((qu) => h('li', {},
          h('p', {}, rich(qu.prompt)),
          h('ol', { class: 'teach-choices', type: 'a' }, qu.choices.map((c, i) => h('li', { class: i === qu.answer ? 'is-answer' : '' }, rich(c)))),
          h('p', { class: 'teach-key' }, h('strong', {}, `Answer: ${LETTERS[qu.answer]}. `), rich(qu.explain))))));
    }
    section.append(art);
  }
  root.append(section);
}
summary.textContent = `${LESSONS.length} lessons, ${totalQ} questions, about ${Math.round(totalMin / 60)} hours of class time in all.`;

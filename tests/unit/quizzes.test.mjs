// Check-your-understanding questions: one signed dataset per lesson,
// data-src/datasets/quiz-<lesson-id>.json -> site/data/quiz-<lesson-id>.json.
//
// Shape:
// { "meta": { "title", "sources": [ids], "license", "last_verified": "YYYY-MM-DD" },
//   "data": {
//     "lesson": "<lesson id from sitemap.js>",
//     "minutes": 20,                       // suggested class time for the lesson
//     "objectives": ["Explain why ...", "Calculate ...", "Compare ..."],   // 2-5, start with a verb
//     "questions": [                       // 3-5
//       { "id": "q1", "prompt": "...", "choices": ["...", "...", "...", "..."],
//         "answer": 2,                     // index of the correct choice
//         "explain": "Why the answer is right, and the trap in the most tempting wrong choice.",
//         "source": "optional source id" }
//     ] } }
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const dataDir = new URL('../../site/data/', import.meta.url);
const sitemap = readFileSync(new URL('../../site/assets/js/sitemap.js', import.meta.url), 'utf8');
const lessons = [...sitemap.matchAll(/id: '([^']+)', path: '[^']+'[^\n]*lesson: true/g)].map((m) => m[1]);
const sources = JSON.parse(readFileSync(new URL('sources.json', dataDir), 'utf8'));
const files = readdirSync(dataDir).filter((f) => /^quiz-[a-z0-9-]+\.json$/.test(f));

test('quiz files only exist for lessons', () => {
  for (const f of files) {
    const id = f.slice(5, -5);
    assert.ok(lessons.includes(id), `${f}: "${id}" is not a lesson in sitemap.js`);
  }
});

test('every lesson has questions', () => {
  const missing = lessons.filter((id) => !files.includes(`quiz-${id}.json`));
  assert.deepEqual(missing, [], `lessons without a quiz: ${missing.join(', ')}`);
});

for (const f of files) {
  test(`${f} is well formed`, () => {
    const q = JSON.parse(readFileSync(new URL(f, dataDir), 'utf8'));
    assert.ok(q.meta?.title && q.meta?.license && /^\d{4}-\d{2}-\d{2}$/.test(q.meta?.last_verified ?? ''));
    assert.ok(Array.isArray(q.meta.sources) && q.meta.sources.length > 0, 'meta.sources');
    for (const s of q.meta.sources) assert.ok(sources[s], `unknown source ${s}`);
    const d = q.data;
    assert.equal(d.lesson, f.slice(5, -5));
    assert.ok(Number.isInteger(d.minutes) && d.minutes >= 5 && d.minutes <= 120, 'minutes');
    assert.ok(d.objectives.length >= 2 && d.objectives.length <= 5, 'objectives count');
    for (const o of d.objectives) assert.match(o, /^[A-Z][a-z]+ /, `objective should start with a verb: ${o}`);
    assert.ok(d.questions.length >= 3 && d.questions.length <= 5, 'question count');
    const ids = new Set();
    for (const qu of d.questions) {
      assert.ok(!ids.has(qu.id), `duplicate id ${qu.id}`); ids.add(qu.id);
      assert.match(qu.id, /^[a-z0-9-]+$/);
      assert.ok(qu.prompt.length > 15 && qu.prompt.length < 400, `${qu.id} prompt length`);
      assert.ok(qu.choices.length >= 3 && qu.choices.length <= 5, `${qu.id} choices`);
      assert.equal(new Set(qu.choices.map((c) => c.trim().toLowerCase())).size, qu.choices.length, `${qu.id} duplicate choices`);
      for (const c of qu.choices) assert.ok(c.length > 0 && c.length < 200, `${qu.id} choice length`);
      assert.ok(Number.isInteger(qu.answer) && qu.answer >= 0 && qu.answer < qu.choices.length, `${qu.id} answer index`);
      assert.ok(qu.explain.length > 30, `${qu.id} explanation`);
      assert.ok(!/all of the above|none of the above/i.test(qu.choices.join(' ')), `${qu.id}: avoid "all/none of the above"`);
      if (qu.source) assert.ok(sources[qu.source], `${qu.id}: unknown source ${qu.source}`);
    }
  });
}

test('correct answers are not always in the same position', () => {
  const pos = files.flatMap((f) => JSON.parse(readFileSync(new URL(f, dataDir), 'utf8')).data.questions.map((q) => q.answer));
  if (pos.length < 10) return;
  const counts = [0, 1, 2, 3].map((i) => pos.filter((p) => p === i).length);
  for (const c of counts) assert.ok(c <= pos.length * 0.4, `answer positions are lopsided: ${counts}`);
});

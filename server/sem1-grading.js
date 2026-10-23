// Scoring helpers for multi-select and matching questions.
// Kept separate so the scoring rules can be tested without Firebase/server startup.
function normalizeFillBlank(value) {
  return String(value ?? '').normalize('NFKC').trim().toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ');
}

function isFillBlankCorrect(question, submitted) {
  const raw = Array.isArray(question && question.answer) ? question.answer : [question && question.answer];
  const accepted = [...raw, ...(Array.isArray(question && question.acceptedAnswers) ? question.acceptedAnswers : [])]
    .filter(v => v !== undefined && v !== null && String(v).trim() !== '');
  const actual = normalizeFillBlank(submitted);
  return actual !== '' && accepted.some(v => normalizeFillBlank(v) === actual);
}

function normalizeMatchAnswer(answer) {
  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) return {};
  return Object.fromEntries(Object.entries(answer).map(([key, value]) => [String(key), String(value ?? '')]));
}

function isEmptyAnswer(value) {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.values(value).every(item => item === undefined || item === null || String(item).trim() === '');
  return false;
}

function isMatchCorrect(question, submitted) {
  const expected = normalizeMatchAnswer(question && question.answer);
  const value = normalizeMatchAnswer(submitted);
  const keys = Object.keys(expected);
  return keys.length > 0 && keys.every(key => value[key] === expected[key]);
}

function getMatchAwardedMarks(question, submitted) {
  const maxMarks = Number(question && question.marks) || 0;
  const expected = normalizeMatchAnswer(question && question.answer);
  const value = normalizeMatchAnswer(submitted);
  const keys = Object.keys(expected);
  if (!keys.length || maxMarks <= 0) return 0;
  const correctPairs = keys.reduce((count, key) => count + (value[key] === expected[key] ? 1 : 0), 0);
  return Number(((correctPairs / keys.length) * maxMarks).toFixed(2));
}

function getMultiSelectAwardedMarks(question, submitted) {
  const maxMarks = Number(question && question.marks) || 0;
  const expected = Array.isArray(question && question.answer) ? [...new Set(question.answer.map(Number))] : [];
  const selected = Array.isArray(submitted) ? [...new Set(submitted.map(Number))] : [];
  if (!expected.length || !selected.length || maxMarks <= 0) return 0;
  const correctSelected = selected.filter(value => expected.includes(value)).length;
  // Each correctly selected expected option earns equal credit; wrong choices do not subtract marks.
  return Number(((Math.min(correctSelected, expected.length) / expected.length) * maxMarks).toFixed(2));
}

module.exports = { normalizeFillBlank, isFillBlankCorrect, normalizeMatchAnswer, isEmptyAnswer, isMatchCorrect, getMatchAwardedMarks, getMultiSelectAwardedMarks };

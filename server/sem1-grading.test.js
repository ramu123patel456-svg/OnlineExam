const assert = require('node:assert/strict');
const { IT_SEM1_EXAM } = require('./sem1-exam');
const { normalizeFillBlank, isFillBlankCorrect, normalizeMatchAnswer, isEmptyAnswer, isMatchCorrect, getMatchAwardedMarks, getMultiSelectAwardedMarks } = require('./sem1-grading');

const exam = IT_SEM1_EXAM;
const q6 = exam.questions.find(q => q.type === 'match');
assert.ok(q6, 'Q6 matching question exists');
assert.equal(q6.marks, 4, 'Q6 is worth 4 marks');
assert.equal(Object.keys(normalizeMatchAnswer(q6.answer)).length, 4, 'four answer-key pairs survive normalization');
const allCorrect = {'0':'1','1':'3','2':'0','3':'2'};
assert.equal(getMatchAwardedMarks(q6, allCorrect), 4, '4 correct pairs = 4 marks');
assert.equal(isMatchCorrect(q6, allCorrect), true, 'all correct pairs register as fully correct');
assert.equal(getMatchAwardedMarks(q6, {'0':'1','1':'3','2':'0','3':'0'}), 3, '3 correct pairs = 3 marks');
assert.equal(getMatchAwardedMarks(q6, {'0':'1','1':'3','2':'1','3':'0'}), 2, '2 correct pairs = 2 marks');
assert.equal(getMatchAwardedMarks(q6, {'0':'1','1':'0','2':'1','3':'0'}), 1, '1 correct pair = 1 mark');
assert.equal(getMatchAwardedMarks(q6, {'0':'0','1':'0','2':'1','3':'0'}), 0, '0 correct pairs = 0 marks');
assert.equal(isEmptyAnswer({'0':'','1':'','2':'','3':''}), true, 'blank matching response counts as skipped');
assert.equal(isEmptyAnswer({'0':'1','1':'','2':'','3':''}), false, 'partially answered matching response counts as attempted');
assert.equal(getMultiSelectAwardedMarks({marks:2,answer:[0,1]},[0,3]),1,'one correct choice in select-two earns 1 mark');
assert.equal(getMultiSelectAwardedMarks({marks:3,answer:[0,1,2]},[0,1,4]),2,'two correct choices in select-three earn 2 marks');
assert.equal(getMultiSelectAwardedMarks({marks:2,answer:[0,1]},[0,1,3]),2,'extra wrong selection does not subtract credit');
const sectionMarks = new Map();
for (const q of exam.questions) sectionMarks.set(q.sectionNumber,(sectionMarks.get(q.sectionNumber)||0)+Number(q.marks||0));
assert.deepEqual([...sectionMarks.keys()].sort((a,b)=>a-b),[1,2,3,4,5,6,7,8],'Q1 through Q8 are present');
assert.equal([...sectionMarks.values()].reduce((a,b)=>a+b,0),50,'all sections total 50 marks');
const programs = exam.questions.filter(q=>q.type==='programming');
assert.equal(programs.length,2,'both programming questions exist');
assert.notEqual(programs[0].orGroup,programs[1].orGroup,'Q7 and Q8 do not share an OR/pool group');
assert.equal(programs.reduce((sum,q)=>sum+q.marks,0),10,'both programming questions total 10 marks');
console.log('PASS: Sem1 regression tests (matching partial credit, blank answers, MCQ partial credit, sections, marks, both programs).');

// Fill-in-the-blank aliases are case-insensitive and accept requested alternatives.
const blankTag = exam.questions.find(q => q.id === 'sem1-q1-1');
const blankEcommerce = exam.questions.find(q => q.id === 'sem1-q1-5');
for (const answer of ['<a>', 'a', 'a <a>']) assert.equal(isFillBlankCorrect(blankTag, answer), true, `anchor alias accepted: ${answer}`);
for (const answer of ['e-commerce','E-commerce','e commerce','E commerce','ecommerce']) assert.equal(isFillBlankCorrect(blankEcommerce, answer), true, `e-commerce alias accepted: ${answer}`);
assert.equal(isFillBlankCorrect(blankEcommerce, 'online shopping'), false, 'unrelated answer remains incorrect');
assert.equal(normalizeFillBlank('E-commerce'), normalizeFillBlank('e commerce').replace(' ', '-'), 'normalizer remains deterministic');

const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
const zlib = require('zlib');
require('dotenv').config();
const { db, enabled: firebaseEnabled, localMode, requireFirebase } = require('./firebase');
const { IT_80_EXAM } = require('./it80-exam');
const { IT_SEM1_EXAM } = require('./sem1-exam');
const { normalizeFillBlank, isFillBlankCorrect, normalizeMatchAnswer, isMatchCorrect, getMatchAwardedMarks, getMultiSelectAwardedMarks, isEmptyAnswer } = require('./sem1-grading');

const app = express();
const PORT = process.env.PORT || 3000;
const CLIENT_DIR = path.join(__dirname, '..', 'client');
const DATA_DIR = path.join(__dirname, 'data');
const EXAMS_FILE = path.join(DATA_DIR, 'exams.json');
const RESULTS_FILE = path.join(DATA_DIR, 'results.json');
const ALLOWED_CODE_LANGUAGES = ['html', 'css', 'javascript', 'php'];
const ALLOWED_TYPES = ['mcq1','mcq2','mcq3','fill_blank','true_false','match','short_answer','long_answer','programming','href_page'];
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@onlineexam.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const SESSION_COLLECTION = 'sessions';

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DEFAULT_EXAM = {
  id: 'physics-practice-001',
  title: 'Physics Board Practice Test',
  subject: 'Physics',
  className: '12th',
  durationMinutes: 180,
  totalMarks: 10,
  passingMarks: 4,
  description: 'Physics practice examination.',
  status: 'Published',
  questions: [
    ['What is the SI unit of force?', ['Joule','Newton','Watt','Pascal'], 1],
    ['What is the acceleration due to gravity approximately on Earth?', ['9.8 m/s²','5 m/s²','15 m/s²','20 m/s²'], 0],
    ['Which quantity is measured in Ohms?', ['Current','Voltage','Resistance','Power'], 2],
    ["Which law states that action and reaction are equal and opposite?", ["Newton's First Law","Newton's Second Law","Newton's Third Law","Ohm's Law"], 2],
    ['What is the speed of light in vacuum approximately?', ['3 × 10⁸ m/s','3 × 10⁶ m/s','3 × 10⁵ km/s','Both A and C'], 3],
    ['Which device converts electrical energy into mechanical energy?', ['Generator','Motor','Transformer','Battery'], 1],
    ['The unit of electric charge is:', ['Coulomb','Ampere','Volt','Ohm'], 0],
    ['Which type of lens is used to correct myopia?', ['Convex','Concave','Cylindrical only','Plane'], 1],
    ['What is the formula for kinetic energy?', ['mgh','mv','½mv²','Fd'], 2],
    ['Which phenomenon explains the splitting of white light into colours?', ['Reflection','Refraction','Dispersion','Diffraction'], 2]
  ].map((x, i) => ({ id: i + 1, question: x[0], options: x[1], answer: x[2], marks: 1, type: 'mcq1' })),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};


function hashString(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest();
}

// Each question type is shuffled only within its own type group. MCQ, MCQ-multi,
// True/False, Fill Blank, Short Answer, Long Answer, and Programming never mix.
// The shuffle is stable for the same exam + student ID, so refreshes keep the same paper.
function buildOptionVariants(count, variantCount = 25) {
  if (count <= 1) return [Array.from({ length: count }, (_, i) => i)];
  const variants = [], seen = new Set();
  const factorial = n => { let x = 1; for (let i = 2; i <= n; i++) x *= i; return x; };
  const target = Math.min(Number(variantCount) || 25, factorial(count));
  if (count <= 8) {
    for (let rank = 0; variants.length < target; rank++) {
      let r = rank;
      const items = Array.from({ length: count }, (_, i) => i);
      const perm = [];
      for (let n = count; n >= 1; n--) {
        const f = factorial(n - 1);
        const index = f ? Math.floor(r / f) : 0;
        r = f ? r % f : 0;
        perm.push(items.splice(index, 1)[0]);
      }
      const key = perm.join(',');
      if (!seen.has(key)) { seen.add(key); variants.push(perm); }
    }
    return variants;
  }
  for (let seed = 0; variants.length < (Number(variantCount) || 25); seed++) {
    const bytes = hashString(`option-variant:${count}:${seed}`);
    const perm = Array.from({ length: count }, (_, i) => i);
    for (let i = perm.length - 1; i > 0; i--) {
      const j = bytes[(i + seed) % bytes.length] % (i + 1);
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    const key = perm.join(',');
    if (!seen.has(key)) { seen.add(key); variants.push(perm); }
  }
  return variants;
}

function deterministicShuffleIndices(length, seedText) {
  const arr = Array.from({ length }, (_, i) => i);
  let counter = 0;
  for (let i = arr.length - 1; i > 0; i--) {
    const digest = hashString(`${seedText}:${counter++}`);
    const value = digest.readUInt32BE(0);
    const j = value % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function variantSlotForStudent(exam, studentKey, salt = 'questions') {
  const count = Math.max(1, Number(exam.variantCount) || 25);
  const key = String(studentKey || '').trim();
  const match = key.match(/(\d+)\s*$/);
  if (match) {
    const n = Number(match[1]);
    if (Number.isFinite(n) && n > 0) {
      const base = (n - 1) % count;
      const offset = hashString(`${exam.id}:variant-offset:${salt}`).readUInt32BE(0) % count;
      return (base + offset) % count;
    }
  }
  const digest = hashString(`${exam.id}:variant-slot:${salt}:${key.toLowerCase()}`);
  return digest.readUInt32BE(0) % count;
}
function optionOrderForStudent(exam, question, studentKey) {
  const count = Array.isArray(question.options) ? question.options.length : 0;
  if (count <= 1) return Array.from({ length: count }, (_, i) => i);
  const variants = buildOptionVariants(count, Number(exam.variantCount) || 25);
  const slot = variantSlotForStudent(exam, studentKey, `options:${question.type || 'q'}:${question.id}`);
  return variants.length ? variants[slot % variants.length] : deterministicShuffleIndices(count, `${exam.id}:options:${question.id}:${String(studentKey || '').trim().toLowerCase()}`);
}
function questionDedupKey(q) {
  const type = String(q?.type || 'short_answer').toLowerCase().trim();
  const text = String(q?.question || '').replace(/<[^>]*>/g, ' ').replace(/\\s+/g, ' ').trim().toLowerCase();
  return `${type}::${text}`;
}

function selectQuestionsForStudent(exam, studentKey) {
  const questions = exam.questions || [];
  const selected = new Set();
  const seenQuestions = new Set();

  // Programming: select exactly one question from each programming OR/pool group.
  // This supports papers such as Q8(A) HTML OR and Q8(B) JavaScript OR, while
  // also supporting a single 12-question programming pool where only one is shown.
  const programGroups = new Map();
  questions.forEach((q,i)=>{
    if(String(q?.type||'').toLowerCase()!=='programming') return;
    const group = String(q?.orGroup||'').trim() || '__PROGRAM_POOL__';
    if(!programGroups.has(group)) programGroups.set(group,[]);
    programGroups.get(group).push(i);
  });
  for(const [group,indices] of programGroups){
    const shuffled=deterministicShuffleIndices(indices.length, `${exam.id}:programming-selection:${group}:${String(studentKey||'').trim().toLowerCase()}`);
    if(indices.length) selected.add(indices[shuffled[0]]);
  }

  const orGroups = new Map();
  questions.forEach((q,i)=>{
    if(selected.has(i)) return;
    if(String(q?.type||'').toLowerCase()==='programming') return;
    const dedupKey = questionDedupKey(q);
    if(!dedupKey.endsWith('::') && seenQuestions.has(dedupKey)) return;
    seenQuestions.add(dedupKey);
    const g=String(q.orGroup||'').trim();
    if(g){if(!orGroups.has(g))orGroups.set(g,[]);orGroups.get(g).push(i);}else selected.add(i);
  });
  for(const [group,indices] of orGroups){
    if(!indices.length)continue;
    const digest=hashString(`${exam.id}:or-selection:${group}:${String(studentKey||'').trim().toLowerCase()}`);
    selected.add(indices[digest.readUInt32BE(0)%indices.length]);
  }
  return selected;
}
function questionOrderForStudent(exam, studentKey) {
  const questions = exam.questions || [];
  const selected = selectQuestionsForStudent(exam, studentKey);
  const order = [];
  const seen = new Set();
  for (const idx of selected) {
    const q = questions[idx];
    const key = questionDedupKey(q);
    if (seen.has(key)) continue;
    seen.add(key);
    order.push(idx);
  }

  // IMPORTANT: Never let selection order decide the paper order.
  // Programming questions are selected first above, which used to make Q8
  // appear before Q1. Build the final paper strictly by section number:
  // Q1 -> Q2 -> ... -> Q8. Randomization is allowed ONLY inside a section.
  const sections = new Map();
  order.forEach(index => {
    const q = questions[index];
    const sectionNumber = Number(q?.sectionNumber) || 9999;
    if(!sections.has(sectionNumber)) sections.set(sectionNumber,[]);
    sections.get(sectionNumber).push(index);
  });

  const finalOrder=[];
  const orderedSectionNumbers=[...sections.keys()].sort((a,b)=>a-b);

  for(const sectionNumber of orderedSectionNumbers){
    const indices=sections.get(sectionNumber)||[];
    if(indices.length<2){
      finalOrder.push(...indices);
      continue;
    }

    // Q8 contains separate HTML and JavaScript OR groups. Keep the
    // selected Q8(A) before Q8(B), while OR selection itself remains random.
    const sectionQuestions=indices.map(i=>questions[i]);
    const isProgrammingSection=sectionQuestions.every(q=>String(q?.type||'').toLowerCase()==='programming');

    if(isProgrammingSection){
      indices.sort((a,b)=>{
        const qa=questions[a], qb=questions[b];
        return (Number(qa?.subNumber)||0)-(Number(qb?.subNumber)||0);
      });
      finalOrder.push(...indices);
      continue;
    }

    const variants=buildOptionVariants(indices.length, Number(exam.variantCount)||25);
    const slot=variantSlotForStudent(exam, studentKey, `section:${sectionNumber}`);
    const perm=variants[slot%variants.length] || indices.map((_,i)=>i);
    perm.forEach(i=>finalOrder.push(indices[i]));
  }

  return finalOrder;
}
function shuffledQuestionForStudent(exam, question, studentKey) {
  const q = { ...question };
  const types = ['mcq1', 'mcq2', 'mcq3', 'true_false'];
  if (!types.includes(q.type) || !Array.isArray(q.options) || q.options.length < 2) return q;
  const optionOrder = optionOrderForStudent(exam, q, studentKey);
  q.options = optionOrder.map(i => question.options[i]);
  if (q.type === 'mcq1' || q.type === 'true_false') {
    q.answer = optionOrder.indexOf(Number(question.answer));
  } else if (q.type === 'mcq2' || q.type === 'mcq3') {
    q.answer = (Array.isArray(question.answer) ? question.answer : []).map(a => optionOrder.indexOf(Number(a))).sort((a,b) => a-b);
  }
  return q;
}

function variantForStudent(exam, studentKey) {
  const order = questionOrderForStudent(exam, studentKey);
  const questions = exam.questions || [];
  const optionOrders = Object.fromEntries(questions.map(q => [String(q.id), optionOrderForStudent(exam, q, studentKey)]));
  const index = variantSlotForStudent(exam, studentKey);
  return { index, number: index + 1, order, optionOrders };
}

function decodePdfString(raw) {
  let s = raw.replace(/\\([\\()])/g, '$1');
  s = s.replace(/\\n/g, '\\n').replace(/\\r/g, '\\r').replace(/\\t/g, '\\t');
  s = s.replace(/\\([0-7]{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
  return s;
}

function decodeAscii85(value) {
  let s = String(value || '').replace(/\s+/g, '');
  s = s.replace(/^<~/, '').replace(/~>$/, '');
  const out = [];
  let tuple = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === 'z' && tuple.length === 0) { out.push(0, 0, 0, 0); continue; }
    const code = ch.charCodeAt(0);
    if (code < 33 || code > 117) continue;
    tuple.push(code - 33);
    if (tuple.length === 5) {
      let n = 0; for (const v of tuple) n = n * 85 + v;
      out.push((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
      tuple = [];
    }
  }
  if (tuple.length) {
    const original = tuple.length;
    while (tuple.length < 5) tuple.push(84);
    let n = 0; for (const v of tuple) n = n * 85 + v;
    const bytes = [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
    out.push(...bytes.slice(0, original - 1));
  }
  return Buffer.from(out);
}

function extractPdfTextFallback(buffer) {
  const binary = buffer.toString('latin1');
  const output = [];
  const streamRe = /stream\r?\n([\s\S]*?)(?:\r?\n|~>)\s*endstream/g;
  let match;
  while ((match = streamRe.exec(binary))) {
    const before = binary.slice(Math.max(0, match.index - 4096), match.index);
    const dictStart = before.lastIndexOf('<<');
    const dictEnd = before.lastIndexOf('>>');
    const dict = dictStart >= 0 && dictEnd > dictStart ? before.slice(dictStart + 2, dictEnd) : '';
    let stream = Buffer.from(match[1], 'latin1');
    try {
      if (/\/ASCII85Decode/.test(dict)) stream = decodeAscii85(stream.toString('latin1'));
      if (/\/FlateDecode/.test(dict)) stream = zlib.inflateSync(stream);
    } catch { continue; }
    const text = stream.toString('latin1');
    const strings = [];
    for (const m of text.matchAll(/\((?:\\.|[^\\)])*\)\s*Tj/g)) {
      const inner = m[0].replace(/\)\s*Tj$/, '').replace(/^\(/, '');
      strings.push(decodePdfString(inner));
    }
    for (const m of text.matchAll(/\[((?:\([^)]*\)|-?\d+(?:\.\d+)?\s*)+)\]\s*TJ/g)) {
      const parts = [...m[1].matchAll(/\((?:\\.|[^\\)])*\)/g)].map(x => decodePdfString(x[0].slice(1, -1)));
      if (parts.length) strings.push(parts.join(''));
    }
    if (strings.length) output.push(strings.join('\n'));
  }
  return output.join('\n');
}

function extractPdfText(buffer) {
  const tmp = path.join(os.tmpdir(), `online-exam-${crypto.randomBytes(8).toString('hex')}.pdf`);
  try {
    fs.writeFileSync(tmp, buffer);
    // Prefer native pdftotext when available.
    try {
      const text = execFileSync('pdftotext', ['-layout', tmp, '-'], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
      if (String(text || '').trim()) return text;
    } catch {}
    // Cross-platform pure-JS fallback. Handles ReportLab-style ASCII85 + Flate streams.
    return extractPdfTextFallback(buffer);
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
  }
}

function parseAnswerKey(text) {
  const answers = {};
  const source = String(text || '');
  const keyMatch = source.match(/(?:ANSWER\s+KEY|ANSWER\s*KEY|ANSWERS?)\s*[-:]?([\s\S]*)/i);
  const key = keyMatch ? keyMatch[1] : source;
  if (!key.trim()) return answers;
  const re = /(\d{1,3})\s*[-.):]\s*(.*?)(?=\s+\d{1,3}\s*[-.):]|[,;\n]|$)/g;
  let m;
  while ((m = re.exec(key))) answers[Number(m[1])] = m[2].trim();
  return answers;
}

function answerKeyFromText(text) {
  const answers = {};
  const parsed = parseAnswerKey(text);
  for (const [k, v] of Object.entries(parsed)) {
    const letter = String(v).trim().match(/^([A-E])(?:\b|\s|$)/i);
    if (letter) answers[Number(k)] = letter[1].toUpperCase();
  }
  return answers;
}

function extractSection(line) {
  const x = String(line || '').toLowerCase();
  if (/true\s*\/\s*false|true\s+or\s+false/.test(x)) return 'true_false';
  if (/fill\s+in|fill-in|fill in the blank/.test(x)) return 'fill_blank';
  if (/short\s+answer/.test(x)) return 'short_answer';
  if (/long\s+answer|descriptive/.test(x)) return 'long_answer';
  if (/choose\s+(the\s+)?two|multiple\s+select|select\s+two/.test(x)) return 'mcq2';
  if (/mcq|multiple\s+choice|objective/.test(x)) return 'mcq1';
  if (/programming|write\s+an?\s+html\s+program|write\s+program/.test(x)) return 'programming';
  return null;
}

function sectionMarksInfo(text, fallback=1) {
  const x=String(text||'');
  const grouped=x.match(/\(\s*(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*=\s*(\d+(?:\.\d+)?)\s*marks?\s*\)/i);
  if(grouped) return {perQuestion:Number(grouped[2]), total:Number(grouped[3])};
  const simple=x.match(/[\[(]\s*(\d+(?:\.\d+)?)\s*marks?\s*[\])]/i);
  if(simple) return {perQuestion:Number(fallback), total:Number(simple[1])};
  return {perQuestion:Number(fallback),total:null};
}

function parseQuestionPaperPdf(text) {
  const clean=String(text||'').replace(/\u0000/g,'').replace(/\r/g,'\n');
  const answerMap=parseAnswerKey(clean);
  const answerLetters=answerKeyFromText(clean);
  // Section-specific answer keys prevent question-number collisions between sections.
  const fillKeyText = (clean.match(/Fill in the Blanks?\s*:\s*([\s\S]*?)(?=Choose TWO|Short Answers?|Programming|$)/i)||[])[1] || '';
  const chooseTwoKeyText = (clean.match(/Choose TWO\s*:\s*([\s\S]*?)(?=Short Answers?|Programming|$)/i)||[])[1] || '';
  const fillAnswerMap = parseAnswerKey(fillKeyText);
  const chooseTwoAnswerMap = {};
  for (const m of chooseTwoKeyText.matchAll(/(\d{1,3})\s*[-.):]\s*([A-E](?:\s*,\s*[A-E])*)/gi)) {
    chooseTwoAnswerMap[Number(m[1])] = m[2].trim();
  }
  const chooseTwoLetters = {};
  for (const [n, value] of Object.entries(chooseTwoAnswerMap)) {
    chooseTwoLetters[Number(n)] = (String(value).match(/[A-E]/gi) || []).map(x => x.toUpperCase()).join('');
  }
  const lines=clean.split('\n').map(x=>x.trim()).filter(Boolean);
  const questions=[];
  let sectionType=null, sectionInfo={perQuestion:1,total:null}, sectionKey=0, current=null, inAnswerKey=false;
  const sectionMeta=[];
  const flush=()=>{
    if(!current)return;
    const b=current.text.replace(/\s+/g,' ').trim();
    const num=current.number, type=current.type||sectionType||'short_answer';
    if(inAnswerKey||/^answer\s*key/i.test(b)){current=null;return;}
    const marks=Number.isFinite(current.marks)&&current.marks>0?current.marks:(sectionInfo.perQuestion||1);
    const optionRe=/(?:^|\s)([A-Ea-e])\s*[.)]\s*/g;
    const matches=[...b.matchAll(optionRe)];
    if((type==='mcq1'||type==='mcq2'||type==='mcq3')&&matches.length>=2){
      const question=b.slice(0,matches[0].index).trim();
      const options=matches.slice(0,5).map((m,i)=>{const st=(m.index||0)+m[0].length;const en=i+1<matches.length?(matches[i+1].index||b.length):b.length;return b.slice(st,en).trim();}).filter(Boolean);
      if(question&&options.length>=2){
        let answer=null;
        if(type==='mcq2'||type==='mcq3'){
          const letters=String(chooseTwoAnswerMap[num]||'').match(/[A-E]/gi)||[];
          const unique=[...new Set(letters.map(x=>x.toUpperCase()))];
          answer=unique.map(x=>'ABCDE'.indexOf(x)).filter(i=>i>=0).slice(0, type==='mcq3'?3:2).sort((a,b)=>a-b);
          if(!answer.length){ const vals=String(chooseTwoLetters[num]||'').match(/[A-E]/gi)||[]; answer=[...new Set(vals.map(x=>'ABCDE'.indexOf(x)).filter(i=>i>=0))].slice(0,type==='mcq3'?3:2).sort((a,b)=>a-b); }
        } else {
          const letter=answerLetters[num]; answer=letter?'ABCDE'.indexOf(letter):-1; if(answer<0)answer=null;
        }
        questions.push(normalizeQuestion({id:`${sectionKey}-${num}`,type,question,options,answer,marks},questions.length));
      }
      current=null;return;
    }
    if(type==='true_false'){
      const statement=b.replace(/\s*true\s*\/\s*false\s*:?[\s_]*$/i,'').trim();
      const raw=String(answerMap[num]||'');
      let val=/^t(?:rue)?$/i.test(raw)?0:/^f(?:alse)?$/i.test(raw)?1:null;
      if(val===null && answerLetters[num]) val=String(answerLetters[num]).toUpperCase()==='T'?0:String(answerLetters[num]).toUpperCase()==='F'?1:null;
      questions.push(normalizeQuestion({id:`${sectionKey}-${num}`,type:'true_false',question:statement,options:['True','False'],answer:val,marks},questions.length));
      current=null;return;
    }
    if(type==='fill_blank'){
      const question=b.replace(/_+/g,'__________').trim();
      const answer=String(fillAnswerMap[num]||'').trim();
      questions.push(normalizeQuestion({id:`${sectionKey}-${num}`,type:'fill_blank',question,answer:answer||null,marks},questions.length));
      current=null;return;
    }
    if(type==='short_answer'||type==='long_answer'){
      const question=b.replace(/_+/g,'').trim();
      if(question)questions.push(normalizeQuestion({id:`${sectionKey}-${num}`,type,question,answer:'',marks},questions.length));
      current=null;return;
    }
    if(type==='programming'){
      const question=b.replace(/_+/g,'').trim();
      if(question)questions.push(normalizeQuestion({id:`${sectionKey}-${num}`,type:'programming',question,answer:'',marks:5,orGroup:`PROGRAMMING-${sectionKey}`,orOption:String(num)},questions.length));
      current=null;return;
    }
    current=null;
  };
  for(const line of lines){
    if(/^answer\s*key\b/i.test(line)||/^answers?\s*[-:]/i.test(line)){flush();inAnswerKey=true;continue;}
    if(inAnswerKey)continue;
    const detected=extractSection(line);
    if(detected && !/^Option\s*\d+/i.test(line) && (/^Q\.?\s*\d+/i.test(line) || /^Section\b/i.test(line) || /^(?:FILL|CHOOSE|TRUE|FALSE|SHORT|LONG|PROGRAMMING|MULTIPLE)/i.test(line))){
      flush(); sectionType=detected; sectionInfo=sectionMarksInfo(line,detected==='short_answer'||detected==='long_answer'||detected==='programming'?1:1); sectionKey++; sectionMeta.push({key:sectionKey,type:detected,total:sectionInfo.total}); continue;
    }
    if(/^or$/i.test(line)){
      // Keep an OR alternative inside the same programming question.
      if(current && (current.type==='programming' || current.type==='short_answer' || current.type==='long_answer')){
        current.text += ' OR ';
      }
      continue;
    }
    // Programming papers often use 'Option 1:' / 'Option 2:' instead of
    // numbered questions. Treat the first option as the question and append
    // the second option to it so the OR choice remains one 5-mark question.
    const optionLine=line.match(/^Option\s*1\s*:\s*(.*)$/i);
    if(optionLine && sectionType==='programming'){
      flush();
      current={number:1,text:optionLine[1],type:'programming',marks:5};
      continue;
    }
    const option2Line=line.match(/^Option\s*2\s*:\s*(.*)$/i);
    if(option2Line && current && current.type==='programming'){
      current.text += ' OR ' + option2Line[1];
      continue;
    }
    const romanProgram=line.match(/^(i|ii|iii|iv|v|vi|vii|viii)\s*[.)]\s*(.*)$/i);
    if(romanProgram && sectionType==='programming'){
      flush();
      const roman=romanProgram[1].toLowerCase();
      const romanMap={i:1,ii:2,iii:3,iv:4,v:5,vi:6,vii:7,viii:8};
      current={number:romanMap[roman],text:romanProgram[2],type:'programming',marks:5};
      continue;
    }
    const qm=line.match(/^(?:Q\.?\s*)?(\d{1,3})\s*[.)]\s*(.*)$/i);
    if(qm){flush();const inlineType=extractSection(qm[2]);current={number:Number(qm[1]),text:qm[2],type:inlineType||sectionType,marks:(inlineType||sectionType)==='programming'?5:(sectionInfo.perQuestion||1)};}
    else if(current)current.text+=' '+line;
  }
  flush();
  // If a section header gave only a total (e.g. [10 Marks]), distribute it across its questions.
  for(const meta of sectionMeta){
    if(meta.total==null)continue;
    const group=questions.filter(q=>String(q.id).startsWith(`${meta.key}-`));
    if(!group.length)continue;
    // Every selected programming question is worth 5 marks.
    // The student paper contains exactly one selected programming question.
    const per = meta.type === 'programming'
      ? 5
      : Number((meta.total / group.length).toFixed(2));
    group.forEach(q=>q.marks=per);
  }
  // Remove accidental duplicate questions created by PDF extraction/import.
  // Keep the first occurrence so numbering/order can still be shuffled later.
  const uniqueQuestions = [];
  const seenQuestionKeys = new Set();
  for (const q of questions) {
    const key = questionDedupKey(q);
    if (seenQuestionKeys.has(key)) continue;
    seenQuestionKeys.add(key);
    uniqueQuestions.push(q);
  }
  return uniqueQuestions;
}

function publicExam(exam, variant = null, rollNumber = '') {
  const sourceQuestions = exam.questions || [];
  const safeVariant = variant || (rollNumber ? variantForStudent(exam, rollNumber) : { order: sourceQuestions.map((_, i) => i), number: null });
  const orderedQuestions = (safeVariant.order || sourceQuestions.map((_, i) => i)).map(i => sourceQuestions[i]).filter(Boolean).map(q => shuffledQuestionForStudent(exam, q, rollNumber));
  return {
    id: exam.id, title: exam.title, subject: exam.subject, className: exam.className,
    durationMinutes: Math.max(1, Number(exam.durationMinutes)||60), totalMarks: exam.totalMarks, passingMarks: exam.passingMarks,
    description: exam.description, status: exam.status,
    startedAt: exam.startedAt || null,
    scheduledAt: exam.scheduledAt || null,
    endsAt: exam.endsAt || null,
    serverNow: Date.now(),
    questions: orderedQuestions.map(q => {
      const safe = { ...q, ...(q.type==='programming' ? {marks:5} : {}) };
      delete safe.answer;
      delete safe.acceptedAnswers;
      delete safe.optionOrder;
      return { ...safe, type: safe.type || (safe.options?.length ? 'mcq1' : 'short_answer') };
    }),
    variantNumber: variant ? variant.number : (rollNumber ? safeVariant.number : null),
    variantCount: Number(exam.variantCount) || 25
  };
}

function normalizeText(v) { return String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' '); }
function normalizeHref(v) { return String(v ?? '').trim().replace(/\s+/g, '').replace(/^https?:\/\//i, '').replace(/\/$/, '').toLowerCase(); }
function emptyAnswer(v) { return isEmptyAnswer(v); }

function tokenizeAnswer(v) {
  return normalizeText(v)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}
function gradeSubjectiveQuestion(q, submitted) {
  const expected = normalizeText(q.answer);
  const actual = normalizeText(submitted);
  const maxMarks = Number(q.marks) || 0;
  const correct = Boolean(expected) && expected === actual;
  return {
    correct,
    awarded: correct ? maxMarks : 0,
    score: correct ? 1 : 0,
    grade: correct ? 'full' : 'wrong',
    gradingMethod: 'exact'
  };
}

function getObjectiveAwardedMarks(q, submitted) {
  const maxMarks = Number(q.marks) || 0;
  if (q.type === 'match') return getMatchAwardedMarks(q, submitted);
  if (q.type === 'mcq2' || q.type === 'mcq3') return getMultiSelectAwardedMarks(q, submitted);
  return isCorrectQuestion(q, submitted) ? maxMarks : 0;
}

function isCorrectQuestion(q, submitted) {
  if (q.type === 'mcq1' || q.type === 'true_false') return Number(submitted) === Number(q.answer);
  if (q.type === 'fill_blank') return isFillBlankCorrect(q, submitted);
  if (q.type === 'mcq2' || q.type === 'mcq3') {
    const a = Array.isArray(q.answer) ? q.answer.map(Number).sort((x,y)=>x-y) : [];
    const b = Array.isArray(submitted) ? submitted.map(Number).sort((x,y)=>x-y) : [];
    return a.length === b.length && a.every((v,i)=>v === b[i]);
  }
  if (q.type === 'match') return isMatchCorrect(q, submitted);
  if (q.type === 'href_page') {
    const value = submitted && typeof submitted === 'object' ? submitted : {};
    return normalizeHref(value.href) === normalizeHref(q.href) && normalizeText(value.pageTitle) === normalizeText(q.pageTitle);
  }
  if (q.type === 'programming') return q.answer ? normalizeText(submitted) === normalizeText(q.answer) : false;
  if (q.type === 'short_answer' || q.type === 'long_answer') return normalizeText(submitted) === normalizeText(q.answer);
  return normalizeText(submitted) === normalizeText(q.answer);
}

function normalizeQuestion(q, index) {
  const type = ALLOWED_TYPES.includes(q.type) ? q.type : 'mcq1';
  let options = Array.isArray(q.options) ? q.options.slice(0, 6).map(v => String(v).trim()) : [];
  if (type === 'true_false' && options.length < 2) options = ['True', 'False'];
  let answer = q.answer;
  if (['mcq2','mcq3'].includes(type)) answer = Array.isArray(answer) ? answer.map(Number).sort((a,b)=>a-b) : null;
  else if (type === 'mcq1' || type === 'true_false') answer = (answer===null||answer===undefined||answer==='') ? null : Number(answer);
  else if (type === 'match') answer = normalizeMatchAnswer(answer);
  else if (type === 'fill_blank') answer = Array.isArray(answer) ? answer.map(v => String(v ?? '').trim()).filter(Boolean) : String(answer ?? '').trim();
  else answer = String(answer ?? '').trim();
  const codeLanguage = String(q.codeLanguage || 'html').toLowerCase();
  return {
    id: q.id ?? index + 1, type, question: String(q.question || '').trim(), options, answer,
    acceptedAnswers: Array.isArray(q.acceptedAnswers) ? q.acceptedAnswers.map(v => String(v ?? '').trim()).filter(Boolean) : [],
    marks: type === 'programming' ? 5 : (Number(q.marks) > 0 ? Number(q.marks) : 1),
    orGroup: String(q.orGroup || '').trim(), orOption: String(q.orOption || '').trim(),
    sectionId: String(q.sectionId || '').trim(), sectionTitle: String(q.sectionTitle || '').trim(),
    sectionNumber: Number(q.sectionNumber) || 0, subNumber: Number(q.subNumber) || 0,
    choiceGroup: String(q.choiceGroup || '').trim(), choiceMax: Number(q.choiceMax) || 0,
    pairs: Array.isArray(q.pairs) ? q.pairs.map(p => ({left:String(p.left||p.question||p[0]||'').trim(), options:Array.isArray(p.options)?p.options.map(String):[]})) : [],
    codeLanguage: ALLOWED_CODE_LANGUAGES.includes(codeLanguage) ? codeLanguage : 'html',
    starterCode: String(q.starterCode || ''), pageTitle: String(q.pageTitle || ''), href: String(q.href || '')
  };
}

function calculateExamTotal(questions){
  const orSeen=new Set();
  const choiceGroups=new Map();
  let total=0;
  for(const q of questions||[]){
    const marks=Number(q.type==='programming'?5:q.marks)||0;
    const or=String(q.orGroup||'').trim();
    if(or){
      if(orSeen.has(or)) continue;
      orSeen.add(or); total+=marks; continue;
    }
    const cg=String(q.choiceGroup||'').trim();
    if(cg){
      const max=Number(q.choiceMax)||0;
      if(!choiceGroups.has(cg)) choiceGroups.set(cg,{sum:0,max:max*marks});
      const item=choiceGroups.get(cg); item.sum+=marks; if(max>0)item.max=Math.max(item.max,max*marks);
      continue;
    }
    total+=marks;
  }
  for(const item of choiceGroups.values()) total+=item.max||item.sum;
  return Number(total.toFixed(2));
}

function validateQuestions(questions) {
  return questions.some(q => {
    if (!q.question) return true;
    if (q.type === 'mcq1' || q.type === 'true_false') return !q.options.length || !Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length;
    if (['mcq2','mcq3'].includes(q.type)) return q.options.length < q.answer.length || q.answer.length !== Number(q.type.slice(3)) || q.answer.some(i => i < 0 || i >= q.options.length);
    if (q.type === 'match') return !q.answer;
    if (q.type === 'href_page') return !q.pageTitle || !q.href;
    return !q.answer && q.type !== 'programming';
  });
}

async function listCollection(name) {
  const snap = await requireFirebase().collection(name).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
async function getExam(id) {
  const snap=await requireFirebase().collection('exams').doc(id).get();
  if(!snap.exists)return null;
  const exam={id:snap.id,...snap.data()};
  if(Array.isArray(exam.questions)){
    exam.questions=exam.questions.map((q,i)=>{const nq=normalizeQuestion(q,i);if(nq.type==='programming')nq.marks=5;return nq;});
    exam.totalMarks=calculateExamTotal(exam.questions);

  }
  return exam;
}
async function writeAudit(type, data) {
  await requireFirebase().collection('auditLogs').add({ type, ...data, createdAt: new Date().toISOString() });
}

async function migrateJsonIfRequested() {
  if (process.env.MIGRATE_JSON_TO_FIRESTORE !== 'true') return;
  const firestore = requireFirebase();
  const exams = fs.existsSync(EXAMS_FILE) ? JSON.parse(fs.readFileSync(EXAMS_FILE, 'utf8')) : [];
  const results = fs.existsSync(RESULTS_FILE) ? JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8')) : [];
  for (const exam of exams) await firestore.collection('exams').doc(exam.id).set(exam, { merge: true });
  for (const result of results) await firestore.collection('results').doc(result.id).set(result, { merge: true });
  console.log(`Migrated ${exams.length} exams and ${results.length} results to Firestore.`);
}

async function seedDefaultExam() {
  const firestore = requireFirebase();
  if (process.env.SEED_IT_EXAM === 'true') {
    const exam = JSON.parse(JSON.stringify(IT_80_EXAM));
    const now = new Date().toISOString();
    exam.createdAt = exam.createdAt || now;
    exam.updatedAt = now;
    await firestore.collection('exams').doc(exam.id).set(exam, { merge: true });
    console.log(`Seeded/updated IT 80-mark exam into Firestore: ${exam.id}`);
    return;
  }
  const existing = await firestore.collection('exams').limit(1).get();
  if (existing.empty && process.env.SEED_DEFAULT_EXAM !== 'false') {
    await firestore.collection('exams').doc(DEFAULT_EXAM.id).set(DEFAULT_EXAM);
    console.log('Seeded default Physics exam into Firestore.');
  }
}
function hashPassword(password, salt) {
  return new Promise((resolve, reject) => crypto.scrypt(String(password), salt, 64, (err, derived) => {
    if (err) reject(err); else resolve(derived.toString('hex'));
  }));
}
async function createPasswordRecord(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `scrypt$${salt}$${await hashPassword(password, salt)}`;
}
async function verifyPassword(password, stored) {
  const value = String(stored || '');
  if (!value.startsWith('scrypt$')) { const a=Buffer.from(String(password)); const b=Buffer.from(value); return a.length===b.length && crypto.timingSafeEqual(a,b); }
  const [, salt, digest] = value.split('$');
  const candidate = await hashPassword(password, salt);
  const a = Buffer.from(candidate, 'hex'), b = Buffer.from(digest || '', 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function createSession(type, subject) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const session = { type, subject, createdAt: new Date(now).toISOString(), expiresAt: new Date(now + SESSION_TTL_MS).toISOString() };
  await requireFirebase().collection(SESSION_COLLECTION).doc(token).set(session);
  return token;
}
async function getSession(token, expectedType) {
  if (!token) return null;
  const ref = requireFirebase().collection(SESSION_COLLECTION).doc(token);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data();
  if (data.type !== expectedType || !data.expiresAt || new Date(data.expiresAt).getTime() <= Date.now()) {
    try { await ref.delete(); } catch {}
    return null;
  }
  return data;
}
function bearerToken(req) { const auth=req.headers.authorization||''; return auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''; }
async function requireStudent(req, res, next) {
  try {
    const token=bearerToken(req); const session=await getSession(token,'student');
    if(!session)return res.status(401).json({ok:false,message:'Student login required.'});
    const snap=await requireFirebase().collection('students').doc(session.subject).get();
    if(!snap.exists || snap.data().active===false)return res.status(401).json({ok:false,message:'Student account is unavailable.'});
    const s=snap.data(); req.student={studentId:session.subject,rollNumber:String(s.rollNumber||''),name:String(s.name||''),className:String(s.className||''),phone:String(s.phone||''),active:true}; req.studentToken=token; next();
  } catch(e) { next(e); }
}
async function requireAdmin(req, res, next) {
  try {
    const token=bearerToken(req); const session=await getSession(token,'admin');
    if(!session)return res.status(401).json({ok:false,message:'Admin login required.'});
    req.admin={email:session.subject,name:'Administrator'}; req.adminToken=token; next();
  } catch(e) { next(e); }
}

app.get('/api/health', (req, res) => res.json({ ok: true, firebase: firebaseEnabled && !localMode, database: localMode ? 'local-json' : 'firestore', message: 'Online Exam Server is running', port: PORT }));

app.post('/api/admin/login', async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!email || !password) {
      return res.status(400).json({ ok:false, message:'Email and password are required.' });
    }

    if (email !== ADMIN_EMAIL.toLowerCase() || password !== ADMIN_PASSWORD) {
      return res.status(401).json({ ok:false, message:'Invalid admin email or password.' });
    }

    // IMPORTANT: use the same persistent session store as requireAdmin().
    // Do not use the old undefined in-memory `adminTokens` map.
    const token = await createSession('admin', ADMIN_EMAIL);
    const admin = { email: ADMIN_EMAIL, name: 'Administrator' };

    res.json({ ok:true, token, admin });
  } catch (err) {
    next(err);
  }
});
app.post('/api/admin/logout', requireAdmin, async (req,res,next)=>{ try { await requireFirebase().collection(SESSION_COLLECTION).doc(req.adminToken).delete(); res.json({ok:true}); } catch(e){next(e);} });
app.get('/api/admin/me', requireAdmin, (req,res)=>res.json({ok:true,admin:req.admin}));


// ========================= STUDENT ADMIN CONTROL =========================
app.get('/api/admin/students', requireAdmin, async (req,res,next)=>{
  try {
    const students=await listCollection('students');
    const now=Date.now();
    const sessionSnap=await requireFirebase().collection(SESSION_COLLECTION).where('type','==','student').get();
    const onlineIds=new Set(sessionSnap.docs.filter(d=>new Date(d.data().expiresAt||0).getTime()>now).map(d=>d.data().subject));
    res.json({ok:true,students:students.map(s=>{const x={...s}; delete x.password; x.online=onlineIds.has(x.studentId); return x;})});
  }catch(e){next(e);}
});
app.post('/api/admin/students/bulk', requireAdmin, async (req,res,next)=>{
  try {
    const rows=Array.isArray(req.body?.students)?req.body.students:[];
    if(!rows.length)return res.status(400).json({ok:false,message:'No students supplied.'});
    const dbx=requireFirebase(); const created=[]; const skipped=[];
    for(const b of rows){
      const studentId=String(b.studentId||'').trim(), name=String(b.name||'').trim(), password=String(b.password||'').trim();
      if(!studentId||!name||!password){skipped.push({studentId,message:'Student ID, name and password are required.'});continue;}
      const ref=dbx.collection('students').doc(studentId); const exists=await ref.get();
      if(exists.exists){skipped.push({studentId,message:'Student ID already exists.'});continue;}
      const now=new Date().toISOString();
      const student={studentId,name,password:await createPasswordRecord(password),rollNumber:String(b.rollNumber||'').trim(),className:String(b.className||'').trim(),phone:String(b.phone||'').trim(),active:b.active!==false,createdAt:now,updatedAt:now};
      await ref.set(student); created.push(studentId);
    }
    await writeAudit('students_bulk_created',{admin:req.admin.email,count:created.length});
    res.status(201).json({ok:true,created,skipped,message:`Created ${created.length} student accounts.`});
  }catch(e){next(e);}
});

app.post('/api/admin/students', requireAdmin, async (req,res,next)=>{
  try {
    const b=req.body||{}; const studentId=String(b.studentId||'').trim(); const name=String(b.name||'').trim(); const password=String(b.password||'').trim();
    if(!studentId||!name||!password)return res.status(400).json({ok:false,message:'Student ID, name and password are required.'});
    const ref=requireFirebase().collection('students').doc(studentId); const exists=await ref.get();
    if(exists.exists)return res.status(409).json({ok:false,message:'Student ID already exists.'});
    const student={studentId,name,password:await createPasswordRecord(password),rollNumber:String(b.rollNumber||'').trim(),className:String(b.className||'').trim(),phone:String(b.phone||'').trim(),active:b.active!==false,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
    await ref.set(student); await writeAudit('student_created',{admin:req.admin.email,studentId});
    const safe={...student}; delete safe.password; res.status(201).json({ok:true,student:safe});
  }catch(e){next(e);}
});
app.put('/api/admin/students/:id', requireAdmin, async (req,res,next)=>{
  try { const id=String(req.params.id); const ref=requireFirebase().collection('students').doc(id); const snap=await ref.get(); if(!snap.exists)return res.status(404).json({ok:false,message:'Student not found.'}); const b=req.body||{}; const updated={...snap.data()}; ['name','rollNumber','className','phone'].forEach(k=>{if(b[k]!==undefined)updated[k]=String(b[k]||'').trim();}); if(b.password!==undefined&&String(b.password).trim())updated.password=await createPasswordRecord(String(b.password).trim()); if(b.active!==undefined)updated.active=Boolean(b.active); updated.updatedAt=new Date().toISOString(); await ref.set(updated); await writeAudit('student_updated',{admin:req.admin.email,studentId:id}); const safe={...updated}; delete safe.password; res.json({ok:true,student:safe}); } catch(e){next(e);}
});
app.delete('/api/admin/students/:id', requireAdmin, async (req,res,next)=>{ try { const id=String(req.params.id); const ref=requireFirebase().collection('students').doc(id); const snap=await ref.get(); if(!snap.exists)return res.status(404).json({ok:false,message:'Student not found.'}); await ref.delete(); await writeAudit('student_deleted',{admin:req.admin.email,studentId:id}); res.json({ok:true}); }catch(e){next(e);} });
app.get('/api/admin/results', requireAdmin, async (req,res,next)=>{ try { const [results,students]=await Promise.all([listCollection('results'),listCollection('students')]); const byId=new Map(students.map(s=>[s.studentId||s.rollNumber,s])); const rows=results.map(r=>{const st=byId.get(r.student?.studentId||r.student?.rollNumber)||{}; return {...r,student:{...r.student,className:st.className||'',phone:st.phone||''}}}); res.json({ok:true,results:rows}); }catch(e){next(e);} });
app.get('/api/admin/results/:resultId/paper', requireAdmin, async (req,res,next)=>{
  try {
    const resultSnap=await requireFirebase().collection('results').doc(req.params.resultId).get();
    const subSnap=await requireFirebase().collection('submissions').doc(req.params.resultId).get();
    if(!resultSnap.exists)return res.status(404).json({ok:false,message:'Result not found.'});
    const result={id:resultSnap.id,...resultSnap.data()}; const exam=await getExam(result.exam?.id); if(!exam)return res.status(404).json({ok:false,message:'Exam not found.'});
    const studentKey=result.student?.studentId||result.student?.rollNumber||''; const paper=publicExam(exam,variantForStudent(exam,studentKey),studentKey);
    res.json({ok:true,result,paper,submission:subSnap.exists?{id:subSnap.id,...subSnap.data()}:null});
  }catch(e){next(e);}
});
app.get('/api/admin/submissions/:resultId', requireAdmin, async (req,res,next)=>{ try { const r=await requireFirebase().collection('results').doc(req.params.resultId).get(); const s=await requireFirebase().collection('submissions').doc(req.params.resultId).get(); if(!r.exists)return res.status(404).json({ok:false,message:'Result not found.'}); res.json({ok:true,result:{id:r.id,...r.data()},submission:s.exists?{id:s.id,...s.data()}:null}); }catch(e){next(e);} });
app.patch('/api/admin/results/:resultId/subjective', requireAdmin, async (req,res,next)=>{
  try {
    const ref=requireFirebase().collection('results').doc(req.params.resultId); const snap=await ref.get(); if(!snap.exists)return res.status(404).json({ok:false,message:'Result not found.'});
    const result=snap.data(); const questionId=String(req.body.questionId||''); const marks=Number(req.body.marks); if(!questionId||!Number.isFinite(marks)||marks<0)return res.status(400).json({ok:false,message:'Question ID and valid marks are required.'});
    const review=Array.isArray(result.review)?result.review.map(x=>({...x})):[]; const item=review.find(x=>String(x.id)===questionId); if(!item)return res.status(404).json({ok:false,message:'Question review item not found.'}); const maxAllowed=item.type==='programming'?5:Number(item.maxMarks||0); if(marks>maxAllowed)return res.status(400).json({ok:false,message:`Marks cannot exceed ${maxAllowed}.`}); if(item.type==='programming')item.maxMarks=5;
    if(!['short_answer','long_answer','programming'].includes(item.type)) return res.status(400).json({ok:false,message:'Only subjective/programming answers can be manually graded here.'});
    item.awardedMarks=Number(marks.toFixed(2)); item.status='checked'; item.teacherComment=String(req.body.comment||'').trim();
    const graded=review.filter(x=>(x.type==='short_answer'||x.type==='long_answer'||x.type==='programming') && (x.type!=='programming'||x.teacherRequired||x.status==='checked'));
    const choiceSums=new Map(), choiceCaps=new Map(); let subjectiveMarks=0;
    for(const x of graded){ const cg=String(x.choiceGroup||'').trim(); const val=Number(x.awardedMarks||0); if(cg){choiceSums.set(cg,(choiceSums.get(cg)||0)+val); const cap=Number(x.choiceMax||0)*(Number(x.maxMarks)||0); if(cap>0)choiceCaps.set(cg,Math.max(choiceCaps.get(cg)||0,cap));} else subjectiveMarks+=val; }
    for(const [cg,sum] of choiceSums) subjectiveMarks += Math.min(sum,choiceCaps.get(cg)||sum);
    subjectiveMarks=Number(subjectiveMarks.toFixed(2));
    const objectiveScore=Number(result.objectiveScore??0); const finalScore=Number((objectiveScore+subjectiveMarks).toFixed(2)); const total=Number(result.totalMarks||0); const percentage=total?Number(((finalScore/total)*100).toFixed(2)):0; const pending=review.some(x=>(x.type==='short_answer'||x.type==='long_answer')&&x.status!=='checked');
    const answerKeyPending=review.some(x=>x.status==='answer_key_pending'); const teacherPending=review.some(x=>x.status==='pending' && x.teacherRequired); const allChecked=!pending&&!answerKeyPending&&!teacherPending; const update={review,subjectiveMarks,score:finalScore,percentage,passed:allChecked&&finalScore>=Number(result.passingMarks||0),subjectiveChecked:allChecked,checkedAt:new Date().toISOString(),checkedBy:req.admin.email}; await ref.update(update); res.json({ok:true,result:{id:ref.id,...result,...update}});
  }catch(e){next(e);}
});

app.get('/api/admin/leaderboard', requireAdmin, async (req,res,next)=>{ try { const examId=String(req.query.examId||'').trim(); const snap=await requireFirebase().collection('results').get(); const results=snap.docs.map(d=>({id:d.id,...d.data()})).filter(r=>(r.subjectiveChecked===true)&&(!examId||r.exam?.id===examId)); const best=new Map(); for(const r of results){const k=r.student?.studentId||r.student?.rollNumber; if(!k)continue; const old=best.get(k); if(!old||Number(r.percentage)>Number(old.percentage))best.set(k,r);} const rows=[...best.values()].sort((a,b)=>Number(b.percentage)-Number(a.percentage)||Number(b.score)-Number(a.score)||String(a.submittedAt).localeCompare(String(b.submittedAt))).map((r,i)=>({rank:i+1,name:r.student?.name||'',studentId:r.student?.studentId||'',rollNumber:r.student?.rollNumber||'',exam:r.exam?.title||'',score:r.score,totalMarks:r.totalMarks,percentage:r.percentage,passed:r.passed,submittedAt:r.submittedAt})); res.json({ok:true,leaderboard:rows}); }catch(e){next(e);} });

app.post('/api/admin/exams/from-pdf', requireAdmin, express.raw({ type: 'application/pdf', limit: '20mb' }), async (req,res,next)=>{
  try {
    if(!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ok:false,message:'Upload a PDF question paper.'});
    const text=extractPdfText(req.body);
    const questions=parseQuestionPaperPdf(text);
    if(!questions.length) return res.status(400).json({ok:false,message:'No questions could be decoded. This PDF may be scanned/image-only or use an unsupported layout. Try a selectable-text PDF.'});
    const body=req.headers['x-exam-meta'] ? JSON.parse(req.headers['x-exam-meta']) : {};
    const title=String(body.title||'PDF Imported Exam').trim();
    const subject=String(body.subject||'General').trim();
    const className=String(body.className||'12th').trim();
    const durationMinutes=Math.max(1,Number(body.durationMinutes)||60);
    const now=new Date().toISOString();
    const id=`exam-pdf-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const countedGroups = new Set();
    const totalMarks=questions.reduce((s,q)=>{
      const g=String(q.orGroup||'').trim();
      if(g){ if(countedGroups.has(g)) return s; countedGroups.add(g); }
      return s+Number(q.marks||1);
    },0);
    const answerKeyMissing=questions.some(q=>['mcq1','mcq2','mcq3','true_false','fill_blank'].includes(q.type)&& (q.answer===undefined||q.answer===null||q.answer==='' || (Array.isArray(q.answer)&&!q.answer.length)));
    const programmingNeedsTeacher=questions.some(q=>q.type==='programming'&&!q.answer);
    const exam={id,title,subject,className,durationMinutes,totalMarks,passingMarks:Math.ceil(totalMarks*.35),description:'Automatically imported from PDF question paper.',status:'Published',questions,variantCount:25,source:'pdf',answerKeyMissing,programmingNeedsTeacher,createdAt:now,updatedAt:now};
    await requireFirebase().collection('exams').doc(id).set(exam);
    await writeAudit('exam_imported_from_pdf',{admin:req.admin.email,examId:id,questionCount:questions.length});
    res.status(201).json({ok:true,exam:publicExam(exam),message:`Imported ${questions.length} questions. Exam created and published automatically.`});
  } catch(e){next(e);}
});

app.post('/api/admin/exams/seed-it-sem1', requireAdmin, async (req,res,next)=>{
  try {
    const exam = JSON.parse(JSON.stringify(IT_SEM1_EXAM));
    exam.updatedAt = new Date().toISOString();
    await requireFirebase().collection('exams').doc(exam.id).set(exam, { merge:true });
    await writeAudit('it_sem1_exam_seeded',{admin:req.admin.email,examId:exam.id,questionCount:exam.questions.length});
    res.json({ok:true,exam:publicExam(exam),message:'Standard XII IT Semester 1 exam loaded: 50 marks, 90 minutes, all 8 sections.'});
  } catch(e){next(e);}
});

app.post('/api/admin/exams/seed-it-80', requireAdmin, async (req,res,next)=>{
  try {
    const exam = JSON.parse(JSON.stringify(IT_80_EXAM));
    exam.updatedAt = new Date().toISOString();
    await requireFirebase().collection('exams').doc(exam.id).set(exam, { merge:true });
    await writeAudit('it_80_exam_seeded',{admin:req.admin.email,examId:exam.id});
    res.json({ok:true,exam:publicExam(exam),message:'Standard XII IT 80-mark exam is ready and published.'});
  } catch(e){next(e);}
});
app.get('/api/admin/exams', requireAdmin, async (req,res,next)=>{
  try { const exams = await listCollection('exams'); res.json({ok:true,exams:exams.map(publicExam)}); } catch(e){next(e);}
});

app.post('/api/admin/exams', requireAdmin, async (req,res,next)=>{
  try {
    const body=req.body||{};
    const title=String(body.title||'').trim(), subject=String(body.subject||'').trim(), className=String(body.className||'').trim();
    const durationMinutes=Number(body.durationMinutes), passingMarks=Number(body.passingMarks), description=String(body.description||'').trim();
    const questions=Array.isArray(body.questions)?body.questions.map(normalizeQuestion):[];
    if(!title||!subject||!className||!Number.isFinite(durationMinutes)||durationMinutes<1) return res.status(400).json({ok:false,message:'Title, subject, class and valid duration are required.'});
    if(!questions.length) return res.status(400).json({ok:false,message:'Add at least one question.'});
    if(validateQuestions(questions)) return res.status(400).json({ok:false,message:'Please complete every question and provide valid answers.'});
    const now=new Date().toISOString(), id=`exam-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const exam={id,title,subject,className,durationMinutes,totalMarks:calculateExamTotal(questions),passingMarks:Number.isFinite(passingMarks)&&passingMarks>=0?passingMarks:Math.ceil(questions.reduce((s,q)=>s+q.marks,0)*.35),description,status:'Draft',questions,variantCount:25,createdAt:now,updatedAt:now};
    await requireFirebase().collection('exams').doc(id).set(exam);
    await writeAudit('exam_created',{admin:req.admin.email,examId:id});
    res.status(201).json({ok:true,exam:publicExam(exam)});
  }catch(e){next(e);}
});

app.put('/api/admin/exams/:id', requireAdmin, async (req,res,next)=>{
  try {
    const exam=await getExam(req.params.id); if(!exam)return res.status(404).json({ok:false,message:'Exam not found.'});
    const body=req.body||{};
    const updated={...exam,title:body.title!==undefined?String(body.title).trim():exam.title,subject:body.subject!==undefined?String(body.subject).trim():exam.subject,className:body.className!==undefined?String(body.className).trim():exam.className,durationMinutes:body.durationMinutes!==undefined?Number(body.durationMinutes):exam.durationMinutes,description:body.description!==undefined?String(body.description).trim():exam.description,updatedAt:new Date().toISOString()};
    if(!updated.title||!updated.subject||!updated.className||!Number.isFinite(updated.durationMinutes)||updated.durationMinutes<1)return res.status(400).json({ok:false,message:'Invalid exam details.'});
    await requireFirebase().collection('exams').doc(req.params.id).set(updated,{merge:true});
    res.json({ok:true,exam:publicExam(updated)});
  }catch(e){next(e);}
});

app.post('/api/admin/exams/:id/lifecycle', requireAdmin, async (req,res,next)=>{
  try {
    const exam=await getExam(req.params.id);
    if(!exam)return res.status(404).json({ok:false,message:'Exam not found.'});
    const action=String(req.body.action||'');
    const ref=requireFirebase().collection('exams').doc(req.params.id);
    const now=Date.now();
    let patch={updatedAt:new Date(now).toISOString()};
    if(action==='start'){
      if(exam.status==='Live')return res.status(409).json({ok:false,message:'This exam is already live.'});
      if(!['Published','Scheduled','Ended'].includes(exam.status))return res.status(409).json({ok:false,message:'Publish the exam before starting it.'});
      const durationMinutes=Math.max(1,Math.min(600,Number(req.body.durationMinutes)||Number(exam.durationMinutes)||120));
      const startedAt=new Date(now).toISOString();
      patch={...patch,status:'Live',durationMinutes,startedAt,scheduledAt:null,endsAt:new Date(now+durationMinutes*60000).toISOString(),endedAt:null};
    } else if(action==='schedule'){
      const scheduledMs=Date.parse(String(req.body.scheduledAt||''));
      if(!Number.isFinite(scheduledMs)||scheduledMs<=now)return res.status(400).json({ok:false,message:'Choose a future start date and time.'});
      if(exam.status==='Live')return res.status(409).json({ok:false,message:'End the live exam before scheduling it again.'});
      const durationMinutes=Math.max(1,Math.min(600,Number(req.body.durationMinutes)||Number(exam.durationMinutes)||120));
      patch={...patch,status:'Scheduled',scheduledAt:new Date(scheduledMs).toISOString(),scheduledDurationMinutes:durationMinutes,startedAt:null,endsAt:null,endedAt:null};
    } else if(action==='end'){
      if(exam.status!=='Live')return res.status(409).json({ok:false,message:'Only a live exam can be ended.'});
      const endedAt=new Date(now).toISOString();
      patch={...patch,status:'Ended',endsAt:endedAt,endedAt};
    } else if(action==='reset'){
      if(exam.status==='Live')return res.status(409).json({ok:false,message:'End the live exam first.'});
      patch={...patch,status:'Published',scheduledAt:null,scheduledDurationMinutes:null,startedAt:null,endsAt:null,endedAt:null};
    } else return res.status(400).json({ok:false,message:'Unknown exam action.'});
    await ref.set(patch,{merge:true});
    await writeAudit('exam_lifecycle_changed',{admin:req.admin.email,examId:req.params.id,action,...patch});
    const updated=await getExam(req.params.id);
    res.json({ok:true,message:action==='start'?'Exam started. All students share the same server deadline.':action==='schedule'?'Exam start scheduled.':action==='end'?'Exam ended.':'Exam reset to Published.',exam:publicExam(updated)});
  }catch(e){next(e);}
});

app.patch('/api/admin/exams/:id/status', requireAdmin, async (req,res,next)=>{
  try {
    const status=String(req.body.status||''); if(!['Published','Draft'].includes(status))return res.status(400).json({ok:false,message:'Status must be Published or Draft.'});
    const exam=await getExam(req.params.id); if(!exam)return res.status(404).json({ok:false,message:'Exam not found.'});
    if(exam.status==='Live')return res.status(409).json({ok:false,message:'End the live exam before changing its publish status.'});
    const updatedAt=new Date().toISOString(); await requireFirebase().collection('exams').doc(req.params.id).update({status,scheduledAt:null,scheduledDurationMinutes:null,startedAt:null,endsAt:null,endedAt:null,updatedAt});
    await writeAudit('exam_status_changed',{admin:req.admin.email,examId:req.params.id,status});
    res.json({ok:true,exam:publicExam({...exam,status,updatedAt})});
  }catch(e){next(e);}
});

app.delete('/api/admin/exams/:id', requireAdmin, async (req,res,next)=>{
  try { const exam=await getExam(req.params.id); if(!exam)return res.status(404).json({ok:false,message:'Exam not found.'}); await requireFirebase().collection('exams').doc(req.params.id).delete(); await writeAudit('exam_deleted',{admin:req.admin.email,examId:req.params.id}); res.json({ok:true,message:'Exam deleted.'}); } catch(e){next(e);}
});

app.post('/api/student/login', async (req,res,next)=>{
  try {
    const studentId=String(req.body.studentId||'').trim();
    const password=String(req.body.password||'');
    if(!studentId||!password)return res.status(400).json({ok:false,message:'Student ID and password are required.'});
    const snap=await requireFirebase().collection('students').doc(studentId).get();
    if(!snap.exists)return res.status(401).json({ok:false,message:'Invalid Student ID or password.'});
    const saved=snap.data();
    if(saved.active===false)return res.status(403).json({ok:false,message:'This student account is disabled.'});
    if(!(await verifyPassword(password, saved.password)))return res.status(401).json({ok:false,message:'Invalid Student ID or password.'});
    if(!String(saved.password||'').startsWith('scrypt$')) await requireFirebase().collection('students').doc(studentId).update({password:await createPasswordRecord(password)});
    const student={studentId,rollNumber:String(saved.rollNumber||''),name:String(saved.name||''),className:String(saved.className||''),phone:String(saved.phone||''),active:true};
    const token=await createSession('student',studentId);
    await requireFirebase().collection('students').doc(studentId).update({lastLoginAt:new Date().toISOString()});
    res.json({ok:true,token,student});
  }catch(e){next(e);}
});
app.post('/api/student/logout', requireStudent, async (req,res,next)=>{ try { await requireFirebase().collection(SESSION_COLLECTION).doc(req.studentToken).delete(); res.json({ok:true}); } catch(e){next(e);} });
app.get('/api/student/me', requireStudent, (req,res)=>res.json({ok:true,student:req.student}));

app.get('/api/exam', requireStudent, async (req,res,next)=>{
  try {
    const requestedId=String(req.query.id||'').trim();
    let exam;
    if(requestedId) {
      exam=await getExam(requestedId);
    } else {
      // IMPORTANT: when no exam id is supplied, always use the newest published exam.
      // Previously Firestore's limit(1) could return an older published exam (e.g. 50 min)
      // even after the admin updated/published a newer 90-minute exam.
      const snap=await requireFirebase().collection('exams').where('status','==','Live').get();
      const live=snap.docs.map(d=>({id:d.id,...d.data()}));
      live.sort((a,b)=>new Date(b.startedAt||0).getTime()-new Date(a.startedAt||0).getTime());
      exam=live[0]||null;
    }
    if(!exam||exam.status!=='Live')return res.status(423).json({ok:false,message:'The exam has not started yet or has already ended. Please wait for your teacher.'});
    const endMs=Date.parse(exam.endsAt||'');
    if(!Number.isFinite(endMs)||Date.now()>=endMs)return res.status(423).json({ok:false,message:'The exam deadline has passed.'});
    const studentKey=req.student.studentId || req.student.rollNumber;
    const variant=variantForStudent(exam, studentKey);
    res.json({ok:true,exam:publicExam(exam, variant, studentKey)});
  }catch(e){next(e);}
});

app.get('/api/exam/status', requireStudent, async (req,res,next)=>{
  try {
    const examId=String(req.query.id||'').trim();
    if(!examId)return res.status(400).json({ok:false,message:'Exam ID is required.'});
    const exam=await getExam(examId);
    if(!exam)return res.status(404).json({ok:false,message:'Exam not found.'});
    res.json({ok:true,status:exam.status,startedAt:exam.startedAt||null,endsAt:exam.endsAt||null,serverNow:Date.now()});
  }catch(e){next(e);}
});

app.get('/api/results/:id', requireStudent, async (req,res,next)=>{try{const snap=await requireFirebase().collection('results').doc(req.params.id).get();if(!snap.exists)return res.status(404).json({ok:false,message:'Result not found.'}); const data=snap.data(); if(String(data.student?.studentId||'')!==String(req.student.studentId||'')) return res.status(403).json({ok:false,message:'You can only view your own result.'}); res.json({ok:true,result:{id:snap.id,...data}});}catch(e){next(e);}});

app.get('/api/leaderboard', async (req,res,next)=>{
  try {
    const examId=String(req.query.examId||'').trim();
    const snap=await requireFirebase().collection('results').get();
    const results=snap.docs.map(d=>({id:d.id,...d.data()})).filter(r=>r.subjectiveChecked===true&&(!examId||r.exam?.id===examId));
    const best=new Map();
    for(const r of results){const key=r.student?.studentId||r.student?.rollNumber;if(!key)continue;const old=best.get(key);if(!old||r.percentage>old.percentage||(r.percentage===old.percentage&&String(r.submittedAt)<String(old.submittedAt)))best.set(key,r);}
    const rows=[...best.values()].sort((a,b)=>b.percentage-a.percentage||b.score-a.score||String(a.submittedAt).localeCompare(String(b.submittedAt))).slice(0,100).map((r,i)=>({rank:i+1,name:r.student.name,studentId:r.student.studentId,rollNumber:r.student.rollNumber,exam:r.exam.title,score:r.score,totalMarks:r.totalMarks,percentage:r.percentage,passed:r.passed,submittedAt:r.submittedAt}));
    res.json({ok:true,leaderboard:rows});
  }catch(e){next(e);}
});

app.get('/api/student/profile', requireStudent, async (req,res,next)=>{
  try {
    const studentId=String(req.student.studentId||'').trim(); const roll=String(req.student.rollNumber||'').trim();
    if(!studentId)return res.status(400).json({ok:false,message:'Student session is missing.'});
    const studentSnap=await requireFirebase().collection('students').doc(studentId).get();
    const resultSnap=await requireFirebase().collection('results').where('student.studentId','==',studentId).get();
    const results=resultSnap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>new Date(b.submittedAt)-new Date(a.submittedAt));
    const name=studentSnap.exists?studentSnap.data().name:(results[0]?.student?.name||'Student');
    res.json({ok:true,profile:{name,rollNumber:roll,totalAttempts:results.length,passed:results.filter(r=>r.passed).length,averagePercentage:results.length?Number((results.reduce((a,r)=>a+r.percentage,0)/results.length).toFixed(2)):0,bestPercentage:results.length?Math.max(...results.map(r=>r.percentage)):0,results:results.slice(0,50)}});
  }catch(e){next(e);}
});

app.post('/api/exam/submit', requireStudent, async (req,res,next)=>{
  try {
    const student=req.student,answers=req.body.answers||{},examId=String(req.body.examId||'').trim();
    const exam=await getExam(examId);
    if(!exam||!['Live','Ended'].includes(exam.status))return res.status(404).json({ok:false,message:'This exam is not live.'});
    const officialEndMs=Date.parse(exam.endsAt||'');
    if(!Number.isFinite(officialEndMs)||Date.now()>officialEndMs+15000)return res.status(409).json({ok:false,message:'The official exam deadline has passed. Late submissions are not accepted.'});
    if(!String(student.rollNumber||'').trim()||!String(student.name||'').trim())return res.status(400).json({ok:false,message:'Student login information is missing.'});
    // Answers arrive using the student's shuffled option indexes. Convert them
    // back to the original question indexes before grading.
    const rollNumber = String(student.studentId || student.rollNumber || '').trim();
    const gradingAnswers = { ...answers };
    for (const originalQ of exam.questions || []) {
      const submitted = answers[originalQ.id];
      if (emptyAnswer(submitted)) continue;
      const optionTypes = ['mcq1','mcq2','mcq3','true_false'];
      if (optionTypes.includes(originalQ.type) && Array.isArray(originalQ.options)) {
        const order = optionOrderForStudent(exam, originalQ, rollNumber);
        if (originalQ.type === 'mcq1' || originalQ.type === 'true_false') {
          gradingAnswers[originalQ.id] = order[Number(submitted)];
        } else if (Array.isArray(submitted)) {
          gradingAnswers[originalQ.id] = submitted.map(v => order[Number(v)]).filter(Number.isInteger);
        }
      }
    }
    let objectiveScore=0,correct=0,wrong=0,skipped=0;const review=[];
    const selectedForStudent=selectQuestionsForStudent(exam, rollNumber);
    for(const [qIndex,q] of (exam.questions||[]).entries()){
      // Grade only the exact questions shown to this student. This prevents
      // duplicate/hidden questions from old Firestore exams entering results.
      if(!selectedForStudent.has(qIndex)) continue;
      const submitted=gradingAnswers[q.id];
      if(emptyAnswer(submitted)){
        skipped++;
        if(q.type==='short_answer'||q.type==='long_answer'){
          review.push({id:q.id,type:q.type,status:'checked',awardedMarks:0,maxMarks:q.type==='programming'?5:(Number(q.marks)||0),answer:'',teacherComment:'No answer submitted.',choiceGroup:q.choiceGroup||'',choiceMax:q.choiceMax||0});
        } else {
          review.push({id:q.id,type:q.type,status:'skipped',awardedMarks:0,maxMarks:q.type==='programming'?5:(Number(q.marks)||0),choiceGroup:q.choiceGroup||'',choiceMax:q.choiceMax||0});
        }
        continue;
      }
      if(q.type==='short_answer'||q.type==='long_answer'){review.push({id:q.id,type:q.type,status:'pending',awardedMarks:null,maxMarks:Number(q.marks)||0,answer:submitted,choiceGroup:q.choiceGroup||'',choiceMax:q.choiceMax||0});}
      else {
        const hasKey = q.answer!==undefined && q.answer!==null && q.answer!=='' && !(Array.isArray(q.answer)&&!q.answer.length);
        if(!hasKey){
          if(q.type==='programming') review.push({id:q.id,type:q.type,status:'pending',awardedMarks:null,maxMarks:q.type==='programming'?5:(Number(q.marks)||0),answer:submitted,teacherRequired:true,choiceGroup:q.choiceGroup||'',choiceMax:q.choiceMax||0});
          else review.push({id:q.id,type:q.type,status:'answer_key_pending',awardedMarks:null,maxMarks:Number(q.marks)||0,answer:submitted,choiceGroup:q.choiceGroup||'',choiceMax:q.choiceMax||0});
        }
        else {
          const awarded = getObjectiveAwardedMarks(q, submitted);
          const maxMarks = q.type==='programming'?5:(Number(q.marks)||0);
          const ok = awarded >= maxMarks;
          const partial = awarded > 0 && awarded < maxMarks;
          objectiveScore += awarded;
          if(ok) correct++; else if(partial) correct++; else wrong++;
          review.push({id:q.id,type:q.type,status:ok?'correct':(partial?'partial':'wrong'),awardedMarks:awarded,maxMarks,choiceGroup:q.choiceGroup||'',choiceMax:q.choiceMax||0});
        }
      }}
    objectiveScore=Number(objectiveScore.toFixed(2));
    const subjectiveItems=(exam.questions||[]).map((q,i)=>({i,q})).filter(({i,q})=>selectedForStudent.has(i) && (q.type==='short_answer'||q.type==='long_answer'||q.type==='programming'));
    const subjectiveChoiceCaps=new Map(); let subjectiveMax=0;
    for(const {q} of subjectiveItems){ const cg=String(q.choiceGroup||'').trim(); const marks=q.type==='programming'?5:(Number(q.marks)||0); if(cg){ const cap=(Number(q.choiceMax)||0)*marks; subjectiveChoiceCaps.set(cg,Math.max(subjectiveChoiceCaps.get(cg)||0,cap)); } else subjectiveMax+=marks; }
    for(const cap of subjectiveChoiceCaps.values()) subjectiveMax+=cap;
    subjectiveMax=Number(subjectiveMax.toFixed(2));
    const totalMarks=Number(exam.totalMarks)||0,passingMarks=Number.isFinite(Number(exam.passingMarks))?Number(exam.passingMarks):Math.ceil(totalMarks*.35); const percentage=totalMarks?Number(((objectiveScore/totalMarks)*100).toFixed(2)):0;
    const antiCheat=req.body.antiCheat||{};
    const attemptId=String(req.body.attemptId||'').trim();
    const firestore=requireFirebase();
    if (attemptId) {
      const existingSnap=await firestore.collection('submissions').where('attemptId','==',attemptId).limit(1).get();
      if (!existingSnap.empty) {
        const existingId=existingSnap.docs[0].data().resultId;
        const existingResult=await firestore.collection('results').doc(existingId).get();
        if(existingResult.exists) return res.status(200).json({ok:true,result:{id:existingResult.id,...existingResult.data()},duplicate:true});
      }
    }
    const resultId=`result-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const variant=variantForStudent(exam, student.studentId);
    const result={id:resultId,attemptId:attemptId||null,student:{studentId:String(student.studentId).trim(),name:String(student.name).trim(),rollNumber:String(student.rollNumber||'').trim(),className:String(student.className||'').trim()},exam:{id:exam.id,title:exam.title,subject:exam.subject,variantNumber:variant.number},score:objectiveScore,objectiveScore,totalMarks,subjectiveMax,subjectiveMarks:0,subjectiveChecked:subjectiveMax===0&&!review.some(x=>x.status==='answer_key_pending'),passingMarks,percentage,passed:subjectiveMax===0&&objectiveScore>=passingMarks,correct,wrong,skipped,attempted:correct+wrong,review,submittedAt:new Date().toISOString(),startedAt:req.body.startedAt||null,autoSubmitted:Boolean(req.body.autoSubmitted),antiCheat:{tabSwitches:Number(antiCheat.tabSwitches)||0,fullscreenExits:Number(antiCheat.fullscreenExits)||0,shortcutAttempts:Number(antiCheat.shortcutAttempts)||0,copyAttempts:Number(antiCheat.copyAttempts)||0,violationCount:Number(antiCheat.violationCount)||0}};
    const batch=firestore.batch();
    batch.set(firestore.collection('results').doc(resultId),result);
    batch.set(firestore.collection('submissions').doc(resultId),{resultId,attemptId:result.attemptId,examId:exam.id,student:result.student,answers,autoSubmitted:result.autoSubmitted,submittedAt:result.submittedAt,antiCheat:result.antiCheat});
    batch.set(firestore.collection('students').doc(result.student.studentId),{lastAttemptId:resultId,lastExamId:exam.id,lastSubmittedAt:result.submittedAt,updatedAt:result.submittedAt},{merge:true});
    batch.set(firestore.collection('antiCheatLogs').doc(resultId),{resultId,examId:exam.id,student:result.student,antiCheat:result.antiCheat,createdAt:result.submittedAt});
    await batch.commit();
    res.status(201).json({ok:true,result});
  }catch(e){next(e);}
});

app.use('/api',(req,res)=>res.status(404).json({ok:false,message:'API endpoint not found.'}));
app.use(express.static(CLIENT_DIR));
app.get('*',(req,res)=>res.sendFile(path.join(CLIENT_DIR,'index.html')));

app.use((err,req,res,next)=>{console.error(err);const status=err.statusCode||500;res.status(status).json({ok:false,message:err.message||'Server error.'});});

async function refreshExamLifecycle(){
  try {
    const snap=await requireFirebase().collection('exams').where('status','in',['Scheduled','Live']).get();
    const now=Date.now();
    const batch=requireFirebase().batch();
    let changed=0;
    for(const doc of snap.docs){
      const exam=doc.data();
      const scheduled=Date.parse(exam.scheduledAt||'');
      const ends=Date.parse(exam.endsAt||'');
      if(exam.status==='Scheduled'&&Number.isFinite(scheduled)&&scheduled<=now){
        const durationMinutes=Math.max(1,Math.min(600,Number(exam.scheduledDurationMinutes)||Number(exam.durationMinutes)||120));
        batch.set(doc.ref,{status:'Live',durationMinutes,startedAt:new Date(scheduled).toISOString(),endsAt:new Date(scheduled+durationMinutes*60000).toISOString(),scheduledAt:null,scheduledDurationMinutes:null,updatedAt:new Date(now).toISOString()},{merge:true}); changed++;
      } else if(exam.status==='Live'&&Number.isFinite(ends)&&ends<=now){
        batch.set(doc.ref,{status:'Ended',endedAt:new Date(ends).toISOString(),updatedAt:new Date(now).toISOString()},{merge:true}); changed++;
      }
    }
    if(changed)await batch.commit();
  } catch(e) { console.error('Exam lifecycle refresh failed:',e.message); }
}
async function boot(){
  try {
    await migrateJsonIfRequested(); await seedDefaultExam();
    app.listen(PORT,()=>console.log(`\nOnline Exam System running at http://localhost:${PORT}\nDatabase: ${localMode ? 'local JSON (no Firebase credentials needed)' : 'Firebase Firestore'}\n`));
    setInterval(refreshExamLifecycle,5000);
  } catch(e){console.error('Startup failed:',e.message);process.exit(1);}
}
boot();

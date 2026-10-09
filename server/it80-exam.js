const now = new Date().toISOString();

function q(id, sectionId, sectionNumber, subNumber, sectionTitle, type, question, marks, extra = {}) {
  return {
    id, sectionId, sectionNumber, subNumber, sectionTitle, type, question, marks,
    ...extra
  };
}

const questions = [];

// Q1 — Fill in the blanks: 10 × 1 = 10
const q1 = [
  ['HTML5 provides a new input type such as __________ for selecting a date.', 'date'],
  ['The HTML element used to embed an audio file is the __________ element.', 'audio'],
  ['An image with several clickable regions is called an __________.', 'image map'],
  ['The logical structure of an HTML/XML document is represented by the __________.', 'DOM'],
  ['JavaScript is a lightweight, platform-__________ scripting language.', 'independent'],
  ['The statement commonly used to leave a loop immediately is __________.', 'break'],
  ['PHP is mainly a __________-side scripting language.', 'server'],
  ['In PHP, a variable name begins with the __________ symbol.', '$'],
  ['IOT stands for __________ of Things.', 'Internet'],
  ['The paperless exchange of business information using electronic means is called __________.', 'EDI']
];
q1.forEach((x,i)=>questions.push(q(`q1-${i+1}`,'q1',1,i+1,'Q1 — Fill in the Blanks','fill_blank',x[0],1,{answer:x[1]})));

// Q2 — True/False: 10 × 1 = 10; answer 0=True, 1=False
const q2 = [
  ['HTML5 supports advanced form controls for collecting and validating user input.',0],
  ['The <video> element can use multiple <source> elements.',0],
  ['In a client-side image map, the <area> element defines clickable regions.',0],
  ['JavaScript is case-sensitive.',0],
  ['Math.ceil() returns the nearest integer greater than or equal to a number.',0],
  ['The getDay() method of the JavaScript Date object returns the month number.',1],
  ['PHP variables begin with the $ symbol.',0],
  ['PHP code can be embedded inside HTML.',0],
  ['5G is a generation of cellular network technology designed for high-speed data communication.',0],
  ['E-governance means using information technology in government processes and services.',0]
];
q2.forEach((x,i)=>questions.push(q(`q2-${i+1}`,'q2',2,i+1,'Q2 — True / False','true_false',x[0],1,{options:['True','False'],answer:x[1]})));

// Q3 — One correct: 10 × 1 = 10
const q3 = [
  ['Which HTML element is used to provide a video on a webpage?',['<audio>','<video>','<media>','<movie>'],1],
  ['Which attribute of <img> points to a client-side image map?',['map','usemap','hotspot','region'],1],
  ['Which JavaScript object represents the browser window?',['document','screen','window','browser'],2],
  ['Which JavaScript statement is a multi-way decision statement?',['switch...case','repeat','select...loop','choose'],0],
  ['Which extension is normally used for a PHP program file?',['.html','.php','.js','.css'],1],
  ['Which PHP function returns a portion of a string?',['trim()','substr()','count()','splitOnly()'],1],
  ['Which of the following is a cloud service model?',['SaaS','HTML','DOM','CSS'],0],
  ['Which generation of cellular technology is the fifth generation of mobile networks?',['2G','3G','4G','5G'],3],
  ['Which is an example of G2C e-governance?',['Government-to-Citizen service','Government-to-Employee only','Business-to-Business','Customer-to-Customer'],0],
  ['Which type of e-commerce is a transaction between a business and a customer?',['B2B','B2C','C2C','C2B'],1]
];
q3.forEach((x,i)=>questions.push(q(`q3-${i+1}`,'q3',3,i+1,'Q3 — Multiple Choice: Select ONE','mcq1',x[0],1,{options:x[1],answer:x[2]})));

// Q4 — Two correct: 10 × 2 = 20
const q4 = [
  ['Which two are valid HTML5 input types?',['date','email','webpage','browser'],[0,1]],
  ['Which two tags are used for HTML5 media?',['audio','video','soundbox','film'],[0,1]],
  ['Which two are parts of a client-side image map?',['map','area','hotspotbox','pointer'],[0,1]],
  ['Which two are JavaScript built-in objects?',['Date','Math','BrowserPage','WebFile'],[0,1]],
  ['Which two are JavaScript event handlers?',['onFocus','onBlur','onJump','onRun'],[0,1]],
  ['Which two are valid PHP data types?',['Integer','Array','VarcharHTML','WebObject'],[0,1]],
  ['Which two are types of PHP arrays?',['Indexed','Associative','Browser','Platform'],[0,1]],
  ['Which two are cloud service models?',['SaaS','PaaS','HTMLS','DOMS'],[0,1]],
  ['Which two are common e-commerce payment methods?',['E-wallet','Bank transfer','HTML form','CSS rule'],[0,1]],
  ['Which two are forms/types of e-governance?',['G2C','G2E','B2C','C2B'],[0,1]]
];
q4.forEach((x,i)=>questions.push(q(`q4-${i+1}`,'q4',4,i+1,'Q4 — Multiple Choice: Select TWO','mcq2',x[0],2,{options:x[1],answer:x[2]})));

// Q5 — Three correct: 2 × 3 = 6
const q5 = [
  ['Which THREE are features/characteristics of JavaScript?',['It supports event-driven programming','It is platform independent','It provides built-in objects','It requires compilation before every browser execution','It cannot handle dates'],[0,1,2]],
  ['Which THREE are types of PHP arrays?',['Indexed','Associative','Multidimensional','Browser','Universal','Graphic'],[0,1,2]]
];
q5.forEach((x,i)=>questions.push(q(`q5-${i+1}`,'q5',5,i+1,'Q5 — Multiple Choice: Select THREE','mcq3',x[0],3,{options:x[1],answer:x[2]})));

// Q6 — Match: 4 × 1 = 4
questions.push(q('q6-1','q6',6,1,'Q6 — Match the Following','match','Match the following pairs.',4,{
  pairs:[
    {left:'1. JavaScript Date object',options:['a. Paperless exchange of business information','b. Platform with tools for developing/hosting applications','c. Works with dates and time','d. Government services for citizens']},
    {left:'2. PaaS',options:['a. Paperless exchange of business information','b. Platform with tools for developing/hosting applications','c. Works with dates and time','d. Government services for citizens']},
    {left:'3. EDI',options:['a. Paperless exchange of business information','b. Platform with tools for developing/hosting applications','c. Works with dates and time','d. Government services for citizens']},
    {left:'4. G2C',options:['a. Paperless exchange of business information','b. Platform with tools for developing/hosting applications','c. Works with dates and time','d. Government services for citizens']}
  ],
  answer:{0:'2',1:'1',2:'0',3:'3'}
}));

// Q7 — 8 subquestions, attempt ANY 5: 5 × 2 = 10
const q7 = [
  'Explain any two advantages of using HTML5 advanced form controls.',
  'Differentiate between the audio and video elements in HTML5.',
  'Explain the purpose of the DOM in JavaScript.',
  'Write any two JavaScript event handlers and state when they are used.',
  'State any two features of PHP.',
  'Explain the difference between client-side and server-side scripting.',
  'Explain any two applications of IOT or 5G.',
  'Explain any two advantages of e-commerce or e-governance.'
];
q7.forEach((text,i)=>questions.push(q(`q7-${i+1}`,'q7',7,i+1,'Q7 — Answer Briefly (Attempt ANY FIVE)','short_answer',text,2,{answer:'',choiceGroup:'Q7',choiceMax:5})));

// Q8(A) — HTML OR: one of two, 5 marks
questions.push(q('q8a-1','q8a',8,1,'Q8(A) — Write a Program Using HTML (Attempt ANY ONE)','programming','Create a webpage titled “My College”. Use a heading, horizontal line, short paragraph, an ordered list of three courses and an unordered list of five facilities.',5,{answer:'',codeLanguage:'html',orGroup:'Q8A-HTML',orOption:'1'}));
questions.push(q('q8a-2','q8a',8,2,'Q8(A) — Write a Program Using HTML (Attempt ANY ONE)','programming','Create a Student Registration webpage using an HTML5 form. Include name, email, date, number, URL and submit controls using suitable HTML5 input types.',5,{answer:'',codeLanguage:'html',orGroup:'Q8A-HTML',orOption:'2'}));

// Q8(B) — JavaScript OR: one of two, 5 marks
questions.push(q('q8b-1','q8b',8,1,'Q8(B) — Write a Program Using JavaScript (Attempt ANY ONE)','programming','Write an event-driven JavaScript program that accepts two numbers and displays their addition, multiplication, division and remainder.',5,{answer:'',codeLanguage:'javascript',orGroup:'Q8B-JS',orOption:'1'}));
questions.push(q('q8b-2','q8b',8,2,'Q8(B) — Write a Program Using JavaScript (Attempt ANY ONE)','programming','Write a JavaScript program that accepts a string and counts and displays the number of vowels in it.',5,{answer:'',codeLanguage:'javascript',orGroup:'Q8B-JS',orOption:'2'}));

const IT_80_EXAM = {
  id:'it-std12-80-textbook-001',
  title:'Standard XII Information Technology — 80 Marks Textbook Practice Test',
  subject:'Information Technology',
  className:'12th Science',
  durationMinutes:180,
  totalMarks:80,
  passingMarks:28,
  description:'Board-pattern 80-mark practice paper based on the supplied Standard XII Information Technology textbook and question-paper format. Q1 and Q2 contain 10 subquestions each; Q7 requires any five; Q8 contains HTML OR and JavaScript OR programming sections.',
  status:'Published',
  variantCount:25,
  questions,
  source:'textbook-practice-paper',
  createdAt:now,
  updatedAt:now
};

module.exports = { IT_80_EXAM };

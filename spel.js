'use strict';

const board = document.querySelector('#board');
const guide = document.querySelector('#guide');
const modes = [...document.querySelectorAll('[data-mode]')];
const hero = document.querySelector('.hero');
let level = 1;
const levelInfo = {1: {words: 6, flash: 6}, 2: {words: 8, flash: 8}};
const vocab = {
  b: ['bal', 'beer', 'boek', 'been', 'boom', 'bed', 'bus', 'bij', 'bel', 'boot'],
  d: ['dak', 'doos', 'dop', 'duif', 'deur', 'dier', 'das', 'duim', 'dik', 'dun']
};
const vocab2 = {
  b: ['baard', 'band', 'bieb', 'bips', 'blij', 'blijf', 'boer', 'berg', 'brood', 'bril', 'bloem', 'brug'],
  d: ['dorp', 'dans', 'duin', 'doel', 'dekt', 'drinkt', 'dreun', 'draak', 'droom', 'durf', 'deeg', 'doek']
};
const syllables = ['ba','be','bi','bo','bu','da','de','di','do','du'];
const STORE_KEY = 'letterbos-eigen-lijst';
const OCR_SRC = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
const custom = {words: [], on: false, editing: false, busy: false, draft: '', note: ''};
const escapeHtml = t => String(t).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const splitWords = text => (String(text).toLowerCase().match(/[a-zà-ÿ]+/g) || []).filter(w => w.length > 1 && w.length <= 14);
const usable = text => [...new Set(splitWords(text).filter(w => w[0] === 'b' || w[0] === 'd'))].slice(0, 40);
const levelBar = (withCustom = false) => `<div class="levels ${withCustom ? 'has-custom' : ''}" role="group" aria-label="Niveau">${[[1,'Niveau 1','start'],[2,'Niveau 2','moeilijker'],...(withCustom ? [['eigen','Eigen lijst','met foto']] : [])].map(([n,t,sub]) => `<button type="button" data-level="${n}" aria-pressed="${n === 'eigen' ? custom.on : level === n && !(withCustom && custom.on)}"><strong>${t}</strong><span>${sub}</span></button>`).join('')}</div>`;
const tasks = {
  body: ['Stamp drie keer als een beer.', 'Spreid je armen. Fladder drie keer als een duif.', 'Tik op je knieën en steek dan je armen in de lucht. Doe het drie keer.', 'Zet drie grote berenstappen op de plaats.'],
  fingers: ['Tik met je duim tegen elke vingertop.', 'Maak met je duim en wijsvinger een rondje. Open en sluit het drie keer.', 'Laat twee vingers als pootjes over de tafel lopen.', 'Teken met één vinger een grote letter in de lucht.']
};
const shuffle = values => {
  const a = [...values];
  for (let j = a.length - 1; j > 0; j--) {
    const i = Math.floor(Math.random() * (j + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const svg = (name, extra = '') => `<svg ${extra} aria-hidden="true"><use href="#${name}"/></svg>`;
const primary = (action, text) => `<button type="button" class="primary" data-action="${action}">${text}${svg('arrow')}</button>`;
const soft = (action, text, attrs = '') => `<button type="button" class="soft" data-action="${action}" ${attrs}>${text}</button>`;
const focus = selector => board.querySelector(selector)?.focus({preventScroll: true});
const header = (title, info, progress = '') => `<div class="board-top"><div><h2 tabindex="-1">${title}</h2><p>${info}</p></div>${progress}</div>`;
const progress = (index, count) => `<div class="progress" aria-label="Kaart ${index + 1} van ${count}"><span aria-hidden="true">${index + 1} / ${count}</span><div class="dots" aria-hidden="true">${Array.from({length: count}, (_, i) => `<span class="dot ${i < index ? 'is-done' : i === index ? 'current' : ''}"></span>`).join('')}</div></div>`;

let mode = 'words';
let words, flash, timer;
const move = {kind: 'body', body: 0, fingers: 0, letter: 'b'};
let pace = 0;
let wordTimer;
const WORD_PAUSE = 1100;
const FLASH_GAP = 700;
let liveStroke = null;

function resetWords(first = false) {
  clearTimeout(wordTimer);
  if (custom.on) {
    words = {deck: shuffle(custom.words).slice(0, 10), index: 0, status: custom.words.length ? 'ready' : 'empty', hint: false};
    return;
  }
  const list = level === 2 ? vocab2 : vocab;
  const half = levelInfo[level].words / 2;
  first = first && level === 1;
  const left = shuffle(list.b).filter(w => !first || w !== 'bal').slice(0, first ? half - 1 : half);
  const right = shuffle(list.d).slice(0, half);
  words = {deck: [...(first ? ['bal'] : []), ...shuffle([...left, ...right])], index: 0, status: 'ready', hint: false};
}
function clearClock() {
  clearTimeout(timer);
  timer = undefined;
}
function resetFlash() {
  clearClock();
  const half = levelInfo[level].flash / 2;
  const deck = level === 2
    ? [...shuffle(syllables.slice(0,5)).slice(0,half-1), 'b', ...shuffle(syllables.slice(5)).slice(0,half-1), 'd']
    : [...Array(half).fill('b'), ...Array(half).fill('d')];
  flash = {deck: shuffle(deck), index: 0, status: 'ready'};
}
function finish(title, info, restart, next, nextLabel) {
  return `<div class="finish">${svg('star')}<h2 tabindex="-1">${title}</h2><p>${info}</p><div class="split">${primary(restart,'Nog een rondje')}${soft(next,nextLabel)}</div></div>`;
}
function countText(text) {
  const list = usable(text);
  const b = list.filter(w => w[0] === 'b').length;
  const d = list.length - b;
  if (!list.length) return 'Nog geen woorden met b of d.';
  return `${list.length} ${list.length === 1 ? 'woord doet' : 'woorden doen'} mee: ${b} met b, ${d} met d.`;
}
function chipList(text) {
  return usable(text).map(w => `<li class="chip chip-${w[0]}">${escapeHtml(w)}</li>`).join('');
}
function renderCustomSetup() {
  const hasList = custom.words.length > 0;
  const draft = custom.draft;
  return levelBar(true) + header('Eigen woordenlijst', 'Maak een foto van de woorden van school, of typ ze zelf.') + `
    <div class="custom-setup">
      <div class="photo-box">
        <label class="primary photo-button ${custom.busy ? 'is-busy' : ''}">
          <input type="file" accept="image/*" data-photo ${custom.busy ? 'disabled' : ''}>
          ${svg('camera')}<span>${custom.busy ? 'Even lezen…' : 'Foto maken of kiezen'}</span>
        </label>
        <p class="ocr-status" role="status">${escapeHtml(custom.note)}</p>
        <p class="small">Lukt het best met gedrukte letters, recht van boven en met goed licht. De foto blijft op dit apparaat.</p>
      </div>
      <div class="list-box">
        <label for="custom-words"><strong>De woorden</strong> <span class="small">(pas gerust aan)</span></label>
        <textarea id="custom-words" rows="6" spellcheck="false" placeholder="bijvoorbeeld: bal, dak, boek, deur">${escapeHtml(draft)}</textarea>
        <p class="small count" aria-live="polite">${countText(draft)} Andere woorden worden overgeslagen.</p>
        <ul class="chips" aria-label="Woorden die meedoen">${chipList(draft)}</ul>
        <div class="split">${primary('save-custom','Opslaan en spelen')}${hasList ? soft('cancel-custom','Annuleren') : ''}</div>
      </div>
    </div>`;
}
function customTools() {
  return `<div class="custom-tools">${soft('edit-custom','Lijst aanpassen')}${soft('share-custom','Link voor de klas kopiëren')}<span class="small share-note" role="status"></span></div>`;
}
function renderWords() {
  if (custom.on && (custom.editing || !custom.words.length)) return renderCustomSetup();
  const {deck,index,status,hint} = words;
  const bar = levelBar(true) + (custom.on ? customTools() : '');
  if (status === 'done') return bar + finish('Rondje klaar!', custom.on ? 'Goed geoefend met je eigen woorden.' : level === 2 ? 'Knap! Ook de moeilijke woorden gelukt.' : 'Goed geoefend met Beer en Duif.', 'restart-words', 'go-move', 'Even bewegen');
  const word = deck[index];
  const count = deck.length;
  const plain = level === 2 && !custom.on;
  const feedback = status === 'correct' ? `Ja, ${word} begint met een ${word[0]}!` : status === 'retry' ? 'Kijk nog eens naar de eerste letter.' : '';
  const choice = (letter, animal, label) => `<button type="button" class="choice ${status === 'correct' && word[0] === letter ? 'is-correct' : ''}" data-answer="${letter}" ${status === 'correct' ? 'aria-disabled="true"' : ''} aria-label="${plain ? letter : `${letter} van ${label}`}">${plain ? '' : svg(animal,'class="animal-small"')}<span class="letter" aria-hidden="true">${letter}</span>${plain ? '' : `<span class="choice-note" aria-hidden="true">${label}</span>`}</button>`;
  return bar + header('Waar hoort het woord?', plain ? 'Langere woorden. Kijk goed naar de eerste letter.' : 'Kijk naar de eerste letter.', progress(index, count)) + `
    <div class="play-grid">
      <div class="stage"><div class="paper-card word ${word.length > 9 ? 'is-xlong' : word.length > 6 ? 'is-long' : ''}" tabindex="-1"><span>${hint ? `<span class="mark-first">${word[0]}</span>${word.slice(1)}` : word}</span></div></div>
      <div class="sort-side">
        <div class="choices ${plain ? 'plain' : ''}">${choice('b','bear','beer')}${choice('d','pigeon','duif')}</div>
        <div class="below"><p class="feedback" role="status">${feedback}</p>
        ${status === 'correct' ? '' : soft('hint',hint ? 'Verberg tip' : 'Even kijken',`aria-expanded="${hint}" aria-controls="hint"`)}</div>
      </div>
    </div>
    <div id="hint" class="extra" ${hint && status !== 'correct' ? '' : 'hidden'}><p>Bij <strong>b</strong> staat het stokje links. Bij <strong>d</strong> staat het stokje rechts.</p></div>`;
}
function renderFlash() {
  const {deck,index,status} = flash;
  const count = deck.length;
  if (status === 'done') return levelBar() + finish('Geflitst!', `Je hebt ${count} kaartjes bekeken.`, 'restart-flash', 'go-words', 'Naar woorden');
  const visible = status === 'shown';
  const speed = (p,label) => `<label><input name="pace" type="radio" value="${p}" ${pace === p ? 'checked' : ''} ${visible ? 'disabled' : ''}>${label}</label>`;
  const command = status === 'ready' ? primary('show','Toon letter') : visible ? primary('hide', index === count - 1 ? 'Rondje klaar' : 'Volgende letter') : `<p class="feedback" role="status">${index === count - 1 ? 'Bijna klaar…' : 'Daar komt de volgende…'}</p>`;
  return levelBar() + header('Flits een letter', level === 2 ? 'Zeg de klank hardop, ook als er een klinker bij staat.' : 'Kijk en zeg de letterklank hardop.', progress(index, count)) + `
    <div class="play-grid">
      <div class="stage"> <div class="paper-card flash-card ${visible && deck[index].length > 1 ? 'is-syllable' : ''}" aria-live="polite" ${visible ? '' : 'aria-label="Kaartje dicht"'}>${visible ? deck[index] : svg('bolt')}</div></div>
      <div class="controls">
        <fieldset><legend>Hoe lang kijken?</legend><div class="speeds">${speed(0,'Zelf bepalen')}${speed(2000,'2 sec.')}${speed(1000,'1 sec.')}</div></fieldset>
        ${command}
      </div>
    </div>`;
}
const traceB = 'M113 34 L113 148 M113 99 C131 78 177 75 181 111 C187 153 142 166 113 143';
const traceD = 'M187 34 L187 148 M187 99 C169 78 123 75 119 111 C113 153 158 166 187 143';
function renderMove() {
  const {kind,letter} = move;
  const trace = kind === 'trace';
  return header('Even bewegen', 'Kies iets voor je lijf of je vingers.') + `
    <div class="play-grid">
      ${trace ? `<div class="stage trace-stage"><svg class="trace" viewBox="0 0 300 182" role="img" aria-label="Overtrekletter ${letter}"><path d="${letter === 'b' ? traceB : traceD}" stroke="currentColor" stroke-width="20"/><g class="ink"></g></svg></div>` :
        `<div class="stage movement"><div>${svg(kind === 'body' ? 'steps' : 'leaf')}<span class="task" role="status">${tasks[kind][move[kind]]}</span></div></div>`}
      <div class="controls">
        <div class="split">${soft('body','Mijn lijf',`aria-pressed="${kind === 'body'}"`)}${soft('fingers','Mijn vingers',`aria-pressed="${kind === 'fingers'}"`)}</div>
        ${trace ? `<p>Trek de letter over met je vinger of muis.</p><div class="split">${soft('trace-b','Trek b over',`aria-pressed="${letter === 'b'}"`)}${soft('trace-d','Trek d over',`aria-pressed="${letter === 'd'}"`)}${soft('erase','Wis')}</div>` : `${primary('move-next','Nog een opdracht')}${soft('trace-b','Trek een letter over')}`}
      </div>
    </div>`;
}
function render() {
  liveStroke = null;
  const isFlash = mode === 'flash';
  hero.dataset.flash = String(isFlash);
  hero.querySelector('.hero-flash').hidden = !isFlash;
  hero.setAttribute('aria-labelledby', isFlash ? 'flash-title' : 'title');
  modes.forEach(el => el.setAttribute('aria-pressed', String(el.dataset.mode === mode)));
  board.innerHTML = mode === 'words' ? renderWords() : mode === 'flash' ? renderFlash() : renderMove();
}
function switchMode(next, viaBoard = false) {
  if (next === mode) return;
  if (mode === 'flash' && flash.status === 'shown') flash.status = 'hidden';
  clearClock();
  if (mode === 'flash' && flash.status === 'hidden') nextFlash(true);
  if (mode === 'words' && words.status === 'correct') nextWord(true);
  mode = next;
  render();
  if (viaBoard) focus('h2');
}
function showFlash() {
  clearClock();
  flash.status = 'shown';
  render();
  focus('[data-action="hide"]');
  if (pace) timer = setTimeout(hideFlash,pace);
}
function nextFlash(silent = false) {
  clearClock();
  if (flash.status !== 'hidden') return;
  if (flash.index + 1 === flash.deck.length) { flash.status = 'done'; if (!silent) { render(); focus('h2'); } return; }
  flash.index++;
  if (silent) { flash.status = 'ready'; return; }
  showFlash();
}
function hideFlash() {
  if (mode !== 'flash' || flash.status !== 'shown') return;
  clearClock();
  flash.status = 'hidden';
  render();
  timer = setTimeout(() => nextFlash(), FLASH_GAP);
}
function setLevel(n) {
  if (n === 'eigen') {
    if (custom.on) return;
    custom.on = true;
    custom.editing = !custom.words.length;
    custom.draft = custom.words.join(', ');
    clearTimeout(wordTimer);
    resetWords();
    render();
    focus('[data-level="eigen"]');
    return;
  }
  if (n === level && !(mode === 'words' && custom.on)) return;
  if (mode === 'words') custom.on = false;
  level = n;
  clearClock();
  resetWords();
  resetFlash();
  render();
  focus(`[data-level="${n}"]`);
}
function nextWord(silent = false) {
  clearTimeout(wordTimer);
  wordTimer = undefined;
  if (words.status !== 'correct') return;
  if (words.index + 1 === words.deck.length) words.status = 'done';
  else { words.index++; words.status = 'ready'; }
  if (silent || mode !== 'words') return;
  render();
  focus(words.status === 'done' ? 'h2' : '.word');
}
function pick(letter) {
  if (mode !== 'words' || words.status === 'correct' || words.status === 'done') return;
  words.status = words.deck[words.index][0] === letter ? 'correct' : 'retry';
  if (words.status === 'correct') {
    words.hint = false;
    render();
    wordTimer = setTimeout(() => nextWord(), WORD_PAUSE);
  } else {
    board.querySelector('.feedback').textContent = 'Kijk nog eens naar de eerste letter.';
  }
}
document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  const {action,mode: nextMode,answer,level: nextLevel} = button.dataset;
  if (nextLevel) return setLevel(nextLevel === 'eigen' ? 'eigen' : Number(nextLevel));
  if (nextMode) return switchMode(nextMode);
  if (answer) return pick(answer);
  switch (action) {
    case 'guide': guide.showModal(); break;
    case 'close-guide': guide.close(); break;
    case 'go-move': switchMode('move',true); break;
    case 'go-words': switchMode('words',true); break;
    case 'restart-words': clearTimeout(wordTimer); resetWords(); render(); focus('.word'); break;
    case 'hint': words.hint = !words.hint; render(); focus('[data-action="hint"]'); break;
    case 'restart-flash': resetFlash(); render(); focus('[data-action="show"]'); break;
    case 'show': showFlash(); break;
    case 'hide': hideFlash(); break;
    case 'body':
    case 'fingers':
      if (move.kind === action) break;
      move.kind = action; render(); focus(`[data-action="${action}"]`); break;
    case 'move-next':
      move[move.kind] = (move[move.kind] + 1) % tasks[move.kind].length;
      render(); focus('[data-action="move-next"]'); break;
    case 'trace-b':
    case 'trace-d':
      if (move.kind === 'trace' && move.letter === action.at(-1)) break;
      move.kind = 'trace'; move.letter = action.at(-1); render(); focus(`[data-action="${action}"]`); break;
    case 'save-custom': saveCustom(); break;
    case 'cancel-custom': custom.editing = false; render(); focus('h2'); break;
    case 'edit-custom': clearTimeout(wordTimer); custom.editing = true; custom.draft = custom.words.join(', '); custom.note = ''; render(); focus('#custom-words'); break;
    case 'share-custom': shareCustom(button); break;
    case 'erase': board.querySelector('.ink')?.replaceChildren(); break;
  }
});
board.addEventListener('change', event => {
  if (event.target.name === 'pace') pace = Number(event.target.value);
  if (event.target.matches('[data-photo]') && event.target.files[0]) readPhoto(event.target.files[0]);
});
board.addEventListener('input', event => {
  if (event.target.id !== 'custom-words') return;
  custom.draft = event.target.value;
  board.querySelector('.count').textContent = countText(custom.draft) + ' Andere woorden worden overgeslagen.';
  board.querySelector('.chips').innerHTML = chipList(custom.draft);
});
function storeList(list) {
  try { list.length ? localStorage.setItem(STORE_KEY, JSON.stringify(list)) : localStorage.removeItem(STORE_KEY); } catch (e) { /* opslag niet beschikbaar */ }
}
function loadList() {
  try { const v = JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); return Array.isArray(v) ? usable(v.join(' ')) : []; } catch (e) { return []; }
}
function saveCustom() {
  const box = board.querySelector('#custom-words');
  if (box) custom.draft = box.value;
  const list = usable(custom.draft);
  if (list.length < 2) {
    custom.note = 'Zet minstens twee woorden met b of d in de lijst.';
    board.querySelector('.ocr-status').textContent = custom.note;
    return;
  }
  custom.words = list;
  custom.editing = false;
  custom.note = '';
  storeList(list);
  resetWords();
  render();
  focus('.word');
}
function shareLink() {
  return `${location.origin}${location.pathname}?lijst=${encodeURIComponent(custom.words.join(','))}`;
}
async function shareCustom(button) {
  const note = board.querySelector('.share-note');
  const link = shareLink();
  try {
    await navigator.clipboard.writeText(link);
    note.textContent = 'Gekopieerd. Plak de link in een bericht aan de klas.';
  } catch (e) {
    note.textContent = link;
  }
  button.focus();
}
let ocrLoader;
function loadOcr() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  ocrLoader ??= new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = OCR_SRC;
    el.onload = () => resolve(window.Tesseract);
    el.onerror = () => { ocrLoader = undefined; reject(new Error('laden mislukt')); };
    document.head.append(el);
  });
  return ocrLoader;
}
async function shrink(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}
function setNote(text) {
  custom.note = text;
  const el = board.querySelector('.ocr-status');
  if (el) el.textContent = text;
}
async function readPhoto(file) {
  const box = board.querySelector('#custom-words');
  if (box) custom.draft = box.value;
  custom.busy = true;
  custom.note = 'De leesmachine wordt geladen…';
  render();
  try {
    const T = await loadOcr();
    const image = await shrink(file).catch(() => file);
    const result = await T.recognize(image, 'nld', {logger: m => { if (m.status === 'recognizing text') setNote(`Woorden lezen… ${Math.round(m.progress * 100)}%`); }});
    const found = [...new Set(splitWords(result.data.text))];
    const fromPhoto = usable(found.join(' '));
    custom.draft = [custom.draft.trim(), found.join(', ')].filter(Boolean).join(', ');
    custom.note = fromPhoto.length ? `Gevonden: ${fromPhoto.length} ${fromPhoto.length === 1 ? 'woord' : 'woorden'} met b of d. Kijk de lijst even na.` : 'Geen woorden met b of d gevonden. Probeer een scherpere foto of typ de woorden.';
  } catch (e) {
    custom.note = 'Het lezen van de foto lukte niet. Controleer de internetverbinding of typ de woorden zelf.';
  }
  custom.busy = false;
  render();
  focus('#custom-words');
}
document.addEventListener('keydown', event => {
  if (event.target.closest?.('input, textarea')) return;
  if (!guide.open && mode === 'words' && !(custom.on && custom.editing) && !event.ctrlKey && !event.metaKey && !event.altKey && !event.repeat && ['b','d'].includes(event.key)) pick(event.key);
});
function tracePoint(svgEl, event) {
  return new DOMPoint(event.clientX,event.clientY).matrixTransform(svgEl.getScreenCTM().inverse());
}
board.addEventListener('pointerdown', event => {
  const svgEl = event.target.closest('.trace');
  if (!svgEl || liveStroke || event.button !== 0) return;
  const point = tracePoint(svgEl,event);
  const path = document.createElementNS('http://www.w3.org/2000/svg','path');
  path.setAttribute('class','line');
  const d = `M${point.x.toFixed(1)} ${point.y.toFixed(1)} l.1 0`;
  path.setAttribute('d',d);
  svgEl.querySelector('.ink').append(path);
  svgEl.setPointerCapture(event.pointerId);
  liveStroke = {svgEl,path,d,id:event.pointerId};
});
board.addEventListener('pointermove', event => {
  if (!liveStroke || liveStroke.id !== event.pointerId) return;
  const point = tracePoint(liveStroke.svgEl,event);
  liveStroke.d += ` L${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
  liveStroke.path.setAttribute('d',liveStroke.d);
});
for (const name of ['pointerup','pointercancel','lostpointercapture']) {
  board.addEventListener(name,event => {
    if (liveStroke?.id === event.pointerId) liveStroke = null;
  });
}
window.render_game_to_text = () => JSON.stringify({mode,status: mode === 'words' ? words.status : mode === 'flash' ? flash.status : move.kind,screen: board.innerText.replace(/\s+/g,' ').trim()});
(() => {
  const fromLink = new URLSearchParams(location.search).get('lijst');
  const linked = fromLink ? usable(fromLink.replace(/,/g, ' ')) : [];
  if (linked.length >= 2) { custom.words = linked; custom.on = true; storeList(linked); }
  else custom.words = loadList();
})();
resetWords(true);
resetFlash();
render();

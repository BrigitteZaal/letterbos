'use strict';

const board = document.querySelector('#board');
const guide = document.querySelector('#guide');
const modes = [...document.querySelectorAll('[data-mode]')];
const hero = document.querySelector('.hero');
const count = 6;
const vocab = {
  b: ['bal', 'beer', 'boek', 'been', 'boom', 'bed', 'bus', 'bij', 'bel', 'boot'],
  d: ['dak', 'doos', 'dop', 'duif', 'deur', 'dier', 'das', 'duim', 'dik', 'dun']
};
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
const progress = index => `<div class="progress" aria-label="Kaart ${index + 1} van ${count}"><span aria-hidden="true">${index + 1} / ${count}</span><div class="dots" aria-hidden="true">${Array.from({length: count}, (_, i) => `<span class="dot ${i < index ? 'is-done' : i === index ? 'current' : ''}"></span>`).join('')}</div></div>`;

let mode = 'words';
let words, flash, timer;
const move = {kind: 'body', body: 0, fingers: 0, letter: 'b'};
let pace = 0;
let liveStroke = null;

function resetWords(first = false) {
  const left = shuffle(vocab.b).filter(w => !first || w !== 'bal').slice(0, first ? 2 : 3);
  const right = shuffle(vocab.d).slice(0, 3);
  words = {deck: [...(first ? ['bal'] : []), ...shuffle([...left, ...right])], index: 0, status: 'ready', hint: false};
}
function clearClock() {
  clearTimeout(timer);
  timer = undefined;
}
function resetFlash() {
  clearClock();
  flash = {deck: shuffle(['b','b','b','d','d','d']), index: 0, status: 'ready'};
}
function finish(title, info, restart, next, nextLabel) {
  return `<div class="finish">${svg('star')}<h2 tabindex="-1">${title}</h2><p>${info}</p><div class="split">${primary(restart,'Nog een rondje')}${soft(next,nextLabel)}</div></div>`;
}
function renderWords() {
  const {deck,index,status,hint} = words;
  if (status === 'done') return finish('Rondje klaar!', 'Goed geoefend met Beer en Duif.', 'restart-words', 'go-move', 'Even bewegen');
  const word = deck[index];
  const feedback = status === 'correct' ? `Ja, ${word} begint met een ${word[0]}!` : status === 'retry' ? 'Kijk nog eens naar de eerste letter.' : '';
  const choice = (letter, animal, label) => `<button type="button" class="choice ${status === 'correct' && word[0] === letter ? 'is-correct' : ''}" data-answer="${letter}" ${status === 'correct' ? 'aria-disabled="true"' : ''} aria-label="${letter} van ${label}">${svg(animal,'class="animal-small"')}<span class="letter" aria-hidden="true">${letter}</span><span class="choice-note" aria-hidden="true">${label}</span></button>`;
  return header('Waar hoort het woord?', 'Kijk naar de eerste letter.', progress(index)) + `
    <div class="play-grid">
      <div class="stage"><div class="paper-card word" tabindex="-1"><span>${hint ? `<span class="mark-first">${word[0]}</span>${word.slice(1)}` : word}</span></div></div>
      <div class="sort-side">
        <div class="choices">${choice('b','bear','beer')}${choice('d','pigeon','duif')}</div>
        <div class="below"><p class="feedback" role="status">${feedback}</p>
        ${status === 'correct' ? primary('word-next',index === count - 1 ? 'Rondje klaar' : 'Volgende') : soft('hint',hint ? 'Verberg tip' : 'Even kijken',`aria-expanded="${hint}" aria-controls="hint"`)}</div>
      </div>
    </div>
    <div id="hint" class="extra" ${hint && status !== 'correct' ? '' : 'hidden'}><p>Bij <strong>b</strong> staat het stokje links. Bij <strong>d</strong> staat het stokje rechts.</p></div>`;
}
function renderFlash() {
  const {deck,index,status} = flash;
  if (status === 'done') return finish('Geflitst!', 'Je hebt zes letterkaartjes bekeken.', 'restart-flash', 'go-words', 'Naar woorden');
  const visible = status === 'shown';
  const speed = (p,label) => `<label><input name="pace" type="radio" value="${p}" ${pace === p ? 'checked' : ''} ${visible ? 'disabled' : ''}>${label}</label>`;
  const command = status === 'ready' ? primary('show','Toon letter') : visible ? primary('hide','Verberg') : primary('flash-next', index === count - 1 ? 'Rondje klaar' : 'Volgende letter');
  return header('Flits een letter', 'Kijk en zeg de letterklank hardop.', progress(index)) + `
    <div class="play-grid">
      <div class="stage"><div class="paper-card flash-card" aria-live="polite" ${visible ? '' : 'aria-label="Kaartje dicht"'}>${visible ? deck[index] : svg('bolt')}</div></div>
      <div class="controls">
        <fieldset><legend>Hoe lang kijken?</legend><div class="speeds">${speed(0,'Zelf bepalen')}${speed(2000,'2 sec.')}${speed(1000,'1 sec.')}</div></fieldset>
        ${command}
        ${status === 'hidden' ? soft('show','Nog eens kijken') : ''}
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
function hideFlash() {
  if (mode !== 'flash' || flash.status !== 'shown') return;
  clearClock();
  flash.status = 'hidden';
  render();
  if (!guide.open) focus('[data-action="flash-next"]');
}
function pick(letter) {
  if (mode !== 'words' || words.status === 'correct' || words.status === 'done') return;
  words.status = words.deck[words.index][0] === letter ? 'correct' : 'retry';
  if (words.status === 'correct') {
    words.hint = false;
    render();
    focus('[data-action="word-next"]');
  } else {
    board.querySelector('.feedback').textContent = 'Kijk nog eens naar de eerste letter.';
  }
}
document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  const {action,mode: nextMode,answer} = button.dataset;
  if (nextMode) return switchMode(nextMode);
  if (answer) return pick(answer);
  switch (action) {
    case 'guide': guide.showModal(); break;
    case 'close-guide': guide.close(); break;
    case 'go-move': switchMode('move',true); break;
    case 'go-words': switchMode('words',true); break;
    case 'restart-words': resetWords(); render(); focus('.word'); break;
    case 'hint': words.hint = !words.hint; render(); focus('[data-action="hint"]'); break;
    case 'word-next':
      if (words.index + 1 === count) { words.status = 'done'; render(); focus('h2'); }
      else { words.index++; words.status = 'ready'; render(); focus('.word'); }
      break;
    case 'restart-flash': resetFlash(); render(); focus('[data-action="show"]'); break;
    case 'show': showFlash(); break;
    case 'hide': hideFlash(); break;
    case 'flash-next':
      if (flash.index + 1 === count) { flash.status = 'done'; render(); focus('h2'); }
      else { flash.index++; showFlash(); }
      break;
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
    case 'erase': board.querySelector('.ink')?.replaceChildren(); break;
  }
});
board.addEventListener('change', event => {
  if (event.target.name === 'pace') pace = Number(event.target.value);
});
document.addEventListener('keydown', event => {
  if (!guide.open && mode === 'words' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.repeat && ['b','d'].includes(event.key)) pick(event.key);
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
resetWords(true);
resetFlash();
render();

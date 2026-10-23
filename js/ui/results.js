// The end-of-round sheet: one column of numbers for single player and co-op, two for a race.

import { formatTime } from './hud.js';

const ROWS = [
  ['Time', (p) => formatTime(p.seconds * 1000)],
  ['Moves', (p) => p.moves],
  ['Score', (p) => p.score],
  ['Time bonus', (p) => (p.finished ? `+${p.timeBonus}` : '-')],
  ['Move bonus', (p) => (p.finished ? `+${p.moveBonus}` : '-')],
  ['Best streak', (p) => `x${p.bestStreak}`],
];

function row(label, cells, className = '') {
  const el = document.createElement('div');
  el.className = `rt-row ${className}`;
  const first = document.createElement('span');
  first.textContent = label;
  el.append(first, ...cells);
  return el;
}

const cell = (text, className = '') => {
  const span = document.createElement('span');
  span.textContent = text;
  if (className) span.className = className;
  return span;
};

/**
 * @param {{ title: string, subtitle: string, players: object[], winner?: number, extra?: string,
 *           actions: { label: string, primary?: boolean, disabled?: boolean, onClick: () => void }[] }} model
 */
export function showResult(model) {
  const dlg = document.getElementById('dlg-result');
  document.getElementById('result-title').textContent = model.title;
  document.getElementById('result-sub').textContent = model.subtitle;

  const table = document.getElementById('result-table');
  table.style.setProperty('--cols', model.players.length);
  const rows = [];
  if (model.players.length > 1) {
    rows.push(row('', model.players.map((p, i) => cell(p.name, i === model.winner ? 'winner' : '')), 'rt-head'));
  }
  for (const [label, read] of ROWS) {
    rows.push(row(label, model.players.map((p) => cell(read(p), p.finished || label === 'Time' || label === 'Moves' || label === 'Score' || label === 'Best streak' ? '' : 'dim'))));
  }
  rows.push(row('Total', model.players.map((p, i) => cell(p.total, i === model.winner ? 'winner' : '')), 'rt-total'));
  table.replaceChildren(...rows);

  const extra = document.getElementById('result-extra');
  extra.hidden = !model.extra;
  extra.textContent = model.extra ?? '';

  const actions = document.getElementById('result-actions');
  actions.replaceChildren(
    ...model.actions.map((a) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `btn${a.primary ? ' primary' : ''}`;
      btn.textContent = a.label;
      btn.disabled = !!a.disabled;
      btn.addEventListener('click', a.onClick);
      return btn;
    }),
  );
  if (!dlg.open) dlg.showModal();
}

export function closeResult() {
  const dlg = document.getElementById('dlg-result');
  if (dlg.open) dlg.close();
}

/** Update the note under the table (e.g. "Bob wants a rematch") without rebuilding the sheet. */
export function setResultExtra(text) {
  const extra = document.getElementById('result-extra');
  extra.hidden = !text;
  extra.textContent = text ?? '';
}

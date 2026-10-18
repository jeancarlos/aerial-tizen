// SPDX-FileCopyrightText: 2026 Jean
// SPDX-License-Identifier: MIT
function simKeyAction(keyCode, tag, listOpen) {
  if (tag === 'INPUT') return keyCode === 27 ? 'close-list' : 'swallow';
  if (keyCode === 76) return 'toggle-list';
  if (listOpen) return keyCode === 27 ? 'close-list' : 'swallow';
  if (keyCode === 32) return 'playpause';
  if (keyCode === 27) return 'back';
  return 'pass';
}

function simBackKey(menuOpen) {
  return menuOpen ? 10009 : 13;
}

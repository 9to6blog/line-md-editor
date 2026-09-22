const paths = {
  new: '<path d="M6 2.5h7l4 4V20H6z"/><path d="M13 2.5V7h4M9 12h5m-2.5-2.5v5"/>',
  file: '<path d="M5 2h8l5 5v15H5z"/><path d="M13 2v6h5M8 12h5m-5 4h5"/>',
  folder: '<path d="M3 6V4h6l3 3h9v13H3z"/><path d="M3 9h18"/>',
  project: '<path d="M3 5h6l2 3h10v13H3zM7 12h4v5H7zm8 0h2m-2 4h2"/>',
  book: '<path d="M5 4l7-2 7 2v17l-7-2-7 2zM12 2v17M8 6l2-1m4 0l2 1M8 10l2-1m4 0l2 1"/>',
  workspace:
    '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 7h4v4H7zm7 0h3m-3 4h3M7 15h4v3H7zm7 0h3"/>',
  archive:
    '<rect x="4" y="6" width="16" height="15" rx="2"/><path d="M3 3h18v4H3zm6 8h6v4H9z"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
  save: '<path d="M4 3h13l3 3v15H4zM8 3v6h8V3M8 21v-8h8v8"/>',
  undo: '<path d="M9 4L3 9l6 5M3 9h11a6 6 0 010 12h-3"/>',
  redo: '<path d="M15 4l6 5-6 5m6-5H10a6 6 0 000 12h3"/>',
  bold: '<path d="M7 3h6a4.5 4.5 0 010 9H7m0-9v18h7a4.5 4.5 0 000-9H7" stroke-width="2.5"/>',
  italic: '<path d="M10 3h9M5 21h9M15 3L9 21"/>',
  heading: '<path d="M5 4v16M19 4v16M5 12h14"/>',
  list: '<path d="M9 5h12M9 12h12M9 19h12"/><circle cx="3" cy="5" r=".8" fill="currentColor"/><circle cx="3" cy="12" r=".8" fill="currentColor"/><circle cx="3" cy="19" r=".8" fill="currentColor"/>',
  check:
    '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 12l3 3 7-7"/>',
  code: '<path d="M7 6l-5 6 5 6m10-12l5 6-5 6M14 3l-4 18"/>',
  link: '<path d="M10 7l3-3a5 5 0 017 7l-4 4a5 5 0 01-7 0m5 2l-3 3a5 5 0 01-7-7l4-4a5 5 0 017 0M8 16l8-8"/>',
  image:
    '<rect x="3" y="4" width="18" height="16" rx="1"/><circle cx="8" cy="9" r="2"/><path d="M3 17l5-4 4 3 4-6 5 7"/>',
  table:
    '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
  quote: '<path d="M5 4h5v11H6v5H3V9l2-5zm12 0h5v11h-4v5h-3V9l2-5z"/>',
  split:
    '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M12 4v16M6 8h3M6 12h3M6 16h3M15 8h3m-3 4h3"/>',
  preview:
    '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  search: '<circle cx="10" cy="10" r="7"/><path d="M15 15l6 6"/>',
  export: '<path d="M12 15V2M7 7l5-5 5 5M7 11H3v10h18V11h-4"/>',
  settings:
    '<path d="M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z"/><circle cx="12" cy="12" r="3"/>',
  moon: '<path d="M20 15.5A9 9 0 018.5 4 9 9 0 1020 15.5z" fill="currentColor" stroke="none"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12l2 2M4 20l2-2M18 6l2-2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  star: '<path d="M12 2l3 6 7 1-5 5 1 8-6-4-6 4 1-8-5-5 7-1z"/>',
  tag: '<path d="M4 4h10l7 8-9 9-8-8z"/><circle cx="9" cy="9" r="1.5"/>',
  hash: '<path d="M9 3L6 21M18 3l-3 18M3 8h18M2 16h18"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
  minus: '<path d="M4 12h16"/>',
  close: '<path d="M5 5l14 14M5 19L19 5"/>',
  maximize: '<rect x="5" y="5" width="14" height="14" rx="1"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  up: '<path d="M6 15l6-6 6 6"/>',
  sync: '<path d="M20 4v6h-6M4 20v-6h6M4 9a8 8 0 0114-5l2 6M4 14l2 6a8 8 0 0014-5"/>',
  copy: '<rect x="8" y="6" width="12" height="15" rx="1"/><path d="M16 6V3H4v15h4"/>',
  more: '<circle cx="4" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="20" cy="12" r="1"/>',
  cloud: '<path d="M7 19a6 6 0 01-1-12 7 7 0 0113 3 4.5 4.5 0 010 9z"/>',
  github:
    '<path d="M9 21v-4c-4 1-5-2-5-2M15 21v-4c0-1 .2-2-1-3 4-.4 6-2 6-6 0-2-1-3-1-3l-.2-3-4 2a13 13 0 00-6 0L5 2l-.2 3S4 6 4 8c0 4 2 5.6 6 6-1 1-1 2-1 3"/>',
  sparkle: '<path d="M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3z"/>',
  arrow: '<path d="M5 12h14m-6-6l6 6-6 6"/>',
};
export const icon = (name, cls = "") =>
  `<svg class="icon ${cls === "workspace" ? "workspace-icon" : cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.file}</svg>`;
export const logo =
  '<svg class="logo" viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="logo-gradient" x2="1" y2="1"><stop stop-color="#30c9f2"/><stop offset=".55" stop-color="#1485e6"/><stop offset="1" stop-color="#2040b8"/></linearGradient></defs><rect x="1" y="1" width="22" height="22" rx="6" fill="url(#logo-gradient)"/><rect x="9" y="5" width="10" height="13" rx="3" fill="#b4efff" fill-opacity=".45" stroke="#d6f6ff" stroke-width=".6"/><rect x="6" y="8" width="9" height="12" rx="3" fill="#087bdf" fill-opacity=".8" stroke="#abebff" stroke-width=".8"/><path d="M9 11h3m-3 2h3m-3 2h2" stroke="white" stroke-width=".7" stroke-linecap="round"/></svg>';

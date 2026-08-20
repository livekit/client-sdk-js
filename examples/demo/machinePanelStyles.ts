/**
 * Styles for the inspector window. Inline rather than a stylesheet because the window is written
 * into an `about:blank` document, which has no base URL to resolve a link against.
 *
 * The page itself never scrolls: the window is a column, the diagram takes whatever height is left
 * over, and the two panes that can grow without bound — the context dump and the timeline — scroll
 * inside their own box.
 */
export const PANEL_STYLES = `
  :root { color-scheme: light dark; }
  html, body { height: 100%; }
  body {
    margin: 0; padding: 12px 20px 16px; box-sizing: border-box;
    display: flex; flex-direction: column; gap: 10px; overflow: hidden;
    font: 13px/1.5 ui-sans-serif, system-ui, sans-serif;
    background: Canvas; color: CanvasText;
  }
  header { display: flex; align-items: baseline; gap: 16px; flex-wrap: wrap; }
  h1 { font-size: 16px; margin: 0; }
  h2 { font-size: 13px; margin: 0 0 6px; }
  header label { font-size: 12px; opacity: .75; }
  #empty { opacity: .7; max-width: 46ch; }
  main {
    flex: 1; min-height: 0;
    display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 20px;
  }
  .machines, aside { display: flex; flex-direction: column; min-height: 0; min-width: 0; }
  .note { font-size: 11px; opacity: .65; margin: -2px 0 8px; }

  .tabs { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 8px; }
  .tab {
    font: inherit; font-size: 12px; cursor: pointer;
    display: flex; align-items: center; gap: 6px;
    padding: 4px 10px; border-radius: 6px 6px 0 0;
    border: 1px solid color-mix(in srgb, CanvasText 18%, transparent);
    border-bottom: 2px solid transparent;
    background: color-mix(in srgb, CanvasText 5%, transparent); color: CanvasText;
  }
  .tab:hover { background: color-mix(in srgb, CanvasText 10%, transparent); }
  .tab.selected { background: Canvas; border-bottom-color: #2563eb; font-weight: 600; }
  .tab.superseded { opacity: .55; }
  .tab .seq { opacity: .5; font-weight: normal; margin-left: -4px; }
  /* fixed slot, so a state change never reflows the strip */
  .tab .state {
    min-width: 13ch; text-align: center;
    font-family: ui-monospace, monospace; font-size: 11px; font-weight: 600;
    padding: 1px 6px; border-radius: 999px; background: #2563eb; color: #fff;
  }
  .tab.superseded .state { background: color-mix(in srgb, CanvasText 35%, transparent); }

  article.machine { display: flex; flex-direction: column; min-height: 0; flex: 1; }
  article.machine.superseded { opacity: .7; }
  #machine { display: flex; min-height: 0; flex: 1; }
  .diagram { flex: 1; min-height: 0; overflow: auto; }
  .diagram svg { max-width: 100%; height: auto; }
  .inputs { display: flex; flex-wrap: wrap; gap: 4px; margin: 8px 0; }
  .inputs span {
    font-family: ui-monospace, monospace; font-size: 11px;
    padding: 2px 7px; border-radius: 4px; border: 1px solid transparent; cursor: help;
  }
  .inputs .legal { background: #dcfce7; border-color: #86efac; color: #14532d; }
  .inputs .illegal {
    background: transparent; opacity: .45;
    border-color: color-mix(in srgb, CanvasText 15%, transparent);
  }
  pre {
    font-size: 11px; margin: 0; padding: 8px; max-height: 16vh; overflow: auto;
    background: color-mix(in srgb, CanvasText 6%, transparent); border-radius: 6px;
  }

  .faults { display: flex; flex-direction: column; gap: 4px; margin-bottom: 16px; }
  .faults button {
    font: inherit; font-size: 12px; text-align: left; padding: 5px 9px; border-radius: 6px;
    border: 1px solid color-mix(in srgb, CanvasText 20%, transparent);
    background: Canvas; color: CanvasText; cursor: pointer;
  }
  .faults button:hover:enabled { background: color-mix(in srgb, CanvasText 8%, transparent); }
  .faults button:disabled { opacity: .4; cursor: not-allowed; }
  .timeline { list-style: none; margin: 0; padding: 0; flex: 1; min-height: 0; overflow-y: auto; }
  .timeline li {
    display: flex; gap: 6px; padding: 3px 0; font-size: 11px;
    border-top: 1px solid color-mix(in srgb, CanvasText 10%, transparent);
  }
  .timeline time { opacity: .45; font-variant-numeric: tabular-nums; }
  .timeline code { opacity: .7; }
  .timeline .machine { color: #1d4ed8; }
  .timeline .declined { color: #b45309; }
  .timeline .attach { font-weight: 600; }
  .timeline .room { opacity: .8; }
  @media (prefers-color-scheme: dark) {
    .inputs .legal { background: #14532d; border-color: #166534; color: #dcfce7; }
    .timeline .machine { color: #93c5fd; }
    .timeline .declined { color: #fcd34d; }
  }
`;

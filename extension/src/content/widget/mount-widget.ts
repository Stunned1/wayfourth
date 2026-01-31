import { getUserSettings } from '../../shared/storage';
import type { SupportedSite } from '../sites';
import { el, setStyles } from './dom';
import { createSettingsForm } from './settings-form';
import { fontFamily, theme } from './theme';

const WIDGET_ROOT_ID = 'pinkvanity-root';

type WidgetState = {
  expanded: boolean;
  settingsSavedAt?: number;
};

function ensureRoot(): HTMLElement {
  const existing = document.getElementById(WIDGET_ROOT_ID);
  if (existing) return existing;

  const root = document.createElement('div');
  root.id = WIDGET_ROOT_ID;
  setStyles(root, {
    zIndex: '2147483647',
    position: 'fixed',
    right: '16px',
    top: '16px',
    width: '340px',
    pointerEvents: 'none',
  });

  document.documentElement.appendChild(root);
  return root;
}

function buttonStyles(): Partial<CSSStyleDeclaration> {
  return {
    padding: '8px 10px',
    borderRadius: '10px',
    border: `1px solid ${theme.btnBorder}`,
    background: theme.btnBg,
    color: theme.text,
    cursor: 'pointer',
    fontFamily,
    fontSize: '13px',
  };
}

async function render(
  root: HTMLElement,
  supportedSite: SupportedSite,
  state: WidgetState,
): Promise<void> {
  root.innerHTML = '';

  const settings = await getUserSettings();
  const hasMeasurements =
    typeof settings.measurements.bustIn === 'number' ||
    typeof settings.measurements.waistIn === 'number' ||
    typeof settings.measurements.hipsIn === 'number';

  const card = el('div');
  setStyles(card, {
    pointerEvents: 'auto',
    border: `1px solid ${theme.border}`,
    borderRadius: '14px',
    padding: '12px',
    background: theme.bg,
    color: theme.text,
    boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
    backdropFilter: 'blur(8px)',
    fontFamily,
  });

  const header = el('div');
  setStyles(header, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '10px',
  });

  const titleWrap = el('div');
  const title = el('div', { text: 'PinkVanity' });
  setStyles(title, { fontWeight: '800', color: theme.pink, lineHeight: '1.1' });
  const subtitle = el('div', { text: `AE / ZARA / H&M • ${supportedSite}` });
  setStyles(subtitle, { fontSize: '12px', color: theme.muted, marginTop: '2px' });
  titleWrap.appendChild(title);
  titleWrap.appendChild(subtitle);

  const headerActions = el('div');
  setStyles(headerActions, { display: 'flex', gap: '8px' });

  const toggle = el('button', { text: state.expanded ? 'Collapse' : 'Expand' });
  setStyles(toggle, buttonStyles());
  toggle.addEventListener('click', () => {
    state.expanded = !state.expanded;
    void render(root, supportedSite, state);
  });

  const hide = el('button', { text: 'Hide' });
  setStyles(hide, buttonStyles());
  hide.addEventListener('click', () => root.remove());

  headerActions.appendChild(toggle);
  headerActions.appendChild(hide);

  header.appendChild(titleWrap);
  header.appendChild(headerActions);

  const divider = el('div');
  setStyles(divider, {
    height: '1px',
    background: 'rgba(255,255,255,0.08)',
    marginTop: '10px',
    marginBottom: '10px',
  });

  const summary = el('div');
  setStyles(summary, { fontSize: '13px', lineHeight: '1.35' });
  summary.textContent = hasMeasurements
    ? `Vanity sizing: ready (fit: ${settings.fitPreference}). Pink tax: ready for side-by-side compare.`
    : 'Vanity sizing: add your measurements to get a size recommendation.';

  const saved =
    typeof state.settingsSavedAt === 'number'
      ? el('div', { text: 'Saved.' })
      : null;
  if (saved) {
    setStyles(saved, { fontSize: '12px', color: theme.muted, marginTop: '8px' });
  }

  card.appendChild(header);
  card.appendChild(divider);
  card.appendChild(summary);
  if (saved) card.appendChild(saved);

  if (state.expanded) {
    const panel = el('div');
    setStyles(panel, { marginTop: '12px' });

    const form = await createSettingsForm({
      onSaved: () => {
        state.settingsSavedAt = Date.now();
        void render(root, supportedSite, state);
      },
    });

    panel.appendChild(form);
    card.appendChild(panel);
  }

  root.appendChild(card);
}

export async function mountWidget(supportedSite: SupportedSite): Promise<void> {
  const root = ensureRoot();
  const state: WidgetState = { expanded: false };
  await render(root, supportedSite, state);
}


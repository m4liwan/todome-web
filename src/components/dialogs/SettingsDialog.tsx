import { useEffect, useRef, useState } from 'react';
import { useAppState } from '../../app/hooks';
import { useServices } from '../../app/services';
import type { AmbienceId, Client, LayoutId, PaletteId, Rounding, Settings, Tone } from '../../domain/types';
import { desktop } from '../../lib/desktop';
import { bloom, focusTone } from '../../lib/chimes';
import { freeState, hasPro, isProLayout, isProPalette, openPro } from '../../app/pro';
import { IconChat, IconLock } from '../icons';
import { companionHello } from '../../app/companion';
import { avatarName } from '../../domain/companion';
import { COPYRIGHT } from '../../domain/legal';
import { AvatarPicker } from '../AvatarPicker';
import { LocationPicker } from '../LocationPicker';
import { idleDetectionSupported, requestIdlePermission, requestNotificationPermission } from '../../lib/notifier';
import { formatEuro } from '../../lib/time';
import { upsertClient } from '../../state/commands';
import { parseState } from '../../state/store';
import { Dialog } from '../Dialog';
import { Select } from '../Select';
import { AboutSection } from './AboutSection';
import { ContactDialog } from './ContactDialog';
import { downloadBackup } from '../../app/backup';
import { AmbienceSoundField, BrainSection, TimelineStyleField, MediaSection, MoodSection, OverlaySection, StandbySection } from './SettingsSections';
import { USER_CONTEXTS, businessShown, contextLabels, normalizeUserContext, type ContextLabels } from '../../domain/userContext';

export type SettingsTab = 'general' | 'companion' | 'design' | 'overlay' | 'media' | 'data' | 'about';

/** Switches the open settings sheet to a tab (used by the companion tour). */
export const SETTINGS_TAB_EVENT = 'todome:settings-tab';
export function showSettingsTab(tab: SettingsTab): void {
  window.dispatchEvent(new CustomEvent<SettingsTab>(SETTINGS_TAB_EVENT, { detail: tab }));
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Open on a specific tab (e.g. straight to the companion from the water card). */
  initialTab?: SettingsTab;
}

const TABS: Array<{ id: SettingsTab; label: string }> = [
  { id: 'general', label: 'Allgemein' },
  { id: 'companion', label: 'Begleiter' },
  { id: 'design', label: 'Design' },
  { id: 'overlay', label: 'Overlay' },
  { id: 'media', label: 'Audio' },
  { id: 'data', label: 'Daten' },
  { id: 'about', label: 'Über' },
];

const TONES: Array<{ id: Tone; label: string; example: string }> = [
  { id: 'gentle', label: 'Sanft', example: '„Du bist etwas über der Zeit – völlig okay.“' },
  { id: 'direct', label: 'Direkt', example: '„15 min drüber. Noch etwas Zeit oder ein sauberer Schnitt?“' },
  { id: 'sporty', label: 'Sportlich', example: '„Nachspielzeit! Noch mal ran oder abpfeifen?“' },
];

const PALETTES: Array<{ id: PaletteId; label: string; colors: [string, string, string] }> = [
  { id: 'lime', label: 'Frühling', colors: ['#22c27a', '#c8f23c', '#ffb23f'] },
  { id: 'rose', label: 'Rosé', colors: ['#ff4d6d', '#ff9fb8', '#ffc38b'] },
  { id: 'ocean', label: 'Ozean', colors: ['#2f7cff', '#6fe3e0', '#9b8cff'] },
  { id: 'sunset', label: 'Abendrot', colors: ['#ff7a3d', '#ffcf6e', '#ff6f91'] },
  { id: 'lavender', label: 'Lavendel', colors: ['#7c5cff', '#c6b3ff', '#ff9ed8'] },
  { id: 'neon', label: 'Neon Cyber', colors: ['#0c0a1c', '#22e6f2', '#c04dff'] },
  { id: 'pulse', label: 'Neon Pulse', colors: ['#12061c', '#ff3dbb', '#7a5cff'] },
  { id: 'matrix', label: 'Matrix Frost', colors: ['#06140f', '#5dffb4', '#7fd8ff'] },
];

const NIGHT_WORLDS = new Set<PaletteId>(['neon', 'pulse', 'matrix']);

const LAYOUTS: Array<{ id: LayoutId; label: string; text: string }> = [
  { id: 'hub', label: 'Companion Hub', text: 'Dein Begleiter im Mittelpunkt, in seinem Glas-Zuhause' },
  { id: 'classic', label: 'Classic', text: 'Übersichtliches Dashboard zum Scrollen' },
  { id: 'sanctuary', label: 'Sanctuary', text: 'Eine große Karte im Zentrum, alles andere ruhig drumherum' },
  { id: 'flow', label: 'Flow & Focus', text: 'Bereiche als sanfter Slider, Seite für Seite' },
];

const AMBIENCES: Array<{ id: AmbienceId; label: string }> = [
  { id: 'none', label: 'Ruhig' },
  { id: 'live', label: 'Wie draußen' },
  { id: 'rain', label: 'Regen' },
  { id: 'clouds', label: 'Wolken' },
  { id: 'snow', label: 'Schnee' },
  { id: 'leaves', label: 'Herbstlaub' },
];

/** Position of the sliding tab highlight (moves with transform only, no layout work). */
const tabPill = (i: number) => ({ '--i': i, '--c4': i % 4, '--r4': Math.floor(i / 4) }) as React.CSSProperties;

const ROUNDING: Record<Rounding, string> = { none: 'Minutengenau', six: '6-Minuten-Takt', fifteen: '15-Minuten-Takt' };

export function SettingsDialog({ open, onClose, initialTab = 'general' }: Props) {
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [contactOpen, setContactOpen] = useState(false);
  // The companion tour can point to a tab without reopening the sheet.
  useEffect(() => {
    const onTab = (e: Event) => {
      const next = (e as CustomEvent<SettingsTab>).detail;
      if (TABS.some((t) => t.id === next)) setTab(next);
    };
    window.addEventListener(SETTINGS_TAB_EVENT, onTab);
    return () => window.removeEventListener(SETTINGS_TAB_EVENT, onTab);
  }, []);
  const services = useServices();
  const state = useAppState();
  const labels = contextLabels(state.settings.userContext);
  const s = state.settings;
  const set = (patch: Partial<Settings>) => services.store.dispatch({ type: 'settings/update', patch });
  const setCompanion = (patch: Partial<Settings['companion']>) => set({ companion: { ...s.companion, ...patch } });
  const fileRef = useRef<HTMLInputElement>(null);

  const exportJson = () => downloadBackup(services.store.getState());

  const importJson = async (file: File) => {
    const parsed = parseState(await file.text());
    if (!parsed) return services.announce('Die Datei ist kein gültiges ToDoMe-Backup.');
    services.store.dispatch({ type: 'state/replace', state: freeState(parsed) });
    services.announce('Backup wiederhergestellt.');
  };

  return (
    <Dialog open={open} title="Einstellungen" wide onClose={onClose} className="dialog--settings">
      <div className="settings">
        <div className="settings__tabs" role="tablist" aria-label="Bereiche" style={tabPill(TABS.findIndex((t) => t.id === tab))}>
          <span className="settings__tabs-pill" aria-hidden="true" />
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`settings-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls="settings-panel"
              className={tab === t.id ? 'is-on' : undefined}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="settings__panel" id="settings-panel" role="tabpanel" aria-labelledby={`settings-tab-${tab}`} key={tab}>
          {tab === 'general' && (
            <>
        <BrainSection />
        <section>
          <h3>Wie ToDoMe mit dir spricht</h3>
          <label className="field">
            <span>Dein Vorname</span>
            <input value={s.userName} onChange={(e) => set({ userName: e.target.value })} maxLength={40} />
          </label>
          <div className="field">
            <span>Wofür nutzt du ToDoMe?</span>
            <Select value={s.userContext} onChange={(v) => set({ userContext: normalizeUserContext(v) })} aria-label="Wofür nutzt du ToDoMe?">
              {USER_CONTEXTS.map((c) => (
                <option key={c.id} value={c.id}>
                  {`${c.icon} ${c.label}`}
                </option>
              ))}
            </Select>
          </div>
          <div className="tone-picker" role="radiogroup" aria-label="Tonalität">
            {TONES.map((t) => (
              <label key={t.id} className={`tone${s.tone === t.id ? ' is-on' : ''}`}>
                <input type="radio" name="tone" checked={s.tone === t.id} onChange={() => set({ tone: t.id })} />
                <strong>{t.label}</strong>
                <span>{t.example}</span>
              </label>
            ))}
          </div>
        </section>
        <section>
          <h3>{labels.dayFrame}</h3>
          <div className="form--grid">
            <TimeField label={labels.dayStart} value={s.workdayStart} onChange={(v) => set({ workdayStart: v })} />
            <TimeField label={labels.dayEnd} value={s.workdayEnd} onChange={(v) => set({ workdayEnd: v })} />
            <TimeField label="Mittag von" value={s.lunchStart} onChange={(v) => set({ lunchStart: v })} />
            <TimeField label="Mittag bis" value={s.lunchEnd} onChange={(v) => set({ lunchEnd: v })} />
            <NumberField label="Tageslimit netto (h)" value={s.dailyCapMin / 60} min={2} max={14} step={0.5} onChange={(v) => set({ dailyCapMin: Math.round(v * 60) })} />
            <NumberField label="Pause vorschlagen nach (min Fokus)" value={s.focusBudgetMin} min={30} max={240} step={5} onChange={(v) => set({ focusBudgetMin: v })} />
          </div>
        </section>
        <section>
          <h3>Nachfragen</h3>
          <div className="form--grid">
            <NumberField label="Höchstens pro Stunde" value={s.maxPromptsPerHour} min={1} max={10} step={1} onChange={(v) => set({ maxPromptsPerHour: v })} />
            <NumberField label="Unbeantwortet ausblenden nach (min)" value={s.promptExpiryMin} min={1} max={30} step={1} onChange={(v) => set({ promptExpiryMin: v })} />
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={s.systemNotifications}
              onChange={async (e) => {
                if (!e.target.checked) return set({ systemNotifications: false });
                const ok = await requestNotificationPermission();
                set({ systemNotifications: ok });
                if (!ok) services.announce('Benachrichtigungen wurden im Browser nicht erlaubt.');
              }}
            />
            <span>Systembenachrichtigungen, wenn ToDoMe im Hintergrund ist</span>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={s.idleDetection}
              disabled={!idleDetectionSupported() || services.mode === 'demo'}
              onChange={async (e) => {
                if (!e.target.checked) return set({ idleDetection: false });
                const ok = await requestIdlePermission();
                set({ idleDetection: ok });
                if (!ok) services.announce('Leerlauf-Erkennung wurde nicht erlaubt.');
              }}
            />
            <span>
              Leerlauf am Rechner erkennen ({s.idleThresholdMin} min)
              {!idleDetectionSupported() && <em className="muted"> – in diesem Browser nicht verfügbar, nutze die Desktop-App oder Chrome/Edge</em>}
            </span>
          </label>
        </section>
        <section>
          <h3>Wetter</h3>
          <LocationPicker value={s.location} onChange={(location) => set({ location })} />
        </section>
              {desktop && <DesktopSection />}
        <section className="feedback-sec">
          <h3>Hilfe</h3>
          <p className="muted small">{avatarName(s.companion.avatar)} zeigt dir in einer Minute, wo alles ist.</p>
          <div className="row">
            <button
              type="button"
              className="pill pill--sm"
              onClick={() => {
                set({ tourDone: false });
                onClose();
              }}
            >
              Rundgang mit {avatarName(s.companion.avatar)} starten
            </button>
          </div>
        </section>
        <section className="feedback-sec" aria-labelledby="settings-contact">
          <h3 id="settings-contact">Feedback & Kontakt</h3>
          <p className="muted small">Was fühlt sich gut an, was hakt noch, wo kommst du nicht weiter? Zwei Minuten, ganz formlos. Jede Nachricht macht ToDoMe. ruhiger und besser.</p>
          <div className="row">
            <button type="button" className="pill pill--sm feedback-link" onClick={() => setContactOpen(true)} aria-haspopup="dialog">
              <IconChat size={16} />
              Nachricht schreiben
            </button>
          </div>
          <ContactDialog open={contactOpen} onClose={() => setContactOpen(false)} />
        </section>
            </>
          )}
          {tab === 'companion' && (
            <>
        <section id="settings-companion">
          <h3>Begleiter</h3>
          <label className="check">
            <input type="checkbox" checked={s.companion.enabled} onChange={(e) => setCompanion({ enabled: e.target.checked })} />
            <span>Begleiter schaut vorbei {desktop ? '(am Bildschirmrand)' : '(im App-Fenster)'}</span>
          </label>
          <AvatarPicker
            value={s.companion.avatar}
            onChange={(avatar) => {
              setCompanion({ avatar });
              // The choice is saved at once, not only when the app closes.
              services.store.flush();
            }}
          />
          <div className="form--grid">
            <label className="field">
              <span>Vorbeischauen während einer Session</span>
              <Select value={s.companion.visitIntervalMin} onChange={(v) => setCompanion({ visitIntervalMin: Number(v) })}>
                {[0, 10, 15, 20, 30, 45, 60, 90].map((m) => (
                  <option key={m} value={m}>
                    {m === 0 ? 'Nie' : `alle ${m} Minuten`}
                  </option>
                ))}
              </Select>
              <small className="hint">Wichtige Aufgaben: öfter (×0,6). Niedrige Priorität: seltener (×1,6).</small>
            </label>
            <label className="field">
              <span>Ans Trinken erinnern</span>
              <Select value={s.companion.hydrationIntervalMin} onChange={(v) => setCompanion({ hydrationIntervalMin: Number(v) })}>
                {[0, 30, 45, 60, 90, 120].map((m) => (
                  <option key={m} value={m}>
                    {m === 0 ? 'Nie' : `alle ${m} Minuten`}
                  </option>
                ))}
              </Select>
            </label>
            <NumberField label="Tagesziel Wasser (Gläser)" value={s.companion.waterGoal} min={1} max={16} step={1} onChange={(v) => setCompanion({ waterGoal: v })} />
            <label className="field">
              <span>Erscheint am</span>
              <Select value={s.companion.position} onChange={(v) => setCompanion({ position: v as 'left' | 'right' })}>
                <option value="right">rechten Bildschirmrand</option>
                <option value="left">linken Bildschirmrand</option>
              </Select>
            </label>
          </div>
          <label className="check">
            <input type="checkbox" checked={s.companion.motivation} onChange={(e) => setCompanion({ motivation: e.target.checked })} />
            <span>Kurz gratulieren, wenn du etwas erledigt hast</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={s.companion.softCheck} onChange={(e) => setCompanion({ softCheck: e.target.checked })} />
            <span>Am Nachmittag sanft fragen, ob der Rest des Tages leichter werden darf</span>
          </label>
          <div className="row">
            <button type="button" className="pill pill--sm" onClick={() => companionHello(services)} disabled={!s.companion.enabled}>
              Jetzt vorbeischauen lassen
            </button>
          </div>
        </section>
            </>
          )}
          {tab === 'design' && (
            <>
        <section>
          <h3>Darstellung</h3>
          <div className="segmented" role="radiogroup" aria-label="Design">
            {(
              [
                ['light', 'Hell'],
                ['dark', 'Dunkel'],
                ['system', 'Wie System'],
              ] as const
            ).map(([value, label]) => (
              <button key={value} type="button" role="radio" aria-checked={s.theme === value} className={s.theme === value ? 'is-on' : ''} onClick={() => set({ theme: value })}>
                {label}
              </button>
            ))}
          </div>
          <p className="settings__label">Farbwelt</p>
          <div className="palettes" role="radiogroup" aria-label="Farbwelt">
            {PALETTES.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={s.appearance.palette === p.id}
                aria-disabled={isProPalette(p.id) || undefined}
                className={`palette${s.appearance.palette === p.id ? ' is-on' : ''}${isProPalette(p.id) ? ' is-pro' : ''}`}
                onClick={() => {
                  if (isProPalette(p.id)) return openPro('palettes');
                  set({ appearance: { ...s.appearance, palette: p.id } });
                  // The cyber worlds are night worlds: they come with the dark design.
                  if (NIGHT_WORLDS.has(p.id) && s.theme !== 'dark') {
                    set({ theme: 'dark' });
                    services.announce(`${p.label} leuchtet im Dunkeln am schönsten, daher das dunkle Design.`);
                  }
                }}
              >
                <span className="palette__frame" aria-hidden="true">
                  <span className="palette__swatch" style={{ background: `radial-gradient(circle at 30% 30%, ${p.colors[1]}, transparent 60%), radial-gradient(circle at 75% 70%, ${p.colors[2]}, transparent 60%), ${p.colors[0]}` }} />
                  {isProPalette(p.id) && (
                    <span className="pro-blur__lock">
                      <IconLock size={13} />
                    </span>
                  )}
                </span>
                <span>{p.label}</span>
                {isProPalette(p.id) && <ProLock />}
              </button>
            ))}
          </div>
          <p className="settings__label">Aufbau der Startseite</p>
          <div className="layouts" role="radiogroup" aria-label="Aufbau der Startseite">
            {LAYOUTS.map((l) => (
              <button
                key={l.id}
                type="button"
                role="radio"
                aria-checked={s.appearance.layout === l.id}
                aria-disabled={isProLayout(l.id) || undefined}
                className={`layout-opt${s.appearance.layout === l.id ? ' is-on' : ''}${isProLayout(l.id) ? ' is-pro' : ''}`}
                onClick={() => (isProLayout(l.id) ? openPro('flow') : set({ appearance: { ...s.appearance, layout: l.id } }))}
              >
                <span className={`layout-opt__preview layout-opt__preview--${l.id}`} aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
                <strong>{l.label}</strong>
                {l.id === 'hub' && <span className="layout-opt__badge">Standard</span>}
                <span>{l.text}</span>
                {isProLayout(l.id) && <ProLock />}
              </button>
            ))}
          </div>
          <TimelineStyleField />
          <p className="settings__label">Atmosphäre im Hintergrund</p>
          <div className="segmented" role="radiogroup" aria-label="Atmosphäre">
            {AMBIENCES.map((a) => (
              <button
                key={a.id}
                type="button"
                role="radio"
                aria-checked={s.appearance.ambience === a.id}
                className={s.appearance.ambience === a.id ? 'is-on' : ''}
                onClick={() => set({ appearance: { ...s.appearance, ambience: a.id } })}
              >
                {a.label}
              </button>
            ))}
          </div>
          <small className="hint">„Wie draußen“ folgt deinem Wetter: Regen tropft, Wolken ziehen, Schnee fällt. Ganz leise im Hintergrund.</small>
          <AmbienceSoundField />
        </section>
              <MoodSection />
              <StandbySection />
            </>
          )}
          {tab === 'overlay' && <OverlaySection />}
          {tab === 'media' && (
            <>
              <section>
                <h3>Sanfte Interaktions-Klänge</h3>
                <label className="check">
                  <input type="checkbox" checked={s.uiSounds} onChange={(e) => set({ uiSounds: e.target.checked })} />
                  <span>Ein warmes Aufblühen bei „Ankommen“ und „{labels.dayEnd}“, ein tiefer binauraler Ton beim Start eines Blocks und ein leiser 432-Hz-Ton beim Durchatmen</span>
                </label>
                <p className="muted small">Alles wird live erzeugt, ganz leise und weich. Binaurale Töne wirken am schönsten mit Kopfhörern.</p>
                <div className="row">
                  <button type="button" className="pill pill--sm" onClick={() => bloom()} disabled={!s.uiSounds}>
                    Aufblühen anhören
                  </button>
                  <button type="button" className="pill pill--sm" onClick={() => focusTone()} disabled={!s.uiSounds}>
                    Fokus-Ton anhören
                  </button>
                </div>
              </section>
              <MediaSection />
            </>
          )}
          {tab === 'about' && <AboutSection />}
          {tab === 'data' && (
            <>
              <ClientsSection clients={Object.values(state.clients)} labels={labels} business={businessShown(state)} />
        <section>
          <h3>Daten</h3>
          <p className="muted small">Alles bleibt auf diesem Gerät. Mit dem Backup ziehst du um oder sicherst deine Zeiten.</p>
          <div className="row">
            <button type="button" className="btn btn--small" onClick={exportJson}>
              Backup herunterladen
            </button>
            <button type="button" className="btn btn--small" onClick={() => fileRef.current?.click()}>
              Backup einspielen
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importJson(f);
                e.target.value = '';
              }}
            />
            <ResetButton demo={services.mode === 'demo'} onConfirm={services.resetData} />
          </div>
        </section>
            </>
          )}
          {tab !== 'about' && <p className="settings__copyright">{COPYRIGHT}</p>}
        </div>
      </div>
    </Dialog>
  );
}

function DesktopSection() {
  const services = useServices();
  const [autostart, setAutostart] = useState<{ supported: boolean; enabled: boolean } | null>(null);
  const [version, setVersion] = useState('');

  useEffect(() => {
    let alive = true;
    desktop?.getAutostart().then((a) => alive && setAutostart(a)).catch(() => undefined);
    desktop?.getInfo().then((i) => alive && setVersion(i.version)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section>
      <h3>Desktop</h3>
      <label className="check">
        <input
          type="checkbox"
          checked={autostart?.enabled ?? false}
          disabled={!autostart?.supported}
          onChange={async (e) => {
            try {
              setAutostart(await desktop!.setAutostart(e.target.checked));
            } catch {
              services.announce('Autostart konnte nicht geändert werden.');
            }
          }}
        />
        <span>
          Mit Windows starten (unsichtbar im Infobereich)
          {autostart && !autostart.supported && <em className="muted"> – nur in der installierten App</em>}
        </span>
      </label>
      <p className="muted small">
        Das Fenster zu schließen beendet ToDoMe nicht: Sessions und Nachfragen laufen im Infobereich neben der Uhr weiter. Beenden über
        Rechtsklick auf das Symbol.{version && ` Version ${version}.`}
      </p>
    </section>
  );
}

/** Two-step confirmation inside the page (no blocking browser dialogs). */
function ResetButton({ demo, onConfirm }: { demo: boolean; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <button type="button" className="btn btn--small btn--danger" onClick={() => setArmed(true)}>
        {demo ? 'Demo neu starten' : 'Alle Daten löschen'}
      </button>
    );
  }
  return (
    <span className="row" role="group" aria-label="Löschen bestätigen" style={{ marginTop: 0 }}>
      <span className="small">{demo ? 'Demo-Daten zurücksetzen?' : 'Alle Daten auf diesem Gerät löschen? Das lässt sich nicht rückgängig machen.'}</span>
      <button type="button" className="btn btn--small btn--danger" onClick={onConfirm}>
        {demo ? 'Ja, neu starten' : 'Ja, endgültig löschen'}
      </button>
      <button type="button" className="btn btn--small btn--quiet" onClick={() => setArmed(false)}>
        Abbrechen
      </button>
    </span>
  );
}

function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="time" value={value} onChange={(e) => e.target.value && onChange(e.target.value)} />
    </label>
  );
}

function NumberField(props: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <input
        type="number"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v) && v >= props.min && v <= props.max) props.onChange(v);
        }}
      />
    </label>
  );
}

function ClientsSection({ clients, labels, business }: { clients: Client[]; labels: ContextLabels; business: boolean }) {
  const services = useServices();
  const [draft, setDraft] = useState({ name: '', hourlyRate: business ? 90 : 0, rounding: 'fifteen' as Rounding, billableDefault: business });
  // Creating clients is part of Pro; existing clients stay fully usable.
  const pro = hasPro();
  const save = (c: Omit<Client, 'id' | 'archived'> & { id?: string; archived?: boolean }) =>
    services.run(upsertClient(services.store.getState(), services.deps(), c));

  return (
    <section>
      <h3>{labels.clients}</h3>
      {clients.length > 0 && (
        <ul className="clients">
          {clients.map((c) => (
            <li key={c.id} className={c.archived ? 'is-archived' : undefined}>
              <strong>{c.name}</strong>
              {business && (
                <>
                  <span>{formatEuro(c.hourlyRate)}/h</span>
                  <span>{ROUNDING[c.rounding]}</span>
                  <span>{c.billableDefault ? 'abrechenbar' : 'standardmäßig nicht abrechenbar'}</span>
                </>
              )}
              <button type="button" className="btn btn--small btn--quiet" onClick={() => save({ ...c, archived: !c.archived })}>
                {c.archived ? 'Reaktivieren' : 'Archivieren'}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className={`form--grid clients__add${business ? '' : ' clients__add--simple'}`}
        onSubmit={(e) => {
          e.preventDefault();
          if (!pro) return openPro('clients');
          if (save(draft)) setDraft({ ...draft, name: '' });
        }}
      >
        <label className="field">
          <span>{labels.clientNew}</span>
          <input required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={80} />
        </label>
        {business && (
        <>
        <label className="field">
          <span>Stundensatz (€)</span>
          <input type="number" min={0} step={5} value={draft.hourlyRate} onChange={(e) => setDraft({ ...draft, hourlyRate: Number(e.target.value) })} />
        </label>
        <label className="field">
          <span>Rundung</span>
          <Select value={draft.rounding} onChange={(v) => setDraft({ ...draft, rounding: v as Rounding })}>
            {Object.entries(ROUNDING).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </label>
        </>
        )}
        <div className="field field--end">
          {pro ? (
            <button type="submit" className="btn btn--small btn--primary">
              {labels.clientAdd}
            </button>
          ) : (
            <button type="button" className="btn btn--small btn--pro" onClick={() => openPro('clients')} title="Bald in Pro">
              <IconLock size={14} />
              {labels.clientAdd}
            </button>
          )}
        </div>
      </form>
    </section>
  );
}

/** A small, calm lock: this is part of ToDoMe. Pro. */
function ProLock() {
  return (
    <span className="pro-lock" title="Bald in Pro">
      <IconLock size={12} />
      Pro
    </span>
  );
}

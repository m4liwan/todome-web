import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useAppState } from '../../app/hooks';
import { useServices } from '../../app/services';
import type { AppState, Client, CornerStyle, DockPosition, PaletteId, QuickCaptureKey, Rounding, Settings, Tone } from '../../domain/types';
import { QUICK_KEY_LABELS, useQuickStatus } from '../../app/quickCapture';
import { desktop, type AutostartStatus } from '../../lib/desktop';
import { bloom, focusTone } from '../../lib/chimes';
import { freeState, hasPro, isProPalette, openPro, themesUnlocked } from '../../app/pro';
import { IconArrowUpRight, IconChart, IconChat, IconCompanion, IconHelp, IconLock, IconMusic, IconSettings, IconSparkle } from '../icons';
import { companionHello } from '../../app/companion';
import { avatarName } from '../../domain/companion';
import { COPYRIGHT } from '../../domain/legal';
import { AvatarPicker } from '../AvatarPicker';
import { LocationPicker } from '../LocationPicker';
import { idleDetectionSupported, requestIdlePermission, requestNotificationPermission } from '../../lib/notifier';
import { formatEuro } from '../../lib/time';
import { upsertClient } from '../../state/commands';
import { inspectState } from '../../state/store';
import { describeState, snapshotState, vaultSupported } from '../../app/vault';
import { VaultPicker } from '../Recovery';
import { Dialog } from '../Dialog';
import { Select } from '../Select';
import { AboutSection } from './AboutSection';
import { ContactDialog } from './ContactDialog';
import { downloadBackup } from '../../app/backup';
import { AmbientField, AmbiencePicker, AmbienceSoundSection, BrainSection, CompanionFxSection, TimelineStyleField, MediaSection, MoodSection, OverlaySection, StandbySection } from './SettingsSections';
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
  /** Switch to the "Begleiter" tab (its intro replays there). */
  onShowCompanion?: () => void;
}

const TABS: Array<{ id: SettingsTab; label: string; lead: string; icon: ReactNode }> = [
  { id: 'general', label: 'Allgemein', lead: 'Wie ToDoMe mit dir spricht und wie dein Tag tickt.', icon: <IconSettings size={17} /> },
  { id: 'companion', label: 'Begleiter', lead: 'Wer dich begleitet, wie oft er vorbeischaut und woran er erinnert.', icon: <IconCompanion size={17} /> },
  { id: 'design', label: 'Design', lead: 'Navigation, Licht, Ecken und die Atmosphäre, in der du arbeitest.', icon: <IconSparkle size={17} /> },
  { id: 'overlay', label: 'Overlay', lead: 'Die kleine Glasbox, die bei dir bleibt, während du woanders arbeitest.', icon: <IconArrowUpRight size={17} /> },
  { id: 'media', label: 'Audio', lead: 'Klänge, Töne und deine Musik.', icon: <IconMusic size={17} /> },
  { id: 'data', label: 'Daten', lead: 'Kunden, Backups und alles, was auf diesem Gerät liegt.', icon: <IconChart size={17} /> },
  { id: 'about', label: 'Über', lead: 'Version, Rechtliches und wer hinter ToDoMe steht.', icon: <IconHelp size={17} /> },
];
const tabIndex = (id: SettingsTab) => TABS.findIndex((t) => t.id === id);

const TONES: Array<{ id: Tone; label: string; example: string }> = [
  { id: 'gentle', label: 'Sanft', example: '„Du bist etwas über der Zeit – völlig okay.“' },
  { id: 'direct', label: 'Direkt', example: '„15 min drüber. Noch etwas Zeit oder ein sauberer Schnitt?“' },
  { id: 'sporty', label: 'Sportlich', example: '„Nachspielzeit! Noch mal ran oder abpfeifen?“' },
];

/** Ambient light colours: a soft light behind the modules, muted in the accents. */
const LIGHTS: Array<{ id: PaletteId; label: string; color: string }> = [
  { id: 'lime', label: 'Fokus-Lime', color: '#a3e635' },
  { id: 'cyan', label: 'Tiefsee-Cyan', color: '#62d4dc' },
  { id: 'amber', label: 'Warmes Bernstein', color: '#e9b46a' },
  { id: 'mono', label: 'Reines Weiß', color: '#e6e8ee' },
  { id: 'violet', label: 'Tiefes Violett', color: '#a593ff' },
  { id: 'rose', label: 'Gedämpftes Rosé', color: '#e49aae' },
];

const CORNERS: Array<{ id: CornerStyle; label: string; text: string }> = [
  { id: 'sharp', label: 'Kantig', text: 'Architektonisch, klare Kanten' },
  { id: 'precise', label: 'Präzise', text: 'Straff und exakt' },
  { id: 'soft', label: 'Weich', text: 'Sanft gerundet' },
];

/** Where the floating navigation sits; left keeps the reading flow free. */
const DOCKS: Array<{ id: DockPosition; label: string; text: string }> = [
  { id: 'left', label: 'Links', text: 'Ruhig am Rand, wie ein Buchrücken' },
  { id: 'right', label: 'Rechts', text: 'Der Blick startet beim Inhalt' },
  { id: 'top', label: 'Oben', text: 'Kompakt über allem' },
  { id: 'bottom', label: 'Unten', text: 'Wie ein Dock, griffbereit' },
];

const ROUNDING: Record<Rounding, string> = { none: 'Minutengenau', six: '6-Minuten-Takt', fifteen: '15-Minuten-Takt' };

export function SettingsDialog({ open, onClose, initialTab = 'general', onShowCompanion }: Props) {
  const [tab, setTabNow] = useState<SettingsTab>(initialTab);
  // The panel slides in the direction you travel through the list.
  const [dir, setDir] = useState<'up' | 'down'>('down');
  const current = useRef(tab);
  const setTab = (next: SettingsTab) => {
    setDir(tabIndex(next) < tabIndex(current.current) ? 'up' : 'down');
    current.current = next;
    setTabNow(next);
  };
  /** A link to another tab: switch and keep the keyboard on that tab (the panel is rebuilt). */
  const goTo = (next: SettingsTab) => {
    setTab(next);
    document.getElementById(`settings-tab-${next}`)?.focus({ preventScroll: true });
  };
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
  // Level 15 of the companion opens the exclusive light colours without Pro.
  const themes = themesUnlocked(state);
  const set = (patch: Partial<Settings>) => services.store.dispatch({ type: 'settings/update', patch });
  const setCompanion = (patch: Partial<Settings['companion']>) => set({ companion: { ...s.companion, ...patch } });
  const fileRef = useRef<HTMLInputElement>(null);

  const exportJson = () => downloadBackup(services.store.getState());

  // Replacing all data is never one click: a summary first, and the safe keeps the current state.
  const [pendingImport, setPendingImport] = useState<{ state: AppState; from: string } | null>(null);
  const [vaultOpen, setVaultOpen] = useState(false);
  const importJson = async (file: File) => {
    const check = inspectState(await file.text());
    if (check.status === 'newer') return services.announce('Dieses Backup stammt aus einer neueren ToDoMe-Version. Aktualisiere ToDoMe zuerst.');
    if (check.status !== 'ok') return services.announce('Die Datei ist kein gültiges ToDoMe-Backup.');
    setPendingImport({ state: check.state, from: file.name });
  };
  const confirmImport = () => {
    if (!pendingImport) return;
    snapshotState('pre-import', services.store.getState());
    services.store.dispatch({ type: 'state/replace', state: freeState(pendingImport.state) });
    setPendingImport(null);
    setVaultOpen(false);
    services.announce(vaultSupported() ? 'Backup eingespielt. Dein vorheriger Stand liegt in den Sicherungen.' : 'Backup eingespielt.');
  };

  return (
    <Dialog open={open} title="Einstellungen" wide onClose={onClose} className="dialog--settings">
      <div className="settings" style={{ '--tab': tabIndex(tab) } as CSSProperties}>
        <div className="settings__tabs" role="tablist" aria-label="Bereiche">
          <span className="settings__lens" aria-hidden="true" />
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
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
        <div className="settings__panel" id="settings-panel" role="tabpanel" aria-labelledby={`settings-tab-${tab}`} key={tab} data-dir={dir}>
          <header className="settings__intro">
            <h2 className="settings__title">{TABS[tabIndex(tab)]?.label}</h2>
            <p className="settings__lead">{TABS[tabIndex(tab)]?.lead}</p>
          </header>
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
        {desktop && <QuickCaptureSection value={s.quickCapture} onChange={(quickCapture) => set({ quickCapture })} />}
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
          <p className="muted small">{avatarName(s.companion.avatar)} zeigt dir in einer Minute, wo alles ist, und erzählt dir im Begleiter-Reiter, wie ihr zusammen wachst.</p>
          <div className="row">
            <button
              type="button"
              className="btn btn--small"
              onClick={() => {
                set({ tourDone: false });
                onClose();
              }}
            >
              Rundgang mit {avatarName(s.companion.avatar)} starten
            </button>
            <button
              type="button"
              className="btn btn--small"
              onClick={() => {
                set({ companionIntroSeen: false });
                onShowCompanion?.();
                onClose();
              }}
            >
              Begleiter-Intro erneut zeigen
            </button>
          </div>
        </section>
        <section className="feedback-sec" aria-labelledby="settings-contact">
          <h3 id="settings-contact">Feedback & Kontakt</h3>
          <p className="muted small">Was fühlt sich gut an, was hakt noch, wo kommst du nicht weiter? Zwei Minuten, ganz formlos. Jede Nachricht macht ToDoMe. ruhiger und besser.</p>
          <div className="row">
            <button type="button" className="btn btn--small feedback-link" onClick={() => setContactOpen(true)} aria-haspopup="dialog">
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
            <button type="button" className="btn btn--small" onClick={() => companionHello(services)} disabled={!s.companion.enabled}>
              Jetzt vorbeischauen lassen
            </button>
          </div>
        </section>
              <CompanionFxSection />
            </>
          )}
          {tab === 'design' && (
            <>
        <section>
          <h3>Navigation</h3>
          <p className="muted small">Die schwebende Leiste mit allen Bereichen. Sie zeigt nur Symbole; die Namen erscheinen, wenn du darüber fährst.</p>
          <div className="docks" role="radiogroup" aria-label="Position der Navigation">
            {DOCKS.map((d) => (
              <button
                key={d.id}
                type="button"
                role="radio"
                aria-checked={s.appearance.dock === d.id}
                className={`option dock-opt${s.appearance.dock === d.id ? ' is-on' : ''}`}
                onClick={() => set({ appearance: { ...s.appearance, dock: d.id } })}
              >
                <span className={`dock-opt__preview dock-opt__preview--${d.id}`} aria-hidden="true">
                  <i />
                </span>
                <strong>{d.label}</strong>
                <span>{d.text}</span>
              </button>
            ))}
          </div>
        </section>
        <section>
          <h3>Ambient Light</h3>
          <p className="muted small">Die Flächen bleiben dunkel. Hinter deinen Modulen liegt ein leises Licht, ganz nach deiner Stimmung.</p>
          <p className="settings__label">Lichtfarbe</p>
          <div className="palettes" role="radiogroup" aria-label="Lichtfarbe">
            {LIGHTS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={s.appearance.palette === p.id}
                aria-disabled={isProPalette(p.id, themes) || undefined}
                className={`palette${s.appearance.palette === p.id ? ' is-on' : ''}${isProPalette(p.id, themes) ? ' is-pro' : ''}`}
                onClick={() => {
                  if (isProPalette(p.id, themes)) return openPro('palettes');
                  set({ appearance: { ...s.appearance, palette: p.id } });
                }}
              >
                <span className="palette__frame" aria-hidden="true">
                  <span className="palette__swatch" style={{ '--swatch': p.color } as React.CSSProperties} />
                  {isProPalette(p.id, themes) && (
                    <span className="pro-blur__lock">
                      <IconLock size={13} />
                    </span>
                  )}
                </span>
                <span>{p.label}</span>
                {isProPalette(p.id, themes) && <ProLock />}
              </button>
            ))}
          </div>
          <AmbientField value={s.appearance.ambient} onCommit={(ambient) => set({ appearance: { ...services.store.getState().settings.appearance, ambient } })} />
          <p className="settings__label">Ecken</p>
          <div className="corners" role="radiogroup" aria-label="Ecken">
            {CORNERS.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={s.appearance.corners === c.id}
                className={`corner-opt${s.appearance.corners === c.id ? ' is-on' : ''}`}
                data-corners-preview={c.id}
                onClick={() => set({ appearance: { ...s.appearance, corners: c.id } })}
              >
                <strong>{c.label}</strong>
                <span className="muted small">{c.text}</span>
              </button>
            ))}
          </div>
          <TimelineStyleField />
          <AmbiencePicker label="Atmosphäre im Hintergrund" />
          <small className="hint">
            „Wie draußen“ folgt deinem Wetter: Regen tropft, Wolken ziehen, Schnee fällt. Ganz leise im Hintergrund. Den Klang dazu stellst du unter Audio ein.{' '}
            <button type="button" className="link-btn" onClick={() => goTo('media')}>
              Zum Klang
            </button>
          </small>
        </section>
              <MoodSection />
              <StandbySection />
            </>
          )}
          {tab === 'overlay' && <OverlaySection />}
          {tab === 'media' && (
            <>
              <AmbienceSoundSection onShowDesign={() => goTo('design')} />
              <section>
                <h3>Sanfte Interaktions-Klänge</h3>
                <label className="check">
                  <input type="checkbox" checked={s.uiSounds} onChange={(e) => set({ uiSounds: e.target.checked })} />
                  <span>Ein warmes Aufblühen bei „Ankommen“ und „{labels.dayEnd}“, ein tiefer binauraler Ton beim Start eines Blocks und ein leiser 432-Hz-Ton beim Durchatmen</span>
                </label>
                <p className="muted small">Alles wird live erzeugt, ganz leise und weich. Binaurale Töne wirken am schönsten mit Kopfhörern.</p>
                <div className="row">
                  <button type="button" className="btn btn--small" onClick={() => bloom()} disabled={!s.uiSounds}>
                    Aufblühen anhören
                  </button>
                  <button type="button" className="btn btn--small" onClick={() => focusTone()} disabled={!s.uiSounds}>
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
          {pendingImport && (
            <div className="recovery__confirm" role="group" aria-label="Einspielen bestätigen">
              <p>
                <strong>{pendingImport.from}</strong>
                <br />
                {describeState(pendingImport.state)}. Dieser Stand ersetzt alle aktuellen Daten
                {vaultSupported() ? ', dein jetziger Stand kommt vorher in die Sicherungen.' : '.'}
              </p>
              <div className="row">
                <button type="button" className="btn btn--small btn--primary" onClick={confirmImport}>
                  Einspielen
                </button>
                <button type="button" className="btn btn--small btn--quiet" onClick={() => setPendingImport(null)}>
                  Abbrechen
                </button>
              </div>
            </div>
          )}
        </section>
        {vaultSupported() && services.mode === 'live' && (
          <section>
            <h3>Automatische Sicherungen</h3>
            <p className="muted small">
              ToDoMe. sichert deine Daten jeden Tag, vor jedem Update und bevor Daten ersetzt werden. Die letzten 14 Tage bleiben erhalten, nur auf diesem
              Gerät.
            </p>
            <div className="row">
              <button type="button" className="btn btn--small" onClick={() => setVaultOpen((v) => !v)} aria-expanded={vaultOpen}>
                {vaultOpen ? 'Sicherungen ausblenden' : 'Frühere Sicherung laden'}
              </button>
              <button type="button" className="btn btn--small btn--quiet" onClick={() => void desktop?.vaultOpen()}>
                Ordner öffnen
              </button>
            </div>
            {vaultOpen && <VaultPicker onPick={(state, from) => setPendingImport({ state, from })} onProblem={services.announce} />}
          </section>
        )}
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
  const [autostart, setAutostart] = useState<AutostartStatus | null>(null);
  const [busy, setBusy] = useState(false);
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
      <label className="switch-row">
        <span className="switch-row__text">
          <strong>Mit Windows starten</strong>
          <span className="muted small">
            {autostart && !autostart.supported
              ? 'Nur in der installierten App.'
              : autostart?.blocked
                ? 'In Windows ausgeschaltet. Unter Task-Manager › Autostart-Apps kannst du ToDoMe wieder einschalten.'
                : 'Startet leise im Infobereich, ohne Fenster. Dein Tag ist da, wenn du ihn brauchst.'}
          </span>
        </span>
        <input
          type="checkbox"
          role="switch"
          className="switch"
          checked={autostart?.enabled ?? false}
          aria-checked={autostart?.enabled ?? false}
          disabled={!autostart?.supported || busy}
          onChange={async (e) => {
            const next = e.target.checked;
            setBusy(true);
            try {
              setAutostart(await desktop!.setAutostart(next));
            } catch {
              services.announce('Autostart konnte nicht geändert werden.');
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      <p className="muted small">
        Das Fenster zu schließen beendet ToDoMe nicht: Sessions und Nachfragen laufen im Infobereich neben der Uhr weiter. Beenden über
        Rechtsklick auf das Symbol.{version && ` Version ${version}.`}
      </p>
    </section>
  );
}

/** Two-step confirmation inside the page (no blocking browser dialogs). */
/** Global shortcut for quick capture; says plainly when another program owns it. */
function QuickCaptureSection({ value, onChange }: { value: QuickCaptureKey; onChange: (key: QuickCaptureKey) => void }) {
  const active = useQuickStatus();
  return (
    <section>
      <h3>Schnellerfassung</h3>
      <p className="muted small">
        Ein Tastenkürzel öffnet überall ein kleines Eingabefeld, auch wenn ToDoMe. im Infobereich liegt. Am Ende der Zeile kannst du ergänzen: 45m, !hoch, @Kunde,
        morgen.
      </p>
      <div className="field">
        <span>Tastenkürzel</span>
        <Select value={value} onChange={(v) => onChange(v as QuickCaptureKey)} aria-label="Tastenkürzel für die Schnellerfassung">
          {(Object.keys(QUICK_KEY_LABELS) as QuickCaptureKey[]).map((k) => (
            <option key={k} value={k}>
              {QUICK_KEY_LABELS[k]}
            </option>
          ))}
        </Select>
      </div>
      {value !== 'off' && active === false && <p className="small">Dieses Kürzel ist schon von einem anderen Programm belegt. Wähle bitte ein anderes.</p>}
    </section>
  );
}

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
      <span className="small">{demo
          ? 'Demo-Daten zurücksetzen?'
          : vaultSupported()
            ? 'Alle Daten auf diesem Gerät löschen? Eine Kopie bleibt in den automatischen Sicherungen.'
            : 'Alle Daten auf diesem Gerät löschen? Das lässt sich nicht rückgängig machen.'}</span>
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

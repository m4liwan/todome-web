import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActiveSession } from '../components/ActiveSession';
import { Ambience, resolveAmbience } from '../components/Ambience';
import { ClosingView } from '../components/ClosingView';
import { CompanionHub } from '../components/CompanionHub';
import { useLegendaryShell } from '../components/AvatarFx';
import { CompanionCard } from '../components/CompanionCard';
import { InlineCompanion } from '../components/CompanionHost';
import { DayPlan } from '../components/DayPlan';
import { Greeting } from '../components/Greeting';
import { PromptCenter } from '../components/PromptCenter';
import { ReportPanel, TodayTimesCard } from '../components/ReportPanel';
import { FlowSlider } from '../components/FlowSlider';
import { CompanionHome, DailyImpulse, MicroRoutines, RoutineTimer, ThoughtParking, WeekTeaser, type Routine } from '../components/HomeExtras';
import { Onboarding } from '../components/Onboarding';
import { StorageNotice } from '../components/StorageNotice';
import { FirstTasks } from '../components/FirstTasks';
import { CompanionTour } from '../components/CompanionTour';
import { Garland, isWinterActive } from '../components/Winter';
import { Splash } from '../components/Splash';
import { Standby } from '../components/Standby';
import { Breathe } from '../components/Breathe';
import { Timeline } from '../components/Timeline';
import { Toasts } from '../components/Toasts';
import { Topbar, type View } from '../components/Topbar';
import { WeatherCard } from '../components/WeatherCard';
import { WeekView } from '../components/WeekView';
import { WorkspaceHome } from '../components/Workspace';
import { CalmStats } from '../components/CalmStats';
import { EnergyDialog } from '../components/dialogs/EnergyDialog';
import { InterruptDialog } from '../components/dialogs/InterruptDialog';
import { WeatherDialog } from '../components/dialogs/WeatherDialog';
import { PauseDialog } from '../components/dialogs/PauseDialog';
import { ReEntryDialog } from '../components/dialogs/ReEntryDialog';
import { CorrectTimeDialog, EndCheckDialog, ReEstimateDialog, SharpenDodDialog } from '../components/dialogs/SessionDialogs';
import { SettingsDialog } from '../components/dialogs/SettingsDialog';
import { StartDialog } from '../components/dialogs/StartDialog';
import { StuckDialog } from '../components/dialogs/StuckDialog';
import { TaskDialog } from '../components/dialogs/TaskDialog';
import { ProDialog } from '../components/dialogs/ProDialog';
import { openCheckIns } from '../domain/checkinEngine';
import { dayKey, MIN } from '../lib/time';
import { useCompanion } from './companion';
import { useDocumentTitle, useIdleDetection, usePowerEvents, useProjections, useScheduler } from './hooks';
import type { Modal } from './modal';
import { useOverlaySync } from './overlay';
import { useServices } from './services';
import { useAmbienceSound } from './sound';
import { uiSound } from './uiSound';
import { useApplyTheme, useResolvedTheme } from './theme';
import { useWeatherSync } from './weather';
import { useUpdateNotice } from './updates';
import { trackEvent } from '../services/telemetry';

const SPLASH_KEY = 'todome:splash-shown';
const STANDBY_AFTER_MS = 15 * MIN;

function splashAlreadyShown(): boolean {
  try {
    return window.sessionStorage.getItem(SPLASH_KEY) === '1';
  } catch {
    return false;
  }
}

/** Soft light that follows the pointer across glass cards. */
function useSpotlight() {
  useEffect(() => {
    let frame = 0;
    let last: PointerEvent | null = null;
    const apply = () => {
      frame = 0;
      const e = last;
      if (!e) return;
      const el = (e.target as Element | null)?.closest?.('.card, .focus, .segnav') as HTMLElement | null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${e.clientX - r.left}px`);
      el.style.setProperty('--my', `${e.clientY - r.top}px`);
    };
    const onMove = (e: PointerEvent) => {
      last = e;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(frame);
    };
  }, []);
}

/** True after a stretch without any input (real time, also in the demo). */
/**
 * A React key that is new for every opening (and every variant, such as a
 * settings tab) but stays the same while the thing closes, so it can fade out.
 */
function useOpeningKey(base: string, open: boolean, variant: string | null): string {
  const [seen, setSeen] = useState<{ open: boolean; n: number; variant: string | null }>({ open: false, n: 0, variant: null });
  if (open && (!seen.open || variant !== seen.variant)) setSeen({ open: true, n: seen.n + 1, variant });
  else if (!open && seen.open) setSeen({ ...seen, open: false });
  return `${base}-${seen.n}`;
}

function useInactivity(enabled: boolean, afterMs: number): [boolean, () => void] {
  const [idle, setIdle] = useState(false);
  const lastInput = useRef(Date.now());
  useEffect(() => {
    const mark = () => {
      lastInput.current = Date.now();
    };
    const events = ['pointerdown', 'keydown', 'wheel', 'pointermove'] as const;
    events.forEach((ev) => window.addEventListener(ev, mark, { passive: true }));
    return () => events.forEach((ev) => window.removeEventListener(ev, mark));
  }, []);
  useEffect(() => {
    if (!enabled) return;
    lastInput.current = Math.max(lastInput.current, Date.now() - afterMs / 2);
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible' && Date.now() - lastInput.current >= afterMs) setIdle(true);
    }, 15_000);
    return () => window.clearInterval(id);
  }, [enabled, afterMs]);
  const wake = useCallback(() => {
    lastInput.current = Date.now();
    setIdle(false);
  }, []);
  return [idle && enabled, wake];
}

export function App() {
  const services = useServices();
  const [modal, setModalRaw] = useState<Modal | null>(null);
  const [view, setView] = useState<View>('today');
  const [planOpen, setPlanOpen] = useState(false);
  // Every launch (the very first one too) begins on the warm welcome; the setup follows after it.
  const [splash, setSplash] = useState<'launch' | 'manual' | null>(() => (splashAlreadyShown() ? null : 'launch'));
  const [restNow, setRestNow] = useState(false);
  // "Durchatmen": the emergency calm, above everything.
  const [breathe, setBreathe] = useState(false);
  const [routine, setRoutine] = useState<Routine | null>(null);
  const energyAsked = useRef(false);

  // The day's close is a calm screen of its own, not a dialog.
  const setModal = useCallback((m: Modal | null) => {
    if (m?.kind === 'shutdown') {
      setView('closing');
      setModalRaw(null);
      return;
    }
    setModalRaw(m);
  }, []);
  const close = useCallback(() => setModalRaw(null), []);
  const endSplash = useCallback(() => {
    setSplash(null);
    try {
      window.sessionStorage.setItem(SPLASH_KEY, '1');
    } catch {
      /* ignore */
    }
  }, []);

  useScheduler();
  useIdleDetection();
  usePowerEvents();
  useWeatherSync();
  useUpdateNotice();
  useCompanion(setModal);
  useSpotlight();

  const { state, now, projections, foreground } = useProjections();
  useApplyTheme(state.settings.theme, state.settings.appearance.palette);
  const theme = useResolvedTheme(state.settings.theme);
  useOverlaySync(state, now, foreground, theme);
  const appearance = state.settings.appearance;
  useAmbienceSound(resolveAmbience(appearance.ambience, state.weather), appearance.sound, appearance.soundVolume);
  const layout = state.settings.appearance.layout;
  useEffect(() => {
    document.documentElement.setAttribute('data-layout', layout);
  }, [layout]);

  const open = useMemo(() => openCheckIns(Object.values(state.checkIns)), [state.checkIns]);
  const fgTask = foreground ? state.tasks[foreground.taskId] : undefined;
  useDocumentTitle(foreground, fgTask?.title ?? null, open.length);

  const onboarding = !splash && !state.settings.onboarded;
  // Soft landing: the onboarding fades out while the home fades in underneath.
  const [landing, setLanding] = useState(false);
  const landingRef = useRef(false);
  const startLanding = useCallback(() => {
    landingRef.current = true;
    setLanding(true);
  }, []);
  const endLanding = useCallback(() => {
    // Called by the fade's end and by its safety timer: the second call is a no-op.
    if (!landingRef.current) return;
    landingRef.current = false;
    setLanding(false);
    // First the companion tour, then, as its last step, "Kopf aufräumen" (the first tasks).
    // Tour already seen (setup repeated): straight to the first tasks.
    if (services.store.getState().settings.tourDone) setModalRaw({ kind: 'first_tasks' });
    else setBridgeNext(true);
  }, [services]);
  /** The first-task bridge waits for the end of the tour. */
  const [bridgeNext, setBridgeNext] = useState(false);
  const endBridge = useCallback(() => setModalRaw(null), []);
  // After the first start (and once after updating), the companion shows the place.
  const [tour, setTour] = useState(false);
  const today = dayKey(now);

  // Once a day, after the welcome: how much energy is in the tank?
  useEffect(() => {
    if (splash || onboarding || landing || tour || energyAsked.current || modal) return;
    if (state.wellbeing.energyDay === today) return;
    energyAsked.current = true;
    const id = window.setTimeout(() => setModalRaw((m) => m ?? { kind: 'energy' }), 500);
    return () => window.clearTimeout(id);
  }, [splash, onboarding, landing, tour, modal, state.wellbeing.energyDay, today]);

  const [idleRest, wake] = useInactivity(view === 'today' && !foreground && !modal && !splash && !onboarding && !routine && !tour && !breathe, STANDBY_AFTER_MS);
  const standby = restNow || idleRest;

  useEffect(() => {
    if (tour || breathe || state.settings.tourDone || splash || onboarding || landing || modal || standby || routine || view !== 'today') return;
    const id = window.setTimeout(() => setTour(true), 900);
    return () => window.clearTimeout(id);
  }, [tour, breathe, state.settings.tourDone, splash, onboarding, landing, modal, standby, routine, view]);
  const endBreathe = useCallback(
    (better: boolean) => {
      setBreathe(false);
      const day = dayKey(services.clock.now());
      const w = services.store.getState().wellbeing;
      services.store.dispatch({ type: 'wellbeing/mark', patch: { breathLog: { ...w.breathLog, [day]: (w.breathLog[day] ?? 0) + 1 } } });
      services.announce(better ? 'Schön. Weiter in deinem Tempo.' : 'Alles gut. Du kannst jederzeit wieder durchatmen.');
    },
    [services],
  );
  const endTour = useCallback(() => {
    trackEvent('tour_finished');
    setTour(false);
    services.store.dispatch({ type: 'settings/update', patch: { tourDone: true } });
    // After the very first tour (finished or skipped): "Kopf aufräumen".
    if (bridgeNext) {
      setBridgeNext(false);
      setModalRaw({ kind: 'first_tasks' });
    }
  }, [services, bridgeNext]);
  // Short lock after waking, so the same key press can never reopen it.
  const restLock = useRef(0);
  const wakeUp = useCallback(() => {
    restLock.current = Date.now() + 1500;
    setRestNow(false);
    wake();
  }, [wake]);
  const startRest = useCallback(() => {
    if (Date.now() < restLock.current) return;
    setRestNow(true);
  }, []);

  // Space toggles the rest screen (only where Space has no other job).
  const restKeys = useRef({ standby, blocked: false, wakeUp, startRest });
  restKeys.current = { standby, blocked: view !== 'today' || Boolean(modal) || Boolean(splash) || onboarding || Boolean(routine) || tour || breathe, wakeUp, startRest };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const r = restKeys.current;
      if (e.repeat) return;
      if (r.standby && (e.key === 'Enter' || e.key === 'Escape')) {
        e.preventDefault();
        (document.activeElement as HTMLElement | null)?.blur?.();
        r.wakeUp();
        return;
      }
      if (e.key !== ' ') return;
      if (r.standby) {
        e.preventDefault();
        // Nothing behind the rest screen may react to this key (e.g. on key up).
        (document.activeElement as HTMLElement | null)?.blur?.();
        r.wakeUp();
        return;
      }
      if (document.activeElement && document.activeElement !== document.body) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('input, textarea, select, button, a, [role="button"], [role="option"], [role="combobox"], [contenteditable="true"], dialog')) return;
      if (r.blocked) return;
      e.preventDefault();
      r.startRest();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const showPlan = useCallback(() => {
    setPlanOpen(true);
    window.setTimeout(() => document.getElementById('plan')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);
  }, []);

  const endRoutine = useCallback(
    (completed: boolean) => {
      if (completed && routine) {
        const day = dayKey(services.clock.now());
        if (!(services.store.getState().wellbeing.routines[day] ?? []).includes(routine.id)) services.store.dispatch({ type: 'routine/toggle', day, id: routine.id });
        services.announce('Schön, dass du dir das gegönnt hast.');
      }
      setRoutine(null);
    },
    [routine, services],
  );

  // Second shift: Feierabend was made, but there is a little more to do. The
  // day opens again; everything already done today stays counted.
  const resumeFocus = useCallback(() => {
    const day = dayKey(services.clock.now());
    services.store.dispatch({ type: 'coach/reopenDay', day });
    setView('today');
    services.announce('Zweite Schicht. Alles von heute bleibt gezählt. Nimm dir nur, was sich noch leicht anfühlt.');
  }, [services]);

  // A deep, soft binaural tone whenever a new block starts (any way it starts).
  const lastRunning = useRef<string | null | undefined>(undefined);
  const runningId = foreground?.status === 'running' ? foreground.sessionId : null;
  useEffect(() => {
    const prev = lastRunning.current;
    lastRunning.current = runningId;
    if (prev === undefined || !runningId || runningId === prev) return;
    // Resuming a paused block is not a new start.
    const started = foreground?.startedAt ?? 0;
    if (services.clock.now() - started < 60_000 * services.clock.speed) uiSound(services.store.getState(), 'focus');
  // `foreground` is read for its start time only; the id decides.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runningId, services]);

  const m = modal;
  const settingsKey = useOpeningKey('settings', m?.kind === 'settings', m?.kind === 'settings' ? m.tab ?? 'general' : null);
  const focusing = view === 'today' && foreground?.status === 'running';
  // Focus style while a block runs: breathe / tunnel / cocoon / micro.
  const focusStyle = focusing ? state.settings.appearance.focusStyle : null;
  const winter = isWinterActive(state.settings.appearance.xmas, now);
  // Level 50: the companion's shimmer touches the app (badge, header line), if the user wants it.
  const legendary = useLegendaryShell(state.progression.stats.level, state.settings.appearance.companionFx);
  // Flow shows one calm stage: no vertical scrolling there.
  useEffect(() => {
    const lock = view === 'today' && layout === 'flow';
    document.documentElement.classList.toggle('flow-lock', lock);
    return () => document.documentElement.classList.remove('flow-lock');
  }, [view, layout]);

  // Every home panel once; the layout decides where they sit.
  const p: Record<string, ReactNode> = {
    greet: (
      <Greeting
        state={state}
        projections={projections}
        now={now}
        onOpen={setModal}
        onLogin={() => setSplash('manual')}
        onStandby={() => {
          // Let the click itself pass before the rest screen starts listening.
          window.setTimeout(() => setRestNow(true), 250);
        }}
        onBreathe={() => setBreathe(true)}
      />
    ),
    tl: <Timeline state={state} projections={projections} now={now} />,
    focus: <ActiveSession state={state} projections={projections} foreground={foreground} now={now} onOpen={setModal} onShowPlan={showPlan} onBreathe={() => setBreathe(true)} />,
    hub: <CompanionHome state={state} now={now} fgTaskId={foreground?.taskId ?? null} onCustomize={() => setModal({ kind: 'settings', tab: 'companion' })} />,
    plan: (
      <DayPlan state={state} projections={projections} foreground={foreground} now={now} onOpen={setModal} expanded={planOpen} onToggle={() => setPlanOpen((o) => !o)} />
    ),
    weather: <WeatherCard state={state} now={now} onOpen={setModal} />,
    water: <CompanionCard state={state} projections={projections} now={now} onOpen={setModal} />,
    times: <TodayTimesCard state={state} projections={projections} now={now} onMore={() => setView('times')} />,
    impulse: <DailyImpulse state={state} now={now} />,
    thoughts: <ThoughtParking state={state} now={now} />,
    routines: <MicroRoutines state={state} now={now} onStart={setRoutine} />,
    week: <WeekTeaser state={state} projections={projections} now={now} onOpen={() => setView('times')} />,
  };
  const order =
    layout === 'hub'
      ? ['greet', 'focus', 'hub', 'plan', 'water', 'tl', 'weather', 'impulse', 'times', 'thoughts', 'week', 'routines']
      : layout === 'sanctuary'
        ? ['greet', 'weather', 'focus', 'plan', 'water', 'times', 'routines', 'tl', 'impulse', 'week', 'thoughts']
        : ['greet', 'focus', 'plan', 'impulse', 'tl', 'weather', 'water', 'times', 'thoughts', 'routines', 'week'];
  const panel = (id: string) => (
    <div key={id} className={`panel panel--${id}`}>
      {p[id]}
    </div>
  );

  return (
    <div className={`shell shell--${view} shell--${layout}${focusing ? ' is-focusing' : ''}${focusStyle ? ` fs-${focusStyle}` : ''}${state.settings.oneStep ? ' is-one-step' : ''}${winter ? ' is-winter' : ''}${state.settings.onboarded ? '' : ' is-covered'}${landing ? ' is-landing' : ''}${legendary}`}>
      <div className="ambient" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="gridlines" aria-hidden="true" />
      <Ambience kind={state.settings.appearance.ambience} weather={state.weather} dark={theme === 'dark'} />
      {winter && state.settings.appearance.ambience !== 'snow' && <Ambience kind="snow" weather={null} dark={theme === 'dark'} />}
      {winter && <Garland />}
      <a className="skip-link" href="#main">
        Zum Inhalt springen
      </a>
      <Topbar state={state} view={view} onView={setView} onOpen={setModal} onResume={resumeFocus} />

      <div className="app">
        <main id="main" className={`dash dash--${view}`}>
          {view === 'today' &&
            (layout === 'flow' ? (
              <div className="home home--flow" key="flow">
                {panel('greet')}
                <FlowSlider
                  slides={[
                    { id: 'now', label: 'Jetzt', content: <>{panel('focus')}</> },
                    { id: 'day', label: 'Dein Tag', content: <>{panel('tl')}{panel('plan')}</> },
                    { id: 'care', label: 'Für dich', content: <>{panel('water')}{panel('weather')}{panel('impulse')}</> },
                    { id: 'mind', label: 'Kopf frei', content: <>{panel('thoughts')}{panel('routines')}</> },
                    { id: 'look', label: 'Rückblick', content: <>{panel('times')}{panel('week')}</> },
                  ]}
                />
              </div>
            ) : (
              <WorkspaceHome layout={layout} settings={state.settings} standard={order} panels={p} enabled={!focusing && !tour && !modal} />
            ))}
          {view === 'times' && (
            <div className="view-fade" key="times">
              <WeekView state={state} projections={projections} now={now} />
              <CalmStats state={state} projections={projections} now={now} />
              <ReportPanel state={state} projections={projections} now={now} />
            </div>
          )}
          {view === 'companion' && (
            <div className="view-fade" key="companion">
              <CompanionHub state={state} now={now} />
            </div>
          )}
          {view === 'closing' && (
            <div className="view-fade" key="closing">
              <ClosingView state={state} projections={projections} foreground={foreground} now={now} onOpen={setModal} onBack={() => setView('today')} />
            </div>
          )}
        </main>
      </div>

      {/* Prompts wait until the setup, its soft landing and the first-task bridge are over. */}
      {!onboarding && !landing && m?.kind !== 'first_tasks' && (
        <>
          <PromptCenter state={state} now={now} openPrompts={open} onOpen={setModal} />
          <InlineCompanion onOpen={setModal} />
        </>
      )}
      <Toasts />
      <StorageNotice />

      <StartDialog modal={m?.kind === 'start' ? m : null} onClose={close} />
      <TaskDialog modal={m?.kind === 'task' ? m : null} onClose={close} />
      <PauseDialog modal={m?.kind === 'pause' ? m : null} onClose={close} />
      <InterruptDialog modal={m?.kind === 'interrupt' ? m : null} onClose={close} />
      <ReEntryDialog modal={m?.kind === 'reentry' ? m : null} onClose={close} />
      <StuckDialog modal={m?.kind === 'stuck' ? m : null} onClose={close} onOpen={setModal} />
      <EndCheckDialog modal={m?.kind === 'end_check' ? m : null} onClose={close} onOpen={setModal} />
      <ReEstimateDialog modal={m?.kind === 're_estimate' ? m : null} onClose={close} />
      <CorrectTimeDialog modal={m?.kind === 'correct_time' ? m : null} onClose={close} />
      <SharpenDodDialog modal={m?.kind === 'sharpen_dod' ? m : null} onClose={close} onOpen={setModal} />
      <EnergyDialog open={m?.kind === 'energy'} onClose={close} />
      <FirstTasks open={m?.kind === 'first_tasks'} onDone={endBridge} />
      <WeatherDialog open={m?.kind === 'weather'} onClose={close} />
      <SettingsDialog
        // A fresh instance per opening (the right tab from the very first frame);
        // the key stays while closing, so the sheet can fade out softly.
        key={settingsKey}
        open={m?.kind === 'settings'}
        onClose={close}
        initialTab={m?.kind === 'settings' ? m.tab : undefined}
      />
      <ProDialog />

      {routine && <RoutineTimer routine={routine} onClose={endRoutine} />}
      {breathe && <Breathe avatar={state.settings.companion.avatar} sound={state.settings.uiSounds} onClose={endBreathe} />}
      {standby && <Standby state={state} now={now} onWake={wakeUp} />}
      {(onboarding || landing) && <Onboarding onLeave={startLanding} onDone={endLanding} />}
      {tour && (
        <CompanionTour
          avatar={state.settings.companion.avatar}
          userName={state.settings.userName}
          onOpenSettings={(tab) => setModal({ kind: 'settings', tab })}
          onCloseSettings={close}
          onDone={endTour}
          bridgeNext={bridgeNext}
        />
      )}
      {splash && <Splash state={state} now={now} onDone={endSplash} manual={splash === 'manual'} />}
    </div>
  );
}

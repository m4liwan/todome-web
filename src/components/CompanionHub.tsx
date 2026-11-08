import { useEffect, useState, type CSSProperties } from 'react';
import { hasPro } from '../app/pro';
import { avatarName } from '../domain/companion';
import {
  XP_RULES,
  effectTier,
  levelProgress,
  rewardPath,
  streakMultiplier,
  totalXpForLevel,
  visibleStreak,
  type EffectTier,
  type FeatureId,
  type PathStep,
  type Reward,
} from '../domain/companionProgression';
import type { AppState, Millis } from '../domain/types';
import { useEffectsMode } from '../lib/effects';
import { dayKey } from '../lib/time';
import { Avatar } from './Avatar';
import { AvatarFx, holoFor } from './AvatarFx';
import { IconCheck, IconFlame, IconLock, IconSnowflake } from './icons';

/**
 * "Begleiter": the companion, its level and the way ahead.
 * Hero (companion + level + XP bar), four calm numbers, the reward path.
 * Reads only; XP is paid in the reducer (domain/companionProgression).
 */

/** Rewards that already exist in the app. The others are earned now and arrive with an update. */
const AVAILABLE_FEATURES: ReadonlySet<FeatureId> = new Set<FeatureId>(['advanced_stats', 'exclusive_themes']);
const AVAILABLE_EFFECTS: ReadonlySet<EffectTier> = new Set<EffectTier>(['sparkle', 'aura', 'shiny']);

const nf = new Intl.NumberFormat('de-DE');

/** How the line from one milestone to the next looks: full of energy, filling up, or still asleep. */
export type StrandState = 'charged' | 'charging' | 'dormant';

export interface TrailStep {
  step: PathStep;
  /** 0 … 1: how far the XP have come from the previous milestone (or the start) to this one. */
  charge: number;
  /** The line down to the next milestone; null for the last one. */
  strand: { state: StrandState; fill: number } | null;
}

/**
 * The reward path as a progression trail. Charge is measured in XP between
 * milestones, so the line into the next milestone fills as XP come in.
 * A milestone reached through a kept unlock counts as full, whatever the XP.
 */
export function progressionTrail(path: readonly PathStep[], xp: number): TrailStep[] {
  const span = (from: number, to: number) => {
    const lo = totalXpForLevel(from);
    const hi = totalXpForLevel(to);
    return hi > lo ? Math.max(0, Math.min(1, (xp - lo) / (hi - lo))) : 1;
  };
  return path.map((step, i) => {
    const prev = path[i - 1];
    const next = path[i + 1];
    const charge = step.status === 'reached' ? 1 : span(prev?.level ?? 1, step.level);
    let strand: TrailStep['strand'] = null;
    if (next) {
      if (next.status === 'reached') strand = { state: 'charged', fill: 1 };
      else if (step.status === 'reached') strand = { state: 'charging', fill: span(step.level, next.level) };
      else strand = { state: 'dormant', fill: 0 };
    }
    return { step, charge, strand };
  });
}
const factor = (f: number) => `${String(f).replace('.', ',')}×`;

const TIER_LINE: Record<EffectTier, (name: string) => string> = {
  standard: (n) => `Jeder erledigte Schritt lässt ${n} ein Stück wachsen.`,
  sparkle: (n) => `${n} funkelt schon, wenn ihr etwas schafft.`,
  aura: (n) => `Um ${n} liegt inzwischen ein warmes Leuchten.`,
  shiny: (n) => `${n} schimmert legendär. Ihr seid ein eingespieltes Team.`,
};

export function CompanionHub({ state, now }: { state: AppState; now: Millis }) {
  const { stats, daily } = state.progression;
  const avatar = state.settings.companion.avatar;
  const name = avatarName(avatar);
  const today = dayKey(now);
  const progress = levelProgress(stats.xp);
  // The user's switch (appearance.companionFx): off, the hub tells the plain story.
  const fx = state.settings.appearance.companionFx;
  const tier: EffectTier = fx ? effectTier(progress.level) : 'standard';
  const streak = visibleStreak(stats, today);
  const path = rewardPath(stats);
  // The next milestone of the whole path (features and looks), not only features.
  const next = path.find((step) => step.status === 'next') ?? null;
  const todayXp = daily.day === today ? daily.taskXp + daily.subtaskXp : 0;
  const pro = hasPro();
  const trail = progressionTrail(path, stats.xp);
  // The energy pulses on the trail are an effect: only with effects on and nothing asking for calm.
  const live = useEffectsMode(fx) === 'full';

  return (
    <section className="companion-hub rise" aria-label={`Dein Begleiter ${name}`}>
      <div className={`companion-hub__hero card is-${tier}`}>
        <div className="companion-hub__stage" aria-hidden="true">
          <AvatarFx level={progress.level} enabled={fx}>
            <Avatar id={avatar} mood="happy" size={184} holo={holoFor(progress.level, fx)} />
          </AvatarFx>
        </div>
        <div className="companion-hub__intro">
          <h1 className="companion-hub__title">
            <span className="companion-hub__name">{name}</span>{' '}
            <span className="companion-hub__level">
              <span className="companion-hub__level-word">Level</span> <span className="companion-hub__level-num">{progress.level}</span>
            </span>
          </h1>
          <p className="companion-hub__line">{TIER_LINE[tier](name)}</p>
          <XpBar key={progress.level} level={progress.level} into={progress.xpIntoLevel} span={progress.xpForNext} ratio={progress.ratio} />
          <p className="companion-hub__next muted">
            {next ? (
              <>
                Bei Level {next.level} wartet: <strong>{next.rewards.map((r) => r.title).join(' und ')}</strong>
              </>
            ) : (
              'Alle Belohnungen gehören euch. Jedes Level von hier ist reine Freude.'
            )}
          </p>
        </div>
      </div>

      <ul className="companion-hub__stats card" aria-label="Eure Zahlen">
        <li className={streak > 0 ? 'is-lit' : ''}>
          <span className="companion-hub__stat-label">
            <IconFlame size={16} /> Serie
          </span>
          <strong className="companion-hub__stat-value">
            {streak} {streak === 1 ? 'Tag' : 'Tage'}
          </strong>
          <span className="companion-hub__stat-note">
            {streak > 0
              ? `${streakMultiplier(streak) > 1 ? `${factor(streakMultiplier(streak))} XP. ` : ''}Wochenenden zählen nie gegen dich.`
              : 'Startet mit deinem nächsten erledigten Schritt.'}
            {stats.maxStreak > streak && ` Bestwert ${stats.maxStreak}.`}
          </span>
        </li>
        <li>
          <span className="companion-hub__stat-label">Gesamte XP</span>
          <strong className="companion-hub__stat-value">{nf.format(stats.xp)}</strong>
          <span className="companion-hub__stat-note">
            Heute {todayXp} von {XP_RULES.dailyTaskCap + XP_RULES.dailySubtaskCap} möglichen XP.
          </span>
        </li>
        <li>
          <span className="companion-hub__stat-label">Erledigt</span>
          <strong className="companion-hub__stat-value">{nf.format(stats.tasksCompleted)}</strong>
          <span className="companion-hub__stat-note">
            {stats.subtasksCompleted > 0 ? `Aufgaben, dazu ${nf.format(stats.subtasksCompleted)} kleine Schritte.` : 'Aufgaben, seit dein Begleiter mitwächst.'}
          </span>
        </li>
        <li>
          <span className="companion-hub__stat-label">
            <IconSnowflake size={16} /> Streak-Freezes
          </span>
          <span className="companion-hub__freezes" role="img" aria-label={`${stats.streakFreezes} von ${XP_RULES.maxFreezes}`}>
            {Array.from({ length: XP_RULES.maxFreezes }, (_, i) => (
              <span key={i} className={i < stats.streakFreezes ? 'is-on' : ''} />
            ))}
          </span>
          <span className="companion-hub__stat-note">Halten deine Serie an einem freien Werktag. Alle {XP_RULES.freezeEvery} Tage kommt einer dazu.</span>
        </li>
      </ul>

      <section className="companion-hub__path card" aria-labelledby="reward-path-title">
        <header className="card__head">
          <div>
            <h2 id="reward-path-title">Euer Belohnungs-Pfad</h2>
            <p className="muted">Was du mit {name} gemeinsam freischaltest. Einmal erreicht, bleibt es für immer.</p>
          </div>
        </header>
        <ol className={`reward-path${live ? ' is-live' : ''}`}>
          {trail.map((t, i) => (
            <PathItem key={t.step.level} trail={t} index={i} pro={pro} fx={fx} />
          ))}
        </ol>
      </section>
    </section>
  );
}

/** Fills once from empty when the hub opens (and again after each level-up), then follows each gain. */
function XpBar({ level, into, span, ratio }: { level: number; into: number; span: number; ratio: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(ratio));
    return () => cancelAnimationFrame(id);
  }, [ratio]);
  return (
    <div className="xp-bar">
      <div
        className="xp-bar__track"
        role="progressbar"
        aria-label={`Fortschritt bis Level ${level + 1}`}
        aria-valuemin={0}
        aria-valuemax={span}
        aria-valuenow={into}
        aria-valuetext={`${into} von ${span} XP`}
      >
        <span className="xp-bar__fill" style={{ transform: `scaleX(${shown})` }} />
      </div>
      <p className="xp-bar__caption">
        <span>
          {nf.format(into)} von {nf.format(span)} XP
        </span>
        <span>Noch {nf.format(span - into)} bis Level {level + 1}</span>
      </p>
    </div>
  );
}

function rewardState(r: Reward, reached: boolean, pro: boolean, fx: boolean): string {
  const available = r.kind === 'feature' ? AVAILABLE_FEATURES.has(r.feature) : AVAILABLE_EFFECTS.has(r.tier);
  if (reached && !available) return 'Freigeschaltet, kommt mit einem der nächsten Updates';
  // Earned stays earned: a switched-off look only rests.
  if (reached) return r.kind === 'effect' && !fx ? 'Freigeschaltet, ruht gerade (Einstellungen › Begleiter)' : 'Freigeschaltet';
  if (pro && r.kind === 'feature' && available) return 'Mit Pro schon offen';
  return '';
}

function PathItem({ trail, index, pro, fx }: { trail: TrailStep; index: number; pro: boolean; fx: boolean }) {
  const { step, charge, strand } = trail;
  const reached = step.status === 'reached';
  return (
    <li
      className={`reward-path__step is-${step.status}`}
      aria-current={step.status === 'next' ? 'step' : undefined}
      style={{ '--charge': charge.toFixed(3), '--i': index } as CSSProperties}
    >
      <span className="reward-path__node" aria-hidden="true">
        {reached ? <IconCheck size={16} /> : step.status === 'next' ? step.level : <IconLock size={14} />}
      </span>
      {strand && (
        <span className={`reward-path__strand is-${strand.state}`} aria-hidden="true">
          {strand.state !== 'dormant' && <i className="reward-path__charge" style={{ '--fill': strand.fill.toFixed(3) } as CSSProperties} />}
          {strand.state === 'charged' && <i className="reward-path__pulse" />}
        </span>
      )}
      <div className="reward-path__body">
        <p className="reward-path__level">
          Level {step.level}
          {step.status === 'next' && <span className="reward-path__togo">noch {nf.format(step.xpToGo)} XP</span>}
        </p>
        <ul className="reward-path__rewards">
          {step.rewards.map((r) => {
            const note = rewardState(r, reached, pro, fx);
            return (
              <li key={r.title}>
                <strong>{r.title}</strong>
                <span className="muted">{r.text}</span>
                {note && <span className="reward-path__note">{note}</span>}
              </li>
            );
          })}
        </ul>
      </div>
    </li>
  );
}

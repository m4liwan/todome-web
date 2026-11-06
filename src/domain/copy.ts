import type { CheckInKind, Tone } from './types';
import { contextLabels, type UserContext } from './userContext';

/**
 * Persona copy (concept §4): short, always with an action, no blame,
 * numbers instead of adjectives. Every prompt exists in three tones.
 */

export type AnswerId =
  | 'ok'
  | 'stuck'
  | 'yes'
  | 'not_yet'
  | 'on_track'
  | 'extend_10'
  | 'extend_15'
  | 'extend_25'
  | 'finish'
  | 'defer'
  | 'cause_bigger'
  | 'cause_stuck'
  | 'cause_interrupted'
  | 'cause_perfection'
  | 'resume'
  | 'extend_pause'
  | 'working'
  | 'break'
  | 'distracted'
  | 'start_5'
  | 'later'
  | 'tomorrow'
  | 'take_break'
  | 'snooze'
  | 'wrap_up'
  | 'continue'
  | 'start_shutdown';

export interface PromptOption {
  id: AnswerId;
  label: string;
  primary?: boolean;
}

export interface PromptContent {
  title: string;
  body: string;
  options: PromptOption[];
  /** Short one-liner for system notifications (≤ 90 chars). */
  push: string;
}

export interface PromptVars {
  taskTitle: string;
  clientName: string | null;
  intention: string;
  overMin: number;
  overrunRatio: number;
  remainingMin: number;
  streakMin: number;
  idleMin: number;
  pauseMin: number;
  capHours: string;
  userName: string;
  /** ADHS profile: breaks are movement breaks. */
  movement?: boolean;
  /** Wording context (study, work, everyday); neutral when missing. */
  context?: UserContext;
}

type Variants = Record<Tone, string>;
const pick = (tone: Tone, v: Variants) => v[tone];

/** Threshold above which an overrun asks for the cause instead of offering more time. */
export const MAJOR_OVERRUN_RATIO = 0.3;

export function promptFor(kind: CheckInKind, tone: Tone, v: PromptVars): PromptContent {
  const task = v.clientName ? `${v.clientName}: ${v.taskTitle}` : v.taskTitle;
  switch (kind) {
    case 'first_step': {
      const body = pick(tone, {
        gentle: 'Ist der erste Satz schon da? Ein holpriger Anfang ist ein guter Anfang.',
        direct: 'Erster Satz da? Unperfekt ist perfekt für den Start.',
        sporty: 'Drei Minuten rum! Steht der erste Satz? Egal wie krumm.',
      });
      return {
        title: task,
        body,
        push: body,
        options: [
          { id: 'yes', label: 'Ja, läuft', primary: true },
          { id: 'not_yet', label: 'Noch nicht, hilf mir' },
        ],
      };
    }
    case 'pulse': {
      const body = pick(tone, {
        gentle: 'Kurzer Blick: Kommst du gut voran?',
        direct: 'Läuft’s?',
        sporty: 'Alles im Flow?',
      });
      return {
        title: task,
        body,
        push: `${body} · ${v.taskTitle}`,
        options: [
          { id: 'ok', label: 'Läuft', primary: true },
          { id: 'stuck', label: 'Hänge fest' },
        ],
      };
    }
    case 'milestone': {
      const body = pick(tone, {
        gentle: `Ein großes Stück ist geschafft, noch ${v.remainingMin} min. 80 % reichen völlig. Wie fühlt es sich an?`,
        direct: `Noch ${v.remainingMin} min für „${v.intention}“. 80 % sind schon ein Erfolg. Wie läuft's?`,
        sporty: `Endspurt: ${v.remainingMin} min. Gut genug schlägt perfekt!`,
      });
      return {
        title: task,
        body,
        push: body,
        options: [
          { id: 'on_track', label: 'Läuft gut', primary: true },
          { id: 'extend_15', label: '+15 min gönnen' },
          { id: 'stuck', label: 'Ich hänge fest' },
        ],
      };
    }
    case 'overrun': {
      if (v.overrunRatio >= MAJOR_OVERRUN_RATIO) {
        const body = pick(tone, {
          gentle: `Das braucht mehr Zeit als gedacht (+${v.overMin} min). Das ist völlig normal. Magst du sagen, woran es liegt?`,
          direct: `+${v.overMin} min länger als geplant, ganz normal. Größer als gedacht, oder hängst du fest?`,
          sporty: `+${v.overMin} min Nachspielzeit. Kein Problem. Was bremst gerade?`,
        });
        return {
          title: task,
          body,
          push: body,
          options: [
            { id: 'cause_bigger', label: 'Größer als gedacht', primary: true },
            { id: 'cause_stuck', label: 'Ich hänge fest' },
            { id: 'cause_interrupted', label: 'Wurde unterbrochen' },
            { id: 'cause_perfection', label: 'Will es perfekt machen' },
          ],
        };
      }
      const body = pick(tone, {
        gentle: `Du bist ${v.overMin} min länger dran als geplant, ganz okay. Magst du noch ein paar Minuten?`,
        direct: `${v.overMin} min länger als geplant, du bist gut drin. Noch etwas Zeit oder ein guter Moment für einen Schnitt?`,
        sporty: `Nachspielzeit! ${v.overMin} min drauf. Noch mal ran oder für heute abpfeifen?`,
      });
      return {
        title: task,
        body,
        push: body,
        options: [
          { id: 'extend_10', label: '+10 min', primary: true },
          { id: 'extend_25', label: '+25 min' },
          { id: 'finish', label: 'Gut so, abschließen' },
          { id: 'defer', label: 'Rest darf morgen' },
        ],
      };
    }
    case 'pause_over': {
      const body = pick(tone, {
        gentle: `${v.pauseMin} min sind um. Bereit für ${v.taskTitle}?`,
        direct: `Weiter mit ${v.taskTitle}?`,
        sporty: `Zurück aufs Feld: ${v.taskTitle}?`,
      });
      return {
        title: 'Pause vorbei',
        body,
        push: body,
        options: [
          { id: 'resume', label: 'Weiter', primary: true },
          { id: 'extend_pause', label: '+10 min Pause' },
        ],
      };
    }
    case 'idle': {
      const body = pick(tone, {
        gentle: `Du warst ${v.idleMin} min nicht am Rechner. Wie soll ich die Zeit buchen?`,
        direct: `${v.idleMin} min inaktiv. Noch dran gewesen oder kurz weg?`,
        sporty: `${v.idleMin} min Funkstille – Denkpause oder echte Pause?`,
      });
      return {
        title: task,
        body,
        push: body,
        options: [
          { id: 'working', label: 'Bin dran (Nachdenken)', primary: true },
          { id: 'break', label: 'Als Pause buchen' },
          { id: 'distracted', label: 'War abgelenkt' },
        ],
      };
    }
    case 'start_delay': {
      const body = pick(tone, {
        gentle: `„${v.taskTitle}“ wartet geduldig auf dich. Magst du einfach mal 5 Minuten reinschnuppern?`,
        direct: `„${v.taskTitle}“ wartet geduldig. Nur 5 Minuten anfangen?`,
        sporty: `„${v.taskTitle}“ wartet. 5 Minuten Warm-up?`,
      });
      return {
        title: 'Geplanter Start',
        body,
        push: body,
        options: [
          { id: 'start_5', label: '5 min reinschnuppern', primary: true },
          { id: 'later', label: 'Später heute' },
          { id: 'tomorrow', label: 'Heute nicht, okay' },
        ],
      };
    }
    case 'break_suggestion': {
      const body = v.movement
        ? `${v.streakMin} min Fokus. Zeit für eine Bewegungspause: aufstehen, strecken, ein paar Schritte. Fünf Minuten reichen.`
        : pick(tone, {
            gentle: `${v.streakMin} min Fokus am Stück – stark. Eine Viertelstunde ohne Bildschirm tut jetzt gut.`,
            direct: `${v.streakMin} min am Stück. 15 min ohne Bildschirm, dann geht’s leichter weiter.`,
            sporty: `${v.streakMin} min Vollgas. Boxenstopp: 15 min, dann weiter.`,
          });
      return {
        title: contextLabels(v.context).breakTitle,
        body,
        push: body,
        options: [
          { id: 'take_break', label: 'Pause starten', primary: true },
          { id: 'snooze', label: 'Noch 20 min' },
        ],
      };
    }
    case 'daily_cap': {
      const body = pick(tone, {
        gentle: `Du hast heute schon ${v.capHours} gegeben. Das ist richtig viel. Magst du langsam abschließen?`,
        direct: `${v.capHours} geschafft, dein Tageslimit. Zeit, auf dich zu achten. Abschluss einleiten?`,
        sporty: `${v.capHours} im Kasten. Was für ein Tag! Abpfiff?`,
      });
      return {
        title: 'Tageslimit erreicht',
        body,
        push: body,
        options: [
          { id: 'wrap_up', label: 'Abschluss einleiten', primary: true },
          { id: 'continue', label: 'Bewusst weiter' },
        ],
      };
    }
    case 'shutdown': {
      const body = pick(tone, {
        gentle: contextLabels(v.context).shutdownGentle,
        direct: contextLabels(v.context).shutdownDirect,
        sporty: 'Letzte Runde! Gleich feiern wir deinen Tag.',
      });
      return {
        title: 'Tagesabschluss',
        body,
        push: body,
        options: [
          { id: 'start_shutdown', label: 'Tag anschauen', primary: true },
          { id: 'later', label: 'In 15 min' },
        ],
      };
    }
  }
}

export const PAUSE_REASON_LABELS = {
  none: 'Ohne Grund',
  planned_break: 'Geplante Pause',
  client: 'Kunde / Anruf',
  private: 'Privat',
  distraction: 'Ablenkung',
  energy: 'Energie',
  meeting: 'Termin',
  tech: 'Technik',
} as const;

export const OUTCOME_LABELS = {
  achieved: 'Geschafft',
  partial: 'Ein gutes Stück',
  not_achieved: 'Weiter dran',
  unconfirmed: 'Offen',
} as const;

/**
 * What ToDoMe is used for: studying, working or everyday life. Only the words
 * change with it; timer, first tasks and task logic stay exactly the same.
 */
export type UserContext = 'study' | 'work' | 'allround';

/** Existing installations and anything unclear: the neutral everyday wording. */
export const DEFAULT_USER_CONTEXT: UserContext = 'allround';

export interface UserContextOption {
  id: UserContext;
  icon: string;
  label: string;
  description: string;
}

export const USER_CONTEXTS: UserContextOption[] = [
  { id: 'study', icon: '📚', label: 'Lernen & Studium', description: 'Vorlesungen, Prüfungen und Klausuren in deinem Tempo.' },
  { id: 'work', icon: '💼', label: 'Arbeiten & Business', description: 'Termine, Projekte und deine Arbeitszeit im Blick.' },
  { id: 'allround', icon: '🌿', label: 'Allround & Alltag', description: 'Entspannt planen, was dir im Alltag wichtig ist.' },
];

export function normalizeUserContext(value: unknown): UserContext {
  return value === 'study' || value === 'work' || value === 'allround' ? value : DEFAULT_USER_CONTEXT;
}

/** Every word that depends on the context, in one place. */
export interface ContextLabels {
  /** Business fields (hourly rate, rounding, billable, amounts) belong to this context. */
  business: boolean;
  /** What tasks belong to: "Kunde", "Fach", "Vorhaben". */
  client: string;
  clients: string;
  clientNew: string;
  clientAdd: string;
  noClient: string;
  clientsHint: string;
  perClient: string;
  forWhom: string;
  /** Stuck dialog: info is missing from someone. */
  infoMissing: string;
  askBack: string;
  /** Hand-over question when a block is wrapped up. */
  roundUp: string;
  /** Breaks ("Pause", "Lernpause"). */
  breakName: string;
  breakShort: string;
  breakTitle: string;
  /** Example for the very first thing (Kopf aufräumen). */
  firstTaskExample: string;
  /** The focus period of the day ("Arbeitszeit"). */
  focusTime: string;
  /** Plural, for hints ("Arbeitszeiten"). */
  focusTimes: string;
  /** Settings heading for the day frame ("Arbeitstag"). */
  dayFrame: string;
  /** Field label for the start of the day ("Arbeitsbeginn"). */
  dayStart: string;
  /** "Arbeitsbeginn um 08:00". */
  dayStartsAt: (time: string) => string;
  /** The end of the day as a noun and as the main button ("Feierabend"). */
  dayEnd: string;
  /** "bis Feierabend". */
  untilDayEnd: string;
  /** Timeline after the end ("Feierabendzeit erreicht"). */
  dayEndReached: string;
  /** Closing screen headline once done. */
  dayEndDone: string;
  /** Closing screen, once done: what lies behind you. */
  doneLead: (duration: string) => string;
  /** Closing screen button. */
  dayEndAction: string;
  /** Start dialog after the end ("Dein Arbeitstag ist eigentlich vorbei"). */
  dayOver: string;
  /** Onboarding question for the day frame. */
  hoursQuestion: string;
  /** "Der Feierabend liegt noch vor dem Arbeitsbeginn." */
  hoursMismatch: string;
  /** Evening weather ("Nach Feierabend"). */
  afterDayEnd: string;
  /** Weekly care part. */
  closedDays: string;
  /** Tour step about the main button. */
  tourText: string;
  /** Check-in 30 minutes before the end. */
  shutdownGentle: string;
  shutdownDirect: string;
}

const LABELS: Record<UserContext, ContextLabels> = {
  work: {
    business: true,
    client: 'Kunde',
    clients: 'Kunden',
    clientNew: 'Neuer Kunde',
    clientAdd: 'Kunde anlegen',
    noClient: 'Intern (kein Kunde)',
    clientsHint: 'Kunden legst du in den Einstellungen an.',
    perClient: 'Zeiten pro Kunde (Summen)',
    forWhom: 'Für wen du da warst',
    infoMissing: 'Info fehlt vom Kunden',
    askBack: 'Rückfrage an Kunden',
    roundUp: 'Was soll der Kunde sehen, damit es rund ist? Mehr braucht es nicht.',
    breakName: 'Pause',
    breakShort: 'Kurze Pause',
    breakTitle: 'Zeit für eine Pause',
    firstTaskExample: 'z. B. Angebot für Kunde A öffnen',
    focusTime: 'Arbeitszeit',
    focusTimes: 'Arbeitszeiten',
    dayFrame: 'Arbeitstag',
    dayStart: 'Arbeitsbeginn',
    dayStartsAt: (t) => `Arbeitsbeginn um ${t}`,
    dayEnd: 'Feierabend',
    untilDayEnd: 'bis Feierabend',
    dayEndReached: 'Feierabendzeit erreicht',
    dayEndDone: 'Feierabend. Gut gemacht.',
    doneLead: (d) => `${d} konzentrierte Arbeit liegen hinter dir. Jetzt gehört der Abend dir.`,
    dayEndAction: 'Feierabend machen',
    dayOver: 'Dein Arbeitstag ist eigentlich vorbei',
    hoursQuestion: 'Wann arbeitest du normalerweise? Danach richte ich deine Zeitlinie aus und erinnere dich sanft an den Feierabend.',
    hoursMismatch: 'Der Feierabend liegt noch vor dem Arbeitsbeginn. Magst du kurz nachsehen?',
    afterDayEnd: 'Nach Feierabend',
    closedDays: 'Bewusst Feierabend gemacht',
    tourText: 'Hier machst du bewusst Schluss für heute. Und falls doch noch etwas kommt: „Fokus wieder aufnehmen“, und alles von heute bleibt gezählt.',
    shutdownGentle: 'Der Feierabend rückt näher. Lass uns anschauen, was du heute alles geschafft hast.',
    shutdownDirect: 'Feierabend in 30 min. Schauen wir, was du heute geschafft hast?',
  },
  study: {
    business: false,
    client: 'Fach',
    clients: 'Fächer',
    clientNew: 'Neues Fach',
    clientAdd: 'Fach anlegen',
    noClient: 'Kein Fach',
    clientsHint: 'Fächer legst du in den Einstellungen an.',
    perClient: 'Zeiten pro Fach (Summen)',
    forWhom: 'Wofür du gelernt hast',
    infoMissing: 'Info fehlt noch',
    askBack: 'Rückfrage',
    roundUp: 'Was brauchst du, damit es für dich rund ist? Mehr braucht es nicht.',
    breakName: 'Lernpause',
    breakShort: 'Kurze Lernpause',
    breakTitle: 'Zeit für eine Lernpause',
    firstTaskExample: 'z. B. Kapitel 3 für die Klausur lesen',
    focusTime: 'Lern-Phase',
    focusTimes: 'Lernzeiten',
    dayFrame: 'Lerntag',
    dayStart: 'Lernbeginn',
    dayStartsAt: (t) => `Lernbeginn um ${t}`,
    dayEnd: 'Tagesabschluss',
    untilDayEnd: 'bis zum Tagesabschluss',
    dayEndReached: 'Zeit für den Tagesabschluss',
    dayEndDone: 'Tagesabschluss. Gut gelernt.',
    doneLead: (d) => `${d} konzentriertes Lernen liegen hinter dir. Jetzt gehört der Abend dir.`,
    dayEndAction: 'Tag abschließen',
    dayOver: 'Dein Lerntag ist eigentlich vorbei',
    hoursQuestion: 'Wann lernst du normalerweise? Danach richte ich deine Zeitlinie aus und erinnere dich sanft an den Tagesabschluss.',
    hoursMismatch: 'Der Tagesabschluss liegt noch vor dem Lernbeginn. Magst du kurz nachsehen?',
    afterDayEnd: 'Nach dem Lernen',
    closedDays: 'Bewusst den Tag abgeschlossen',
    tourText: 'Hier schließt du deinen Lerntag bewusst ab. Und falls doch noch etwas kommt: „Fokus wieder aufnehmen“, und alles von heute bleibt gezählt.',
    shutdownGentle: 'Dein Tagesabschluss rückt näher. Lass uns anschauen, was du heute alles gelernt hast.',
    shutdownDirect: 'Tagesabschluss in 30 min. Schauen wir, was du heute geschafft hast?',
  },
  allround: {
    business: false,
    client: 'Vorhaben',
    clients: 'Vorhaben',
    clientNew: 'Neues Vorhaben',
    clientAdd: 'Vorhaben anlegen',
    noClient: 'Kein Vorhaben',
    clientsHint: 'Vorhaben legst du in den Einstellungen an.',
    perClient: 'Zeiten pro Vorhaben (Summen)',
    forWhom: 'Wofür du dir Zeit genommen hast',
    infoMissing: 'Info fehlt noch',
    askBack: 'Rückfrage',
    roundUp: 'Was brauchst du, damit es für dich rund ist? Mehr braucht es nicht.',
    breakName: 'Pause',
    breakShort: 'Kurze Pause',
    breakTitle: 'Zeit für eine Pause',
    firstTaskExample: 'z. B. Unterlagen für die Steuer sortieren',
    focusTime: 'Fokus-Zeit',
    focusTimes: 'Fokus-Zeiten',
    dayFrame: 'Dein Tag',
    dayStart: 'Fokus-Zeit ab',
    dayStartsAt: (t) => `Fokus-Zeit ab ${t}`,
    dayEnd: 'Ruhe-Phase',
    untilDayEnd: 'bis zur Ruhe-Phase',
    dayEndReached: 'Zeit für die Ruhe-Phase',
    dayEndDone: 'Ruhe-Phase. Gut gemacht.',
    doneLead: (d) => `${d} Fokus-Zeit liegen hinter dir. Jetzt gehört der Abend dir.`,
    dayEndAction: 'Ruhe-Phase beginnen',
    dayOver: 'Deine Fokus-Zeit ist eigentlich vorbei',
    hoursQuestion: 'Wann möchtest du dich normalerweise konzentrieren? Danach richte ich deine Zeitlinie aus und erinnere dich sanft an die Ruhe-Phase.',
    hoursMismatch: 'Die Ruhe-Phase liegt noch vor dem Start deiner Fokus-Zeit. Magst du kurz nachsehen?',
    afterDayEnd: 'Am Abend',
    closedDays: 'Bewusst zur Ruhe gekommen',
    tourText: 'Hier kommst du bewusst zur Ruhe für heute. Und falls doch noch etwas kommt: „Fokus wieder aufnehmen“, und alles von heute bleibt gezählt.',
    shutdownGentle: 'Deine Ruhe-Phase rückt näher. Lass uns anschauen, was du heute alles geschafft hast.',
    shutdownDirect: 'Ruhe-Phase in 30 min. Schauen wir, was du heute geschafft hast?',
  },
};

/** The words for a context (unknown values get the neutral wording). */
export function contextLabels(context: unknown): ContextLabels {
  return LABELS[normalizeUserContext(context)];
}

/**
 * Show hourly rates, rounding, "abrechenbar" and amounts? Always at work, and
 * also elsewhere as soon as someone already has entries of their own (nothing
 * existing ever disappears).
 */
export function showsBusiness(context: unknown, ownEntries: number): boolean {
  return contextLabels(context).business || ownEntries > 0;
}

/** `showsBusiness` for a whole app state (counts the clients that are still active). */
export function businessShown(state: { settings: { userContext: UserContext }; clients: Record<string, { archived: boolean }> }): boolean {
  return showsBusiness(state.settings.userContext, Object.values(state.clients).filter((c) => !c.archived).length);
}

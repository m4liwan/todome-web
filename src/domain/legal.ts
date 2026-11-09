import data from './legal.json';

/**
 * Impressum and privacy notice, built from the operator data in legal.json.
 * Pure data: the settings sheet renders it, tests check it, and
 * scripts/check-release.mjs refuses a release while a required field is empty.
 *
 * Two operator kinds: a private person (Impressum and privacy notice speak
 * as "ich") or a company (legal form, representatives, register, "wir").
 */
export type OperatorKind = 'person' | 'company';

export interface Operator {
  kind: OperatorKind;
  name: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  email: string;
  phone: string;
  website: string;
  /** Company only. */
  legalForm: string;
  representatives: string;
  register: string;
  vatId: string;
}

export type LegalBlock = string | { list: string[] } | { link: { label: string; href: string } };
export interface LegalSection {
  title: string;
  blocks: LegalBlock[];
}

export const OPERATOR: Operator = { ...data.operator, kind: data.operator.kind === 'company' ? 'company' : 'person' };
export const LEGAL_UPDATED: string = data.updated;
/** Copyright line (Impressum and the Über tab). */
export const COPYRIGHT: string = data.copyright;

/** Shown in test builds where a required field is still empty. */
export const MISSING = '⟨Angabe fehlt⟩';

export const requiredFields = (op: Operator = OPERATOR): Array<keyof Operator> => data.required[op.kind] as Array<keyof Operator>;
export const missingLegalFields = (op: Operator = OPERATOR): Array<keyof Operator> => requiredFields(op).filter((k) => !String(op[k] ?? '').trim());

const isPerson = (op: Operator) => op.kind === 'person';
const v = (value: string) => value.trim() || MISSING;
const displayName = (op: Operator) =>
  (isPerson(op) ? op.name.trim() : [op.name, op.legalForm].map((s) => s.trim()).filter(Boolean).join(' ')) || MISSING;
const address = (op: Operator) => [v(op.street), `${v(op.postalCode)} ${v(op.city)}`, op.country].filter(Boolean);
const contact = (op: Operator) => [
  `E-Mail: ${v(op.email)}`,
  ...(op.phone.trim() ? [`Telefon: ${op.phone.trim()}`] : []),
  ...(op.website.trim() ? [`Web: ${op.website.trim()}`] : []),
];
const dateDe = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${Number(m[3])}. ${Number(m[2])}. ${m[1]}` : iso;
};

/** Impressum (§ 5 DDG). A company adds representatives, register and VAT ID when given. */
export function impressum(op: Operator = OPERATOR): LegalSection[] {
  if (isPerson(op)) {
    return [
      { title: 'Angaben gemäß § 5 DDG', blocks: [{ list: [displayName(op), ...address(op)] }] },
      { title: 'Kontakt', blocks: [{ list: contact(op) }] },
      { title: 'Urheberrecht', blocks: [COPYRIGHT] },
    ];
  }
  return [
    { title: 'Angaben gemäß § 5 DDG', blocks: [{ list: [displayName(op), ...address(op)] }] },
    { title: 'Vertreten durch', blocks: [v(op.representatives)] },
    { title: 'Kontakt', blocks: [{ list: contact(op) }] },
    ...(op.register.trim() ? [{ title: 'Registereintrag', blocks: [op.register.trim()] }] : []),
    ...(op.vatId.trim() ? [{ title: 'Umsatzsteuer-ID', blocks: [`Umsatzsteuer-Identifikationsnummer nach § 27a UStG: ${op.vatId.trim()}`] }] : []),
    { title: 'Urheberrecht', blocks: [COPYRIGHT] },
  ];
}

/** Privacy notice (Art. 13 DSGVO), written for exactly what the app does. */
export function privacy(op: Operator = OPERATOR): LegalSection[] {
  const me = isPerson(op);
  /** Person speaks as "ich", a company as "wir". */
  const say = (person: string, company: string) => (me ? person : company);
  return [
    {
      title: 'Kurz gesagt',
      blocks: [
        `ToDoMe. arbeitet lokal. Aufgaben, Zeiten, Kunden, Gedanken und Einstellungen bleiben auf diesem Gerät. Es gibt kein Konto und keine Werbung. ${say('Ich erhalte', 'Wir erhalten')} diese Daten nicht.`,
        'Nur fünf Funktionen sprechen mit dem Internet, und jede davon kannst du abschalten oder einfach nicht nutzen. Anonyme Nutzungsdaten gibt es nur, wenn du sie ausdrücklich erlaubst.',
      ],
    },
    {
      title: 'Verantwortlich',
      blocks: ['Verantwortlicher im Sinne der Datenschutz-Grundverordnung (Art. 4 Nr. 7 DSGVO):', { list: [displayName(op), ...address(op), `E-Mail: ${v(op.email)}`] }],
    },
    {
      title: 'Daten auf deinem Gerät',
      blocks: [
        'ToDoMe. speichert alles im Benutzerprofil von Windows. Mit „Backup herunterladen“ nimmst du eine Kopie mit, mit „Alle Daten löschen“ entfernst du sie. Beim Deinstallieren bleiben die Daten erhalten, damit ein Update nichts verliert.',
        'Die Mediensteuerung liest Titel und Interpret der gerade laufenden Wiedergabe direkt von Windows. Diese Angaben verlassen das Gerät nicht. Schriften und Klänge sind in die App eingebaut und werden nicht nachgeladen.',
      ],
    },
    {
      title: 'Wetter und Ortssuche (Open-Meteo)',
      blocks: [
        'Nur wenn du einen Ort wählst, fragt ToDoMe. etwa alle 30 Minuten das Wetter dafür ab. Dabei gehen der gesuchte Ortsname beziehungsweise die Koordinaten sowie technisch bedingt deine IP-Adresse an die OpenMeteo GmbH, Bürglen, Schweiz. Laut Open-Meteo werden Server-Protokolle nach 90 Tagen gelöscht.',
        `Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO, ${say('mein', 'unser')} berechtigtes Interesse an der von dir gewünschten Wetteranzeige. Für die Schweiz besteht ein Angemessenheitsbeschluss der EU-Kommission. Ohne gewählten Ort findet keine Abfrage statt.`,
        { link: { label: 'Bedingungen und Datenschutz von Open-Meteo', href: 'https://open-meteo.com/en/terms' } },
      ],
    },
    {
      title: 'Updates (GitHub)',
      blocks: [
        'Eine installierte Release-Version sucht ab und zu nach einer neuen Version und lädt sie herunter. Dabei werden deine IP-Adresse und technische Angaben wie die App-Version an GitHub, Inc., San Francisco, USA, übermittelt. GitHub ist nach dem EU-US Data Privacy Framework zertifiziert.',
        `Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO, ${say('mein', 'unser')} berechtigtes Interesse an einer sicheren, aktuellen App. Unter Einstellungen → Über schaltest du die automatische Suche ab.`,
        { link: { label: 'Datenschutzerklärung von GitHub', href: 'https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement' } },
      ],
    },
    {
      title: 'Feedback (Tally)',
      blocks: [
        `Der Feedback-Knopf öffnet ein Formular von Tally BV, Gent, Belgien, in deinem Browser. Erst wenn du es absendest, gehen deine Angaben an Tally und an ${say('mich', 'uns')}. Tally speichert Daten auf Servern in der EU.`,
        'Rechtsgrundlage ist deine Einwilligung durch das freiwillige Absenden, Art. 6 Abs. 1 lit. a DSGVO. Du kannst sie jederzeit per E-Mail widerrufen.',
        { link: { label: 'Datenschutzerklärung von Tally', href: 'https://tally.so/privacy' } },
      ],
    },
    {
      title: 'Feedback & Kontakt',
      blocks: [
        `Schreibst du unter Einstellungen → Allgemein → „Feedback & Kontakt“ eine Nachricht, gehen Thema, Nachricht, App-Version, Betriebssystem und, falls angegeben, deine E-Mail-Adresse an ${say('mich', 'uns')}. Ist ein Formular-Dienst eingerichtet, übermittelt die App die Nachricht verschlüsselt an den Dienst Formspree (USA), der sie per E-Mail weiterleitet. Sonst bereitet ToDoMe. die Nachricht in deinem E-Mail-Programm vor, und du schickst sie selbst ab.`,
        'Meldest du einen Fehler und lässt das Häkchen „Technisches Protokoll anhängen“ gesetzt, geht zusätzlich ein Auszug aus dem technischen Protokoll mit: App- und Electron-Version, Betriebssystem, die Zahl der Abstürze der letzten 7 Tage und die letzten Zeilen des Fehlerprotokolls. Es enthält keine Aufgaben, Notizen oder Kundennamen; dein Benutzerordner und E-Mail-Adressen werden vorher unkenntlich gemacht. Das Protokoll selbst und eventuelle Absturzberichte bleiben auf deinem Gerät (Ordner „logs“ und „Crashpad“ im ToDoMe.-Datenordner) und werden nie automatisch gesendet.',
        `Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO, ${say('mein', 'unser')} berechtigtes Interesse, deine Nachricht zu beantworten. ${say('Ich lösche', 'Wir löschen')} Nachrichten, sobald sie erledigt sind und keine Aufbewahrungspflicht besteht.`,
        { link: { label: 'Datenschutzerklärung von Formspree', href: 'https://formspree.io/legal/privacy-policy/' } },
      ],
    },
    {
      title: 'Anonyme Nutzungsdaten (PostHog, nur mit Einwilligung)',
      blocks: [
        'Nur wenn du „Anonyme Nutzungsdaten teilen“ einschaltest (im Onboarding oder unter Einstellungen → Über → Datenschutz), sendet ToDoMe. einzelne Nutzungsereignisse, etwa „App geöffnet“, „Onboarding abgeschlossen“ oder „Fokusblock gestartet“, außerdem ob eine Nachricht des Begleiters erschienen ist und welche Antwort du gewählt hast (nur die Art der Nachricht und die Antwort-Kennung, grob gerundet die Reaktionszeit, nie der Text), ob ein Update geladen und installiert wurde, und technische Fehlerberichte (Fehlermeldung und Programmstelle). Dazu gehören App-Version, Desktop oder Web, der gewählte Nutzungskontext und wenige Zahlen wie die geplante Blocklänge. Inhalte wie Aufgaben, Notizen, Kundennamen oder erfasste Zeiten werden nie übertragen. Es gibt keine Sitzungsaufzeichnung, keine Klick-Erfassung und kein Nutzerprofil.',
        'Empfänger ist PostHog Inc., San Francisco, USA, mit Datenverarbeitung auf Servern in der EU (Frankfurt). Zum Wiedererkennen des Geräts speichert PostHog eine zufällige Kennung im lokalen Speicher der App. Beim Senden wird technisch bedingt deine IP-Adresse übertragen; sie wird nicht zusammen mit den Ereignissen gespeichert.',
        'Rechtsgrundlage ist deine Einwilligung nach Art. 6 Abs. 1 lit. a DSGVO und § 25 Abs. 1 TDDDG. Ohne Häkchen sendet ToDoMe. nichts und lädt die Funktion nicht einmal. Du kannst die Einwilligung jederzeit widerrufen, indem du das Häkchen entfernst; ab dann wird nichts mehr gesendet und die Kennung gelöscht.',
        { link: { label: 'Datenschutzerklärung von PostHog', href: 'https://posthog.com/privacy' } },
      ],
    },
    {
      title: 'Deine Rechte',
      blocks: [
        `Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch gegen Verarbeitungen nach Art. 6 Abs. 1 lit. f DSGVO. Schreib ${say('mir', 'uns')} dafür eine E-Mail.`,
        'Außerdem kannst du dich bei einer Datenschutz-Aufsichtsbehörde beschweren, zum Beispiel beim Hessischen Beauftragten für Datenschutz und Informationsfreiheit.',
      ],
    },
    { title: 'Stand', blocks: [dateDe(LEGAL_UPDATED)] },
  ];
}

import type { UIStrings } from './types';

// German (Deutsch).
// Machine-translated first pass — flagged for native review before launch.
// Google Docs menu labels follow the localized German UI (Datei → Herunterladen).
export const de: UIStrings = {
  eyebrow: 'Kostenlos · Open Source · 100% im Browser',
  tagline:
    'Wandle Word-Dateien (.docx) in sauberes Markdown um — komplett in deinem Browser. Deine Dateien werden nie hochgeladen.',

  flowFromAlt: 'Word-Dokument',
  flowToAlt: 'Markdown-Datei',

  dropzoneTitle: 'Lege deine .docx hier ab',
  dropzoneBrowsePrefix: 'oder ',
  dropzoneBrowseLink: 'klicke, um eine Datei zu wählen',
  googleDocHint: 'Google Doc? Datei → Herunterladen → Microsoft Word (.docx)',
  convertSectionAria: 'Dokument umwandeln',

  convertedLabel: 'Umgewandelt',
  copyButton: 'Markdown kopieren',
  downloadButton: '.md herunterladen',
  panelMarkdown: 'Markdown',
  panelPreview: 'Vorschau',

  steps: [
    {
      t: 'Hochladen',
      d: 'Ziehe eine .docx-Datei hinein oder klicke zum Auswählen.',
    },
    {
      t: 'Umwandeln',
      d: 'Die Umwandlung erfolgt im Browser — kein Server, kein Warten.',
    },
    {
      t: 'Kopieren oder speichern',
      d: 'Kopiere das Markdown oder lade eine .md-Datei herunter.',
    },
  ],

  faqHeading: 'Häufig gestellte Fragen',
  faqs: [
    {
      q: 'Wie wandle ich ein Word-Dokument in Markdown um?',
      a: 'Ziehe eine .docx-Datei auf die Seite (oder klicke zum Auswählen). Word to Markdown wandelt sie im Browser um und zeigt das Markdown sofort an — kopiere es oder lade eine .md-Datei herunter.',
    },
    {
      q: 'Ist Word to Markdown kostenlos?',
      a: 'Ja. Es ist völlig kostenlos und Open Source — ohne Anmeldung, ohne Dateigrößenbeschränkung und ohne Werbung.',
    },
    {
      q: 'Werden meine Dokumente auf einen Server hochgeladen?',
      a: 'Nein. Die Umwandlung erfolgt vollständig in deinem Browser mit JavaScript. Deine Dateien verlassen nie dein Gerät und werden nie hochgeladen, gespeichert oder protokolliert.',
    },
    {
      q: 'Wie wandle ich ein Google Doc in Markdown um?',
      a: 'Wähle in Google Docs Datei → Herunterladen → Microsoft Word (.docx) und ziehe diese .docx in Word to Markdown.',
    },
    {
      q: 'Welche Formatierung bleibt erhalten?',
      a: 'Überschriften, fetter und kursiver Text, geordnete und verschachtelte Listen, Tabellen, Links und Code werden in sauberes Markdown im GitHub-Stil umgewandelt.',
    },
  ],

  footer: {
    feedback: 'Feedback',
    source: 'Quellcode',
    donate: 'Spenden',
    terms: 'Nutzungsbedingungen',
    privacy: 'Datenschutz',
  },
  footerTagline: 'Im Browser umgewandelt · nichts wird hochgeladen',
  homeAria: 'Word to Markdown — Startseite',

  metaTitle: 'Word to Markdown — Kostenloser .docx-zu-Markdown-Konverter',
  metaDescription:
    'Wandle Word (.docx) und Google Docs in sauberes Markdown im GitHub-Stil um — kostenlos, Open Source und komplett im Browser.',
  schemaDescription:
    'Kostenloses Open-Source-Tool, das Word (.docx) und Google Docs vollständig im Browser in sauberes Markdown im GitHub-Stil umwandelt.',
  schemaFeatureList: [
    'Word (.docx) in Markdown umwandeln',
    'Google Docs in Markdown umwandeln',
    'Markdown-Ausgabe im GitHub-Stil',
    '100% clientseitig — nichts wird hochgeladen',
  ],

  errorGeneric:
    'Beim Umwandeln des Dokuments ist ein unerwarteter Fehler aufgetreten. Bitte versuche es erneut.',
  dismiss: 'Schließen',
};

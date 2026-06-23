import type { UIStrings } from './types';

// French (Français).
// Machine-translated first pass — flagged for native review before launch.
// Google Docs menu labels follow the localized French UI (Fichier → Télécharger).
export const fr: UIStrings = {
  eyebrow: 'Gratuit · Open source · 100% dans votre navigateur',
  tagline:
    'Convertissez des fichiers Word (.docx) en Markdown propre — entièrement dans votre navigateur. Vos fichiers ne sont jamais envoyés.',

  flowFromAlt: 'Document Word',
  flowToAlt: 'Fichier Markdown',

  dropzoneTitle: 'Déposez votre .docx ici',
  dropzoneBrowsePrefix: 'ou ',
  dropzoneBrowseLink: 'cliquez pour choisir un fichier',
  googleDocHint: 'Google Doc ? Fichier → Télécharger → Microsoft Word (.docx)',
  convertSectionAria: 'Convertir un document',

  convertedLabel: 'Converti',
  copyButton: 'Copier le Markdown',
  downloadButton: 'Télécharger .md',
  panelMarkdown: 'Markdown',
  panelPreview: 'Aperçu',

  steps: [
    {
      t: 'Importer',
      d: 'Glissez un fichier .docx, ou cliquez pour en choisir un.',
    },
    {
      t: 'Convertir',
      d: 'La conversion se fait dans votre navigateur — sans serveur, sans attente.',
    },
    {
      t: 'Copier ou enregistrer',
      d: 'Copiez le Markdown, ou téléchargez un fichier .md.',
    },
  ],

  faqHeading: 'Questions fréquentes',
  faqs: [
    {
      q: 'Comment convertir un document Word en Markdown ?',
      a: 'Glissez un fichier .docx sur la page (ou cliquez pour le sélectionner). Word to Markdown le convertit dans votre navigateur et affiche le Markdown instantanément — copiez-le ou téléchargez un fichier .md.',
    },
    {
      q: 'Word to Markdown est-il gratuit ?',
      a: 'Oui. Il est entièrement gratuit et open source — sans inscription, sans limite de taille de fichier et sans publicité.',
    },
    {
      q: 'Mes documents sont-ils envoyés à un serveur ?',
      a: 'Non. La conversion a lieu entièrement dans votre navigateur avec JavaScript. Vos fichiers ne quittent jamais votre appareil et ne sont jamais envoyés, stockés ni enregistrés.',
    },
    {
      q: 'Comment convertir un Google Doc en Markdown ?',
      a: 'Dans Google Docs, choisissez Fichier → Télécharger → Microsoft Word (.docx), puis déposez ce .docx dans Word to Markdown.',
    },
    {
      q: 'Quelle mise en forme est conservée ?',
      a: 'Les titres, le texte en gras et en italique, les listes ordonnées et imbriquées, les tableaux, les liens et le code sont convertis en Markdown propre au format GitHub.',
    },
  ],

  footer: {
    feedback: 'Commentaires',
    source: 'Code source',
    donate: 'Faire un don',
    terms: 'Conditions',
    privacy: 'Confidentialité',
  },
  footerTagline: "Converti dans votre navigateur · rien n'est envoyé",
  homeAria: 'Word to Markdown — accueil',

  metaTitle: 'Word to Markdown — Convertisseur .docx vers Markdown gratuit',
  metaDescription:
    'Convertissez Word (.docx) et Google Docs en Markdown propre au format GitHub — gratuit, open source et entièrement dans votre navigateur.',
  schemaDescription:
    'Outil gratuit et open source qui convertit Word (.docx) et Google Docs en Markdown propre au format GitHub, entièrement dans votre navigateur.',
  schemaFeatureList: [
    'Convertir Word (.docx) en Markdown',
    'Convertir Google Docs en Markdown',
    'Sortie Markdown au format GitHub',
    "100% côté client — rien n'est envoyé",
  ],

  errorGeneric:
    "Une erreur inattendue s'est produite lors de la conversion du document. Veuillez réessayer.",
  dismiss: 'Fermer',
};

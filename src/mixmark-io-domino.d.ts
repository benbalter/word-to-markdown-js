// @mixmark-io/domino's bundled index.d.ts declares an ambient `domino` module
// rather than being a module itself, so `import domino from
// '@mixmark-io/domino'` (src/worker-dom-polyfill.ts) can't see it. Declare the
// slice we use under the package's real name.
declare module '@mixmark-io/domino' {
  const domino: {
    createDocument(html?: string, force?: boolean): Document;
  };
  export default domino;
}

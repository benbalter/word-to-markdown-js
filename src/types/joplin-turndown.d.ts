// @joplin/turndown and its GFM plugin ship no type declarations. Under
// `noImplicitAny` an untyped import is a hard error, so we provide a minimal,
// hand-written surface covering exactly what src/main.ts uses. (The upstream
// `turndown` API is broad; typing only what we call keeps this shim honest and
// avoids fighting the deliberately-loose `object` options bag we pass in.)

declare module '@joplin/turndown' {
  class TurndownService {
    constructor(options?: object);
    turndown(html: string): string;
    use(plugin: unknown): this;
    keep(filter: string | string[]): this;
  }
  export default TurndownService;
}

declare module '@joplin/turndown-plugin-gfm' {
  export const gfm: unknown;
  export const tables: unknown;
  export const strikethrough: unknown;
  export const taskListItems: unknown;
}

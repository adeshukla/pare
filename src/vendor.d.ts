/**
 * Types for dependencies that ship none.
 *
 * Written against the actual runtime shape rather than `any`, so a signature
 * change in the package shows up as a type error instead of at runtime inside a
 * worker, where it would surface as a skipped file and a shrug.
 */

declare module 'html-minifier-terser' {
  export type Options = {
    removeComments?: boolean;
    collapseWhitespace?: boolean;
    conservativeCollapse?: boolean;
    /** `type` is 'inline' for a style attribute, 'media' for a media query,
     *  and undefined for a <style> element. */
    minifyCSS?: boolean | ((css: string, type?: string) => string | Promise<string>);
    /** `type` is 'event' for an on* handler attribute, undefined for <script>. */
    minifyJS?: boolean | ((js: string, type?: string) => string | Promise<string>);
    removeAttributeQuotes?: boolean;
    removeEmptyAttributes?: boolean;
    removeRedundantAttributes?: boolean;
    collapseBooleanAttributes?: boolean;
    removeOptionalTags?: boolean;
    useShortDoctype?: boolean;
    sortAttributes?: boolean;
    sortClassName?: boolean;
  };
  export function minify(source: string, options?: Options): Promise<string>;
}
declare const __BUILD_ID__: string;

declare module 'libheif-js/libheif-wasm/libheif-bundle.mjs' {
  const factory: (options?: unknown) => unknown;
  export default factory;
}

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
    minifyCSS?: boolean | ((css: string) => string | Promise<string>);
    minifyJS?: boolean | ((js: string) => string | Promise<string>);
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

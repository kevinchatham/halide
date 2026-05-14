import type { ContentSecurityPolicyOptionHandler } from 'hono/secure-headers';

/**
 * Value for a Content Security Policy directive. Can be a string or a custom handler.
 */
export type CspDirectiveValue = string | ContentSecurityPolicyOptionHandler;

/**
 * Content Security Policy directives for the server.
 * Each directive controls which resources can be loaded and from where.
 */
export type CspDirectives = {
  /** Limits the URLs that can appear in a page's <base>element. */
  baseUri?: CspDirectiveValue[];
  /** Restricts the URLs for workers and embedded frame contents. */
  childSrc?: CspDirectiveValue[];
  /** Restricts the URLs that can be loaded using script, connect, fetch, or XHR. */
  connectSrc?: CspDirectiveValue[];
  /** Serves as a fallback for other directives when they are not explicitly defined. */
  defaultSrc?: CspDirectiveValue[];
  /** Controls the sources for fonts loaded via @font-face. */
  fontSrc?: CspDirectiveValue[];
  /** Restricts the URLs that can be used as the target of form submissions. */
  formAction?: CspDirectiveValue[];
  /** Specifies valid parents for embedding this page in a frame, iframe, or object. */
  frameAncestors?: CspDirectiveValue[];
  /** Controls the sources for frames and iframes. */
  frameSrc?: CspDirectiveValue[];
  /** Controls the sources for images and favicons. */
  imgSrc?: CspDirectiveValue[];
  /** Controls the sources for web manifests. */
  manifestSrc?: CspDirectiveValue[];
  /** Controls the sources for media files (audio and video). */
  mediaSrc?: CspDirectiveValue[];
  /** Controls the sources for plugins (e.g., <object>, <embed>). */
  objectSrc?: CspDirectiveValue[];
  /** Enables restrictions on what the page can do (like sandboxing). */
  sandbox?: CspDirectiveValue[];
  /** Controls the sources for JavaScript scripts. */
  scriptSrc?: CspDirectiveValue[];
  /** Controls the sources for inline event handlers (e.g., onclick). */
  scriptSrcAttr?: CspDirectiveValue[];
  /** Controls the sources for <script> elements. */
  scriptSrcElem?: CspDirectiveValue[];
  /** Controls the sources for stylesheets. */
  styleSrc?: CspDirectiveValue[];
  /** Controls the sources for inline styles applied via the style attribute. */
  styleSrcAttr?: CspDirectiveValue[];
  /** Controls the sources for <style> elements. */
  styleSrcElem?: CspDirectiveValue[];
  /** Instructs the browser to upgrade HTTP requests to HTTPS. */
  upgradeInsecureRequests?: CspDirectiveValue[];
  /** Controls the sources for Web Workers. */
  workerSrc?: CspDirectiveValue[];
};

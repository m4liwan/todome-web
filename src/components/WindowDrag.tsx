import { createPortal } from 'react-dom';

/**
 * The title bar of a full-screen view (desktop app): a strip as high as the
 * window buttons, the only place there that moves the window. The view's
 * own surface never does, so a click with a little wobble stays a click.
 * Invisible and without pointer events: Windows alone treats it as the title
 * bar (-webkit-app-region), the page never sees it.
 *
 * Rendered at the end of <body>, not inside the view: the app region is
 * inherited, so every full-size layer of the view (grid, aura, logo) is
 * no-drag as well, and Chromium lets each later region override the earlier
 * ones. Inside the view those layers would punch the strip out again; as the
 * last element of the page it always wins. Write it as the view's first child.
 */
export function WindowDrag() {
  return createPortal(<div className="window-drag" aria-hidden="true" />, document.body);
}

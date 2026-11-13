/**
 * The title bar of a full-screen view (desktop app): a strip as high as the
 * window buttons, the only place there that moves the window. The view's
 * own surface never does, so a click with a little wobble stays a click.
 * Invisible and without pointer events: Windows alone treats it as the title
 * bar (-webkit-app-region), the page never sees it.
 */
export function WindowDrag() {
  return <div className="window-drag" aria-hidden="true" />;
}

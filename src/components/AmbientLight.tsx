/**
 * The ambient light behind everything, in layers: a wash that fills the whole
 * background in both tones of the light colour and breathes slowly, an aurora
 * (a long soft band from one tone to the other) that turns and wanders, three
 * soft light sources that wander across the background, and a fine grain
 * that keeps the gradients free of banding. How they move is a choice
 * (data-light on <html>: drift, breathe, aurora, center, corners); the
 * rainbow layer only lights up with the rainbow colour. The halo is the light of the
 * running focus style (off while nothing runs). Strength, colour and each focus
 * style's light profile come from the stylesheet (components/ambient-light.css).
 */
export function AmbientLight() {
  return (
    <div className="light" aria-hidden="true">
      <span className="light__wash" />
      <span className="light__aurora" />
      <span className="light__aurora light__aurora--b" />
      <span className="light__source light__source--a" />
      <span className="light__source light__source--b" />
      <span className="light__source light__source--c" />
      <span className="light__halo" />
      <span className="light__rainbow" />
      <span className="light__grain" />
    </div>
  );
}

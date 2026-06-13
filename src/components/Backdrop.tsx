import Starfield from './Starfield';

/**
 * The two theme-swapped texture layers, behind all content. The starfield
 * shows in dark; the paper grain shows in light (toggled by CSS on data-theme).
 */
export default function Backdrop() {
  return (
    <>
      <Starfield />
      <div className="grain" aria-hidden="true" />
    </>
  );
}

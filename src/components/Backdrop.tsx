import Starfield from './Starfield';
import Meteors   from './Meteors';

/**
 * The theme-swapped texture layers, behind all content. In dark mode, back to
 * front: nebula → starfield → meteors. In light mode the parchment grain shows
 * (all dark layers are hidden via CSS on data-theme).
 */
export default function Backdrop() {
  return (
    <>
      <div className="nebula" aria-hidden="true" />
      <Starfield />
      <Meteors />
      <div className="grain" aria-hidden="true" />
    </>
  );
}

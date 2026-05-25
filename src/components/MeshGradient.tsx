/**
 * Background aurora mesh — pure CSS, stitched radial-gradients at 2% opacity.
 * Positioned top-right / bottom-right, slowly breathing over 30s.
 */
import styles from "./MeshGradient.module.css";

export function MeshGradient() {
  return <div className={styles.mesh} aria-hidden="true" />;
}

// User-supplied PAF song for the hangar and pause screens.
// Imported as an inline data URL so the single-file/offline build includes the audio.
import musicUrl from '../../assets/paf-mujahido.webm?inline';

export class MenuMusic {
  constructor() {
    this.audio = new Audio(musicUrl);
    this.audio.loop = true;
    this.audio.preload = 'auto';
    this.volume = 0.65;
    this.scene = null;
    this.audio.volume = this.volume;
  }

  // Called from user gestures as well as play(); browsers may defer autoplay
  // until the first click/tap, so a later unlock retries playback.
  unlock() {
    if (!this.scene || !this.audio.paused) return true;
    const result = this.audio.play();
    if (result && typeof result.catch === 'function') result.catch(() => {});
    return true;
  }

  setVolume(value) {
    const v = Number(value);
    this.volume = (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0) * 0.65;
    this.audio.volume = this.volume;
  }

  play(scene = 'menu') {
    this.scene = scene;
    this.unlock();
  }

  stop() {
    this.scene = null;
    this.audio.pause();
    try { this.audio.currentTime = 0; } catch (_) {}
  }
}

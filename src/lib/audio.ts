/**
 * audio.ts — Web Audio API tone synthesiser for trading alerts.
 *
 * No external files needed. All sounds are generated programmatically
 * via the AudioContext oscillator API.
 *
 * Usage:
 *   playSignalAlert("BUY")   → ascending two-tone chime
 *   playSignalAlert("SELL")  → descending two-tone chime
 *   playSignalAlert("BLOCK") → short low buzz
 *   playExecutionConfirm()   → three-note success chord
 *   playAutoPilotOn()        → rising sweep
 *   playAutoPilotOff()       → falling sweep
 */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx || ctx.state === "closed") {
    ctx = new AudioContext();
  }
  // Resume if suspended (browser autoplay policy)
  if (ctx.state === "suspended") {
    ctx.resume();
  }
  return ctx;
}

function tone(
  frequency: number,
  startTime: number,
  duration: number,
  gainPeak: number,
  type: OscillatorType = "sine",
  audioCtx: AudioContext,
) {
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, startTime);

  // Envelope: quick attack, sustain, fast release
  gainNode.gain.setValueAtTime(0, startTime);
  gainNode.gain.linearRampToValueAtTime(gainPeak, startTime + 0.015);
  gainNode.gain.setValueAtTime(gainPeak, startTime + duration * 0.6);
  gainNode.gain.linearRampToValueAtTime(0, startTime + duration);

  osc.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  osc.start(startTime);
  osc.stop(startTime + duration + 0.01);
}

/** Two-tone chime for BUY (ascending) or SELL (descending) signal detection. */
export function playSignalAlert(side: "BUY" | "SELL" | "BLOCK") {
  try {
    const ac = getCtx();
    const now = ac.currentTime;

    if (side === "BUY") {
      tone(660, now, 0.12, 0.18, "sine", ac);
      tone(880, now + 0.13, 0.14, 0.18, "sine", ac);
    } else if (side === "SELL") {
      tone(880, now, 0.12, 0.18, "sine", ac);
      tone(660, now + 0.13, 0.14, 0.18, "sine", ac);
    } else {
      // BLOCK — low short buzz
      tone(180, now, 0.18, 0.12, "sawtooth", ac);
    }
  } catch {
    // Silently ignore if AudioContext is unavailable (e.g. SSR)
  }
}

/** Three-note success chord played when a trade is confirmed. */
export function playExecutionConfirm() {
  try {
    const ac = getCtx();
    const now = ac.currentTime;
    tone(523, now, 0.1, 0.15, "sine", ac);        // C5
    tone(659, now + 0.08, 0.1, 0.15, "sine", ac); // E5
    tone(784, now + 0.16, 0.15, 0.18, "sine", ac);// G5
  } catch {
    // ignore
  }
}

/** Rising frequency sweep when Auto-Pilot is enabled. */
export function playAutoPilotOn() {
  try {
    const ac = getCtx();
    const now = ac.currentTime;
    const osc = ac.createOscillator();
    const gainNode = ac.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(900, now + 0.35);
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.15, now + 0.05);
    gainNode.gain.linearRampToValueAtTime(0, now + 0.38);
    osc.connect(gainNode);
    gainNode.connect(ac.destination);
    osc.start(now);
    osc.stop(now + 0.4);
  } catch {
    // ignore
  }
}

/** Falling frequency sweep when Auto-Pilot is disabled. */
export function playAutoPilotOff() {
  try {
    const ac = getCtx();
    const now = ac.currentTime;
    const osc = ac.createOscillator();
    const gainNode = ac.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(900, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.35);
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.12, now + 0.05);
    gainNode.gain.linearRampToValueAtTime(0, now + 0.38);
    osc.connect(gainNode);
    gainNode.connect(ac.destination);
    osc.start(now);
    osc.stop(now + 0.4);
  } catch {
    // ignore
  }
}

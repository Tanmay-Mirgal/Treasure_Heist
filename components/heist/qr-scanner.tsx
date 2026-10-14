"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { IScannerControls } from "@zxing/browser";
import { Camera, CameraOff, Flashlight, Keyboard, Loader2, ScanLine, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type Phase = "idle" | "starting" | "scanning" | "error";
type CamError = "denied" | "no-camera" | "busy" | "insecure" | "unsupported" | "unknown";

const ERROR_TEXT: Record<CamError, { title: string; body: string }> = {
  denied: {
    title: "Camera permission denied",
    body: "Allow camera access for this site in your browser settings, then tap Start camera again. You can also type the code printed under the QR.",
  },
  "no-camera": { title: "No camera found", body: "This device has no usable camera. Type the code printed under the QR instead." },
  busy: { title: "Camera is busy", body: "Another app is using the camera. Close it and try again." },
  insecure: {
    title: "Secure connection required",
    body: "Browsers only allow the camera on HTTPS. Open the site over https:// or use manual entry.",
  },
  unsupported: { title: "Camera not supported", body: "This browser cannot access the camera. Use manual entry below." },
  unknown: { title: "Could not start the camera", body: "Try again, or use manual entry below." },
};

function classify(err: unknown): CamError {
  const name = (err as { name?: string })?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError" || name === "DevicesNotFoundError") return "no-camera";
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") return "busy";
  return "unknown";
}

/** Exposed for automated tests: number of live camera tracks opened by the scanner. */
declare global {
  interface Window {
    __heistActiveTracks?: number;
  }
}

export function QrScanner({
  onDetected,
  busy,
  disabled,
}: {
  /** Called once per detected code; the scanner stays paused until it resolves. */
  onDetected: (text: string, source: "CAMERA" | "MANUAL") => Promise<void>;
  busy?: boolean;
  disabled?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const handlingRef = useRef(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [camError, setCamError] = useState<CamError | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [manual, setManual] = useState("");

  const stop = useCallback(() => {
    try {
      controlsRef.current?.stop();
    } catch {
      /* already stopped */
    }
    controlsRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
    window.__heistActiveTracks = 0;
    setTorchOn(false);
    setTorchSupported(false);
  }, []);

  // Always release the camera when the scanner unmounts or is hidden.
  useEffect(() => stop, [stop]);

  const start = useCallback(async () => {
    setCamError(null);
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setCamError("insecure");
      setPhase("error");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamError("unsupported");
      setPhase("error");
      return;
    }
    setPhase("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      window.__heistActiveTracks = stream.getVideoTracks().length;
      const track = stream.getVideoTracks()[0];
      const caps = (track?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
      setTorchSupported(Boolean(caps.torch));

      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 120, delayBetweenScanSuccess: 1500 });
      handlingRef.current = false;
      controlsRef.current = await reader.decodeFromStream(stream, videoRef.current!, (result) => {
        if (!result || handlingRef.current) return;
        handlingRef.current = true; // ignore further callbacks until this one is processed
        const text = result.getText();
        stop();
        setPhase("idle");
        void onDetected(text, "CAMERA").finally(() => {
          handlingRef.current = false;
        });
      });
      setPhase("scanning");
    } catch (err) {
      stop();
      setCamError(classify(err));
      setPhase("error");
    }
  }, [onDetected, stop]);

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn } as MediaTrackConstraintSet] });
      setTorchOn((v) => !v);
    } catch {
      setTorchSupported(false);
    }
  }

  async function submitManual(e: FormEvent) {
    e.preventDefault();
    if (!manual.trim() || busy) return;
    stop();
    setPhase("idle");
    await onDetected(manual.trim(), "MANUAL");
    setManual("");
  }

  const live = phase === "scanning" || phase === "starting";

  return (
    <div className="space-y-4">
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl border bg-black">
        <video
          ref={videoRef}
          className={`size-full object-cover ${live ? "opacity-100" : "opacity-0"}`}
          muted
          playsInline
          autoPlay
          aria-label="Camera preview"
        />
        {live && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="scan-frame relative size-[68%] rounded-xl">
              <div className="scan-sweep absolute inset-x-2 top-2 h-0.5 rounded bg-gold/90 [--sweep:calc(100%-1rem)]" />
            </div>
          </div>
        )}
        {!live && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center">
            {busy ? (
              <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-8 animate-spin text-signal" /> Verifying checkpoint…
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <ScanLine className="size-12 text-gold" aria-hidden />
                <p className="max-w-[16rem] text-sm text-muted-foreground">
                  Tap <span className="text-foreground">Start camera</span> and point it at the checkpoint QR.
                </p>
                <Button onClick={start} disabled={disabled || busy} size="lg" className="h-11 px-5">
                  <Camera className="size-5" /> Start camera
                </Button>
              </div>
            )}
          </div>
        )}
        {phase === "starting" && (
          <div className="absolute inset-0 grid place-items-center bg-black/60 text-sm text-muted-foreground">
            <Loader2 className="size-6 animate-spin" />
            <span className="sr-only">Starting camera</span>
          </div>
        )}
        {live && (
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/80 to-transparent p-3">
            {torchSupported ? (
              <Button size="sm" variant="secondary" onClick={toggleTorch} aria-pressed={torchOn}>
                <Flashlight className="size-4" /> {torchOn ? "Light off" : "Light"}
              </Button>
            ) : (
              <span />
            )}
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                stop();
                setPhase("idle");
              }}
            >
              <X className="size-4" /> Close camera
            </Button>
          </div>
        )}
      </div>

      {phase === "error" && camError && (
        <Alert variant="destructive">
          <CameraOff />
          <AlertTitle>{ERROR_TEXT[camError].title}</AlertTitle>
          <AlertDescription>{ERROR_TEXT[camError].body}</AlertDescription>
        </Alert>
      )}

      <ul className="space-y-1 text-xs text-muted-foreground">
        <li>• Hold the phone 20–40 cm from the code and keep it inside the frame.</li>
        <li>• In low light, turn on the light (if available) or move closer to a lamp; avoid glare.</li>
        <li>• Only your team&apos;s next checkpoint will be accepted.</li>
      </ul>

      <form onSubmit={submitManual} className="relative overflow-hidden rounded-2xl border-2 border-slate-700 bg-slate-900/90 p-4 shadow-lg backdrop-blur-md">
        <div className="absolute inset-x-0 top-0 h-1 subway-hazard opacity-70" />
        <Label htmlFor="manual-code" className="flex items-center gap-2 text-xs sm:text-sm font-black text-cyan-300 uppercase tracking-wider">
          <Keyboard className="size-4 text-cyan-400" /> Manual Code Entry
        </Label>
        <p className="mt-1 text-xs font-semibold text-slate-400">Type the 8-character code printed under the station QR (e.g. K7QX-M4PZ).</p>
        <div className="mt-3 flex gap-2">
          <Input
            id="manual-code"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="XXXX-XXXX"
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={80}
            className="h-12 border-2 border-slate-700 bg-slate-950/80 font-mono text-base font-bold uppercase tracking-widest text-white flex-1"
          />
          <button
            type="submit"
            className="subway-btn-gold h-12 px-4 sm:px-6 rounded-xl font-heading text-sm font-black tracking-wider uppercase shrink-0 transition-all flex items-center justify-center gap-1.5"
            disabled={busy || disabled || !manual.trim()}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : "SUBMIT"}
          </button>
        </div>
      </form>
    </div>
  );
}

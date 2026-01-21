import { useEffect, useRef, useState } from "react";

export default function App() {
  const [micStream, setMicStream] = useState<MediaStream | null>(null);

  const agentAudioRef = useRef<HTMLAudioElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const startedRef = useRef(false);
  const [agentPaused, setAgentPaused] = useState(false);

  //  Get RAW microphone (no browser auto-processing)
  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      })
      .then(setMicStream);
  }, []);

  const startAudio = async () => {
    if (!micStream || !agentAudioRef.current || startedRef.current) return;
    startedRef.current = true;

    // Must start audio inside user gesture
    await agentAudioRef.current.play();

    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    await ctx.resume();

    const micSource = ctx.createMediaStreamSource(micStream);
    const agentSource = ctx.createMediaElementSource(agentAudioRef.current);

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyserRef.current = analyser;

    const gain = ctx.createGain();
    gain.gain.value = 1;
    gainRef.current = gain;

    // Graph
    micSource.connect(analyser);
    agentSource.connect(gain);
    gain.connect(ctx.destination);

    const buffer = new Uint8Array(analyser.fftSize);
   
    let noiseFloor = 0.004;
    let speechFrames = 0;
    let silenceFrames = 0;

    const SPEECH_FRAMES_REQUIRED = 10; // 180ms
    const SILENCE_FRAMES_REQUIRED = 25; // 450ms
    const NOISE_MULTIPLIER = 2.5;

    const detect = () => {
      analyser.getByteTimeDomainData(buffer);

      let sum = 0;
      for (let i = 0; i < buffer.length; i++) {
        const v = (buffer[i] - 128) / 128;
        sum += v * v;
      }

      const rms = Math.sqrt(sum / buffer.length);

      // update noise floor ONLY when quiet 
      if (rms < noiseFloor * 1.5) {
        noiseFloor = noiseFloor * 0.85 + rms * 0.01;
      }

      const threshold = noiseFloor * NOISE_MULTIPLIER;
      const isSpeech = rms > threshold;

      const audio = agentAudioRef.current!;

      if (isSpeech) {
        speechFrames++;
        silenceFrames = 0;

        if (speechFrames >= SPEECH_FRAMES_REQUIRED && !audio.paused) {
          audio.pause();
          setAgentPaused(true);
        }
      } else {
        silenceFrames++;
        speechFrames = 0;

        if (silenceFrames >= SILENCE_FRAMES_REQUIRED && audio.paused) {
          audio.play();
          setAgentPaused(false);
        }
      }

      requestAnimationFrame(detect);
    };

    detect();
  };

  return (
    <div style={{ padding: 40 }}>
      <h2> Audio Ducking POC</h2>

      <h4>Agent Audio: {agentPaused ? " Paused by VAD" : "Playing"}</h4>

      <button
        onClick={startAudio}
        style={{
          padding: "12px 20px",
          fontSize: 16,
          marginBottom: 20,
          cursor: "pointer",
        }}
      >
        Start Audio Engine
      </button>

      <br />

      <audio ref={agentAudioRef} src="/file_example_MP3_700KB.mp3" controls />
    </div>
  );
}

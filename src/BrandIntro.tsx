import { useEffect, useRef } from "react";
import "./BrandIntro.css";

const INTRO_DURATION = 4600;

export function BrandIntro({ onClose }: { onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    addEventListener("keydown", closeOnEscape);
    const automaticEntry = window.setTimeout(onClose, INTRO_DURATION);
    return () => {
      document.body.style.overflow = previousOverflow;
      removeEventListener("keydown", closeOnEscape);
      window.clearTimeout(automaticEntry);
    };
  }, [onClose]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ratio = Math.min(2, devicePixelRatio || 1);
    canvas.width = 340 * ratio;
    canvas.height = 210 * ratio;
    context.scale(ratio, ratio);
    const mask = document.createElement("canvas");
    mask.width = 220 * ratio;
    mask.height = 220 * ratio;
    const maskContext = mask.getContext("2d", { willReadFrequently: true });
    if (!maskContext) return;
    const logo = new Image();
    logo.src = "/assets/fuchong-logo.webp";
    let frame = 0;
    let cancelled = false;
    const paintLogoMask = async () => {
      await logo.decode();
      if (cancelled) return;
      maskContext.drawImage(logo, 0, 0, mask.width, mask.height);
      const pixels = maskContext.getImageData(0, 0, mask.width, mask.height);
      for (let index = 0; index < pixels.data.length; index += 4) {
        const red = pixels.data[index];
        const green = pixels.data[index + 1];
        const blue = pixels.data[index + 2];
        const lineStrength = Math.max(0, Math.min(255, (green - 82) * 3 + (blue - 55) * 1.4));
        const isCreamLine = green > 92 && blue > 54 && red > green;
        pixels.data[index] = 216;
        pixels.data[index + 1] = 68;
        pixels.data[index + 2] = 11;
        pixels.data[index + 3] = isCreamLine ? lineStrength : 0;
      }
      maskContext.putImageData(pixels, 0, 0);
      const startedAt = performance.now();
      const paint = (time: number) => {
        context.clearRect(0, 0, 340, 210);
        const progress = reduceMotion ? 1 : Math.min(1, (time - startedAt) / 2100);
        const eased = 1 - Math.pow(1 - progress, 3);
        context.save();
        context.drawImage(mask, 60, -5, 220, 220);
        context.globalCompositeOperation = "destination-in";
        const reveal = context.createLinearGradient(40, 0, 300, 0);
        reveal.addColorStop(0, "#000");
        reveal.addColorStop(Math.max(0, eased - 0.14), "#000");
        reveal.addColorStop(Math.min(1, eased), "#0000");
        reveal.addColorStop(1, "#0000");
        context.fillStyle = reveal;
        context.fillRect(0, 0, 340, 210);
        context.restore();
        if (progress < 1 && !reduceMotion) frame = requestAnimationFrame(paint);
      };
      frame = requestAnimationFrame(paint);
    };
    paintLogoMask().catch(() => {});
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <section className="brand-intro" role="dialog" aria-modal="true" aria-label="福宠品牌开场动画">
      <button className="brand-intro-back" onClick={onClose} aria-label="跳过动画并返回网站">‹</button>
      <div className="brand-intro-glow" />
      <div className="brand-intro-orbit"><i /><i /><i /></div>
      <div className="brand-intro-stage">
        <div className="brand-intro-red" />
        <canvas ref={canvasRef} className="brand-intro-canvas" aria-hidden="true" />
        <img className="brand-intro-final" src="/assets/fuchong-logo.webp" alt="福宠猫狗线条标志" />
      </div>
      <div className="brand-intro-copy">
        <small>FUCHONG · LIFE TOGETHER</small>
        <h1>让相遇，成为长久的家</h1>
        <p>真实相伴，从认真看见开始</p>
      </div>
      <div className="brand-intro-auto"><i /><span>即将自动进入福宠</span></div>
      <span className="brand-intro-hint">无需操作 · 左上角可提前返回</span>
    </section>
  );
}

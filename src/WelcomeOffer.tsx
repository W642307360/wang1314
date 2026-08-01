import { useCallback, useEffect, useState } from "react";
import "./WelcomeOffer.css";

const OFFER_DURATION = 2300;
const EXIT_DURATION = 280;

export function WelcomeOffer({ onClose }: { onClose: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const [imageReady, setImageReady] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const leave = useCallback(() => {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(onClose, EXIT_DURATION);
  }, [leaving, onClose]);
  useEffect(() => {
    if (!imageReady) return;
    const timer = window.setTimeout(leave, OFFER_DURATION);
    return () => window.clearTimeout(timer);
  }, [imageReady, leave]);
  return (
    <section className={`welcome-offer${leaving ? " leaving" : ""}`} role="dialog" aria-modal="true" aria-label="福宠新用户福利">
      <div className="welcome-offer-card">
        <button className="welcome-offer-close" type="button" onClick={leave} aria-label="关闭福利窗口">×</button>
        {!imageReady && !imageFailed && <span className="welcome-offer-loading">福宠福利加载中…</span>}
        {imageFailed && <button className="welcome-offer-retry" type="button" onClick={() => { setImageFailed(false); setImageReady(false); }}>图片加载失败，点击重试</button>}
        {!imageFailed && <img className={imageReady ? "ready" : ""} src="/assets/brand/fuchong-mobile-welcome-20260801.webp?asset_source=origin-20260801" alt="福宠新用户服务与福利" width="768" height="1152" decoding="sync" fetchPriority="high" onLoad={() => setImageReady(true)} onError={() => setImageFailed(true)} />}
      </div>
      <button className="welcome-offer-enter" type="button" onClick={leave}>立即开启</button>
      {imageReady && <div className="welcome-offer-progress" aria-hidden="true"><i /></div>}
    </section>
  );
}

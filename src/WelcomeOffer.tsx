import { useCallback, useEffect, useState } from "react";
import "./WelcomeOffer.css";

const OFFER_DURATION = 2300;
const EXIT_DURATION = 280;

export function WelcomeOffer({ onClose }: { onClose: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const leave = useCallback(() => {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(onClose, EXIT_DURATION);
  }, [leaving, onClose]);
  useEffect(() => {
    const timer = window.setTimeout(leave, OFFER_DURATION);
    return () => window.clearTimeout(timer);
  }, [leave]);
  return (
    <section className={`welcome-offer${leaving ? " leaving" : ""}`} role="dialog" aria-modal="true" aria-label="福宠新用户福利">
      <div className="welcome-offer-card">
        <button className="welcome-offer-close" type="button" onClick={leave} aria-label="关闭福利窗口">×</button>
        <img src="/assets/brand/fuchong-mobile-welcome-20260801.webp" alt="福宠新用户服务与福利" width="768" height="1152" decoding="async" />
      </div>
      <button className="welcome-offer-enter" type="button" onClick={leave}>立即开启</button>
      <div className="welcome-offer-progress" aria-hidden="true"><i /></div>
    </section>
  );
}

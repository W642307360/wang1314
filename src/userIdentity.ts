import { useEffect, useState } from "react";

export const identityEvent = "fuchong-identity-change";

export const storedUserId = () =>
  Math.max(0, Number(localStorage.getItem("fuchong-user-id") || 0));

export const publishUserId = (userId: number) => {
  if (userId > 0) localStorage.setItem("fuchong-user-id", String(userId));
  else localStorage.removeItem("fuchong-user-id");
  window.dispatchEvent(new CustomEvent(identityEvent, { detail: { userId } }));
};

export const useUserId = () => {
  const [userId, setUserId] = useState(storedUserId);
  useEffect(() => {
    const update = () => setUserId(storedUserId());
    window.addEventListener(identityEvent, update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener(identityEvent, update);
      window.removeEventListener("storage", update);
    };
  }, []);
  return userId;
};

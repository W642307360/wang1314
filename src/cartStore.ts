export type StoredCartPet = {
  cart_id: string | number;
  pet_id?: number | null;
  name: string;
  breed: string;
  gender?: string;
  age_months?: number;
  price: number;
  image?: string;
  seller_name?: string;
  quantity?: number;
  added_at: string;
};

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:3001";
const legacyKey = "fuchong-cart";
const keyFor = (userId: number) => `fuchong-cart:${Math.max(0, userId)}`;

export const currentCartUserId = () => Number(localStorage.getItem("fuchong-user-id") || 0);

export const readCart = (userId = currentCartUserId()): StoredCartPet[] => {
  try {
    const userKey = keyFor(userId);
    const existing = localStorage.getItem(userKey);
    const legacy = localStorage.getItem(legacyKey);
    if (!existing && legacy) {
      localStorage.setItem(userKey, legacy);
      localStorage.removeItem(legacyKey);
    }
    const parsed = JSON.parse(localStorage.getItem(userKey) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const writeCart = (items: StoredCartPet[], userId = currentCartUserId()) => {
  localStorage.setItem(keyFor(userId), JSON.stringify(items.slice(0, 200)));
  window.dispatchEvent(new Event("fuchong-cart-change"));
};

export const loadCartFromServer = async (userId = currentCartUserId()) => {
  if (!userId) return [];
  const response = await fetch(`${API_BASE}/api/cart?user_id=${userId}`);
  if (!response.ok) throw new Error("购物车同步失败");
  const items = await response.json();
  const safe = Array.isArray(items) ? items : [];
  writeCart(safe, userId);
  return safe as StoredCartPet[];
};

export const mergeCartToServer = async (userId: number, items: StoredCartPet[]) => {
  if (!userId) return [];
  if (!items.length) return loadCartFromServer(userId);
  const response = await fetch(`${API_BASE}/api/cart/merge`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ user_id: userId, items }),
  });
  if (!response.ok) throw new Error("购物车合并失败");
  return loadCartFromServer(userId);
};

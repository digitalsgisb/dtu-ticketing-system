import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type PwaValue = {
  canInstall: boolean;
  isInstalled: boolean;
  isOnline: boolean;
  install: () => Promise<boolean>;
};

const PwaContext = createContext<PwaValue | null>(null);

export function PwaProvider({ children }: { children: ReactNode }) {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [isInstalled, setIsInstalled] = useState(() => window.matchMedia("(display-mode: standalone)").matches);

  useEffect(() => {
    let refreshForNewVersion: (() => void) | undefined;
    if ("serviceWorker" in navigator) {
      let refreshing = false;
      refreshForNewVersion = () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      };
      navigator.serviceWorker.addEventListener("controllerchange", refreshForNewVersion);
      void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" })
        .then(registration => registration.update())
        .catch(() => undefined);
    }

    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstallPrompt(null);
      setIsInstalled(true);
    };
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);

    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      if (refreshForNewVersion) navigator.serviceWorker.removeEventListener("controllerchange", refreshForNewVersion);
      window.removeEventListener("beforeinstallprompt", onInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const value = useMemo<PwaValue>(() => ({
    canInstall: Boolean(installPrompt) && !isInstalled,
    isInstalled,
    isOnline,
    install: async () => {
      if (!installPrompt) return false;
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") setInstallPrompt(null);
      return choice.outcome === "accepted";
    }
  }), [installPrompt, isInstalled, isOnline]);

  return <PwaContext.Provider value={value}>{children}</PwaContext.Provider>;
}

export function usePwa() {
  const value = useContext(PwaContext);
  if (!value) throw new Error("PwaProvider is missing");
  return value;
}

export async function showDeviceNotification(title: string, options: NotificationOptions & { data?: { url?: string } } = {}) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(title, {
      icon: "/pwa-192.png",
      badge: "/pwa-192.png",
      ...options
    });
    return;
  }
  new Notification(title, options);
}

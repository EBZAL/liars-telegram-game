export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramHapticFeedback {
  impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
  notificationOccurred(type: 'error' | 'success' | 'warning'): void;
  selectionChanged(): void;
}

export interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    query_id?: string;
    user?: TelegramUser;
    auth_date?: number;
    hash?: string;
    start_param?: string;
  };
  colorScheme: 'light' | 'dark';
  themeParams: Record<string, string>;
  isExpanded: boolean;
  viewportHeight: number;
  viewportStableHeight: number;
  headerColor: string;
  backgroundColor: string;
  HapticFeedback?: TelegramHapticFeedback;
  expand(): void;
  close(): void;
  ready(): void;
  enableClosingConfirmation(): void;
  disableClosingConfirmation(): void;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
  openTelegramLink?(url: string): void;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

export interface TelegramAdapterContext {
  isAvailable: boolean;
  initData: string;
  startParam: string | null;
  user: TelegramUser | null;
  colorScheme: 'light' | 'dark';
  viewportHeight: number;
  isExpanded: boolean;
  expand: () => void;
  ready: () => void;
  enableClosingConfirmation: () => void;
}

function extractStartParam(webApp?: TelegramWebApp): string | null {
  if (webApp?.initDataUnsafe?.start_param) {
    return webApp.initDataUnsafe.start_param;
  }
  if (webApp?.initData) {
    try {
      const initParams = new URLSearchParams(webApp.initData);
      const sp =
        initParams.get('start_param') ||
        initParams.get('startapp') ||
        initParams.get('roomId');
      if (sp) return sp;
    } catch {}
  }
  if (typeof window !== 'undefined') {
    const searchParams = new URLSearchParams(window.location.search);
    const fromSearch =
      searchParams.get('startapp') ||
      searchParams.get('tgWebAppStartParam') ||
      searchParams.get('start_param') ||
      searchParams.get('roomId') ||
      searchParams.get('start');
    if (fromSearch) return fromSearch;

    if (window.location.hash) {
      try {
        const hashStr = window.location.hash.replace(/^#/, '');
        const hashParams = new URLSearchParams(hashStr);
        const fromHash =
          hashParams.get('tgWebAppStartParam') ||
          hashParams.get('startapp') ||
          hashParams.get('start_param') ||
          hashParams.get('roomId') ||
          hashParams.get('start');
        if (fromHash) return fromHash;

        const tgWebAppData = hashParams.get('tgWebAppData');
        if (tgWebAppData) {
          const innerParams = new URLSearchParams(tgWebAppData);
          const fromInner =
            innerParams.get('start_param') ||
            innerParams.get('startapp') ||
            innerParams.get('roomId');
          if (fromInner) return fromInner;
        }
      } catch {}
    }
  }
  return null;
}

function safeGetStorage(type: 'session' | 'local', key: string): string | null {
  try {
    if (typeof window === 'undefined') return null;
    const store = type === 'session' ? window.sessionStorage : window.localStorage;
    if (store && typeof store.getItem === 'function') {
      return store.getItem(key);
    }
  } catch {}
  return null;
}

function safeSetStorage(type: 'session' | 'local', key: string, value: string): void {
  try {
    if (typeof window === 'undefined') return;
    const store = type === 'session' ? window.sessionStorage : window.localStorage;
    if (store && typeof store.setItem === 'function') {
      store.setItem(key, value);
    }
  } catch {}
}

function extractRawInitData(webApp?: TelegramWebApp): string {
  if (webApp?.initData && webApp.initData.trim().length > 0) {
    return webApp.initData.trim();
  }

  if (typeof window !== 'undefined') {
    if (window.location.hash) {
      try {
        const hashStr = window.location.hash.replace(/^#/, '');
        const hashParams = new URLSearchParams(hashStr);
        const tgData = hashParams.get('tgWebAppData');
        if (tgData && tgData.trim().length > 0) {
          return tgData.trim();
        }
      } catch {}
    }

    if (window.location.search) {
      try {
        const searchParams = new URLSearchParams(window.location.search);
        const tgData = searchParams.get('tgWebAppData') || searchParams.get('initData');
        if (tgData && tgData.trim().length > 0) {
          return tgData.trim();
        }
      } catch {}
    }

    const storedSession = safeGetStorage('session', 'liars_deck_tg_init_data');
    if (storedSession && storedSession.trim().length > 0) {
      return storedSession.trim();
    }

    const storedLocal = safeGetStorage('local', 'liars_deck_tg_init_data');
    if (storedLocal && storedLocal.trim().length > 0) {
      return storedLocal.trim();
    }
  }

  return '';
}

function extractTelegramUser(webApp?: TelegramWebApp, rawInitData?: string): TelegramUser | null {
  if (webApp?.initDataUnsafe?.user?.id) {
    return webApp.initDataUnsafe.user;
  }

  if (rawInitData && rawInitData.length > 0) {
    try {
      const params = new URLSearchParams(rawInitData);
      const userStr = params.get('user');
      if (userStr) {
        const parsed = JSON.parse(userStr);
        if (parsed && parsed.id) {
          return parsed as TelegramUser;
        }
      }
    } catch {}
  }

  if (typeof window !== 'undefined') {
    const storedSession = safeGetStorage('session', 'liars_deck_tg_user');
    if (storedSession) {
      try {
        const parsed = JSON.parse(storedSession);
        if (parsed && parsed.id) return parsed as TelegramUser;
      } catch {}
    }

    const storedLocal = safeGetStorage('local', 'liars_deck_tg_user');
    if (storedLocal) {
      try {
        const parsed = JSON.parse(storedLocal);
        if (parsed && parsed.id) return parsed as TelegramUser;
      } catch {}
    }
  }

  return null;
}

/**
 * Initializes and provides a safe abstraction over window.Telegram.WebApp.
 * Supports running inside Telegram or in standalone web browsers with mock fallback.
 */
export function getTelegramAdapter(): TelegramAdapterContext {
  const webApp = typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined;
  const rawInitData = extractRawInitData(webApp);
  const telegramUser = extractTelegramUser(webApp, rawInitData);

  // Cache in storage if available
  if (rawInitData) {
    safeSetStorage('session', 'liars_deck_tg_init_data', rawInitData);
    safeSetStorage('local', 'liars_deck_tg_init_data', rawInitData);
  }
  if (telegramUser) {
    safeSetStorage('session', 'liars_deck_tg_user', JSON.stringify(telegramUser));
    safeSetStorage('local', 'liars_deck_tg_user', JSON.stringify(telegramUser));
  }

  if (rawInitData || telegramUser || (webApp && webApp.initData)) {
    return {
      isAvailable: true,
      initData: rawInitData,
      startParam: extractStartParam(webApp),
      user: telegramUser,
      colorScheme: webApp?.colorScheme ?? 'dark',
      viewportHeight: webApp?.viewportHeight ?? (typeof window !== 'undefined' ? window.innerHeight : 800),
      isExpanded: Boolean(webApp?.isExpanded ?? true),
      expand: () => {
        try {
          webApp?.expand();
        } catch {
          // Ignore
        }
      },
      ready: () => {
        try {
          webApp?.ready();
        } catch {
          // Ignore
        }
      },
      enableClosingConfirmation: () => {
        try {
          webApp?.enableClosingConfirmation();
        } catch {
          // Ignore
        }
      },
    };
  }

  // Standalone browser fallback
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const mockStartParam = searchParams.get('startapp') || searchParams.get('roomId') || null;
  const mockUserId = searchParams.get('mockUser') || 'player-standalone';

  return {
    isAvailable: false,
    initData: '',
    startParam: mockStartParam,
    user: {
      id: 999999,
      first_name: 'Player',
      username: mockUserId,
    },
    colorScheme: 'dark',
    viewportHeight: typeof window !== 'undefined' ? window.innerHeight : 800,
    isExpanded: true,
    expand: () => {},
    ready: () => {},
    enableClosingConfirmation: () => {},
  };
}

/**
 * Triggers a heavy/rigid shock vibration on lethal bullet shot
 */
export function triggerLethalShotHaptic(): void {
  try {
    const haptic = typeof window !== 'undefined' ? window.Telegram?.WebApp?.HapticFeedback : undefined;
    if (haptic && typeof haptic.impactOccurred === 'function') {
      haptic.impactOccurred('heavy');
      haptic.notificationOccurred?.('error');
    } else if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([180, 60, 220]);
    }
  } catch {}
}

/**
 * Triggers an intense warning shock vibration on CALL LIAR accusation
 */
export function triggerLiarCallHaptic(): void {
  try {
    const haptic = typeof window !== 'undefined' ? window.Telegram?.WebApp?.HapticFeedback : undefined;
    if (haptic && typeof haptic.notificationOccurred === 'function') {
      haptic.notificationOccurred('warning');
    } else if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([80, 40, 120]);
    }
  } catch {}
}
/**
 * Triggers a light relief vibration on empty blank chamber
 */
export function triggerBlankShotHaptic(): void {
  try {
    const haptic = typeof window !== 'undefined' ? window.Telegram?.WebApp?.HapticFeedback : undefined;
    if (haptic && typeof haptic.impactOccurred === 'function') {
      haptic.impactOccurred('light');
    } else if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(50);
    }
  } catch {}
}

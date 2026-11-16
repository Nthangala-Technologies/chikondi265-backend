import {
  getCurrentUser,
  loginAccount,
  logoutAccount,
  registerAccount,
  type AuthSessionResponse,
  type CurrentUserResponse,
  type LoginAccountInput,
  type RegisterAccountInput,
} from "@workspace/api-client-react";
import * as SecureStore from "expo-secure-store";
import { useQueryClient } from "@tanstack/react-query";
import { Platform } from "react-native";
import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const authTokenKey = "kupeza.auth.session-token";

type AuthStatus =
  | "checking"
  | "signed-out"
  | "signed-in"
  | "session-unavailable";

type AuthContextValue = {
  status: AuthStatus;
  account: CurrentUserResponse | null;
  sessionNotice: string | null;
  register: (input: RegisterAccountInput) => Promise<void>;
  login: (input: LoginAccountInput) => Promise<void>;
  logout: () => Promise<void>;
  retrySessionRestore: () => Promise<void>;
  refreshAccount: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function apiMessage(error: unknown, fallback: string): string {
  if (!error || typeof error !== "object") return fallback;
  const data = (error as { data?: unknown }).data;
  if (data && typeof data === "object") {
    const envelope = (data as { error?: { message?: unknown } }).error;
    if (typeof envelope?.message === "string") return envelope.message;
  }
  return fallback;
}

function statusCode(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

async function saveSession(session: AuthSessionResponse) {
  if (Platform.OS === "web") {
    if (typeof window === "undefined") {
      throw new Error("Web session storage is unavailable.");
    }
    window.sessionStorage.setItem(authTokenKey, session.token);
    return;
  }
  await SecureStore.setItemAsync(authTokenKey, session.token, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function getStoredSessionToken(): Promise<string | null> {
  if (Platform.OS === "web") {
    return typeof window === "undefined"
      ? null
      : window.sessionStorage.getItem(authTokenKey);
  }
  return SecureStore.getItemAsync(authTokenKey);
}

async function deleteStoredSessionToken(): Promise<void> {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(authTokenKey);
    }
    return;
  }
  await SecureStore.deleteItemAsync(authTokenKey);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>("checking");
  const [account, setAccount] = useState<CurrentUserResponse | null>(null);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const restoreAttempt = useRef(0);

  const retrySessionRestore = useCallback(async () => {
    const attempt = ++restoreAttempt.current;
    setStatus("checking");
    setSessionNotice(null);
    try {
      const token = await getStoredSessionToken();
      if (attempt !== restoreAttempt.current) return;
      if (!token) {
        setAccount(null);
        setStatus("signed-out");
        return;
      }

      const currentAccount = await getCurrentUser();
      if (attempt !== restoreAttempt.current) return;
      setAccount(currentAccount);
      setStatus("signed-in");
    } catch (error) {
      if (attempt !== restoreAttempt.current) return;
      if (statusCode(error) === 401 || statusCode(error) === 403) {
        await deleteStoredSessionToken().catch(() => undefined);
        if (attempt !== restoreAttempt.current) return;
        setAccount(null);
        setSessionNotice(null);
        setStatus("signed-out");
        return;
      }

      setAccount(null);
      setSessionNotice(
        "Your saved sign-in is still on this device, but we couldn't verify it. Check your connection and try again.",
      );
      setStatus("session-unavailable");
    }
  }, []);

  useEffect(() => {
    void retrySessionRestore();
  }, [retrySessionRestore]);

  const finishSignIn = useCallback(async (session: AuthSessionResponse) => {
    await saveSession(session);
    await queryClient.cancelQueries();
    queryClient.clear();
    setAccount({
      userId: session.userId,
      email: session.email,
      profile: session.profile,
    });
    setSessionNotice(null);
    setStatus("signed-in");
  }, [queryClient]);

  const register = useCallback(
    async (input: RegisterAccountInput) => {
      try {
        await finishSignIn(await registerAccount(input));
      } catch (error) {
        throw new Error(
          apiMessage(
            error,
            "We couldn't create your account. Check your connection and try again.",
          ),
        );
      }
    },
    [finishSignIn],
  );

  const login = useCallback(
    async (input: LoginAccountInput) => {
      try {
        await finishSignIn(await loginAccount(input));
      } catch (error) {
        throw new Error(
          apiMessage(
            error,
            "We couldn't sign you in. Check your connection and try again.",
          ),
        );
      }
    },
    [finishSignIn],
  );

  const logout = useCallback(async () => {
    let revokeError: unknown;
    try {
      await logoutAccount();
    } catch (error) {
      revokeError = error;
    }

    try {
      await deleteStoredSessionToken();
    } catch {
      await queryClient.cancelQueries();
      queryClient.clear();
      setAccount(null);
      setStatus("signed-out");
      throw new Error(
        "The session could not be removed from this device. Please retry sign out.",
      );
    }

    await queryClient.cancelQueries();
    queryClient.clear();
    setAccount(null);
    setStatus("signed-out");
    if (revokeError) {
      throw new Error(
        "This device is signed out, but the server couldn't revoke the session. Sign out again when you have a connection.",
      );
    }
  }, [queryClient]);

  const refreshAccount = useCallback(async () => {
    const currentAccount = await getCurrentUser();
    setAccount(currentAccount);
  }, []);

  const value = useMemo(
    () => ({
      status,
      account,
      sessionNotice,
      register,
      login,
      logout,
      retrySessionRestore,
      refreshAccount,
    }),
    [
      account,
      login,
      logout,
      refreshAccount,
      register,
      retrySessionRestore,
      sessionNotice,
      status,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}

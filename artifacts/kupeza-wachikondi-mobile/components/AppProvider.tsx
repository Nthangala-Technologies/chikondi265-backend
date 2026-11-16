import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';

export type Profile = {
  id: string;
  name: string;
  age: number;
  location: string;
  distance: number;
  bio: string;
  interests: string[];
  intention: string;
  photo: string | number;
  verified: boolean;
  likedYou: boolean;
  online: boolean;
};
export type Match = { id: string; profileId: string; lastMessage: string; unread: number };
export type ChatMessage = { id: string; text: string; sender: 'me' | 'them'; time: string };
export type UserProfile = { name: string; age: number; location: string; bio: string; interests: string[]; intention: string; photo: string | number };

export const profileImages = {
  chisomo: require('@/assets/images/profile-chisomo.jpg'),
  thoko: require('@/assets/images/profile-thoko.jpg'),
  mwayi: require('@/assets/images/profile-mwayi.jpg'),
  logo: require('@/assets/images/chikondi-logo.png'),
  'woman-01': require('@/assets/images/profile-generated-woman-1.jpg'),
  'woman-02': require('@/assets/images/profile-generated-woman-2.jpg'),
  'woman-03': require('@/assets/images/profile-generated-woman-3.jpg'),
  'man-01': require('@/assets/images/profile-generated-man-1.jpg'),
  'man-02': require('@/assets/images/profile-generated-man-2.jpg'),
  'man-03': require('@/assets/images/profile-generated-man-3.jpg'),
};

export const generatedAvatarIds = [
  'woman-01',
  'woman-02',
  'woman-03',
  'man-01',
  'man-02',
  'man-03',
] as const;

export type GeneratedAvatarId = (typeof generatedAvatarIds)[number];

export function defaultAvatarForUser(userId: string): GeneratedAvatarId {
  let hash = 0;
  for (let index = 0; index < userId.length; index += 1) {
    hash = (hash * 31 + userId.charCodeAt(index)) >>> 0;
  }
  return generatedAvatarIds[hash % generatedAvatarIds.length];
}

export const profileSeed: Profile[] = [];

const emptyUser: UserProfile = {
  name: '',
  age: 0,
  location: '',
  bio: '',
  interests: [],
  intention: '',
  photo: 'woman-01',
};

function userFromAccount(account: ReturnType<typeof useAuth>['account']): UserProfile {
  const profile = account?.profile;
  if (!profile) return emptyUser;

  const today = new Date();
  const birthDate = new Date(`${profile.birthDate}T00:00:00.000Z`);
  let age = today.getUTCFullYear() - birthDate.getUTCFullYear();
  if (
    today.getUTCMonth() < birthDate.getUTCMonth() ||
    (today.getUTCMonth() === birthDate.getUTCMonth() &&
      today.getUTCDate() < birthDate.getUTCDate())
  ) {
    age -= 1;
  }

  return {
    name: profile.displayName,
    age,
    location: profile.city,
    bio: profile.bio,
    interests: profile.interests,
    intention: profile.intention,
    photo: profile.photoUrl ?? profile.photoId ?? defaultAvatarForUser(account.userId),
  };
}

type AppContextValue = {
  hydrated: boolean;
  user: UserProfile;
  liked: string[];
  passed: string[];
  matches: Match[];
  chats: Record<string, ChatMessage[]>;
  blocked: string[];
  paused: boolean;
  premium: string;
  setUser: (user: UserProfile) => void;
  actOnProfile: (id: string, action: 'like' | 'pass' | 'super') => void;
  sendMessage: (matchId: string, text: string) => void;
  setPaused: (paused: boolean) => void;
  block: (id: string) => void;
  removeMatch: (id: string) => void;
  setPremium: (plan: string) => void;
};

const AppContext = createContext<AppContextValue | null>(null);
const storageKey = 'kupeza-mobile-state';

export function AppProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const accountId = auth.account?.userId ?? null;
  const storageKey = accountId ? `kupeza-mobile-state:v1:${accountId}` : null;
  const [hydrated, setHydrated] = useState(false);
  const [user, setUser] = useState<UserProfile>(emptyUser);
  const [liked, setLiked] = useState<string[]>([]);
  const [passed, setPassed] = useState<string[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [chats, setChats] = useState<Record<string, ChatMessage[]>>({});
  const [blocked, setBlocked] = useState<string[]>([]);
  const [paused, setPaused] = useState(false);
  const [premium, setPremium] = useState('free');

  useEffect(() => {
    let active = true;
    setHydrated(false);
    setUser(userFromAccount(auth.account));
    setLiked([]);
    setPassed([]);
    setMatches([]);
    setChats({});
    setBlocked([]);
    setPaused(false);
    setPremium('free');

    if (!storageKey) {
      setHydrated(true);
      return () => {
        active = false;
      };
    }

    AsyncStorage.getItem(storageKey)
      .then((raw) => {
        if (!active || !raw) return;
        try {
          const saved = JSON.parse(raw);
          setLiked(Array.isArray(saved.liked) ? saved.liked : []);
          setPassed(Array.isArray(saved.passed) ? saved.passed : []);
          setMatches(Array.isArray(saved.matches) ? saved.matches : []);
          setChats(
            saved.chats && typeof saved.chats === 'object' ? saved.chats : {},
          );
          setBlocked(Array.isArray(saved.blocked) ? saved.blocked : []);
          setPaused(saved.paused === true);
          setPremium(typeof saved.premium === 'string' ? saved.premium : 'free');
        } catch {
          // Ignore invalid local demo state; the account profile comes from the API.
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setHydrated(true);
      });

    return () => {
      active = false;
    };
  }, [auth.account, storageKey]);

  useEffect(() => {
    if (!hydrated || !storageKey) return;
    AsyncStorage.setItem(
      storageKey,
      JSON.stringify({ liked, passed, matches, chats, blocked, paused, premium }),
    ).catch(() => undefined);
  }, [blocked, chats, hydrated, liked, matches, passed, paused, premium, storageKey]);

  const actOnProfile = (id: string, action: 'like' | 'pass' | 'super') => {
    if (action === 'pass') {
      setPassed((current) => current.includes(id) ? current : [...current, id]);
      return;
    }
    setLiked((current) => current.includes(id) ? current : [...current, id]);
  };

  const sendMessage = (matchId: string, text: string) => {
    const clean = text.trim();
    if (!clean) return;
    setChats((current) => ({ ...current, [matchId]: [...(current[matchId] ?? []), { id: Date.now().toString(), text: clean, sender: 'me', time: 'now' }] }));
  };

  const value = useMemo(() => ({ hydrated, user, liked, passed, matches, chats, blocked, paused, premium, setUser, actOnProfile, sendMessage, setPaused, block: (id: string) => setBlocked((current) => [...new Set([...current, id])]), removeMatch: (id: string) => setMatches((current) => current.filter((match) => match.id !== id)), setPremium }), [blocked, chats, hydrated, liked, matches, passed, paused, premium, user]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside AppProvider');
  return value;
}

export function getProfile(id: string) {
  return profileSeed.find((profile) => profile.id === id);
}
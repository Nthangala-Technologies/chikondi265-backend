import type { PublicProfile } from '@workspace/api-client-react';
import { defaultAvatarForUser, type Profile } from '@/components/AppProvider';

export function toMobileProfile(profile: PublicProfile): Profile {
  return {
    id: profile.userId,
    name: profile.displayName,
    age: profile.age,
    location: profile.city,
    distance: 0,
    bio: profile.bio,
    interests: profile.interests,
    intention: profile.intention,
    photo: profile.photoUrl ?? profile.photoId ?? defaultAvatarForUser(profile.userId),
    verified: profile.verificationStatus === 'verified',
    likedYou: false,
    online: false,
  };
}

export function ageFromBirthDate(birthDate: string): number {
  const today = new Date();
  const date = new Date(`${birthDate}T00:00:00.000Z`);
  let age = today.getUTCFullYear() - date.getUTCFullYear();
  if (
    today.getUTCMonth() < date.getUTCMonth() ||
    (today.getUTCMonth() === date.getUTCMonth() &&
      today.getUTCDate() < date.getUTCDate())
  ) {
    age -= 1;
  }
  return age;
}

export function isAtLeast18(
  birthDate: string,
  today = new Date(),
): boolean {
  const birth = new Date(`${birthDate}T00:00:00.000Z`);
  if (
    Number.isNaN(birth.getTime()) ||
    birth.toISOString().slice(0, 10) !== birthDate
  ) {
    return false;
  }

  const todayUtc = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  if (birth > todayUtc) {
    return false;
  }

  let age = todayUtc.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday =
    todayUtc.getUTCMonth() < birth.getUTCMonth() ||
    (todayUtc.getUTCMonth() === birth.getUTCMonth() &&
      todayUtc.getUTCDate() < birth.getUTCDate());

  if (beforeBirthday) {
    age -= 1;
  }

  return age >= 18;
}

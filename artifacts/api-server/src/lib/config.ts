const rawPort = process.env.PORT ?? "8080";
const port = Number(rawPort);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

const configuredOrigins = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const replitDevelopmentOrigins =
  process.env.NODE_ENV === "development"
    ? [process.env.REPLIT_DEV_DOMAIN, process.env.REPLIT_EXPO_DEV_DOMAIN]
        .filter((domain): domain is string => Boolean(domain))
        .map((domain) => `https://${domain.replace(/^https?:\/\//, "")}`)
    : [];

const corsOrigins = [
  ...new Set([...configuredOrigins, ...replitDevelopmentOrigins]),
].map((origin) => {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error("CORS_ORIGINS must contain valid HTTP(S) origins.");
    }

    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.origin !== origin
    ) {
      throw new Error("CORS_ORIGINS must contain valid HTTP(S) origins.");
    }

    return parsed.origin;
  });

export const runtimeConfig = Object.freeze({
  port,
  corsOrigins: Object.freeze(corsOrigins),
});

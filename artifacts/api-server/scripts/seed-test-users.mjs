const apiBaseUrl = (
  process.env.API_BASE_URL ?? "https://chikondi265-backend-nine.vercel.app"
).replace(/\/+$/, "");
const password = process.env.QA_TEST_PASSWORD;

if (!password) {
  console.error("QA_TEST_PASSWORD is required; no requests were sent.");
  process.exit(1);
}

const profiles = [
  {
    firstName: "Chikondi",
    surname: "Phiri",
    age: 26,
    city: "Lilongwe",
    bio: "I work in Lilongwe and enjoy a quiet Sunday with family after a busy week. I’m hoping to meet someone kind who is serious about building something lasting.",
    interests: ["reading", "music", "travel", "cooking"],
    intention: "long-term",
  },
  {
    firstName: "Thandiwe",
    surname: "Banda",
    age: 24,
    city: "Blantyre",
    bio: "Most weekends you will find me trying a new recipe or visiting relatives in Blantyre. I value respect, laughter, and a relationship that grows with purpose.",
    interests: ["church", "cooking", "reading", "music"],
    intention: "marriage",
  },
  {
    firstName: "Mphatso",
    surname: "Mbewe",
    age: 31,
    city: "Mzuzu",
    bio: "I teach in Mzuzu and follow local football whenever I can. I’d like to meet someone easy-going who is open to seeing where a good connection goes.",
    interests: ["football", "hiking", "movies"],
    intention: "casual",
  },
  {
    firstName: "Tamandani",
    surname: "Chirwa",
    age: 22,
    city: "Zomba",
    bio: "I’m happiest with good music, a bit of dancing, and friends around the table. Looking for genuine company and someone who enjoys simple plans.",
    interests: ["dancing", "music", "photography"],
    intention: "friendship",
  },
  {
    firstName: "Limbani",
    surname: "Gondwe",
    age: 33,
    city: "Lilongwe",
    bio: "I run a small business in Lilongwe and make time for books and travel when I can. I’m ready to meet a thoughtful partner who shares a long-term outlook.",
    interests: ["business", "travel", "reading", "hiking"],
    intention: "long-term",
  },
  {
    firstName: "Chisomo",
    surname: "Zulu",
    age: 28,
    city: "Mangochi",
    bio: "Home cooking and time with family keep me grounded, and I enjoy taking photos when I visit new places. I’m looking for a committed relationship built on trust.",
    interests: ["cooking", "church", "photography", "travel"],
    intention: "marriage",
  },
  {
    firstName: "Takondwa",
    surname: "Nyirenda",
    age: 25,
    city: "Kasungu",
    bio: "I help with family farming near Kasungu and never miss a big football match. Hoping to meet a friendly person who appreciates an honest conversation.",
    interests: ["farming", "football", "movies"],
    intention: "friendship",
  },
  {
    firstName: "Dalitso",
    surname: "Kamanga",
    age: 30,
    city: "Blantyre",
    bio: "I work with local businesses in Blantyre and like winding down with music and good food. I’m looking for a steady connection with room for both people to grow.",
    interests: ["business", "music", "cooking", "football"],
    intention: "long-term",
  },
  {
    firstName: "Madalitso",
    surname: "Moyo",
    age: 20,
    city: "Zomba",
    bio: "I’m studying in Zomba and enjoy movies, dancing, and discovering new music. Open to meeting someone kind and seeing if we get along.",
    interests: ["movies", "dancing", "music"],
    intention: "casual",
  },
  {
    firstName: "Yamikani",
    surname: "Tembo",
    age: 34,
    city: "Mzuzu",
    bio: "I spend much of my week supporting my community and make time for church and the outdoors. I hope to meet someone ready for a serious, respectful partnership.",
    interests: ["church", "hiking", "reading", "farming"],
    intention: "marriage",
  },
  {
    firstName: "Wezi",
    surname: "Nkhoma",
    age: 27,
    city: "Lilongwe",
    bio: "Photography helps me notice the small things, and I enjoy weekend trips around Malawi. I’m looking for a purposeful relationship with someone who communicates openly.",
    interests: ["photography", "travel", "business"],
    intention: "long-term",
  },
  {
    firstName: "Kondwani",
    surname: "Nthala",
    age: 23,
    city: "Mangochi",
    bio: "Football, films, and cooking with friends make my weekends better. I’d enjoy meeting someone relaxed who is open to a real friendship first.",
    interests: ["football", "cooking", "movies"],
    intention: "friendship",
  },
  {
    firstName: "Tiyamike",
    surname: "Chiumia",
    age: 32,
    city: "Blantyre",
    bio: "I work in Blantyre and enjoy helping businesses find new ideas. I’m looking for a marriage-minded partner who values faith, family, and shared adventures.",
    interests: ["business", "church", "travel", "reading"],
    intention: "marriage",
  },
  {
    firstName: "Alinafe",
    surname: "Manda",
    age: 29,
    city: "Zomba",
    bio: "I love a good book, an early walk, and taking photos around Zomba. Hoping to meet someone warm and intentional who is ready to build a future together.",
    interests: ["reading", "hiking", "photography", "cooking"],
    intention: "long-term",
  },
];

const onlyArg = process.argv.slice(2).find((arg) => arg.startsWith("--only="));
if (process.argv.length > 2 && !onlyArg) {
  console.error("Usage: node seed-test-users.mjs [--only=<email>]");
  process.exit(1);
}

const onlyEmail = onlyArg?.slice("--only=".length).toLowerCase();
const selectedProfiles = onlyEmail
  ? profiles.filter(
      (person) => `qa-${person.firstName.toLowerCase()}@chikondi.test` === onlyEmail,
    )
  : profiles;

if (selectedProfiles.length === 0) {
  console.error("The --only email must match one of the seeded test accounts.");
  process.exit(1);
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function profileFor(person) {
  const birthYear = new Date().getUTCFullYear() - person.age;
  return {
    displayName: `${person.firstName} ${person.surname}`,
    birthDate: `${birthYear}-01-01`,
    city: person.city,
    countryCode: "MW",
    bio: person.bio,
    interests: person.interests,
    intention: person.intention,
  };
}

async function request(path, options) {
  let response = await fetch(`${apiBaseUrl}${path}`, options);
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get("retry-after"));
    if (!Number.isFinite(retryAfter) || retryAfter <= 0 || retryAfter > 900) {
      return response;
    }

    await response.arrayBuffer();
    await delay(retryAfter * 1000);
    response = await fetch(`${apiBaseUrl}${path}`, options);
  }
  return response;
}

async function responseBody(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function stopForResponse(response, body) {
  const code =
    body && typeof body === "object" && body.error && typeof body.error.code === "string"
      ? body.error.code
      : "UNKNOWN";
  console.error(`Stopped: HTTP ${response.status}; error code ${code}.`);
  process.exit(1);
}

async function main() {
  const summary = [];

  for (const person of selectedProfiles) {
    const email = `qa-${person.firstName.toLowerCase()}@chikondi.test`;
    const profile = profileFor(person);
    const registerResponse = await request("/api/v1/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ email, password, profile }),
    });
    let token;
    let action;

    if (registerResponse.status === 201) {
      const registration = await responseBody(registerResponse);
      token = registration?.token;
      action = "created";
    } else if (registerResponse.status === 409) {
      await registerResponse.arrayBuffer();
      const loginResponse = await request("/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const login = await responseBody(loginResponse);
      if (!loginResponse.ok) stopForResponse(loginResponse, login);
      token = login?.token;

      const updateResponse = await request("/api/v1/me/profile", {
        method: "PUT",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(profile),
      });
      const update = await responseBody(updateResponse);
      if (!updateResponse.ok) stopForResponse(updateResponse, update);
      action = "updated";
    } else {
      stopForResponse(registerResponse, await responseBody(registerResponse));
    }

    if (typeof token !== "string" || token.length === 0) {
      console.error(`Stopped: account setup did not return a session token (HTTP ${registerResponse.status}).`);
      process.exit(1);
    }

    summary.push({
      email,
      displayName: profile.displayName,
      age: person.age,
      city: person.city,
      intention: person.intention,
      action,
    });
  }

  console.table(summary);
}

main().catch(() => {
  console.error("Stopped: an unexpected request or script error occurred.");
  process.exit(1);
});

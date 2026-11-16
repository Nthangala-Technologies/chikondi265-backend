import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { profileImages } from "@/components/AppProvider";
import { AnimatedDatePickerField } from "@/components/AnimatedDatePickerField";
import { AnimatedDistrictPickerField } from "@/components/AnimatedDistrictPickerField";
import { IntentionPicker } from "@/components/IntentionPicker";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import type { Intention } from "@/utils/intentions";

type AuthMode = "login" | "register";

function validateName(value: string, label: string): string | undefined {
  const normalized = value.trim();
  if (!normalized) return `${label} is required.`;
  if (normalized.length > 50) return `${label} must be 50 characters or fewer.`;
  if (/\d/.test(normalized)) return `${label} cannot include numbers.`;
  return undefined;
}

function validatePassword(value: string): string | undefined {
  if (value.length < 12) return "Use at least 12 characters.";
  if (!/[A-Z]/.test(value)) return "Add an uppercase letter.";
  if (!/[a-z]/.test(value)) return "Add a lowercase letter.";
  if (!/[0-9]/.test(value)) return "Add a number.";
  if (!/[^A-Za-z0-9]/.test(value)) return "Add a symbol.";
  return undefined;
}

export default function WelcomeScreen() {
  const colors = useColors();
  const auth = useAuth();
  const [mode, setMode] = useState<AuthMode>("login");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [registrationAttempted, setRegistrationAttempted] = useState(false);
  const [birthDate, setBirthDate] = useState("");
  const [city, setCity] = useState("");
  const [intention, setIntention] = useState<Intention | "">("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (auth.status === "signed-in") router.replace("/(tabs)");
  }, [auth.status]);

  const isRegistering = mode === "register";
  const firstNameError = registrationAttempted
    ? validateName(firstName, "Name")
    : undefined;
  const lastNameError = registrationAttempted
    ? validateName(lastName, "Surname")
    : undefined;
  const passwordError = registrationAttempted
    ? validatePassword(password)
    : undefined;
  const confirmPasswordError =
    registrationAttempted && confirmPassword !== password
      ? "Passwords do not match."
      : undefined;
  const intentionError =
    registrationAttempted && !intention
      ? "Choose what you're looking for."
      : undefined;

  async function submit() {
    setError(null);
    if (
      isRegistering &&
      (
        validateName(firstName, "Name") ||
        validateName(lastName, "Surname") ||
        validatePassword(password) ||
        !confirmPassword ||
        confirmPassword !== password ||
        !intention
      )
    ) {
      setRegistrationAttempted(true);
      return;
    }
    setBusy(true);
    try {
      if (isRegistering) {
        const selectedIntention = intention;
        if (!selectedIntention) {
          setRegistrationAttempted(true);
          return;
        }
        await auth.register({
          identifier,
          password,
          profile: {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            birthDate,
            city,
            intention: selectedIntention,
          },
        });
      } else {
        await auth.login({ identifier, password });
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "We couldn't complete that request. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (auth.status === "checking") {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <Image source={profileImages.logo} resizeMode="contain" style={styles.loadingLogo} />
        <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
          Checking your session…
        </Text>
      </View>
    );
  }

  if (auth.status === "session-unavailable") {
    return (
      <View style={[styles.sessionRecovery, { backgroundColor: colors.background }]}>
        <Image
          source={profileImages.logo}
          resizeMode="contain"
          style={styles.loadingLogo}
        />
        <Text style={[styles.recoveryTitle, { color: colors.foreground }]}>
          Your saved sign-in is still here
        </Text>
        <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
          {auth.sessionNotice}
        </Text>
        <Button
          onPress={() => void auth.retrySessionRestore()}
          testID="button-retry-session"
        >
          Try again
        </Button>
        <Pressable
          accessibilityRole="button"
          onPress={() => void auth.logout().catch(() => undefined)}
          style={styles.switchMode}
        >
          <Text style={[styles.switchLabel, { color: colors.primary }]}>
            Sign in with another account
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAwareScrollViewCompat
      contentContainerStyle={[
        styles.page,
        { backgroundColor: colors.background },
      ]}
      keyboardShouldPersistTaps="handled"
      bottomOffset={32}
    >
      <View style={styles.brandMark}>
        <Image source={profileImages.logo} resizeMode="contain" style={styles.logo} />
        <Text style={[styles.eyebrow, { color: colors.primary }]}>
          A Malawi-first dating app
        </Text>
      </View>

      <Text style={[styles.title, { color: colors.foreground }]}>
        {isRegistering ? "Create your\naccount." : "Find your\n"}
        {!isRegistering && (
          <Text style={{ color: colors.primary }}>person.</Text>
        )}
      </Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
        {isRegistering
          ? "Start with a secure account and an adult profile."
          : "Sign in to continue meeting people who want something intentional."}
      </Text>

      <View style={styles.form}>
        {isRegistering && (
          <>
            <Field
              label="Name"
              value={firstName}
              onChangeText={setFirstName}
              autoCapitalize="words"
              testID="input-registration-first-name"
              error={firstNameError}
            />
            <Field
              label="Surname"
              value={lastName}
              onChangeText={setLastName}
              autoCapitalize="words"
              testID="input-registration-last-name"
              error={lastNameError}
            />
            <AnimatedDatePickerField
              label="Date of birth"
              value={birthDate}
              onChange={setBirthDate}
              testID="input-registration-birth-date"
            />
            <AnimatedDistrictPickerField
              label="District"
              value={city}
              onChange={setCity}
              testID="input-registration-city"
            />
            <IntentionPicker
              label="What are you looking for?"
              value={intention}
              onChange={setIntention}
              error={intentionError}
              testID="input-registration-intention"
            />
          </>
        )}
        <Field
          label="Email or phone"
          value={identifier}
          onChangeText={setIdentifier}
          placeholder="you@example.com or +265…"
          keyboardType="default"
          autoCapitalize="none"
          autoComplete="email"
          testID="input-auth-email"
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPasswords}
          secureToggle={{
            visible: showPasswords,
            onPress: () => setShowPasswords((visible) => !visible),
          }}
          autoCapitalize="none"
          autoComplete={isRegistering ? "new-password" : "current-password"}
          testID="input-auth-password"
          error={isRegistering ? passwordError : undefined}
        />
        {isRegistering && (
          <Field
            label="Confirm password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry={!showPasswords}
            autoCapitalize="none"
            autoComplete="new-password"
            testID="input-auth-confirm-password"
            error={confirmPasswordError}
          />
        )}

        {isRegistering && (
          <Text style={[styles.helper, { color: colors.mutedForeground }]}>
            Use 12+ characters with uppercase, lowercase, a number, and a symbol. Chikondi265 App is for adults 18 and over.
          </Text>
        )}
        {(error || auth.sessionNotice) && (
          <Text
            accessibilityRole="alert"
            style={[styles.error, { color: colors.primary }]}
          >
            {error ?? auth.sessionNotice}
          </Text>
        )}
        <Button
          onPress={submit}
          disabled={busy}
          testID={isRegistering ? "button-register" : "button-login"}
        >
          {busy
            ? "Please wait…"
            : isRegistering
              ? "Create account"
              : "Sign in"}
        </Button>
        <Pressable
          onPress={() => {
            setError(null);
            setRegistrationAttempted(false);
            setMode(isRegistering ? "login" : "register");
          }}
          accessibilityRole="button"
          style={styles.switchMode}
        >
          <Text style={{ color: colors.mutedForeground }}>
            {isRegistering ? "Already have an account? " : "New to Chikondi265 App? "}
            <Text style={[styles.switchLabel, { color: colors.primary }]}>
              {isRegistering ? "Sign in" : "Create an account"}
            </Text>
          </Text>
        </Pressable>
      </View>
    </KeyboardAwareScrollViewCompat>
  );
}

function Field({
  label,
  testID,
  error,
  secureToggle,
  ...inputProps
}: {
  label: string;
  testID: string;
  error?: string;
  secureToggle?: { visible: boolean; onPress: () => void };
} & React.ComponentProps<typeof TextInput>) {
  const colors = useColors();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>
        {label}
      </Text>
      <View>
        <TextInput
          {...inputProps}
          testID={testID}
          style={[
            styles.input,
            secureToggle && styles.inputWithToggle,
            {
              borderColor: colors.border,
              color: colors.foreground,
              backgroundColor: colors.card,
            },
          ]}
          placeholderTextColor={colors.mutedForeground}
          autoCorrect={false}
          accessibilityLabel={label}
        />
        {secureToggle ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={secureToggle.visible ? "Hide passwords" : "Show passwords"}
            onPress={secureToggle.onPress}
            style={styles.visibilityButton}
            testID={`${testID}-visibility`}
          >
            <Feather
              name={secureToggle.visible ? "eye-off" : "eye"}
              size={18}
              color={colors.mutedForeground}
            />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={[styles.fieldError, { color: colors.primary }]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  sessionRecovery: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 28,
  },
  loadingText: { fontSize: 14 },
  recoveryTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    textAlign: "center",
  },
  page: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 26,
    paddingTop: 48,
    paddingBottom: 32,
  },
  brandMark: { alignItems: "center", marginBottom: 22 },
  logo: {
    width: 92,
    height: 92,
    marginBottom: 18,
  },
  loadingLogo: { width: 56, height: 56 },
  eyebrow: {
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    fontSize: 11,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 42,
    lineHeight: 45,
    textAlign: "center",
    letterSpacing: -1.8,
  },
  subtitle: {
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    fontSize: 14,
    lineHeight: 22,
    maxWidth: 310,
    alignSelf: "center",
    marginTop: 14,
  },
  form: { gap: 12, marginTop: 26 },
  field: { gap: 6 },
  fieldError: { fontSize: 12, lineHeight: 17 },
  label: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: 15,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  inputWithToggle: { paddingRight: 52 },
  visibilityButton: {
    position: "absolute",
    right: 12,
    top: 0,
    bottom: 0,
    width: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  helper: { fontSize: 12, lineHeight: 18 },
  error: { fontSize: 13, lineHeight: 19, marginVertical: 2 },
  switchMode: { alignItems: "center", paddingVertical: 8 },
  switchLabel: { fontFamily: "Inter_700Bold" },
});

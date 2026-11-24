import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { build } from "esbuild";

const bundled = await build({
  entryPoints: [
    new URL("../src/modules/payments/webhook.ts", import.meta.url).pathname,
  ],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { processPayChanguWebhook } = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`
);

const TEST_SECRET = "isolated-webhook-test-secret";
const TX_REF = "kw_isolated_test_reference";

function signedRequest(payload) {
  const rawBody = Buffer.from(JSON.stringify(payload));
  const signature = createHmac("sha256", TEST_SECRET)
    .update(rawBody)
    .digest("hex");
  return { rawBody, signature };
}

function createIsolatedDependencies(verification, kind = "chat") {
  const state = {
    attempt:
      kind === "subscription"
        ? {
            kind,
            id: "test-attempt-1",
            userId: "test-user-a",
            txRef: TX_REF,
            amountMwk: 1500,
            currency: "MWK",
            status: "pending",
          }
        : {
            kind,
            id: "test-attempt-1",
            connectionId: "test-connection-1",
            txRef: TX_REF,
            amountMwk: 5000,
            currency: "MWK",
            status: "pending",
          },
    connection: {
      status: "matched",
      chatEnabledAt: null,
    },
    events: new Map(),
    verificationCalls: 0,
    completionCalls: 0,
    publishedUserIds: [],
  };

  return {
    state,
    dependencies: {
      webhookSecret: TEST_SECRET,
      async recordEvent(input) {
        assert.deepEqual(input.txRefCandidates, [TX_REF]);
        const key = `${TX_REF}:${input.eventType}:${input.payloadSha256}`;
        if (state.events.has(key)) {
          return { attempt: state.attempt, eventId: null };
        }

        const eventId = `test-event-${state.events.size + 1}`;
        state.events.set(key, {
          id: eventId,
          eventType: input.eventType,
          payloadSha256: input.payloadSha256,
          status: "received",
        });
        return { attempt: state.attempt, eventId };
      },
      async verifyTransaction(txRef) {
        state.verificationCalls += 1;
        assert.equal(txRef, TX_REF);
        return verification;
      },
      async markEventFailed(eventId, errorCode) {
        const event = [...state.events.values()].find(
          (candidate) => candidate.id === eventId,
        );
        assert.ok(event);
        event.status = "failed";
        event.errorCode = errorCode;
      },
      async completePayment({ attempt, eventId, providerTransactionId }) {
        assert.equal(attempt.id, state.attempt.id);
        const event = [...state.events.values()].find(
          (candidate) => candidate.id === eventId,
        );
        assert.ok(event);
        assert.equal(providerTransactionId, "test-provider-transaction");
        state.completionCalls += 1;
        state.attempt.status = "succeeded";
        if (attempt.kind === "chat") {
          state.connection.status = "chat_enabled";
          state.connection.chatEnabledAt = new Date("2026-01-01T00:00:00.000Z");
        }
        event.status = "processed";
      },
      async findAffectedUserIds(attempt) {
        return attempt.kind === "subscription"
          ? [attempt.userId]
          : ["test-user-a", "test-user-b"];
      },
      async publishUpdates(userIds) {
        state.publishedUserIds = userIds;
      },
    },
  };
}

const successPayload = {
  event: "charge.success",
  data: {
    tx_ref: TX_REF,
    status: "success",
    amount: 5000,
    currency: "MWK",
  },
};
test("signed success uses mocked verification and unlocks isolated test state", async () => {
  const { rawBody, signature } = signedRequest(successPayload);
  const fixture = createIsolatedDependencies({
    txRef: TX_REF,
    status: "success",
    amount: 5000,
    currency: "MWK",
    providerTransactionId: "test-provider-transaction",
  });

  await processPayChanguWebhook(
    rawBody,
    signature,
    fixture.dependencies,
  );

  assert.equal(fixture.state.verificationCalls, 1);
  assert.equal(fixture.state.attempt.status, "succeeded");
  assert.equal(fixture.state.connection.status, "chat_enabled");
  assert.ok(fixture.state.connection.chatEnabledAt instanceof Date);
  assert.deepEqual(fixture.state.publishedUserIds, [
    "test-user-a",
    "test-user-b",
  ]);
  assert.equal(
    [...fixture.state.events.values()][0].eventType,
    "charge.success",
  );

  // Replaying the exact payload is a no-op in the isolated event store.
  await processPayChanguWebhook(rawBody, signature, fixture.dependencies);
  assert.equal(fixture.state.events.size, 1);
  assert.equal(fixture.state.verificationCalls, 1);
  assert.equal(fixture.state.completionCalls, 1);
});

test("invalid signatures are rejected before touching the isolated event store", async () => {
  const { rawBody, signature } = signedRequest(successPayload);
  const fixture = createIsolatedDependencies({
    txRef: TX_REF,
    status: "success",
    amount: 5000,
    currency: "MWK",
    providerTransactionId: "test-provider-transaction",
  });
  const tamperedSignature = `${signature.slice(0, -1)}${signature.endsWith("0") ? "1" : "0"}`;

  await assert.rejects(
    processPayChanguWebhook(
      rawBody,
      tamperedSignature,
      fixture.dependencies,
    ),
    (error) =>
      error?.statusCode === 403 && error?.code === "FORBIDDEN",
  );
  assert.equal(fixture.state.events.size, 0);
  assert.equal(fixture.state.connection.chatEnabledAt, null);
});

test("a non-success provider verification never unlocks isolated chat", async () => {
  const { rawBody, signature } = signedRequest(successPayload);
  const fixture = createIsolatedDependencies({
    txRef: TX_REF,
    status: "pending",
    amount: 5000,
    currency: "MWK",
    providerTransactionId: null,
  });

  await processPayChanguWebhook(
    rawBody,
    signature,
    fixture.dependencies,
  );

  assert.equal(fixture.state.connection.status, "matched");
  assert.equal(fixture.state.connection.chatEnabledAt, null);
  assert.equal(fixture.state.completionCalls, 0);
  assert.equal(
    [...fixture.state.events.values()][0].errorCode,
    "VERIFICATION_MISMATCH",
  );
});

test("signed subscription success verifies its plan amount before activation", async () => {
  const payload = {
    event: "charge.success",
    data: {
      tx_ref: TX_REF,
      status: "success",
      amount: 1500,
      currency: "MWK",
    },
  };
  const { rawBody, signature } = signedRequest(payload);
  const fixture = createIsolatedDependencies(
    {
      txRef: TX_REF,
      status: "success",
      amount: 1500,
      currency: "MWK",
      providerTransactionId: "test-provider-transaction",
    },
    "subscription",
  );

  await processPayChanguWebhook(rawBody, signature, fixture.dependencies);

  assert.equal(fixture.state.attempt.status, "succeeded");
  assert.equal(fixture.state.completionCalls, 1);
  assert.deepEqual(fixture.state.publishedUserIds, ["test-user-a"]);
  assert.equal(fixture.state.connection.status, "matched");
});

test("a subscription amount mismatch never activates the entitlement", async () => {
  const payload = {
    event: "charge.success",
    data: {
      tx_ref: TX_REF,
      status: "success",
      amount: 4000,
      currency: "MWK",
    },
  };
  const { rawBody, signature } = signedRequest(payload);
  const fixture = createIsolatedDependencies(
    {
      txRef: TX_REF,
      status: "success",
      amount: 4000,
      currency: "MWK",
      providerTransactionId: "test-provider-transaction",
    },
    "subscription",
  );

  await processPayChanguWebhook(rawBody, signature, fixture.dependencies);

  assert.equal(fixture.state.attempt.status, "pending");
  assert.equal(fixture.state.completionCalls, 0);
  assert.equal(fixture.state.events.values().next().value.errorCode, "VERIFICATION_MISMATCH");
});

const {
  SimplePool,
  getPublicKey,
  nip19,
  nip57,
  finishEvent,
} = require("nostr-tools");
const axios = require("axios");

require("websocket-polyfill");
require("dotenv").config();
nip57.useFetchImplementation(require("node-fetch"));

const amountInSats = process.argv[2];
const strikeApiKey = process.env.STRIKE_API_KEY;
const zapRequestSigningKey = nip19.decode(process.env.NOSTR_NSEC).data;

if (!amountInSats) {
  console.log("Please provide amount in sats as an argument");
  process.exit(1);
}

if (!strikeApiKey) {
  console.log("Please set STRIKE_API_KEY in .env file");
  process.exit(1);
}

if (!zapRequestSigningKey) {
  console.log("Please set a valid NOSTR_NSEC in .env file");
  process.exit(1);
}

const createStrikePaymentQuote = async (invoice) => {
  const { data } = await axios({
    method: "post",
    url: "https://api.strike.me/v1/payment-quotes/lightning",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${strikeApiKey}`,
    },
    data: JSON.stringify({
      lnInvoice: invoice,
      sourceCurrency: "USD",
    }),
  });

  return data.paymentQuoteId;
};

const executeStrikePaymentQuote = async (paymentQuoteId) => {
  const { data } = await axios({
    method: "patch",
    url: `https://api.strike.me/v1/payment-quotes/${paymentQuoteId}/execute`,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${strikeApiKey}`,
    },
  });

  return data;
};

const getUserProfile = async (pubkey) => {
  const pool = new SimplePool();
  const relays = [
    "wss://relay.nostr.band",
    "wss://purplepag.es",
    "wss://relay.damus.io",
    "wss://nostr.wine",
  ];

  try {
    return await pool.get(relays, { kinds: [0], authors: [pubkey] });
  } catch (error) {
    console.error(error);
  } finally {
    if (pool) {
      pool.close(relays);
    }
  }
};

const getUserRelays = async (pubkey) => {
  const pool = new SimplePool();
  const relays = [
    "wss://relay.nostr.band",
    "wss://purplepag.es",
    "wss://relay.damus.io",
    "wss://nostr.wine",
  ];

  try {
    return await pool.get(relays, { kinds: [10002], authors: [pubkey] });
  } catch (error) {
    console.error(error);
  } finally {
    if (pool) {
      pool.close(relays);
    }
  }
};

const fetchInvoice = async ({ relays, zappedPubkey, zappedEventId }) => {
  const amountInMillisats = amountInSats * 1000;
  const comment = "Zapped by notalike ⚡️";
  const userProfile = await getUserProfile(zappedPubkey);

  if (!userProfile) {
    throw new Error(`no user profile found for ${zappedPubkey}`);
  }

  const zapEndpoint = await nip57.getZapEndpoint(userProfile);

  if (!zapEndpoint) {
    throw new Error(`no zap endpoint found for ${zappedPubkey}`);
  }

  const zapRequestEvent = await nip57.makeZapRequest({
    profile: zappedPubkey,
    event: zappedEventId,
    amount: amountInMillisats,
    relays,
    comment,
  });
  const signedZapRequestEvent = finishEvent(
    zapRequestEvent,
    zapRequestSigningKey
  );
  const url = `${zapEndpoint}?amount=${amountInMillisats}&nostr=${encodeURIComponent(
    JSON.stringify(signedZapRequestEvent)
  )}&comment=${encodeURIComponent(comment)}`;
  const { data } = await axios(url);
  const invoice = data.pr;

  if (!invoice) {
    throw new Error(`failed to retrieve invoice for ${zappedPubkey}`);
  }

  return invoice;
};

const zap = async (nostrReactionEvent, relays) => {
  const zappedPubkey = nostrReactionEvent.tags
    .slice()
    .reverse()
    .find((tag) => tag[0] === "p")[1];
  const zappedEventId = nostrReactionEvent.tags
    .slice()
    .reverse()
    .find((tag) => tag[0] === "e")[1];
  const zappedNpub = nip19.npubEncode(zappedPubkey);
  const zappedNoteId = nip19.noteEncode(zappedEventId);

  console.log(
    `zapping ${zappedNpub} for note ${zappedNoteId} ${amountInSats} sats...`,
    nostrReactionEvent
  );

  try {
    const invoice = await fetchInvoice({ relays, zappedPubkey, zappedEventId });
    const strikePaymentQuoteId = await createStrikePaymentQuote(invoice);

    await executeStrikePaymentQuote(strikePaymentQuoteId);
    console.log(
      `successfully zapped ${zappedNpub} for note ${zappedNoteId} ${amountInSats} sats 😎\n`
    );
  } catch (error) {
    console.error(error);
  }
};

const start = async () => {
  let relays = [
    "wss://relays.nostr.band",
    "wss://relay.damus.io",
    "wss://nostr.wine",
    "wss://nostr.mutinywallet.com/",
  ];
  const pubkey = getPublicKey(zapRequestSigningKey);
  const userRelays = await getUserRelays(pubkey);

  if (userRelays?.tags?.length > 0) {
    relays = userRelays.tags.map((tag) => tag[1]);
  }

  console.log(`start listening for likes for ${nip19.npubEncode(pubkey)}\n`);

  const pool = new SimplePool();
  const sub = pool.sub(relays, [
    {
      authors: [pubkey],
      kinds: [7],
      since: Math.round(Date.now() / 1000),
    },
  ]);

  sub.on("event", (event) => {
    // zap any reaction that is not a dislike reaction
    if (event.content !== "-") {
      zap(event, relays);
    }
  });
};

start();

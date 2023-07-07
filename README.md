# notalike
Zaps nostr notes when you like them. Great to turn this on during zapathons.

![screenshot of notalike server logs](https://nostr.build/p/nb12493.png)

## Usage

1. Create an account with Strike if you don't already have one https://strike.me/download/
1. Get a Strike API key with all the payment scopes from https://dashboard.strike.me/
1. Create a .env file with all the required env variables (see .env.example)
1. Install the dependencies using npm or yarn or whatever your heart desires
1. Make sure you have money in your Strike account
1. Run the script providing the zap amount in sats for every like as an argument e.g. `node index.js 21`

Keep in mind that Strike pays the invoices from your cash balance. This means the payment rounds up to the nearest cent when paying an invoice, so if you set the zap amount to 1 sat, you'll be sending more money to Strike than the person you are zapping with every zap. 

Don't forget to turn off the script when you're done.

# Breakroom

The public website is available at [breakroom-quiz.breakroom-quiz.workers.dev](https://breakroom-quiz.breakroom-quiz.workers.dev). Select **Online**, set up the questions, and open the lobby to share its generated QR code or invite link.

This Mac’s Local server reads its cloud connection from `~/Library/Application Support/Breakroom/cloud.env` when it starts. The file contains the deployed URL and a private upload key. Reopen the current Mac package or restart the source server to use these settings.

Breakroom runs an eight-question live office quiz. Players use their phone browsers. Each round lasts 20 seconds and awards 100 points per correct answer. The host starts the first round and advances after each automatic reveal.

Players see correct answers when the countdown ends. Their final results start with a three-second countdown, followed by third, second, and first place, then the remaining standings. The player list omits up to five people at the bottom while always keeping the top three. The host can view the full leaderboard throughout the game and use its eye button to hide or show that list privately.

Each question can label its answers with letters, shapes or emojis. In Game settings, the host can enable randomized answer options and question order. A room keeps its randomized order through refreshes and reconnects, and scoring follows the shuffled correct answers.

Use **Rephrase with AI** next to a question to rewrite its wording, then review it before opening the lobby. The host computer sends that question and its answer options to Cloudflare Workers AI. This feature needs internet access and allows up to twelve requests per minute from one IP address.

## Try the browser prototype

Run `npm run demo` and open [Breakroom on this computer](http://127.0.0.1:8080). Select **Local** and **Host a game**. Set your questions or choose **Use starter quiz** for three ready-made questions. Demo rounds last eight seconds. Open the invite in a second tab or on a phone on the same Wi-Fi, then advance after each reveal. Select **Show final results** to save the game and see its record.

## Host a Local game

**On macOS** extract the Breakroom archive for your Mac’s processor and open **Breakroom.app**. The app opens the host screen in your default browser. Keep the launcher open until the game ends. The archive bundles the runtime and all game assets, so it can start without an internet connection. The launcher is ad hoc signed.

**From source** use Node.js 22 or newer. No package installation is required for Local mode.

```sh
npm start
```

1. Open [the host screen](http://127.0.0.1:8080) on the laptop. Select **Local**, then **Host a game**. Add text or image questions, choose single or multiple selection, mark the correct answers, then click **Open lobby**. Multiple selection earns points when the player submits the full correct set.
2. Show the lobby QR code for players to scan, or click **Copy invite link** and share it. Keep the laptop and phones on the same Wi-Fi or wired network. The invite uses the laptop’s LAN IPv4 address.
3. Start the first question once players have joined. After the final reveal, select **Show final results**.

The network must allow devices to reach one another on TCP port 8080. Guest Wi-Fi can isolate devices. Set `BREAKROOM_LAN_HOST` to the intended address if the laptop has several network interfaces. The source server also accepts `PORT` if the default port is in use.

Players can refresh or reconnect in the same browser. Keep that browser’s site data available. Active rooms live in memory until the server stops or the room expires after 24 hours. New players can join until the first round starts.

## Host from another computer at the venue

Start the Local server on a computer that stays on during the game. Generate a host key with `node -p "require('node:crypto').randomBytes(16).toString('hex')"` and set it as `BREAKROOM_HOST_KEY` on that server before starting. Give the key to the facilitator. On game day, the facilitator opens the server’s printed LAN address in a browser, enters the key, and shares the player invite. The host and phones can use Wi-Fi while the server uses its own internet connection for uploads.

## Save and upload completed games

When the host opens final results, Breakroom saves the game on the Local server before displaying the final standings. The record contains the questions, answer choices, display names, and scores. The host can reopen the same host link in the same browser and download the record as JSON.

Records go to `~/Library/Application Support/Breakroom` on macOS and `$XDG_DATA_HOME/breakroom` or `~/.local/share/breakroom` on Linux. Set `BREAKROOM_DATA_DIR` to use another folder.

To enable uploads, generate a separate key with the same command as above. Set that key on the deployed Worker with `npx --yes wrangler@4 secret put BREAKROOM_RESULTS_KEY`. Start the Local server with the same `BREAKROOM_RESULTS_KEY` and set `BREAKROOM_RESULTS_URL` to the deployed Breakroom HTTPS address. The server retries pending records when it can reach the destination. An upload uses the same record ID each time, so a lost reply does not create a duplicate.

## Deploy Online to Cloudflare

Use a Cloudflare account with Workers deploy access, a configured workers.dev subdomain, and SQLite-backed Durable Objects. Authenticate using Wrangler or the account’s deployment credentials. Set `CLOUDFLARE_ACCOUNT_ID` when Wrangler needs an explicit account selection.

```sh
npx --yes wrangler@4 login
npm run deploy
```

The deploy script runs `npx --yes wrangler@4 deploy --config wrangler.jsonc`. Wrangler prints the public HTTPS URL. Open it, select **Online**, and create a room. To switch to Online from the Local launcher, enter the deployed URL in the setup screen or set `BREAKROOM_ONLINE_URL` before starting the server from source.

Each Online room has one SQLite-backed Durable Object, a server alarm for the deadline, and hibernatable WebSockets for live updates. Local uses HTTP streaming with the same game rules and browser screens. Host credentials stay in the creating browser. Player invites contain only the room code.

Cloudflare’s Free plan lists 100,000 Durable Object requests and 13,000 GB-seconds of duration per day. SQLite storage includes 5 million row reads and 100,000 row writes per day and 5 GB of account storage. These are account quotas. The 100-player room cap is a design target with real-world capacity unverified. [Cloudflare Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)

## Rebuild the macOS archive

```sh
npm run package:mac
```

Run on the intended Mac architecture with Xcode Command Line Tools. The build downloads and checksum-verifies the official Node.js runtime unless `BREAKROOM_NODE_DIST` points to an already extracted official runtime. The output is a ZIP in `dist/`.

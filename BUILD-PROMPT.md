# Build an office quiz app with Local and Online games

Build a browser-based quiz app for office events with a target of 100 concurrent players per room. The host chooses Local or Online when creating a game. Both modes give the host a clickable invite link to copy and send. Players open it in their phone browser, enter a display name, and join the lobby.

Inspect the workspace and follow applicable repository instructions. Start implementing the production app immediately. Complete the phases below as implementation milestones. Skip automated tests, load tests, and device rehearsals. Prepare Online mode for Cloudflare production deployment and Local mode for installation on the host laptop. Deploy to the configured production Cloudflare account if deployment access is available. Otherwise, provide the exact deployment command and identify any missing access. Report what was built and where it is available.

## Design

The supplied AGENTS.md covers a separate sports platform and contains no quiz visual specifications. Use a simple provisional UI until the quiz design guide is available. Prioritize readable type, large answer buttons, and a prominent countdown on mobile. Show distinct waiting, answering, submitted, disconnected, and results states. On the host screen, make Copy invite link and Start question easy to find. Keep host controls separate from the player view.

## Architecture

Keep game rules and room state transitions independent of the network and runtime. Reuse the game rules and browser screens across a Node.js local server and a future Cloudflare Workers deployment with one Durable Object per online room. Each session runs in the mode selected at creation and has one authoritative server.

The server owns the deadline, accepted answers, and scores. Send clients a shared deadline and server time so they can render their own countdown. Validate the cutoff on the server. Keep the correct answer server-side until the reveal. Accept at most one answer per player per question and make retries safe. Only the host can start or advance a round.

## Phase 1 · Local game foundation

- Serve the host and player screens from the host laptop. The host creates a room and copies a player link using the laptop's reachable LAN address, such as http://192.168.1.42:8080/join/4821. Keep host controls accessible only to the host.
- Let players join by name and see the lobby. The host starts one built-in multiple-choice question. Show the countdown and submission confirmation. Reveal the correct answer and scores automatically when the deadline expires.
- Bundle all assets with the local app so a host can start a game during an internet outage. Document how to launch it and share the invite.

## Phase 2 · Complete local games

Add multiple questions, host-controlled advancement, a leaderboard, final results, and reconnect support. A player who refreshes or briefly disconnects should return to the current room state with their previous answers and score intact.

## Phase 3 · Deploy Online mode

Deploy the web app on Cloudflare Workers with a Durable Object per online room. Use live updates for lobby and round changes. Protect host actions and keep player invites separate. Generate a public HTTPS invite for each online room so players can join from any internet connection. Check current Cloudflare free-tier limits before deployment.

## Phase 4 · Give facilitators both modes

Package the local server so a facilitator can launch it without a terminal. Expose Local and Online choices in the host experience and Copy invite link in both modes. Support starting a fresh Local game while the internet is already down.

Keep 100 players per room as the design target. Treat real-world capacity as unverified.

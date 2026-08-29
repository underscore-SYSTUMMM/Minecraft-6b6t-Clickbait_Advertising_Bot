# Clickbait Advertising Bot

A small multi-bot Mineflayer setup for `6b6t.org` that watches public chat for messages containing `kit` and then DM's those players with your Discord invite.

It is built around multiple advertising accounts so you can rotate activity across several bots instead of relying on only one. The current setup includes 3 bot slots and can be extended further.

## Features

- Multi-bot support
- Cross-version compatibility via `mineflayer-viaproxy` (connects Minecraft 1.20 bot to 1.21.11+ servers)
- Keyword-based targeting for players asking about kits (with rank prefix regex support)
- Per-bot message pools for randomized DM text
- In-terminal bot control with `join`, `leave`, `status`, and `help`
- Auto reconnect handling for disconnects, restart messages, limbo, and join cooldowns
- Simple blocklist support to avoid messaging selected usernames

## How It Works

Each bot:

1. Connects to `play.6b6t.org` using `mineflayer-viaproxy` with `forceViaProxy: true`
2. Logs in with `/login <password>`
3. Walks through the join flow until it reaches the main server
4. Watches chat for lines containing `kit`
5. Sends a random DM from that bot's configured message list

## Requirements

- Node.js 18+ recommended (Node 20 / 22 LTS recommended)
- `cmake` & build tools (if using Node 25+ for native module compilation): `sudo apt install cmake build-essential`
- npm
- A cracked/offline account username for each bot
- A password for each bot's `/login`

## Installation

```bash
npm install
```

## Environment Setup

Create a `.env` file in the project root:

```env
AD_BOT_USERNAME1=YourBotName1
AD_BOT_PASSWORD1=YourBotPassword1

AD_BOT_USERNAME2=YourBotName2
AD_BOT_PASSWORD2=YourBotPassword2

AD_BOT_USERNAME3=YourBotName3
AD_BOT_PASSWORD3=YourBotPassword3
```

## Running The Bot

```bash
node index.js
```

When it starts, it will ask which bots to launch. Example:

```text
Enter bot numbers separated by spaces: 1 2 3
```

## Console Commands

- `join 1` : connect bot 1
- `leave 1` : disconnect bot 1
- `status` : show current status of every bot
- `help` : print the command list

## Customizing Messages

Each bot has its own `messages` array inside `index.js`. The bot picks one message at random when it DM's a player.

If you want to change the ad copy, edit the message arrays for `BOT1`, `BOT2`, and `BOT3`.

## Adding More Than The 3 Current Bots

To add bot 4, bot 5, or more:

1. Add new env vars in `.env`:

```env
AD_BOT_USERNAME4=YourBotName4
AD_BOT_PASSWORD4=YourBotPassword4
```

2. Copy one of the existing bot config blocks in index.js and make a new one:

```js
const BOT4 = {
  username: process.env.AD_BOT_USERNAME4,
  password: process.env.AD_BOT_PASSWORD4,
  messages: [
    "Need kits? Join here https://your-discord-link",
    "Join for kits https://your-discord-link"
  ]
}
```

3. Add the new bot to the `BOTS` array:

```js
const BOTS = [BOT1, BOT2, BOT3, BOT4]
```

4. Start the bot again and choose the new number from the startup prompt.

You can keep repeating that same pattern for `BOT5`, `BOT6`, and beyond.

## Blocklist

The bot includes a `BLOCKLIST` array in `index.js`. Any username in that list will be skipped.

Players who have muted the bot and it triggers the `This player is ignoring you` message also get added to the in-memory blocklist while the script is running.

## Notes

- The bot uses `auth: "offline"` in Mineflayer.
- Protocol bridging is handled automatically using `mineflayer-viaproxy`.
- The target server, port, and version are configured in `index.js`.
- Startup joins are staggered by a delay so all bots do not connect at the exact same moment.


<span style="font-size: 0.83em; color: #949ba4;">nobody will know i used ai to write this read me. haha.</span>
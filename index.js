require('dotenv').config()
const { createBot } = require('mineflayer-viaproxy')
const readline = require('readline')

const HOST = "play.6b6t.org"
const PORT = 25565
const VERSION = "1.20"

const DM_INTERVAL = 3000 // 3 sec
const RECONNECT_DELAY = 60000 //60 sec
const RESTART_RECONNECT_DELAY = 120000 // 2 min
const JOIN_COOLDOWN_DELAY = 10000 // 10 sec
const STARTUP_JOIN_DELAY = 10000 // 10 sec

const BOT1 = {
  username: process.env.AD_BOT_USERNAME1,
  password: process.env.AD_BOT_PASSWORD1,
  messages: [
    "Message 1",
    "Message 2"
  ]
}

const BOT2 = {
  username: process.env.AD_BOT_USERNAME2,
  password: process.env.AD_BOT_PASSWORD2,
  messages: [
    "Message 1",
    "Message 2"
  ]
}

const BOT3 = {
  username: process.env.AD_BOT_USERNAME3,
  password: process.env.AD_BOT_PASSWORD3,
  messages: [
    "Message 1",
    "Message 2"
  ]
}

const BOTS = [BOT1, BOT2, BOT3].filter(bot => bot.username && bot.password)

const BLOCKLIST = [
  "Player_1",
  "Player_2",
  "Player_3"
]

const C = {
  reset: "\x1b[0m",
  chat: "\x1b[37m",
  whisper: "\x1b[36m",
  system: "\x1b[33m",
  error: "\x1b[31m"
}

const log = (color, tag, msg) =>
  console.log(`${color}[${tag}] ${msg}${C.reset}`)

function randomMsg(messages) {
  return messages[Math.floor(Math.random() * messages.length)]
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function startBotFor(config, botNumber) {
  let bot = null
  let isConnecting = false
  let shouldBeConnected = false
  let reconnectTimer = null
  let hasSpawned = false
  let inLimbo = false
  let movementStarted = false
  let portalTraverseStarted = false
  let mainServerTransitionSeen = false
  let dmQueue = []
  let sending = false
  let lastDM = null
  let jumpInterval = null
  let forwardLoopTimer = null
  let portalWalkTimer = null
  let lastGameMode = null
  let lastGameDimension = null

  const tag = `${botNumber}:${config.username}`

  function clearReconnectTimer() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  function clearMovementTimers() {
    if (forwardLoopTimer) {
      clearTimeout(forwardLoopTimer)
      forwardLoopTimer = null
    }
    if (portalWalkTimer) {
      clearTimeout(portalWalkTimer)
      portalWalkTimer = null
    }
    if (jumpInterval) {
      clearInterval(jumpInterval)
      jumpInterval = null
    }

    if (bot) {
      try { bot.setControlState("forward", false) } catch (_) { }
      try { bot.setControlState("jump", false) } catch (_) { }
    }
  }

  function hasLiveConnection() {
    return Boolean(bot && bot.player && bot._client && !bot._client.ended)
  }

  function destroyBotInstance() {
    if (!bot) return

    try { bot.removeAllListeners() } catch (_) { }
    try { bot.quit("Resetting bot connection") } catch (_) { }
    try { bot.end() } catch (_) { }
    bot = null
  }

  function resetSessionState() {
    hasSpawned = false
    inLimbo = false
    movementStarted = false
    portalTraverseStarted = false
    mainServerTransitionSeen = false
    dmQueue = []
    sending = false
    lastDM = null
    lastGameMode = null
    lastGameDimension = null
    clearMovementTimers()
  }

  function logGameStateIfChanged() {
    const mode = bot.game?.gameMode || "unknown"
    const dimension = bot.game?.dimension || "unknown"

    if (mode === lastGameMode && dimension === lastGameDimension) return

    lastGameMode = mode
    lastGameDimension = dimension
    log(C.system, tag, `Game state updated (mode: ${mode}, dimension: ${dimension})`)
  }

  function scheduleReconnect(delay) {
    if (!shouldBeConnected || reconnectTimer) return
    log(C.system, tag, `Reconnecting in ${delay / 1000}s...`)
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      startBot()
    }, delay)
  }

  function tryStartMainServer(source) {
    if (movementStarted) return
    if (!bot || !bot.player) return
    if (bot.game?.gameMode === "spectator") return

    inLimbo = false
    movementStarted = true
    log(C.system, tag, `Main server joined via ${source}`)
    startMovement()
  }

  function startMovement() {
    clearMovementTimers()

    function forwardLoop() {
      if (!bot || !bot.player || !shouldBeConnected) return
      bot.setControlState("forward", true)
      forwardLoopTimer = setTimeout(() => {
        if (!bot) return
        bot.setControlState("forward", false)
        forwardLoopTimer = setTimeout(forwardLoop, 2000)
      }, 5000)
    }

    forwardLoop()

    jumpInterval = setInterval(() => {
      if (!bot || !bot.player || !shouldBeConnected) return
      bot.setControlState("jump", true)
      setTimeout(() => {
        if (bot) bot.setControlState("jump", false)
      }, 100)
    }, 800)
  }

  function enqueueDM(player) {
    if (!player || player === config.username) return
    if (BLOCKLIST.includes(player)) return
    if (dmQueue.some(entry => entry.player === player)) return
    dmQueue.push({ player })
    log(C.system, tag, `Queued DM for ${player} (queue: ${dmQueue.length})`)
    processQueue()
  }

  async function processQueue() {
    if (sending) return
    sending = true

    while (dmQueue.length > 0 && bot && bot.player && shouldBeConnected) {
      const { player: target } = dmQueue.shift()
      const msg = randomMsg(config.messages)

      bot.chat(`/msg ${target} ${msg}`)
      lastDM = target
      log(C.whisper, tag, `-> ${target}: ${msg}`)

      await sleep(DM_INTERVAL)
    }

    sending = false
  }

  async function startBot() {
    if (!shouldBeConnected) {
      log(C.system, tag, "Join skipped because this bot is set to stay offline")
      return
    }

    if (isConnecting) {
      log(C.system, tag, "Already connecting - skipping")
      return
    }

    if (hasLiveConnection()) {
      log(C.system, tag, "Already connected")
      return
    }

    isConnecting = true
    clearReconnectTimer()

    if (bot) destroyBotInstance()

    resetSessionState()
    log(C.system, tag, "Connecting...")

    try {
      bot = await createBot({
        host: HOST,
        port: PORT,
        username: config.username,
        auth: "offline",
        version: VERSION,
        forceViaProxy: true
      })
    } catch (err) {
      isConnecting = false
      log(C.error, tag, `Failed to create bot: ${err.message}`)
      scheduleReconnect(RECONNECT_DELAY)
      return
    }

    bot.once("connect", () => {
      isConnecting = false
    })

    bot.on("spawn", () => {
      if (!hasSpawned) {
        hasSpawned = true
        log(C.system, tag, "Spawned - logging in")
        bot.chat(`/login ${config.password}`)

        portalWalkTimer = setTimeout(() => {
          portalTraverseStarted = true
          bot.setControlState("forward", true)
          portalWalkTimer = setTimeout(() => {
            if (bot) bot.setControlState("forward", false)
            portalWalkTimer = null
            tryStartMainServer("timer")
          }, 15000)
        }, 2000)
        return
      }

      if (portalTraverseStarted) {
        mainServerTransitionSeen = true
        log(C.system, tag, "Additional spawn detected after portal/login flow")
        setTimeout(() => tryStartMainServer("spawn"), 1500)
      }
    })

    bot.on("messagestr", (s) => {
      log(C.chat, tag, s)

      if (/Server restarts in 5 seconds\./i.test(s)) {
        log(C.system, tag, "Server restarting - waiting 2 minutes before reconnect")
        scheduleReconnect(RESTART_RECONNECT_DELAY)
        try { bot.quit() } catch (_) { }
        return
      }

      if (/There is 1 second join cooldown protection left\./i.test(s)) {
        log(C.system, tag, "Join cooldown active - waiting 10 seconds before reconnect")
        scheduleReconnect(JOIN_COOLDOWN_DELAY)
        try { bot.quit() } catch (_) { }
        return
      }

      if (/sent you back to the backup server|Connecting to the server\.\.\./i.test(s)) {
        if (!inLimbo) {
          inLimbo = true
          mainServerTransitionSeen = true
          movementStarted = false
          clearMovementTimers()
          log(C.system, tag, "In limbo - waiting for main server...")
        }
        return
      }

      if (/kit/i.test(s)) {
        const messageMatch = s.match(/^(?:\[[^\]]+\]\s*)*([a-zA-Z0-9_]{3,16})\s*»\s*(.+)$/)
        if (messageMatch) {
          enqueueDM(messageMatch[1])
        }
      }

      if (/This player is ignoring you/i.test(s) && lastDM) {
        log(C.system, tag, `${lastDM} is ignoring the bot`)
        if (!BLOCKLIST.includes(lastDM)) BLOCKLIST.push(lastDM)
      }
    })

    bot.on("respawn", () => {
      if (!portalTraverseStarted) return
      mainServerTransitionSeen = true
      log(C.system, tag, `Respawn detected (gamemode: ${bot.game?.gameMode || "unknown"})`)
      setTimeout(() => tryStartMainServer("respawn"), 1500)
    })

    bot.on("game", () => {
      if (!portalTraverseStarted) return
      logGameStateIfChanged()

      if (bot.game?.gameMode === "spectator") {
        inLimbo = true
        return
      }

      tryStartMainServer("game")
    })

    bot.on("kicked", reason => {
      log(C.error, tag, `Kicked: ${reason}`)
      isConnecting = false
      clearMovementTimers()
      bot = null
      if (!shouldBeConnected) return
      if (!/Disconnected from server/i.test(reason.toString())) {
        scheduleReconnect(RECONNECT_DELAY)
      }
    })

    bot.on("error", error => {
      log(C.error, tag, `Error: ${error.message || error}`)
      isConnecting = false
      if (bot && bot._client && bot._client.ended) {
        bot = null
      }
    })

    bot.on("end", () => {
      clearMovementTimers()
      isConnecting = false
      bot = null

      if (!shouldBeConnected) {
        log(C.system, tag, "Connection closed")
        return
      }

      if (inLimbo) {
        log(C.system, tag, "Disconnected mid-limbo - reconnecting in 30s")
        scheduleReconnect(30000)
        return
      }

      log(C.system, tag, "Connection ended")
      scheduleReconnect(RECONNECT_DELAY)
    })
  }

  function join() {
    if (shouldBeConnected) {
      if (hasLiveConnection()) {
        log(C.system, tag, "Join requested, but bot is already connected")
        return
      }

      log(C.system, tag, "Join requested while bot is enabled - retrying connection")
      clearReconnectTimer()
      isConnecting = false
      if (bot) destroyBotInstance()
      startBot()
      return
    }

    shouldBeConnected = true
    log(C.system, tag, "Manual join requested")
    startBot()
  }

  function leave() {
    if (!shouldBeConnected && !bot && !isConnecting) {
      log(C.system, tag, "Leave requested, but bot is already offline")
      return
    }

    shouldBeConnected = false
    isConnecting = false
    clearReconnectTimer()
    clearMovementTimers()
    dmQueue = []
    sending = false
    log(C.system, tag, "Manual leave requested")

    if (bot) {
      try { bot.removeAllListeners() } catch (_) { }
      try { bot.quit("Manual leave") } catch (_) { }
      try { bot.end() } catch (_) { }
      bot = null
    }
  }

  function getStatus() {
    if (isConnecting) return "connecting"
    if (bot && bot.player) return movementStarted ? "active" : "connected"
    if (shouldBeConnected) return reconnectTimer ? "waiting-reconnect" : "idle-enabled"
    return "offline"
  }

  return {
    config,
    botNumber,
    join,
    leave,
    getStatus
  }
}

function createQuestionPrompt() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  function ask(question) {
    return new Promise(resolve => rl.question(question, resolve))
  }

  return { rl, ask }
}

function parseBotNumbers(input) {
  const unique = new Set()

  for (const token of input.trim().split(/\s+/).filter(Boolean)) {
    const number = Number(token)
    if (Number.isInteger(number) && number >= 1 && number <= BOTS.length) {
      unique.add(number)
    }
  }

  return [...unique].sort((a, b) => a - b)
}

async function promptForStartupBots(ask) {
  console.log("Choose bots to start:")
  BOTS.forEach((botConfig, index) => {
    console.log(`${index + 1}. ${botConfig.username}`)
  })

  while (true) {
    const answer = await ask("Enter bot numbers separated by spaces: ")
    const selected = parseBotNumbers(answer)

    if (selected.length > 0) {
      return selected
    }

    console.log("Enter at least one valid bot number, like: 1 2")
  }
}

async function startSelectedBots(selectedNumbers, controllers) {
  for (let i = 0; i < selectedNumbers.length; i++) {
    const botNumber = selectedNumbers[i]
    controllers[botNumber - 1].join()

    if (i < selectedNumbers.length - 1) {
      console.log(`Waiting ${STARTUP_JOIN_DELAY / 1000}s before starting the next bot...`)
      await sleep(STARTUP_JOIN_DELAY)
    }
  }
}

function printCommands() {
  console.log('Commands: "join <number>", "leave <number>", "status", "help"')
}

function wireCommandConsole(rl, controllers) {
  rl.setPrompt("> ")
  printCommands()
  rl.prompt()

  rl.on("line", line => {
    const trimmed = line.trim()
    const [command, rawNumber] = trimmed.split(/\s+/)

    if (!trimmed) {
      rl.prompt()
      return
    }

    if (command === "help") {
      printCommands()
      rl.prompt()
      return
    }

    if (command === "status") {
      controllers.forEach(controller => {
        console.log(`${controller.botNumber}. ${controller.config.username} - ${controller.getStatus()}`)
      })
      rl.prompt()
      return
    }

    if (command === "join" || command === "leave") {
      const botNumber = Number(rawNumber)
      const controller = controllers[botNumber - 1]

      if (!Number.isInteger(botNumber) || !controller) {
        console.log("Use a valid bot number, for example: join 1")
        rl.prompt()
        return
      }

      if (command === "join") controller.join()
      if (command === "leave") controller.leave()
      rl.prompt()
      return
    }

    console.log('Unknown command. Use "help" to see the command list.')
    rl.prompt()
  })
}

async function main() {
  const controllers = BOTS.map((config, index) => startBotFor(config, index + 1))
  const { rl, ask } = createQuestionPrompt()

  const selectedNumbers = await promptForStartupBots(ask)
  await startSelectedBots(selectedNumbers, controllers)
  wireCommandConsole(rl, controllers)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})

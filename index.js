require('dotenv').config();
const { Client, Collection, GatewayIntentBits, Partials, ActivityType } = require('discord.js');
const originalWrite = process.stdout.write;
process.stdout.write = function () { };
process.stderr.write = function () { };
console.log = console.error = console.warn = console.info = console.debug = function () { };
process.on('uncaughtException', () => { });
process.on('unhandledRejection', () => { });

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const db = require('./database/mongodb');
const { startServer } = require('./websocket/server');

const { initAntiNuker } = require('./handlers/antiNuker');
const { initAntiSelfbot } = require('./handlers/antiSelfbot');
const { initRaidPrevention } = require('./handlers/raidPrevention');
const { initSnapshots } = require('./handlers/snapshotHandler');

let statusConfigPath = path.join(__dirname, 'status-config.json');
let customStatuses = [];
try {
    if (fs.existsSync(statusConfigPath)) {
        customStatuses = JSON.parse(fs.readFileSync(statusConfigPath, 'utf8'));
    }
} catch (e) { }

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildBans,
        GatewayIntentBits.GuildEmojisAndStickers,
        GatewayIntentBits.GuildIntegrations,
        GatewayIntentBits.GuildWebhooks,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMessageTyping,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageReactions,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel, Partials.Message, Partials.GuildMember, Partials.User, Partials.Reaction]
});

client.commands = new Collection();
client.snipes = new Collection();

client.customStatuses = customStatuses;
client.statusConfigPath = statusConfigPath;

const DEFAULT_STATUS = {
    text: "Protecting {guilds} servers",
    type: ActivityType.Streaming,
    status: "online",
    url: "https://www.twitch.tv/officialx"
};

let statusIndex = 0;
let statusInterval = null;

function updateBotStatus() {
    if (!client.user) return;

    let activityText;
    let activityType;
    let statusType = "online";

    const totalGuilds = client.guilds.cache.size;
    const totalUsers = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);

    if (client.customStatuses && client.customStatuses.length > 0) {
        const current = client.customStatuses[statusIndex];
        if (current) {
            activityText = current.text
                .replace(/{guilds}/g, totalGuilds)
                .replace(/{users}/g, totalUsers);
            activityType = current.activityType;
            statusType = current.status || "dnd";
        }
    } else {
        activityText = DEFAULT_STATUS.text
            .replace(/{guilds}/g, totalGuilds)
            .replace(/{users}/g, totalUsers);
        activityType = DEFAULT_STATUS.type;
        statusType = DEFAULT_STATUS.status;
    }

    try {
        client.user.setPresence({
            activities: [{
                name: activityText,
                type: activityType,
                url: activityType === ActivityType.Streaming ? "https://www.twitch.tv/officialx" : undefined
            }],
            status: statusType
        });
    } catch (err) {
        console.error('Failed to set status:', err);
    }
}

function startStatusRotation() {
    if (statusInterval) clearInterval(statusInterval);

    updateBotStatus();

    statusInterval = setInterval(() => {
        if (!client.user) return;

        if (client.customStatuses && client.customStatuses.length > 0) {
            statusIndex = (statusIndex + 1) % client.customStatuses.length;
        }

        updateBotStatus();
    }, 8000);
}
client.startStatusRotation = startStatusRotation;

client.setCustomStatus = (text, type = ActivityType.Streaming, status = "online") => {
    if (!client.user) return;

    try {
        client.user.setPresence({
            activities: [{
                name: text,
                type: type,
                url: type === ActivityType.Streaming ? "https://www.twitch.tv/officialx" : undefined
            }],
            status: status
        });
    } catch (err) {
        console.error('Failed to set custom status:', err);
    }
};

client.setDNDStatus = (text, type = ActivityType.Watching) => {
    if (!client.user) return;

    try {
        client.user.setPresence({
            activities: [{ name: text, type: type }],
            status: "dnd"
        });
    } catch (err) {
        console.error('Failed to set DND status:', err);
    }
};

client.isGuildEnabled = (guildId) => {
    try {
        const config = db.prepare('SELECT enabled FROM server_config WHERE guild_id = ?').get(guildId);
        return config ? config.enabled !== 0 : true;
    } catch (e) {
        return true;
    }
};

client.getGuildConfig = (guildId) => {
    try {
        return db.prepare('SELECT * FROM server_config WHERE guild_id = ?').get(guildId) || {};
    } catch (e) {
        return {};
    }
};

const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'));
for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args, client));
    } else {
        client.on(event.name, (...args) => event.execute(...args, client));
    }
}

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);

    if (Array.isArray(command)) {
        for (const cmd of command) {
            if ('data' in cmd && 'execute' in cmd) {
                client.commands.set(cmd.data.name, cmd);
            }
        }
    }
    else if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    } else {
        console.log(chalk.yellow(`[!] Command Skipped: ${file} (Missing data or execute)`));
    }
}
console.log(chalk.green(`[+] Commands Loaded: ${client.commands.size}`));

process.on('unhandledRejection', error => {
    console.error(chalk.red('Unhandled Rejection:'), error);
});

process.on('uncaughtException', error => {
    console.error(chalk.red('Uncaught Exception:'), error);
});

client.once('ready', () => {
    startServer(3000, client);
});


db.ready.then(() => {
    initAntiNuker(client);
    initAntiSelfbot(client, db);
    initRaidPrevention(client, db);
    initSnapshots(client);

    client.login(process.env.DISCORD_TOKEN).catch(err => {
        console.error(chalk.red('[-] Bot Login Failed:'), err);
    });
}).catch(err => {
    console.error(chalk.red('[-] Database connection failed:'), err);
});
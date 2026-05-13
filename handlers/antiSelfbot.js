const ms = require('ms');
const { EmbedBuilder } = require('discord.js');

const messageData = new Map();
const configCache = new Map();
const DUPLICATE_LIMIT = 3;
const DUPLICATE_TIME = ms('5s');
const FLOOD_LIMIT = 5;
const FLOOD_WINDOW = ms('5s');
const CACHE_TTL = 30000;

const GLOBAL_LOG_CHANNEL = process.env.GLOBAL_LOG_CHANNEL || '1496045860864266361';

setInterval(() => {
    const now = Date.now();
    for (const [userId, data] of messageData.entries()) {
        if (now - data.lastTime > ms('10m')) {
            messageData.delete(userId);
        }
    }
    for (const [guildId, data] of configCache.entries()) {
        if (now - data.timestamp > CACHE_TTL) {
            configCache.delete(guildId);
        }
    }
}, ms('5m'));

function isWhitelisted(db, guildId, userId, member) {
    if (!userId) return false;
    const DEVELOPERS = ['1488524196559458485'];
    if (DEVELOPERS.includes(userId) || userId === process.env.BOT_OWNER_ID) return true;

    try {
        if (member && userId === member.guild.ownerId) return true;

        const row = db.prepare(`SELECT 1 FROM whitelists WHERE guild_id = ? AND user_id = ?`).get(guildId, userId);
        if (row) return true;

        const roleRows = db.prepare(`SELECT role_id FROM whitelist_roles WHERE guild_id = ?`).all(guildId);
        if (roleRows.length > 0 && member) {
            const whitelistedRoleIds = new Set(roleRows.map(r => r.role_id));
            if (member.roles.cache.some(r => whitelistedRoleIds.has(r.id))) return true;
        }
    } catch (e) { }
    return false;
}

function isActionAllowed(db, userId, guildId, action, member = null) {
    if (isWhitelisted(db, guildId, userId, member)) return true;
    try {
        const allowed = db.prepare('SELECT 1 FROM allowances WHERE guild_id = ? AND target_id = ? AND action = ?').get(guildId, userId, action);
        if (allowed) return true;

        if (member) {
            const roleIds = Array.from(member.roles.cache.keys());
            if (roleIds.length > 0) {
                const placeholders = roleIds.map(() => '?').join(',');
                const query = `SELECT 1 FROM allowances WHERE guild_id = ? AND action = ? AND target_id IN (${placeholders})`;
                const roleAllowed = db.prepare(query).get(guildId, action, ...roleIds);
                if (roleAllowed) return true;
            }
        }
    } catch (e) { }
    return false;
}

function initAntiSelfbot(client, db) {
    client.on('messageCreate', async (message) => {
        if (message.author.bot || !message.guild) return;

        const guildId = message.guild.id;
        let config = configCache.get(guildId);

        if (!config || (Date.now() - config.timestamp > CACHE_TTL)) {
            const dbConfig = db.prepare('SELECT anti_selfbot, punishment_type, log_channel, antilink FROM server_config WHERE guild_id = ?').get(guildId);
            config = { ...dbConfig, timestamp: Date.now() };
            configCache.set(guildId, config);
        }

        if (!config || !config.anti_selfbot) return;

        const userId = message.author.id;
        if (isActionAllowed(db, userId, guildId, 'anti_selfbot', message.member)) return;

        const now = Date.now();
        const userData = messageData.get(userId) || { count: 0, lastMsg: null, lastTime: now, linkCount: 0, firstTime: now, messageCount: 0 };
        const punishment = config.punishment_type || 'ban';

        async function enactPunishment(reason) {
            try {
                const member = message.member;
                const punishment = config.punishment_type || 'ban';
                let statusText = 'User Punished';
                if (punishment === 'ban') statusText = 'User Banned';
                else if (punishment === 'kick') statusText = 'User Kicked';
                else if (punishment === 'strip') statusText = 'Roles Stripped';
                else if (punishment === 'timeout') statusText = 'User Timed Out';

                const logEmbed = new EmbedBuilder()
                    .setColor(0x0b0b0b)
                    .setAuthor({ name: 'OfficialX Anti-Nuke Alert', iconURL: client.user.displayAvatarURL() })
                    .setThumbnail(client.user.displayAvatarURL())
                    .setDescription(
                        `<:dx:1494729984130945094> **Server:** ${message.guild.name}\n` +
                        `<:dx:1494729984130945094> **Action:** \`Anti-Selfbot Detection\`\n` +
                        `<:dx:1494729984130945094> **Status:** \`${statusText}\`\n` +
                        `<:dx:1494729984130945094> **Details:** ${reason}`
                    )
                    .addFields(
                        { name: 'Attacker', value: `<:dx:1494729984130945094> ${message.author}\n<:dx:1494729984130945094> \`${message.author.id}\``, inline: true },
                        { name: 'Members', value: `<:dx:1494729984130945094> ${message.guild.memberCount}`, inline: true }
                    )
                    .setFooter({ text: 'OfficialX Anti-Nuke System', iconURL: client.user.displayAvatarURL() })
                    .setTimestamp();

                if (config.log_channel) {
                    message.guild.channels.fetch(config.log_channel).then(logChannel => {
                        if (logChannel && logChannel.isTextBased()) {
                            logChannel.send({ embeds: [logEmbed] }).catch(() => null);
                        }
                    }).catch(() => null);
                }

                if (GLOBAL_LOG_CHANNEL) {
                    client.channels.fetch(GLOBAL_LOG_CHANNEL).then(globalLogChannel => {
                        if (globalLogChannel && globalLogChannel.isTextBased()) {
                            const globalEmbed = EmbedBuilder.from(logEmbed)
                                .setAuthor({ name: 'OfficialX Global Logs', iconURL: client.user.displayAvatarURL() })
                                .setTitle(null);
                            globalLogChannel.send({ embeds: [globalEmbed] }).catch(() => null);
                        }
                    }).catch(() => null);
                }

                if (member) {
                    if (member.bannable && punishment === 'ban') {
                        member.ban({ reason: `Anti-Selfbot: ${reason}` }).catch(() => null);
                    } else if (member.kickable && punishment === 'kick') {
                        member.kick(`Anti-Selfbot: ${reason}`).catch(() => null);
                    } else if (member.moderatable && punishment === 'strip') {
                        const roles = member.roles.cache.filter(r => r.id !== message.guild.id);
                        member.roles.remove(roles).catch(() => null);
                    } else if (member.moderatable && punishment === 'timeout') {
                        member.timeout(ms('1h'), `Anti-Selfbot: ${reason}`).catch(() => null);
                    }
                }
            } catch (e) { }
        }

        // Anti-Embed
        const hasCustomEmbed = message.embeds.length > 0 &&
            message.embeds.some(e => e.data.type === 'rich') &&
            !message.author.bot;

        if (config.anti_embed && hasCustomEmbed) {
            message.delete().catch(() => null);
            enactPunishment('`Custom Embed Use By Human`');
            return;
        }

        // Anti-Flood
        userData.messageCount = (userData.messageCount || 0) + 1;
        if (config.anti_flood && (now - userData.firstTime) <= FLOOD_WINDOW && userData.messageCount > FLOOD_LIMIT) {
            enactPunishment('`Message Flood`');
            messageData.delete(userId);
            return;
        }
        if ((now - userData.firstTime) > FLOOD_WINDOW) {
            userData.firstTime = now;
            userData.messageCount = 1;
        }

        // Anti-Spam (Duplicates)
        if (config.anti_spam && userData.lastMsg === message.content && (now - userData.lastTime) < DUPLICATE_TIME) {
            userData.count++;
            if (userData.count >= DUPLICATE_LIMIT) {
                enactPunishment('`Duplicate Message Spam`');
                messageData.delete(userId);
                return;
            }
        } else {
            userData.count = 1;
        }

        // Mass Mention
        if (config.anti_mention && (message.mentions.users.size > 10 || message.mentions.roles.size > 5)) {
            enactPunishment('`Mass Mention Abuse`');
        }

        userData.lastMsg = message.content;
        userData.lastTime = now;
        messageData.set(userId, userData);
    });

    client.on('guildMemberUpdate', async (oldMember, newMember) => {
        if (oldMember.nickname !== newMember.nickname) {
            const userId = newMember.id;
            const config = db.prepare('SELECT * FROM server_config WHERE guild_id = ?').get(newMember.guild.id);
            if (!config || !config.anti_selfbot || !config.anti_nickname) return;
            if (isWhitelisted(db, newMember.guild.id, userId, newMember) || userId === newMember.guild.ownerId) return;
            if (isActionAllowed(db, userId, newMember.guild.id, 'anti_nickname', newMember)) return;

            const now = Date.now();
            const userData = messageData.get(userId) || { nickCount: 0, lastNickTime: now };

            if ((now - userData.lastNickTime) < ms('5s')) {
                userData.nickCount++;
                if (userData.nickCount >= 3) {
                    const punishment = config.punishment_type || 'ban';
                    try {
                        if (punishment === 'ban') await newMember.ban({ reason: 'OfficialX Anti-Selfbot: Nickname Spam' });
                        else if (punishment === 'kick') await newMember.kick('OfficialX Anti-Selfbot: Nickname Spam');
                        else if (punishment === 'strip') await newMember.roles.set([]);
                        else if (punishment === 'timeout') await newMember.timeout(ms('1h'), 'OfficialX Anti-Selfbot: Nickname Spam');
                    } catch (e) { }
                    messageData.delete(userId);
                }
            } else {
                userData.nickCount = 1;
                userData.lastNickTime = now;
            }
            messageData.set(userId, userData);
        }
    });
}

module.exports = { initAntiSelfbot };
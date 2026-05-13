const { Events, EmbedBuilder, PermissionsBitField, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const db = require('../database/mongodb');
const ms = require('ms');
const axios = require('axios');

const themeColor = 0x0b0b0b;

const API_KEYS = [
    process.env.SEARCHAPI_KEY1 || 'uFCXZ8Bj55AF8tExVf69Cupg',
    process.env.SEARCHAPI_KEY2 || '1P2KCfy3FWqTxDJbXgjtH5JR',
    process.env.SEARCHAPI_KEY3 || 'VKeD5oZ3VS3ngQS4msKjq3sv',
    process.env.SEARCHAPI_KEY4 || 'TkDJw664MoHCTeZcmHJ9YcJD',
    process.env.SEARCHAPI_KEY5 || 'K1ow8wb6RqvebbEwk6CA5wDB',
    process.env.SEARCHAPI_KEY6 || 'aLBW3CMjMiRPrpXnEqyJGQD3',
    process.env.SEARCHAPI_KEY7 || 'CNvpKhEGQUhQ23ZHY2n6v8UT',
    process.env.SEARCHAPI_KEY8 || 'mtZYRQzzoeFjGMR9wnhJwiDw',
    process.env.SEARCHAPI_KEY9 || 'K9Gp7bEdDinNXcTH7Zob3Sns',
    process.env.SEARCHAPI_KEY10 || 'Hix8HCZpVyE4Hd62vLUxw2vA',
    process.env.SEARCHAPI_KEY11 || '4G3nJEgpkrkdshzNZSDaohk4',
    process.env.SEARCHAPI_KEY12 || 'PtHyAV2fJvhmAkpTbCyLZhiG',
    process.env.SEARCHAPI_KEY13 || 'VYxPQi9SpMLTRwV6bveD9j4C',
];

let keyIndex = 0;
const prefixCache = new Map();
const premiumCache = new Map();
const guildEnabledCache = new Map();
const whitelistCache = new Map();
const bypassCache = new Map();
const CACHE_TTL = 60000;

async function getNextApiKey() {
    const key = API_KEYS[keyIndex];
    keyIndex = (keyIndex + 1) % API_KEYS.length;
    return key;
}

async function fetchInstagramProfile(username) {
    for (let attempt = 0; attempt < API_KEYS.length * 2; attempt++) {
        const apiKey = await getNextApiKey();
        try {
            const url = `https://www.searchapi.io/api/v1/search?api_key=${apiKey}&engine=instagram_profile&username=${username}`;
            const response = await axios.get(url, { timeout: 15000 });
            if (response.status === 200) {
                const data = response.data;
                const profile = data.profile || {};
                return {
                    username: username,
                    full_name: profile.name || username,
                    bio: profile.bio || 'No bio',
                    followers: profile.followers || 0,
                    following: profile.following || 0,
                    posts: profile.posts || 0,
                    profile_pic: profile.avatar_hd || profile.avatar || ''
                };
            }
        } catch (error) {
            if (error.response?.status === 429) continue;
        }
    }
    return null;
}

async function fetchTikTokProfile(username) {
    for (let attempt = 0; attempt < API_KEYS.length * 2; attempt++) {
        const apiKey = await getNextApiKey();
        try {
            const url = `https://www.searchapi.io/api/v1/search?api_key=${apiKey}&engine=tiktok_profile&username=${username}`;
            const response = await axios.get(url, { timeout: 15000 });
            if (response.status === 200) {
                const data = response.data;
                const profile = data.profile || {};
                return {
                    username: username,
                    nickname: profile.display_name || profile.name || username,
                    bio: profile.bio || profile.description || 'No bio',
                    followers: profile.followers || 0,
                    following: profile.following || 0,
                    posts: profile.posts || profile.video_count || 0,
                    likes: profile.hearts || profile.heart_count || 0,
                    avatar: profile.avatar_hd || profile.avatar || ''
                };
            }
        } catch (error) {
            if (error.response?.status === 429) continue;
        }
    }
    return null;
}

async function fetchYoutubeChannel(channelId) {
    channelId = channelId.replace('@', '').trim();
    for (let attempt = 0; attempt < API_KEYS.length * 2; attempt++) {
        const apiKey = await getNextApiKey();
        try {
            cls
            const url = `https://www.searchapi.io/api/v1/search?api_key=${apiKey}&engine=youtube_channel&channel_id=@${channelId}`;
            const response = await axios.get(url, { timeout: 15000 });
            if (response.status === 200) {
                const data = response.data;
                const channel = data.channel || {};
                return {
                    username: channelId,
                    name: channel.title || channelId,
                    subscribers: channel.subscribers || 0,
                    views: channel.views || 0,
                    videos: channel.videos || 0,
                    description: (channel.description || 'No description').substring(0, 100),
                    avatar: channel.avatar || '',
                    joined: channel.joined_date_text || 'Unknown'
                };
            }
        } catch (error) {
            if (error.response?.status === 429) continue;
        }
    }
    return null;
}



function embed(color, desc) {
    return new EmbedBuilder()
        .setColor(color)
        .setDescription(desc);
}

function ok(desc) { return embed(themeColor, `<:OfficialX:1494713470065705020> ${desc}`); }
function err(desc) { return embed(themeColor, `<:OfficialX:1494713504215601223> ${desc}`); }
function usage(cmd, syntax) { return err(`Usage: \`${cmd} ${syntax}\``); }
function info(desc) { return embed(themeColor, `<:OfficialX:1494714913543684149> ${desc}`); }

async function replyAndDelete(message, emb, delay = 20000) {
    const replyMsg = await message.reply({ embeds: [emb] }).catch(() => null);
    if (replyMsg) {
        setTimeout(() => replyMsg.delete().catch(() => null), delay);
    }
    setTimeout(() => message.delete().catch(() => null), delay);
}

const reply = (message, emb) => replyAndDelete(message, emb);

const isServerOwner = (m) => m.id === m.guild.ownerId;
const isBotOwner = (m) => m.id === process.env.BOT_OWNER_ID;

const isWhitelistedUser = (guildId, userId) => {
    const cacheKey = `${guildId}:${userId}`;
    const cached = whitelistCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) return cached.value;

    try {
        const row = db.prepare('SELECT level FROM whitelists WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
        const value = !!row;
        whitelistCache.set(cacheKey, { value, timestamp: Date.now() });
        return value;
    } catch (e) {
        return false;
    }
};

const isPremiumUser = (userId) => {
    const cached = premiumCache.get(userId);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) return cached.value;

    try {
        const row = db.prepare('SELECT 1 FROM magic_users WHERE user_id = ?').get(userId);
        const value = !!row;
        premiumCache.set(userId, { value, timestamp: Date.now() });
        return value;
    } catch (e) {
        return false;
    }
};

const isWhitelistedRole = (member) => {
    try {
        const cacheKey = `roles:${member.guild.id}`;
        let whitelistedRoleIds = whitelistCache.get(cacheKey);

        if (!whitelistedRoleIds || (Date.now() - whitelistedRoleIds.timestamp) > CACHE_TTL) {
            const roleRows = db.prepare('SELECT role_id FROM whitelist_roles WHERE guild_id = ?').all(member.guild.id) || [];
            whitelistedRoleIds = { value: new Set(roleRows.map(r => r.role_id)), timestamp: Date.now() };
            whitelistCache.set(cacheKey, whitelistedRoleIds);
        }

        return member.roles.cache.some(r => whitelistedRoleIds.value.has(r.id));
    } catch (e) {
        return false;
    }
};

const isWhitelisted = (member) => {
    return isWhitelistedUser(member.guild.id, member.id) || isWhitelistedRole(member);
};

const canViewStatus = (member) => {
    return isBotOwner(member) || isServerOwner(member) || isWhitelisted(member);
};

const canManageSettings = (member) => {
    return isBotOwner(member) || isServerOwner(member);
};

module.exports = {
    name: Events.MessageCreate,
    async execute(message, client) {
        if (message.author.bot || !message.guild) return;

        let PREFIX = ',';
        const cachedPrefix = prefixCache.get(message.guild.id);
        if (cachedPrefix && (Date.now() - cachedPrefix.timestamp) < CACHE_TTL) {
            PREFIX = cachedPrefix.value;
        } else {
            try {
                const config = db.prepare('SELECT prefix FROM server_config WHERE guild_id = ?').get(message.guild.id);
                if (config?.prefix) PREFIX = config.prefix;
                prefixCache.set(message.guild.id, { value: PREFIX, timestamp: Date.now() });
            } catch (e) { }
        }

        if (message.content.trim() === `<@${client.user.id}>` || message.content.trim() === `<@!${client.user.id}>`) {
            const botEmbed = new EmbedBuilder()
                .setColor(themeColor)
                .setAuthor({ name: 'OfficialX', iconURL: message.guild.iconURL({ dynamic: true }) || message.guild.members.me.displayAvatarURL() })
                .setTitle(`\`⚡\` Powerful Anti-Nuke & Moderation Bot`)
                .setThumbnail(message.guild.members.me.displayAvatarURL())
                .addFields(
                    { name: 'Created by', value: '<:dx:1494729984130945094> Nomxrcy & G33K', inline: true },
                    { name: 'Prefix', value: `<:dx:1494729984130945094> \`${PREFIX}\``, inline: true },
                    { name: 'Help Command', value: `<:dx:1494729984130945094> \`${PREFIX}help\``, inline: true },
                    { name: 'Features', value: `<:dx:1494729984130945094> Anti-Nuke Protection\n<:dx:1494729984130945094> Anti-Raid System\n<:dx:1494729984130945094> Server Backup System\n<:dx:1494729984130945094> Moderation Commands\n<:dx:1494729984130945094> Utility Tools`, inline: false }
                );

            const replyMsg = await message.reply({ embeds: [botEmbed] }).catch(() => null);
            if (replyMsg) {
                setTimeout(() => replyMsg.delete().catch(() => null), 20000);
            }
            setTimeout(() => message.delete().catch(() => null), 20000);
            return;
        }

        const isServerOwner = message.author.id === message.guild.ownerId;
        const isAdmin = message.member && message.member.permissions.has(PermissionsBitField.Flags.Administrator);

        try {
            const afkCheck = db.prepare('SELECT reason FROM afk_users WHERE guild_id = ? AND user_id = ?').get(message.guild.id, message.author.id);
            if (afkCheck && !message.content.toLowerCase().startsWith(';afk') && !message.content.toLowerCase().startsWith(`${PREFIX}afk`)) {
                db.prepare('DELETE FROM afk_users WHERE guild_id = ? AND user_id = ?').run(message.guild.id, message.author.id);
                const replyMsg = await message.reply({ embeds: [embed(themeColor, `<a:wavex:1495514386004054117> Welcome back <@${message.author.id}>, your AFK status was removed.`)] }).catch(() => null);
                if (replyMsg) setTimeout(() => replyMsg.delete().catch(() => null), 10000);
            }

            if (message.mentions.users.size > 0 && !message.author.bot) {
                message.mentions.users.forEach(async (mentionedUser) => {
                    if (mentionedUser.id !== message.author.id) {
                        const mentionedAfk = db.prepare('SELECT reason, timestamp FROM afk_users WHERE guild_id = ? AND user_id = ?').get(message.guild.id, mentionedUser.id);
                        if (mentionedAfk) {
                            const timeStr = mentionedAfk.timestamp ? ` - <t:${Math.floor(mentionedAfk.timestamp / 1000)}:R>` : '';
                            const replyMsg = await message.reply({ embeds: [embed(themeColor, `<:OfficialX:1494714913543684149> **${mentionedUser.tag}** is currently AFK: \`${mentionedAfk.reason}\`${timeStr}`)] }).catch(() => null);
                            if (replyMsg) setTimeout(() => replyMsg.delete().catch(() => null), 15000);
                        }
                    }
                });
            }
        } catch (e) { }

        let usedPrefix = PREFIX;
        const mentionPrefix1 = `<@${client.user.id}>`;
        const mentionPrefix2 = `<@!${client.user.id}>`;

        if (message.content.startsWith(mentionPrefix1)) usedPrefix = mentionPrefix1;
        else if (message.content.startsWith(mentionPrefix2)) usedPrefix = mentionPrefix2;

        if (usedPrefix === PREFIX) {
            if (!isBotOwner(message.author) && !isPremiumUser(message.author.id) && !message.content.toLowerCase().startsWith(PREFIX.toLowerCase())) return;
        }

        const isPremium = isPremiumUser(message.author.id);
        const isPrefixless = (isBotOwner(message.author) || isPremium) && !message.content.toLowerCase().startsWith(usedPrefix.toLowerCase());

        let contentToParse = message.content;
        if (isPrefixless) {
        } else {
            contentToParse = message.content.slice(usedPrefix.length);
        }

        const args = contentToParse.trim().split(/ +/);
        const cmd = args.shift().toLowerCase();
        const P = PREFIX;

        const publicCommands = ['avatar', 'banner', 'userinfo', 'serverinfo', 'botinfo', 'help', 'afk', 'instagram', 'tiktok', 'youtube', 'snipe', 'status'];
        const isPublic = publicCommands.includes(cmd);

        let guildEnabled = true;
        const cachedEnabled = guildEnabledCache.get(message.guild.id);
        if (cachedEnabled && (Date.now() - cachedEnabled.timestamp) < CACHE_TTL) {
            guildEnabled = cachedEnabled.value;
        } else {
            guildEnabled = client.isGuildEnabled(message.guild.id);
            guildEnabledCache.set(message.guild.id, { value: guildEnabled, timestamp: Date.now() });
        }

        if (!guildEnabled && !isBotOwner(message.author) && !isServerOwner && !isAdmin && !isPublic) return;

        let antiBypassEnabled = 0;
        const cachedBypass = bypassCache.get(message.guild.id);
        if (cachedBypass && (Date.now() - cachedBypass.timestamp) < CACHE_TTL) {
            antiBypassEnabled = cachedBypass.value;
        } else {
            const configBypass = db.prepare('SELECT anti_bypass FROM server_config WHERE guild_id = ?').get(message.guild.id);
            antiBypassEnabled = configBypass?.anti_bypass || 0;
            bypassCache.set(message.guild.id, { value: antiBypassEnabled, timestamp: Date.now() });
        }

        if (antiBypassEnabled === 1 && (isPremiumUser(message.guild.ownerId) || isBotOwner(message.guild.ownerId))) {
            const isImmune = isBotOwner(message.author) || message.author.id === message.guild.ownerId || isWhitelisted(message.member);
            if (!isImmune) {
                const blocklist = ["cia", "ws", "linis", "!", "&", ">", "@"];
                const content = message.content.toLowerCase();
                if (blocklist.some(word => content.includes(word))) {
                    try {
                        await message.member.ban({ reason: "[OfficialX Anti-Nuke] Anti Kupal < 3" });

                        const configLogs = db.prepare('SELECT log_channel FROM server_config WHERE guild_id = ?').get(message.guild.id);
                        if (configLogs?.log_channel) {
                            const logChannel = message.guild.channels.cache.get(configLogs.log_channel);
                            if (logChannel) {
                                const logEmbed = new EmbedBuilder()
                                    .setColor(0xff0000)
                                    .setAuthor({ name: 'OfficialX Anti-Bypass', iconURL: client.user.displayAvatarURL() })
                                    .setDescription(`<a:1188041101660143636:1287797522080989184> **User Banned**\n\n<:dx:1494729984130945094> **User:** ${message.author.tag} (${message.author.id})\n<:dx:1494729984130945094> **Reason:** OfficialX Anti Kupal < 3\n<:dx:1494729984130945094> **Trigger:** \`${message.content}\``)
                                    .setTimestamp();
                                logChannel.send({ embeds: [logEmbed] }).catch(() => null);
                            }
                        }
                        return;
                    } catch (e) {
                        console.error('Anti-Bypass Ban Error:', e);
                    }
                }
            }
        }


        if (cmd === 'help') {
            const helpCmd = client.commands.get('help');
            return await helpCmd.execute(message, client);
        }

        if (cmd === 'automod' || cmd === 'am') {
            const automodCmd = client.commands.get('automod');
            if (automodCmd) return await automodCmd.execute(message, args, client);
        }


        if (cmd === 'setup' || cmd === 'autosetup') {
            if (!canManageSettings(message.member))
                return reply(message, err('only the ****server owner**** can run this command.'));

            if (!message.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageChannels) || !message.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
                return reply(message, err('I need \`Manage Channels\` and \`Manage Roles\` to auto-setup.'));
            }

            try {
                let logChannel = message.guild.channels.cache.find(c => c.name === 'officialx-security' || c.name === 'officialx-logs');
                if (!logChannel) {
                    try {
                        logChannel = await message.guild.channels.create({
                            name: 'officialx-security',
                            type: ChannelType.GuildText,
                            reason: 'OfficialX Auto-Setup',
                            permissionOverwrites: [
                                { id: message.guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                                { id: message.client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
                            ]
                        });
                    } catch (e) {
                        console.error('Prefix Setup Create Error:', e);
                        return reply(message, err('Failed to create channel. Ensure my role is high enough.'));
                    }
                }

                db.prepare('INSERT OR IGNORE INTO server_config (guild_id) VALUES (?)').run(message.guild.id);
                db.prepare(`UPDATE server_config SET 
                    anti_nuker = 1, anti_selfbot = 1, raid_prevention = 1,
                    log_channel = ?, antilink = 1, punishment_type = 'ban',
                    auto_backup = 1, enabled = 1
                    WHERE guild_id = ?`).run(logChannel.id, message.guild.id);

                return reply(message, ok(`Setup Complete\nLog Channel: <#${logChannel.id}>\nPunishment: \`Ban\`\n\nMove the bot role to the top of your role list to ensure it can ban attackers.`));
            } catch (e) {
                console.error('Total Setup Error:', e);
                return reply(message, err('Critical failure during setup. Check console.'));
            }
        }

        if (cmd === 'verification') {
            if (!canManageSettings(message.member)) return reply(message, err('only the ****server owner**** can manage verification.'));
            const sub = args[0]?.toLowerCase();

            if (sub === 'setup') {
                const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[1]);
                if (!role) return reply(message, usage(`${P}verification setup`, '<@role>'));

                db.prepare('INSERT OR IGNORE INTO server_config (guild_id) VALUES (?)').run(message.guild.id);
                db.prepare('UPDATE server_config SET verification_role = ? WHERE guild_id = ?').run(role.id, message.guild.id);

                return reply(message, ok(`Verification system setup complete! Members must now verify to get the ${role} role.`));
            }

            if (sub === 'disable' || sub === 'off') {
                db.prepare('UPDATE server_config SET verification_role = NULL WHERE guild_id = ?').run(message.guild.id);
                return reply(message, ok('Verification system has been disabled.'));
            }

            if (sub === 'status') {
                const config = db.prepare('SELECT verification_role FROM server_config WHERE guild_id = ?').get(message.guild.id);
                const role = config?.verification_role ? `<@&${config.verification_role}>` : '`Not Set`';
                return reply(message, embed(themeColor, `<:OfficialX:1494712226676871220> **Verification Status**\n\n<:dx:1494729984130945094> Role: ${role}\n<:dx:1494729984130945094> Status: ${config?.verification_role ? '<:OfficialX:1494713470065705020> `Active`' : '<:OfficialX:1494713504215601223> `Inactive`'}`));
            }

            return reply(message, usage(`${P}verification`, '<setup/disable/status>'));
        }

        if (cmd === 'arsetup') {
            if (!canManageSettings(message.member)) return reply(message, err('only the ****server owner**** can manage anti-raid.'));
            db.prepare('INSERT OR IGNORE INTO server_config (guild_id) VALUES (?)').run(message.guild.id);
            db.prepare('UPDATE server_config SET raid_prevention = 1 WHERE guild_id = ?').run(message.guild.id);
            return reply(message, ok('Anti-Raid system has been automatically enabled with default protection settings.'));
        }

        if (cmd === 'antinuke' || cmd === 'an') {
            if (!canManageSettings(message.member)) return reply(message, err('only the ****server owner**** can manage settings.'));

            const sub = args[0]?.toLowerCase();

            if (sub === 'on' || sub === 'enable') {
                db.prepare('INSERT OR IGNORE INTO server_config (guild_id) VALUES (?)').run(message.guild.id);
                db.prepare('UPDATE server_config SET anti_nuker = 1 WHERE guild_id = ?').run(message.guild.id);
                return reply(message, ok('Anti-Nuke has been **Enabled**.'));
            } else if (sub === 'off' || sub === 'disable') {
                db.prepare('INSERT OR IGNORE INTO server_config (guild_id) VALUES (?)').run(message.guild.id);
                db.prepare('UPDATE server_config SET anti_nuker = 0 WHERE guild_id = ?').run(message.guild.id);
                return reply(message, ok('Anti-Nuke has been **Disabled**.'));
            } else if (sub === 'log' || sub === 'logs') {
                const channel = message.mentions.channels.first() || (args[1] ? message.guild.channels.cache.get(args[1]) : null);
                if (!channel) return reply(message, usage(`${P}${cmd} log`, '<#channel>'));
                db.prepare('INSERT OR IGNORE INTO server_config (guild_id) VALUES (?)').run(message.guild.id);
                db.prepare('UPDATE server_config SET log_channel = ? WHERE guild_id = ?').run(channel.id, message.guild.id);
                return reply(message, ok(`Anti-Nuke logs set to ${channel}`));
            } else if (sub === 'punishment') {
                const type = args[1]?.toLowerCase();
                if (!['ban', 'kick', 'strip', 'timeout'].includes(type)) return reply(message, usage(`${P}${cmd} punishment`, '<ban/kick/strip/timeout>'));
                db.prepare('INSERT OR IGNORE INTO server_config (guild_id) VALUES (?)').run(message.guild.id);
                db.prepare('UPDATE server_config SET punishment_type = ? WHERE guild_id = ?').run(type, message.guild.id);
                return reply(message, ok(`Anti-Nuke punishment set to \`${type.toUpperCase()}\``));
            } else {
                const config = db.prepare('SELECT anti_nuker, anti_selfbot, raid_prevention, antilink, log_channel, punishment_type FROM server_config WHERE guild_id = ?').get(message.guild.id) || { anti_nuker: 0, anti_selfbot: 0, raid_prevention: 0, antilink: 0, punishment_type: 'ban' };
                const userWlCount = db.prepare('SELECT COUNT(*) as count FROM whitelists WHERE guild_id = ?').get(message.guild.id)?.count || 0;
                const roleWlCount = db.prepare('SELECT COUNT(*) as count FROM whitelist_roles WHERE guild_id = ?').get(message.guild.id)?.count || 0;
                const wlTotal = userWlCount + roleWlCount;

                const emb = new EmbedBuilder()
                    .setColor(themeColor)
                    .setAuthor({ name: `${message.guild.name} | Security Status`, iconURL: client.user.displayAvatarURL() })
                    .setThumbnail(message.guild.iconURL({ dynamic: true }))
                    .setDescription(`Current protection status and security configuration for this server.`)
                    .addFields(
                        { name: '<:modx:1494732451451371703> Modules', value: `<:dx:1494729984130945094> **Anti-Nuke:** ${config.anti_nuker ? '<:OfficialX:1494713470065705020>' : '<:OfficialX:1494713504215601223>'}\n<:dx:1494729984130945094> **Anti-Selfbot:** ${config.anti_selfbot ? '<:OfficialX:1494713470065705020>' : '<:OfficialX:1494713504215601223>'}\n<:dx:1494729984130945094> **Anti-Raid:** ${config.raid_prevention ? '<:OfficialX:1494713470065705020>' : '<:OfficialX:1494713504215601223>'}\n<:dx:1494729984130945094> **Anti-Link:** ${config.antilink ? '<:OfficialX:1494713470065705020>' : '<:OfficialX:1494713504215601223>'}`, inline: false },
                        { name: '<:dmx:1494731801397035119> Configuration', value: `<:dx:1494729984130945094> **Logs:** ${config.log_channel ? `<#${config.log_channel}>` : '`None`'}\n<:dx:1494729984130945094> **Punishment:** \`${(config.punishment_type || 'ban').toUpperCase()}\`\n<:dx:1494729984130945094> **Auto-Restore:** ${config.auto_restore !== 0 ? '<:OfficialX:1494713470065705020>' : '<:OfficialX:1494713504215601223>'}`, inline: true },
                        { name: '<:OfficialX:1494712226676871220> Whitelist', value: `<:dx:1494729984130945094> **Total:** \`${wlTotal}\` users/roles\n<:dx:1494729984130945094> **Immunity:** \`Bypass Checks\``, inline: true }
                    )
                    .setFooter({ text: 'OfficialX Security System', iconURL: client.user.displayAvatarURL() })
                    .setTimestamp();

                return reply(message, emb);
            }
        }

        if (cmd === 'antibypass' || cmd === 'ab') {
            const isOwner = message.author.id === message.guild.ownerId;
            const isPremium = isPremiumUser(message.author.id);

            if (!isBotOwner(message.author) && !(isOwner && isPremium)) {
                return reply(message, err('This command is only for the **Server Owner** with **Premium** status.'));
            }

            const sub = args[0]?.toLowerCase();
            if (sub === 'on' || sub === 'enable') {
                db.prepare('INSERT OR IGNORE INTO server_config (guild_id) VALUES (?)').run(message.guild.id);
                db.prepare('UPDATE server_config SET anti_bypass = 1 WHERE guild_id = ?').run(message.guild.id);
                bypassCache.set(message.guild.id, { value: 1, timestamp: Date.now() });
                return reply(message, ok('Anti-Bypass has been **Enabled**.'));
            } else if (sub === 'off' || sub === 'disable') {
                db.prepare('INSERT OR IGNORE INTO server_config (guild_id) VALUES (?)').run(message.guild.id);
                db.prepare('UPDATE server_config SET anti_bypass = 0 WHERE guild_id = ?').run(message.guild.id);
                bypassCache.set(message.guild.id, { value: 0, timestamp: Date.now() });
                return reply(message, ok('Anti-Bypass has been **Disabled**.'));
            } else {
                return reply(message, usage(`${P}${cmd}`, 'on/off'));
            }
        }

        if (cmd === 'anr' || cmd === 'ars' || cmd === 'autorestore') {
            if (!canManageSettings(message.member)) return reply(message, err('only the ****server owner**** can manage settings.'));
            const sub = args[0]?.toLowerCase();
            if (sub === 'on' || sub === 'enable') {
                db.prepare('INSERT OR IGNORE INTO server_config (guild_id) VALUES (?)').run(message.guild.id);
                db.prepare('UPDATE server_config SET auto_restore = 1 WHERE guild_id = ?').run(message.guild.id);
                return reply(message, ok('Anti-Nuke Auto-Restore has been **Enabled**.'));
            } else if (sub === 'off' || sub === 'disable') {
                db.prepare('INSERT OR IGNORE INTO server_config (guild_id) VALUES (?)').run(message.guild.id);
                db.prepare('UPDATE server_config SET auto_restore = 0 WHERE guild_id = ?').run(message.guild.id);
                return reply(message, ok('Anti-Nuke Auto-Restore has been **Disabled**.'));
            } else {
                return reply(message, usage(`${P}${cmd}`, 'on/off'));
            }
        }

        if (cmd === 'antiselfbot') {
            const sub = args[0]?.toLowerCase();
            if (!sub || !['on', 'off', 'status'].includes(sub)) return reply(message, usage(`${P}antiselfbot`, 'on/off/status'));

            if (sub === 'status') {
                if (!canViewStatus(message.member)) {
                    return reply(message, err('only the ****server owner**** or **Whitelisted** users/roles can view Anti-Selfbot status.'));
                }

                const config = db.prepare('SELECT anti_selfbot, raid_prevention, anti_nuker, punishment_type FROM server_config WHERE guild_id = ?').get(message.guild.id) || {};
                const enabled = config.anti_selfbot === 1;
                const statusText = `Anti-Nuke: \`${config.anti_nuker === 1 ? 'Enabled' : 'Disabled'}\`\nAnti-Selfbot: \`${enabled ? 'Enabled' : 'Disabled'}\`\nAnti-Raid: \`${config.raid_prevention === 1 ? 'Enabled' : 'Disabled'}\`\n\n**Triggers Monitored:**\n<:dx:1494729984130945094> Message Flood\n<:dx:1494729984130945094> Duplicate Messages\n<:dx:1494729984130945094> Mass Mentions\n<:dx:1494729984130945094> Custom Embeds\n<:dx:1494729984130945094> Nickname Spam`;
                return reply(message, embed(themeColor, statusText));
            }

            if (!canManageSettings(message.member)) {
                return reply(message, err('only the ****server owner**** can enable/disable Anti-Selfbot.'));
            }

            const state = sub === 'on' ? 1 : 0;
            db.prepare('INSERT OR IGNORE INTO server_config (guild_id) VALUES (?)').run(message.guild.id);
            db.prepare('UPDATE server_config SET anti_selfbot = ? WHERE guild_id = ?').run(state, message.guild.id);

            const config = db.prepare('SELECT raid_prevention, anti_nuker, punishment_type FROM server_config WHERE guild_id = ?').get(message.guild.id) || {};
            const messageText = `Anti-Nuke: \`${config.anti_nuker === 1 ? 'Enabled' : 'Disabled'}\`\nAnti-Selfbot: \`${state ? 'Enabled' : 'Disabled'}\`\nAnti-Raid: \`${config.raid_prevention === 1 ? 'Enabled' : 'Disabled'}\`\n\n**Triggers Monitored:**\n<:dx:1494729984130945094> Message Flood\n<:dx:1494729984130945094> Duplicate Messages\n<:dx:1494729984130945094> Mass Mentions\n<:dx:1494729984130945094> Custom Embeds\n<:dx:1494729984130945094> Nickname Spam`;
            return reply(message, ok(messageText));
        }

        if (cmd === 'autobackup') {
            if (!canManageSettings(message.member)) return reply(message, err('only the ****server owner**** can enable/disable Auto-Backup.'));
            if (!args[0]) return reply(message, usage(`${P}autobackup`, 'on/off'));
            const state = args[0] === 'on' ? 1 : 0;
            db.prepare('INSERT OR IGNORE INTO server_config (guild_id) VALUES (?)').run(message.guild.id);
            db.prepare('UPDATE server_config SET auto_backup = ? WHERE guild_id = ?').run(state, message.guild.id);
            return reply(message, ok(state ? 'Auto-Backup Enabled\nDeleted channels/roles will be automatically restored after a nuke.' : 'Auto-Backup Disabled\nAuto-restore has been disabled.'));
        }

        if (cmd === 'log' || cmd === 'logs') {
            if (!canManageSettings(message.member)) return reply(message, err('only the ****server owner**** can set the log channel.'));
            const channel = message.mentions.channels.first() || (args[0] ? message.guild.channels.cache.get(args[0]) : null);
            if (!channel) return reply(message, usage(`${P}${cmd}`, '<#channel>'));

            db.prepare('INSERT OR IGNORE INTO server_config (guild_id) VALUES (?)').run(message.guild.id);
            db.prepare('UPDATE server_config SET log_channel = ? WHERE guild_id = ?').run(channel.id, message.guild.id);
            return reply(message, ok(`Anti-Nuke logs set to ${channel}`));
        }

        if (cmd === 'antilink') {
            if (!canManageSettings(message.member)) return reply(message, err('only the ****server owner**** can enable/disable Anti-Link.'));
            if (!args[0]) return reply(message, usage(`${P}antilink`, 'on/off'));
            const state = args[0] === 'on' ? 1 : 0;
            db.prepare('INSERT OR IGNORE INTO server_config (guild_id) VALUES (?)').run(message.guild.id);
            db.prepare('UPDATE server_config SET antilink = ? WHERE guild_id = ?').run(state, message.guild.id);
            return reply(message, ok(state ? 'Anti-Link Enabled\nLinks will now be automatically deleted.' : 'Anti-Link Disabled\nLink filtering has been disabled.'));
        }

        if (cmd === 'antiraid') {
            if (!canManageSettings(message.member)) return reply(message, err('only the ****server owner**** can enable/disable Anti-Raid.'));
            if (!args[0]) return reply(message, usage(`${P}antiraid`, 'on/off'));
            const state = args[0] === 'on' ? 1 : 0;
            db.prepare('INSERT OR IGNORE INTO server_config (guild_id) VALUES (?)').run(message.guild.id);
            db.prepare('UPDATE server_config SET raid_prevention = ? WHERE guild_id = ?').run(state, message.guild.id);
            return reply(message, ok(state ? 'Anti-Raid Enabled\nMass join raids will now be blocked.' : 'Anti-Raid Disabled\nRaid protection has been disabled.'));
        }

        if (cmd === 'setup') {
            if (!canManageSettings(message.member)) return reply(message, err('only the ****server owner**** can use setup.'));
            if (!message.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageChannels) || !message.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
                return reply(message, err('I need **Manage Channels** and **Manage Roles** permissions to auto-setup.'));
            }

            try {
                let logChannel = message.guild.channels.cache.find(c => c.name === 'officialx-logs');
                if (!logChannel) {
                    logChannel = await message.guild.channels.create({
                        name: 'officialx-logs',
                        type: ChannelType.GuildText,
                        reason: 'OfficialX Anti-Nuke Setup',
                        permissionOverwrites: [
                            { id: message.guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                            { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
                        ]
                    });
                }

                db.prepare('INSERT OR IGNORE INTO server_config (guild_id) VALUES (?)').run(message.guild.id);
                db.prepare(`UPDATE server_config SET anti_nuker = 1, anti_selfbot = 1, raid_prevention = 1, log_channel = ?, punishment_type = 'ban' WHERE guild_id = ?`).run(logChannel.id, message.guild.id);

                return reply(message, ok(`**Setup Complete**\n\n<:dx:1494729984130945094> Anti-Nuke: **Enabled**\n<:dx:1494729984130945094> Anti-Selfbot: **Enabled**\n<:dx:1494729984130945094> Anti-Raid: **Enabled**\n<:dx:1494729984130945094> Logs: ${logChannel}\n<:dx:1494729984130945094> Punishment: **BAN**`));
            } catch (e) {
                console.error('Setup Error:', e);
                return reply(message, err('Failed to complete auto-setup. Check console.'));
            }
        }

        if (cmd === 'createbackup' || (cmd === 'backup' && args[0]?.toLowerCase() === 'create')) {
            if (!canViewStatus(message.member)) {
                return reply(message, err('only the ****server owner**** or **Whitelisted** users/roles can use backup commands.'));
            }

            const loadMsg = await message.reply({ embeds: [info(' Creating please wait...')] }).catch(() => null);

            try {
                const backupId = `manual-${message.guild.id}-${Date.now()}`;
                const channels = [];
                const roles = [];

                message.guild.channels.cache.forEach(ch => {
                    channels.push({
                        id: ch.id, name: ch.name, type: ch.type,
                        parentId: ch.parentId || null, position: ch.rawPosition || 0,
                        topic: ch.topic || null, nsfw: ch.nsfw || false,
                        bitrate: ch.bitrate || null, userLimit: ch.userLimit || null,
                        rateLimitPerUser: ch.rateLimitPerUser || null,
                        permissionOverwrites: ch.permissionOverwrites.cache.map(o => ({
                            id: o.id, type: o.type,
                            allow: o.allow.bitfield.toString(),
                            deny: o.deny.bitfield.toString()
                        }))
                    });
                });

                message.guild.roles.cache.forEach(role => {
                    if (role.managed || role.id === message.guild.id) return;
                    roles.push({
                        id: role.id, name: role.name, color: role.color,
                        hoist: role.hoist, permissions: role.permissions.bitfield.toString(),
                        mentionable: role.mentionable, position: role.rawPosition || 0,
                    });
                });

                db.prepare('INSERT OR REPLACE INTO backups (backup_id, guild_id, data, created_at) VALUES (?, ?, ?, ?)')
                    .run(backupId, message.guild.id, JSON.stringify({ channels, roles }), Date.now());

                const { takeSnapshot } = require('../handlers/snapshotHandler');
                takeSnapshot(message.guild);

                const categoriesCount = message.guild.channels.cache.filter(ch => ch.type === ChannelType.GuildCategory || ch.type === 4).size;
                const totalChannels = message.guild.channels.cache.filter(ch => ch.type !== ChannelType.GuildCategory && ch.type !== 4).size;

                const resultEmbed = ok(`**Successfully created backup in ${message.guild.name}**\n\n` +
                    `<:dx:1494729984130945094> **Server Name:** \`${message.guild.name}\`\n` +
                    `<:dx:1494729984130945094> **Server ID:** \`${message.guild.id}\`\n` +
                    `<:dx:1494729984130945094> **Backup ID:** \`${backupId}\`\n` +
                    `<:dx:1494729984130945094> **Categories:** \`${categoriesCount}\`\n` +
                    `<:dx:1494729984130945094> **Channels:** \`${totalChannels}\`\n` +
                    `<:dx:1494729984130945094> **Roles:** \`${roles.length}\`\n` +
                    `<:dx:1494729984130945094> **Created:** <t:${Math.floor(Date.now() / 1000)}:R>`);

                let dmSuccess = false;
                try {
                    await message.author.send({ embeds: [resultEmbed] });
                    dmSuccess = true;
                } catch (e) {
                    dmSuccess = false;
                }

                if (loadMsg) loadMsg.delete().catch(() => null);

                if (dmSuccess) {
                    const confirmMsg = await message.reply({ embeds: [ok(`**Backup Created!** I've sent the details to your DMs.`)] }).catch(() => null);
                    if (confirmMsg) setTimeout(() => confirmMsg.delete().catch(() => null), 10000);
                    setTimeout(() => message.delete().catch(() => null), 10000);
                } else {
                    return reply(message, resultEmbed);
                }
                return;
            } catch (e) {
                console.error('[backup create]', e);
                if (loadMsg) loadMsg.delete().catch(() => null);
                return reply(message, err('Backup Failed\nAn unexpected error occurred.'));
            }
        }

        if (cmd === 'restore' || (cmd === 'backup' && args[0]?.toLowerCase() === 'restore')) {
            if (!canViewStatus(message.member)) {
                return reply(message, err('only the ****server owner**** or **Whitelisted** users/roles can use backup commands.'));
            }

            let backupId = cmd === 'restore' ? args[0] : args[1];

            if (!backupId) {
                const latestBackup = db.prepare('SELECT backup_id FROM backups WHERE guild_id = ? ORDER BY created_at DESC LIMIT 1')
                    .get(message.guild.id);
                backupId = latestBackup?.backup_id;
            }

            if (!backupId) {
                return reply(message, err(`No backup found for **${message.guild.name}**.\nUse \`${P}createbackup\` to create one first.`));
            }

            const loadMsg = await message.reply({ embeds: [(`\`⏳\` Restoring from backup: \`${backupId}\`...`)] }).catch(() => null);
            setTimeout(() => loadMsg?.delete().catch(() => null), 20000);

            try {
                const { restoreFromSnapshot } = require('../handlers/snapshotHandler');
                await restoreFromSnapshot(message.guild, backupId);
                return reply(message, ok(`**Restore Complete**\nSuccessfully restored server state using backup ID: \`${backupId}\`.\n\nChannels and roles have been recreated.`));
            } catch (e) {
                console.error('[backup restore]', e);
                return reply(message, err('Restore Failed\nEnsure the bot has \`Administrator\` and \`Manage Channels\` permissions.'));
            }
        }

        if (cmd === 'backup') {
            if (!canViewStatus(message.member)) {
                return reply(message, err('only the ****server owner**** or **Whitelisted** users/roles can use backup commands.'));
            }

            const sub = args[0]?.toLowerCase();

            if (sub === 'list') {
                const rows = db.prepare('SELECT backup_id, created_at FROM backups WHERE guild_id = ? ORDER BY created_at DESC LIMIT 10')
                    .all(message.guild.id);

                if (!rows.length) {
                    return reply(message, err(`No backups found for **${message.guild.name}**.\nUse \`${P}createbackup\` to make one.`));
                }

                const list = rows.map((r, i) => {
                    const time = `<t:${Math.floor(r.created_at / 1000)}:R>`;
                    const label = r.backup_id.startsWith('auto-') ? '`🔄` Auto' : '`📦` Manual';
                    return `\`${i + 1}.\` ${label} — ${time}\n\`${r.backup_id}\``;
                }).join('\n\n');

                return reply(message, ok(`**Backups List**\n\n${list}`));
            }

            else {
                return reply(message, usage(`${P}backup`, 'list/create/restore'));
            }
        }

        if (['whitelist', 'wl', 'whitelistrole', 'wlrole'].includes(cmd)) {
            if (!canManageSettings(message.member)) return reply(message, err('only the ****server owner**** can manage whitelist.'));

            const arg = args[0]?.toLowerCase();

            if (arg === 'list' || (!args[0] && !message.mentions.users.first() && !message.mentions.roles.first())) {
                const users = db.prepare('SELECT user_id, level FROM whitelists WHERE guild_id = ?').all(message.guild.id);
                const roles = db.prepare('SELECT role_id, level FROM whitelist_roles WHERE guild_id = ?').all(message.guild.id);
                if (!users.length && !roles.length) return reply(message, ok('No whitelisted users or roles found.'));

                let text = '';
                if (users.length) {
                    text += '**Users**\n';
                    for (const row of users) {
                        const user = await client.users.fetch(row.user_id).catch(() => null);
                        text += `<:dx:1494729984130945094> ${user ? user.tag : row.user_id} (\`${row.user_id}\`) — **${(row.level || 'admin').toLowerCase()}**\n`;
                    }
                    text += '\n';
                }
                if (roles.length) {
                    text += '**Roles**\n';
                    for (const row of roles) {
                        const role = message.guild.roles.cache.get(row.role_id);
                        text += `<:dx:1494729984130945094> ${role ? role.name : row.role_id} (\`${row.role_id}\`) — **${(row.level || 'admin').toLowerCase()}**\n`;
                    }
                }
                return reply(message, ok(`**Whitelist List**\n\n${text}`));
            }

            const targetId = args[0]?.replace(/[<@!&>]/g, '');
            if (!targetId) return reply(message, usage(`${P}wl`, '<@user/role or ID> [owner/admin/trusted]'));

            const possibleLevel = args[1]?.toLowerCase();
            const level = ['owner', 'admin', 'trusted'].includes(possibleLevel) ? possibleLevel : 'admin';

            const role = message.guild.roles.cache.get(targetId);
            if (role) {
                db.prepare('INSERT OR REPLACE INTO whitelist_roles (guild_id, role_id, level) VALUES (?, ?, ?)')
                    .run(message.guild.id, role.id, level);
                whitelistCache.delete(`roles:${message.guild.id}`);
                return reply(message, ok(`**${role.name}** (\`${role.id}\`) role has been whitelisted as **${level.toLowerCase()}**.`));
            }

            const user = await client.users.fetch(targetId).catch(() => null);
            if (user) {
                db.prepare('INSERT OR REPLACE INTO whitelists (guild_id, user_id, level) VALUES (?, ?, ?)')
                    .run(message.guild.id, user.id, level);
                whitelistCache.delete(`${message.guild.id}:${user.id}`);
                return reply(message, ok(`**${user.tag}** (\`${user.id}\`) user has been whitelisted as **${level.toLowerCase()}**.`));
            }

            return reply(message, err('User or Role not found. Please provide a valid ID or mention.'));
        }

        if (cmd === 'allow') {
            if (!canManageSettings(message.member)) return reply(message, err('only the ****server owner**** can manage allowances.'));

            const actionMap = {
                'ban': 'member_ban_add',
                'kick': 'member_kick',
                'channel_create': 'channel_create',
                'channel_delete': 'channel_delete',
                'role_create': 'role_create',
                'role_delete': 'role_delete',
                'webhook': 'webhook_create',
                'guild_update': 'guild_update',
                'role_update': 'member_role_update',
                'member_role_update': 'member_role_update'
            };

            const sub = args[0]?.toLowerCase();
            if (!sub) return reply(message, usage(`${P}allow`, '<@user/role/id> <action> or `show` / `list`'));

            if (sub === 'show' || sub === 'list') {
                const allowances = db.prepare('SELECT target_id, action FROM allowances WHERE guild_id = ?').all(message.guild.id);
                if (!allowances.length) return reply(message, ok('No specific allowances found.'));

                let text = '**Current Allowances**\n';
                for (const row of allowances) {
                    text += `<:dx:1494729984130945094> <@${row.target_id}> (\`${row.target_id}\`) — \`${row.action}\`\n`;
                }
                return reply(message, ok(text));
            }

            if (sub === 'remove') {
                const target = message.mentions.users.first() || message.mentions.roles.first() || { id: args[1] };
                const actionInput = args[2]?.toLowerCase();
                const action = actionMap[actionInput] || actionInput;

                if (!target.id || !action) return reply(message, usage(`${P}allow`, 'remove <@user/role/id> <action>'));

                db.prepare('DELETE FROM allowances WHERE guild_id = ? AND target_id = ? AND action = ?').run(message.guild.id, target.id, action);
                return reply(message, ok(`Removed allowance for **${action}** from <@${target.id}>.`));
            }

            const target = message.mentions.users.first() || message.mentions.roles.first() || { id: args[0] };
            const actionInput = args.slice(1).join('_').toLowerCase();
            const action = actionMap[actionInput] || actionInput;

            if (!target.id || !action) {
                return reply(message, usage(`${P}allow`, '<@user/role/id> <action>\n**Actions:** `ban`, `kick`, `channel_create`, `channel_delete`, `role_create`, `role_delete`, `webhook`, `guild_update`, `role_update`'));
            }

            try {
                db.prepare('INSERT OR IGNORE INTO allowances (guild_id, target_id, action) VALUES (?, ?, ?)').run(message.guild.id, target.id, action);
                return reply(message, ok(`Allowed <@${target.id}> to perform **${action}** without punishment.`));
            } catch (e) {
                return reply(message, err('Failed to add allowance.'));
            }
        }


        if (['unwhitelist', 'unwl', 'unwhitelistrole', 'unwlrole', 'wlr'].includes(cmd)) {
            if (!canManageSettings(message.member)) return reply(message, err('only the ****server owner**** can manage whitelist.'));

            const targetId = args[0]?.replace(/[<@!&>]/g, '');
            if (!targetId) return reply(message, usage(`${P}${cmd}`, '<@user/role or ID>'));

            const role = message.guild.roles.cache.get(targetId);
            if (role) {
                db.prepare('DELETE FROM whitelist_roles WHERE guild_id = ? AND role_id = ?').run(message.guild.id, role.id);
                whitelistCache.delete(`roles:${message.guild.id}`);
                return reply(message, ok(`**${role.name}** (\`${role.id}\`) role has been removed from whitelist.`));
            }

            const user = await client.users.fetch(targetId).catch(() => null);
            if (user) {
                db.prepare('DELETE FROM whitelists WHERE guild_id = ? AND user_id = ?').run(message.guild.id, user.id);
                whitelistCache.delete(`${message.guild.id}:${user.id}`);
                return reply(message, ok(`**${user.tag}** (\`${user.id}\`) user has been removed from whitelist.`));
            }

            return reply(message, err('User or Role not found. Please provide a valid ID or mention.'));
        }

        if (cmd === 'setprefix' || cmd === 'prefix') {
            if (!canManageSettings(message.member))
                return reply(message, err('only the ****server owner**** can change the prefix.'));
            if (!args[0]) return reply(message, usage(`${P}setprefix`, '<new_prefix>'));
            if (args[0].length > 5) return reply(message, err('prefix must be symbol.'));

            db.prepare('INSERT OR IGNORE INTO server_config (guild_id) VALUES (?)').run(message.guild.id);
            db.prepare('UPDATE server_config SET prefix = ? WHERE guild_id = ?').run(args[0], message.guild.id);
            return reply(message, ok(`Prefix has been set to \`${args[0]}\``));
        }



        if (['ban', 'b'].includes(cmd)) {
            if (!isBotOwner(message.author) && !message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return;
            const target = message.mentions.members.first();
            if (!target) return reply(message, usage(`${P}ban`, '<@user> [reason]'));
            if (target.id === message.author.id) return reply(message, err('You cannot ban yourself.'));
            if (!target.bannable) return reply(message, err('I cannot ban this user — my role is too low.'));
            if (message.author.id !== message.guild.ownerId && message.member.roles.highest.position <= target.roles.highest.position) {
                return reply(message, err('You cannot ban this user (Hierarchy).'));
            }

            const reason = args.slice(1).join(' ') || 'No reason provided';
            try {
                await target.ban({ reason: `Moderator: ${message.author.tag} | ${reason}` });
                db.prepare('INSERT INTO moderation_logs (guild_id, user_id, action, reason, timestamp) VALUES (?, ?, ?, ?, ?)')
                    .run(message.guild.id, target.id, 'ban', reason, Date.now());

                const replyMsg = await message.reply({ embeds: [embed(themeColor, `<:OfficialX:1494713470065705020> **${target.user.tag} has been banned.**`)] }).catch(() => null);
                if (replyMsg) {
                    setTimeout(() => replyMsg.delete().catch(() => null), 20000);
                }
                setTimeout(() => message.delete().catch(() => null), 20000);
            } catch (error) {
                return reply(message, err('Failed to ban user. Check my permissions and hierarchy.'));
            }
            return;
        }

        if (['kick', 'k'].includes(cmd)) {
            if (!isBotOwner(message.author) && !message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return;
            const target = message.mentions.members.first();
            if (!target) return reply(message, usage(`${P}kick`, '<@user> [reason]'));
            if (!target.kickable) return reply(message, err('I cannot kick this user — my role is too low.'));
            if (message.author.id !== message.guild.ownerId && message.member.roles.highest.position <= target.roles.highest.position) {
                return reply(message, err('You cannot kick this user (Hierarchy).'));
            }

            const reason = args.slice(1).join(' ') || 'No reason provided';
            try {
                await target.kick(`Moderator: ${message.author.tag} | ${reason}`);
                db.prepare('INSERT INTO moderation_logs (guild_id, user_id, action, reason, timestamp) VALUES (?, ?, ?, ?, ?)')
                    .run(message.guild.id, target.id, 'kick', reason, Date.now());

                const replyMsg = await message.reply({ embeds: [embed(themeColor, `<:OfficialX:1494713470065705020> **${target.user.tag} has been kicked.**`)] }).catch(() => null);
                if (replyMsg) {
                    setTimeout(() => replyMsg.delete().catch(() => null), 20000);
                }
                setTimeout(() => message.delete().catch(() => null), 20000);
            } catch (error) {
                return reply(message, err('Failed to kick user. Check my permissions and hierarchy.'));
            }
            return;
        }

        if (['timeout', 'mute', 'm', 'tm'].includes(cmd)) {
            if (!isBotOwner(message.author) && !message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;
            const target = message.mentions.members.first();
            const durationStr = args[1];
            if (!target || !durationStr) return reply(message, usage(`${P}${cmd}`, '<@user> <duration (10m, 1h, 1d)>'));
            const duration = ms(durationStr);
            if (!duration || duration < 10000) return reply(message, err('Invalid Duration\nExamples: \`10m\`, \`1h\`, \`1d\`'));
            if (!target.moderatable) return reply(message, err('I cannot timeout this user.'));
            if (message.author.id !== message.guild.ownerId && message.member.roles.highest.position <= target.roles.highest.position) {
                return reply(message, err('You cannot timeout this user (Hierarchy).'));
            }

            try {
                await target.timeout(duration, `Moderator: ${message.author.tag}`);
                db.prepare('INSERT INTO moderation_logs (guild_id, user_id, action, reason, timestamp) VALUES (?, ?, ?, ?, ?)').run(message.guild.id, target.id, 'timeout', `Duration: ${durationStr}`, Date.now());
                return reply(message, ok(`**${target.user.tag}** has been muted for **${durationStr}**.`));
            } catch (error) {
                return reply(message, err('Failed to timeout user. Check my permissions.'));
            }
        }

        if (['untimeout', 'unmute', 'um', 'utm'].includes(cmd)) {
            if (!isBotOwner(message.author) && !message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;
            const target = message.mentions.members.first();
            if (!target) return reply(message, usage(`${P}${cmd}`, '<@user>'));
            if (!target.moderatable) return reply(message, err('I cannot untimeout this user.'));

            try {
                await target.timeout(null, `Moderator: ${message.author.tag}`);
                return reply(message, ok(`Timeout removed from **${target.user.tag}**.`));
            } catch (error) {
                return reply(message, err('Failed to remove timeout. Check my permissions.'));
            }
        }

        if (['warn', 'w'].includes(cmd)) {
            if (!isBotOwner(message.author) && !message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;
            const target = message.mentions.users.first() || (args[0] ? await client.users.fetch(args[0].replace(/[<@!>]/g, '')).catch(() => null) : null);
            if (!target) return reply(message, usage(`${P}warn`, '<@user> <reason>'));
            const reason = args.slice(1).join(' ');
            if (!reason) return reply(message, usage(`${P}warn`, '<@user> <reason>'));

            db.prepare('INSERT INTO moderation_logs (guild_id, user_id, action, reason, timestamp) VALUES (?, ?, ?, ?, ?)')
                .run(message.guild.id, target.id, 'warn', reason, Date.now());
            const count = db.prepare('SELECT COUNT(*) as total FROM moderation_logs WHERE guild_id = ? AND user_id = ? AND action = ?').get(message.guild.id, target.id, 'warn').total;

            return reply(message, embed(themeColor, `<:dwdawd:1494726368208879797> **${target.tag}** has been warned.\n**<:dx:1494729984130945094> Reason:** ${reason}\n**<:dx:1494729984130945094> Total Warns:** ${count}`));
        }

        if (['warns', 'ws'].includes(cmd)) {
            if (!isBotOwner(message.author) && !message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;
            const target = message.mentions.users.first() || (args[0] ? await client.users.fetch(args[0].replace(/[<@!>]/g, '')).catch(() => null) : null) || message.author;
            const warns = db.prepare('SELECT * FROM moderation_logs WHERE guild_id = ? AND user_id = ? AND action = ? ORDER BY timestamp DESC').all(message.guild.id, target.id, 'warn');

            if (warns.length === 0) return reply(message, ok(`**${target.tag}** has no warns.`));

            const warnsEmbed = new EmbedBuilder()
                .setColor(themeColor)
                .setAuthor({ name: `Warnings for ${target.tag}`, iconURL: target.displayAvatarURL() })
                .setDescription(warns.map((w, i) => `**#${warns.length - i}** | <t:${Math.floor(w.timestamp / 1000)}:R>\n> ${w.reason}`).join('\n\n'))
                .setFooter({ text: `Total Warnings: ${warns.length}` });

            return reply(message, warnsEmbed);
        }

        if (['purge', 'clear', 'c'].includes(cmd)) {
            if (!isBotOwner(message.author) && !message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return;
            const amount = parseInt(args[0]);
            if (isNaN(amount) || amount < 1 || amount > 100)
                return reply(message, usage(`${P}purge`, '<1-100>'));

            try {
                const deleted = await message.channel.bulkDelete(amount + 1, true);
                const actualDeleted = deleted.size - 1;
                const r = await message.channel.send({ embeds: [ok(`Successfully deleted **${actualDeleted < 0 ? 0 : actualDeleted}** messages.`)] });
                setTimeout(() => r.delete().catch(() => null), 5000);
            } catch (error) {
                console.error('Prefix Purge Error:', error);
                const r = await message.channel.send({ embeds: [err('Failed to purge messages. Ensure I have `Manage Messages` permission.')] });
                setTimeout(() => r.delete().catch(() => null), 5000);
            }
            return;
        }

        if (['unban', 'ub'].includes(cmd)) {
            if (!isBotOwner(message.author) && !message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return;
            const userId = args[0];
            if (!userId) return reply(message, usage(`${P}unban`, '<user_id> [reason]'));

            const reason = args.slice(1).join(' ') || 'No reason provided';
            try {
                await message.guild.bans.remove(userId, `Moderator: ${message.author.tag} | ${reason}`);
                db.prepare('INSERT INTO moderation_logs (guild_id, user_id, action, reason, timestamp) VALUES (?, ?, ?, ?, ?)')
                    .run(message.guild.id, userId, 'unban', reason, Date.now());
                const targetUser = await client.users.fetch(userId).catch(() => null);
                const identifier = targetUser ? targetUser.username : userId;

                const replyMsg = await message.reply({ embeds: [embed(themeColor, `<:OfficialX:1494713470065705020> **${identifier} has been unbanned.**`)] }).catch(() => null);
                if (replyMsg) {
                    setTimeout(() => replyMsg.delete().catch(() => null), 20000);
                }
                setTimeout(() => message.delete().catch(() => null), 20000);
                return;
            } catch (e) {
                return reply(message, err('User might not be banned or ID is invalid.'));
            }
        }

        if (['addrole', 'role', 'r', 'removerole', 'rr'].includes(cmd)) {
            if (!isBotOwner(message.author) && !message.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) return;

            const isAdd = ['addrole', 'role', 'r'].includes(cmd);
            const actionLabel = isAdd ? 'add' : 'remove';

            let target = message.mentions.members.first();
            if (!target && args[0]) {
                target = await message.guild.members.fetch(args[0].replace(/[<@!>]/g, '')).catch(() => null);
            }
            if (!target) return reply(message, usage(`${P}${cmd}`, '<@user/id> <role_name>'));

            const roleQuery = args.slice(1).join(' ').toLowerCase();
            if (!roleQuery) return reply(message, usage(`${P}${cmd}`, '<@user/id> <role_name>'));

            let matchedRoles = [];
            const mentionedRole = message.mentions.roles.first();

            if (mentionedRole) {
                matchedRoles.push(mentionedRole);
            } else if (message.guild.roles.cache.has(args[1])) {
                matchedRoles.push(message.guild.roles.cache.get(args[1]));
            } else {
                const exactMatches = message.guild.roles.cache.filter(r => r.name.toLowerCase() === roleQuery);
                if (exactMatches.size > 0) {
                    matchedRoles = Array.from(exactMatches.values());
                } else {
                    const partialMatches = message.guild.roles.cache.filter(r => r.name.toLowerCase().includes(roleQuery));
                    matchedRoles = Array.from(partialMatches.values());
                }
            }

            if (matchedRoles.length === 0) {
                return reply(message, err(`No roles found matching **${roleQuery}**`));
            }
            matchedRoles = matchedRoles.slice(0, 25);

            const performAction = async (repliable, rolesToApply, isInteraction = false) => {
                let successRoles = [];
                let failedRoles = [];
                let errors = [];

                for (const roleToApply of rolesToApply) {
                    const isOwner = message.author.id === message.guild.ownerId;
                    const botEditable = roleToApply.editable && message.guild.members.me.roles.highest.position > roleToApply.position;
                    const authorEditable = isOwner || message.member.roles.highest.position > roleToApply.position;
                    const targetManageable = isOwner || message.member.roles.highest.position > target.roles.highest.position;

                    if (!botEditable) {
                        failedRoles.push(roleToApply);
                        errors.push(`I cannot manage **${roleToApply.name}** (Bot Hierarchy).`);
                        continue;
                    }

                    if (!authorEditable) {
                        failedRoles.push(roleToApply);
                        errors.push(`You cannot manage **${roleToApply.name}** (Your Hierarchy).`);
                        continue;
                    }

                    if (!targetManageable) {
                        failedRoles.push(roleToApply);
                        errors.push(`You cannot manage roles for **${target.user.tag}** (Target Hierarchy).`);
                        continue;
                    }

                    if (isAdd && target.roles.cache.has(roleToApply.id)) {
                        failedRoles.push(roleToApply);
                        errors.push(`**${target.user.tag}** already has **${roleToApply.name}**.`);
                        continue;
                    }

                    if (!isAdd && !target.roles.cache.has(roleToApply.id)) {
                        failedRoles.push(roleToApply);
                        errors.push(`**${target.user.tag}** doesn't have **${roleToApply.name}**.`);
                        continue;
                    }

                    try {
                        if (isAdd) {
                            await target.roles.add(roleToApply);
                            db.prepare('INSERT INTO moderation_logs (guild_id, user_id, action, reason, timestamp) VALUES (?, ?, ?, ?, ?)').run(message.guild.id, target.id, 'addrole', `Added role ${roleToApply.name}`, Date.now());
                        } else {
                            await target.roles.remove(roleToApply);
                            db.prepare('INSERT INTO moderation_logs (guild_id, user_id, action, reason, timestamp) VALUES (?, ?, ?, ?, ?)').run(message.guild.id, target.id, 'removerole', `Removed role ${roleToApply.name}`, Date.now());
                        }
                        successRoles.push(roleToApply);
                    } catch (error) {
                        failedRoles.push(roleToApply);
                        errors.push(`Failed to ${isAdd ? 'add' : 'remove'} **${roleToApply.name}**.`);
                    }
                }

                let desc = '';
                const emoji = isAdd ? '<:OfficialX:1494710761472135300>' : '<:OfficialX:1494710780631978215>';
                const actionText = isAdd ? 'Added' : 'Removed';
                const preposition = isAdd ? 'to' : 'from';

                if (successRoles.length > 0) {
                    const roleMentions = successRoles.map(r => `<@&${r.id}>`).join(', ');
                    desc += `${emoji} **${actionText} ${roleMentions} ${preposition} ${target}**\n`;
                }

                if (failedRoles.length > 0) {
                    desc += `\n<:OfficialX:1494713504215601223> **Failed (${failedRoles.length}):**\n` + errors.map(e => `> ${e}`).join('\n');
                }

                if (!desc) desc = `<:OfficialX:1494713504215601223> No roles were ${isAdd ? 'added' : 'removed'}.`;

                const successEmbed = embed(themeColor, desc);

                let finalMsg;
                if (isInteraction) {
                    await repliable.update({ content: '', embeds: [successEmbed], components: [] }).catch(() => { });
                    finalMsg = await repliable.message.fetch().catch(() => null);
                } else {
                    finalMsg = await repliable.reply({ embeds: [successEmbed] }).catch(() => null);
                }

                if (finalMsg) {
                    setTimeout(() => finalMsg.delete().catch(() => null), 20000);
                }
                setTimeout(() => message.delete().catch(() => null), 20000);
            };

            if (matchedRoles.length > 1) {
                const options = matchedRoles.map(r => ({
                    label: r.name.substring(0, 100),
                    description: `ID: ${r.id}`,
                    value: r.id
                }));

                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('role_select')
                    .setPlaceholder(`Choose role here ${actionLabel}`)
                    .addOptions(options)
                    .setMinValues(1)
                    .setMaxValues(options.length > 25 ? 25 : options.length);

                const row = new ActionRowBuilder().addComponents(selectMenu);
                const dropdownMsg = await message.reply({ content: `Choose role ${actionLabel}`, components: [row] });

                const filter = i => i.user.id === message.author.id && i.customId === 'role_select';
                const collector = dropdownMsg.createMessageComponentCollector({ filter, time: 20000, max: 1 });

                collector.on('collect', async i => {
                    const selectedRolesIds = i.values;
                    const selectedRoles = selectedRolesIds.map(id => message.guild.roles.cache.get(id)).filter(r => r);

                    if (selectedRoles.length === 0) {
                        return i.update({ content: 'Role not found anymore.', components: [] });
                    }

                    const confirmRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('confirm').setLabel('Confirm').setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId('cancel').setLabel('Cancel').setStyle(ButtonStyle.Danger)
                    );

                    const roleNames = selectedRoles.map(r => `**${r.name}**`).join(', ');

                    await i.update({ content: `You chose: ${roleNames} for <@${target.id}>\n\nConfirm?`, components: [confirmRow] });

                    const finalFilter = btn => btn.user.id === message.author.id && ['confirm', 'cancel'].includes(btn.customId);
                    const finalCollector = dropdownMsg.createMessageComponentCollector({ filter: finalFilter, time: 20000, max: 1 });

                    finalCollector.on('collect', async btn => {
                        if (btn.customId === 'confirm') {
                            await performAction(btn, selectedRoles, true);
                        } else {
                            await btn.update({ content: 'Cancelled.', components: [] });
                        }
                    });

                    finalCollector.on('end', collected => {
                        if (collected.size === 0) {
                            dropdownMsg.delete().catch(() => null);
                            message.delete().catch(() => null);
                        }
                    });
                });

                collector.on('end', collected => {
                    if (collected.size === 0) {
                        dropdownMsg.delete().catch(() => null);
                        message.delete().catch(() => null);
                    }
                });
                return;
            }

            await performAction(message, [matchedRoles[0]], false);
            return;
        }

        if (['purgeuser', 'pu'].includes(cmd)) {
            if (!isBotOwner(message.author) && !message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return;
            const target = message.mentions.users.first();
            const limit = parseInt(args[1]) || 100;

            if (!target) return reply(message, usage(`${P}purgeuser`, '<@user> [limit 1-100]'));
            if (isNaN(limit) || limit < 1 || limit > 100) return reply(message, err('Limit must be between 1-100.'));

            try {
                const messages = await message.channel.messages.fetch({ limit: limit });
                const userMessages = messages.filter(m => m.author.id === target.id);

                if (userMessages.size === 0) return reply(message, info(`No messages found from **${target.tag}** in the last ${limit} messages.`));

                const deleted = await message.channel.bulkDelete(userMessages, true);
                db.prepare('INSERT INTO moderation_logs (guild_id, user_id, action, reason, timestamp) VALUES (?, ?, ?, ?, ?)')
                    .run(message.guild.id, target.id, 'purgeuser', `Deleted ${deleted.size} messages`, Date.now());

                const r = await message.channel.send({ embeds: [ok(`Deleted **${deleted.size}** messages from **${target.tag}**.`)] });
                setTimeout(() => r.delete().catch(() => null), 5000);
                setTimeout(() => message.delete().catch(() => null), 5000);
            } catch (error) {
                console.error('Prefix PurgeUser Error:', error);
                const r = await message.channel.send({ embeds: [err('Failed to purge user messages. Ensure I have `Manage Messages` permission.')] });
                setTimeout(() => r.delete().catch(() => null), 5000);
            }
            return;
        }

        if (['lock', 'l'].includes(cmd)) {
            if (!isBotOwner(message.author) && !message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return;
            const channel = message.mentions.channels.first() || message.channel;
            await channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false }).catch(() => null);

            const replyMsg = await message.reply({ embeds: [embed(themeColor, `<:OfficialX:1494713504215601223> ${channel} has been locked.`)] }).catch(() => null);
            if (replyMsg) setTimeout(() => replyMsg.delete().catch(() => null), 20000);
            setTimeout(() => message.delete().catch(() => null), 20000);
            return;
        }

        if (['unlock', 'ul'].includes(cmd)) {
            if (!isBotOwner(message.author) && !message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return;
            const channel = message.mentions.channels.first() || message.channel;
            await channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null }).catch(() => null);

            const replyMsg = await message.reply({ embeds: [embed(themeColor, `<:OfficialX:1494713470065705020> ${channel} has been unlocked.`)] }).catch(() => null);
            if (replyMsg) setTimeout(() => replyMsg.delete().catch(() => null), 20000);
            setTimeout(() => message.delete().catch(() => null), 20000);
            return;
        }

        if (cmd === 'lockall') {
            if (!isBotOwner(message.author) && !message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return;
            const channels = message.guild.channels.cache.filter(c => c.type === ChannelType.GuildText);
            const loadMsg = await message.reply({ embeds: [embed(themeColor, `<a:officialx_loading:1500889778000756919> Locking all channels...`)] });
            let count = 0;
            for (const [id, channel] of channels) {
                await channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false }).catch(() => null);
                count++;
            }
            return loadMsg.edit({ embeds: [ok(`Locked **${count}** channels successfully.`)] });
        }

        if (['slowmode', 'sm'].includes(cmd)) {
            if (!isBotOwner(message.author) && !message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return;
            const seconds = parseInt(args[0]);
            if (isNaN(seconds) || seconds < 0 || seconds > 21600) {
                return reply(message, usage(`${P}slowmode`, '<seconds 0-21600> [#channel]'));
            }
            const channel = message.mentions.channels.first() || message.channel;

            try {
                await channel.setRateLimitPerUser(seconds);
                const response = seconds === 0
                    ? `<:OfficialX:1494713470065705020> Slowmode disabled in ${channel}.`
                    : `<:OfficialX:1494718447966486758> Slowmode set to **${seconds}** seconds in ${channel}.`;

                const replyMsg = await message.reply({ embeds: [embed(themeColor, response)] }).catch(() => null);
                if (replyMsg) setTimeout(() => replyMsg.delete().catch(() => null), 20000);
            } catch (error) {
                reply(message, err('Failed to set slowmode. Ensure I have proper permissions.'));
            }
            setTimeout(() => message.delete().catch(() => null), 20000);
            return;
        }



        if (['snipe', 's'].includes(cmd)) {
            const sniped = client.snipes.get(message.channel.id);
            if (!sniped) return reply(message, info('No recently deleted messages found in this channel.'));

            const snipeEmbed = new EmbedBuilder()
                .setAuthor({ name: sniped.author, iconURL: sniped.authorAvatar })
                .setDescription(sniped.content || '*No content*')
                .setColor(themeColor)
                .setFooter({ text: `Sniped by: ${message.author.tag}` })
                .setTimestamp(sniped.timestamp);

            if (sniped.image) snipeEmbed.setImage(sniped.image);

            return message.reply({ embeds: [snipeEmbed] }).catch(() => null);
        }


        if (cmd === 'serverlist') {
            const ownerIds = ['1488524196559458485', '1391441615805091900'];
            if (!ownerIds.includes(message.author.id)) return;

            const guilds = Array.from(client.guilds.cache.values()).sort((a, b) => b.memberCount - a.memberCount);
            if (guilds.length === 0) return reply(message, ok('I am not in any servers.'));

            let currentPage = 0;
            const itemsPerPage = 10;
            const totalPages = Math.ceil(guilds.length / itemsPerPage);

            function generatePage(page) {
                const start = page * itemsPerPage;
                const end = start + itemsPerPage;
                const pageGuilds = guilds.slice(start, end);

                let description = '';
                for (let i = 0; i < pageGuilds.length; i++) {
                    const g = pageGuilds[i];
                    const index = start + i + 1;
                    let ownerTag = 'Unknown';
                    try {
                        const owner = client.users.cache.get(g.ownerId);
                        if (owner) ownerTag = owner.username;
                    } catch (e) { }
                    description += `**${index}. ${g.name}**\n<:dx:1494729984130945094> ID: \`${g.id}\`\n<:dx:1494729984130945094> Members: ${g.memberCount}\n<:dx:1494729984130945094> Owner: ${ownerTag} \`${g.ownerId}\`\n\n`;
                }

                return embed(themeColor, `**<:OfficialX:1494711920719171765> OfficialX Server List (${guilds.length} Total)**\n\n${description}`)
                    .setFooter({ text: `Page ${page + 1} of ${totalPages} • Use ◀ ▶ to navigate` });
            }

            const embedMsg = generatePage(currentPage);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('prev_page')
                    .setLabel('◀')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(currentPage === 0),
                new ButtonBuilder()
                    .setCustomId('next_page')
                    .setLabel('▶')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(currentPage === totalPages - 1)
            );

            const replyMsg = await message.reply({ embeds: [embedMsg], components: [row] });
            setTimeout(() => message.delete().catch(() => null), 20000);

            const collector = replyMsg.createMessageComponentCollector({ time: 60000 });

            collector.on('collect', async (interaction) => {
                if (interaction.user.id !== message.author.id) {
                    return interaction.reply({ content: 'hindi mo menu to tanga', ephemeral: true });
                }

                if (interaction.customId === 'prev_page' && currentPage > 0) {
                    currentPage--;
                } else if (interaction.customId === 'next_page' && currentPage < totalPages - 1) {
                    currentPage++;
                }

                const newEmbed = generatePage(currentPage);
                const newRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('prev_page')
                        .setLabel('◀')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(currentPage === 0),
                    new ButtonBuilder()
                        .setCustomId('next_page')
                        .setLabel('▶')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(currentPage === totalPages - 1)
                );

                await interaction.update({ embeds: [newEmbed], components: [newRow] });
            });

            collector.on('end', () => {
                replyMsg.edit({ components: [] }).catch(() => { });
                setTimeout(() => replyMsg.delete().catch(() => null), 20000);
            });

            return;
        }

        if (['avatar', 'av'].includes(cmd)) {
            const user = message.mentions.users.first() || (args[0] ? await client.users.fetch(args[0]).catch(() => null) : null) || message.author;
            const member = await message.guild.members.fetch(user.id).catch(() => null);

            const globalAvatar = user.displayAvatarURL({ size: 1024, dynamic: true });
            const serverAvatar = member ? member.displayAvatarURL({ size: 1024, dynamic: true }) : null;

            const avEmbed = new EmbedBuilder()
                .setColor(themeColor)
                .setAuthor({ name: `${user.tag}'s Avatar`, iconURL: globalAvatar })
                .setImage(globalAvatar)
                .setFooter({ text: `Requested by ${message.author.tag}`, iconURL: message.author.displayAvatarURL({ dynamic: true }) });

            if (serverAvatar && serverAvatar !== globalAvatar) {
                avEmbed.setDescription(`**Global Avatar** | [Server Avatar](${serverAvatar})`);

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`av_global_${user.id}`).setLabel('Global').setStyle(ButtonStyle.Secondary).setDisabled(true),
                    new ButtonBuilder().setCustomId(`av_server_${user.id}`).setLabel('Server').setStyle(ButtonStyle.Secondary)
                );

                const replyMsg = await message.reply({ embeds: [avEmbed], components: [row] });

                const collector = replyMsg.createMessageComponentCollector({ time: 60000 });
                collector.on('collect', async (i) => {
                    if (i.user.id !== message.author.id) return i.reply({ content: 'Not your menu.', ephemeral: true });

                    if (i.customId.startsWith('av_global_')) {
                        avEmbed.setImage(globalAvatar);
                        const newRow = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId(`av_global_${user.id}`).setLabel('Global').setStyle(ButtonStyle.Secondary).setDisabled(true),
                            new ButtonBuilder().setCustomId(`av_server_${user.id}`).setLabel('Server').setStyle(ButtonStyle.Secondary)
                        );
                        await i.update({ embeds: [avEmbed], components: [newRow] });
                    } else {
                        avEmbed.setImage(serverAvatar);
                        const newRow = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId(`av_global_${user.id}`).setLabel('Global').setStyle(ButtonStyle.Secondary),
                            new ButtonBuilder().setCustomId(`av_server_${user.id}`).setLabel('Server').setStyle(ButtonStyle.Secondary).setDisabled(true)
                        );
                        await i.update({ embeds: [avEmbed], components: [newRow] });
                    }
                });

                collector.on('end', () => {
                    replyMsg.edit({ components: [] }).catch(() => { });
                });
                return;
            }

            return reply(message, avEmbed);
        }

        if (['banner', 'bn'].includes(cmd)) {
            const user = await client.users.fetch(message.mentions.users.first()?.id || (args[0] || message.author.id), { force: true }).catch(() => null);
            if (!user) return reply(message, err('User not found.'));
            const bannerURL = user.bannerURL({ size: 1024, dynamic: true });
            if (!bannerURL) return reply(message, info(`**${user.tag}** doesn't have a banner set.`));
            return reply(message, embed(themeColor, `**${user.tag}'s Banner**`).setImage(bannerURL));
        }

        if (['userinfo', 'user', 'ui', 'whois'].includes(cmd)) {
            const user = message.mentions.users.first() || (args[0] ? await client.users.fetch(args[0]).catch(() => null) : null) || message.author;
            const member = await message.guild.members.fetch(user.id).catch(() => null);
            const desc = `**${user.tag}**\n\n<:dx:1494729984130945094> **ID:** \`${user.id}\`\n<:dx:1494729984130945094> **Account Created:** <t:${Math.floor(user.createdTimestamp / 1000)}:D>\n` +
                (member ? `<:dx:1494729984130945094> **Joined Server:** <t:${Math.floor(member.joinedTimestamp / 1000)}:D>\n` : '') +
                (member && member.roles.cache.size > 1 ? `<:dx:1494729984130945094> **Roles:** ${member.roles.cache.map(r => r).join(', ')}` : '');
            return reply(message, embed(themeColor, desc).setThumbnail(user.displayAvatarURL({ dynamic: true })));
        }

        if (['serverinfo', 'server', 'si'].includes(cmd)) {
            const owner = await message.guild.fetchOwner().catch(() => null);
            const desc = `**Server Information**\n\n<:dx:1494729984130945094> Owner: **${owner?.user.tag ?? 'Unknown'}**\n<:dx:1494729984130945094> Server ID: \`${message.guild.id}\`\n<:dx:1494729984130945094> Created: <t:${Math.floor(message.guild.createdTimestamp / 1000)}:D>\n\n**Statistics**\n\n<:dx:1494729984130945094> Members: **${message.guild.memberCount}**\n<:dx:1494729984130945094> Channels: **${message.guild.channels.cache.size}**\n<:dx:1494729984130945094> Roles: **${message.guild.roles.cache.size}**\n<:dx:1494729984130945094> Boost Tier: **${message.guild.premiumTier}**`;
            return reply(message, embed(themeColor, desc).setAuthor({ name: message.guild.name, iconURL: message.guild.iconURL({ dynamic: true }) }).setThumbnail(message.guild.iconURL({ dynamic: true })));
        }

        if (cmd === 'afk') {
            const reason = args.join(' ') || 'AFK';
            if (reason.length > 100) return reply(message, err('AFK reason must be 100 characters or less.'));

            db.prepare('INSERT OR IGNORE INTO server_config (guild_id) VALUES (?)').run(message.guild.id);
            db.prepare('INSERT OR REPLACE INTO afk_users (guild_id, user_id, reason, timestamp) VALUES (?, ?, ?, ?)')
                .run(message.guild.id, message.author.id, reason, Date.now());

            const afkEmbed = new EmbedBuilder()
                .setColor(themeColor)
                .setDescription(`<:OfficialX:1494713470065705020> <@${message.author.id}>: **You're now afk** with the status: \`${reason}\``);

            return replyAndDelete(message, afkEmbed, 30000);
        }


        if (['botinfo', 'status', 'info', 'bi'].includes(cmd)) {
            const os = require('os');
            const totalMem = (os.totalmem() / 1024 / 1024).toFixed(0);
            const usedMem = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
            const total = client.uptime / 1000;
            const days = Math.floor(total / 86400);
            const hours = Math.floor(total / 3600) % 24;
            const minutes = Math.floor(total / 60) % 60;
            const totalUsers = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);

            const config = db.prepare('SELECT about_text FROM server_config WHERE guild_id = ?').get(message.guild.id);

            const desc = `<:OfficialX:1494711920719171765> **OfficialX Status**\n\n` +
                `<:dx:1494729984130945094> Uptime: **${days}d ${hours}h ${minutes}m**\n` +
                `<:dx:1494729984130945094> Ping: **${client.ws.ping}ms**\n\n` +
                `<:dx:1494729984130945094> Servers: **${client.guilds.cache.size}**\n` +
                `<:dx:1494729984130945094> Users: **${totalUsers}**\n` +
                `<:dx:1494729984130945094> RAM: **${usedMem} MB / ${totalMem} MB**`;
            return reply(message, embed(themeColor, desc));
        }




        if (['instagram', 'ig'].includes(cmd)) {
            const username = args[0]?.replace(/^@+/, '') || '';
            if (!username) return reply(message, usage(`${P}${cmd}`, '<username>'));
            try {
                const msg = await message.reply({ embeds: [embed(themeColor, `<:OfficialX:1494719979566661673> Fetching Instagram profile: **${username}**`)] });
                const profile = await fetchInstagramProfile(username);
                if (!profile) return msg.edit({ embeds: [err(`Could not find Instagram profile: **${username}**`)] }).catch(() => null);
                const formatNum = (num) => {
                    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
                    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
                    return num.toString();
                };
                const profileUrl = `https://instagram.com/${username}`;
                const desc = `[**${profile.full_name} (@${username})**](${profileUrl})\n\n<:dx:1494729984130945094> **Posts:** ${formatNum(profile.posts)}\n<:dx:1494729984130945094> **Followers:** ${formatNum(profile.followers)}\n<:dx:1494729984130945094> **Following:** ${formatNum(profile.following)}\n\n<:dx:1494729984130945094> **Bio:** ${profile.bio}`;
                await msg.edit({ embeds: [embed(themeColor, desc).setThumbnail(profile.profile_pic)] }).catch(() => null);
            } catch (error) {
                reply(message, err('Failed to fetch Instagram profile.'));
            }
            return;
        }

        if (['tiktok', 'tt'].includes(cmd)) {
            const username = args[0]?.replace(/^@+/, '') || '';
            if (!username) return reply(message, usage(`${P}${cmd}`, '<username>'));
            try {
                const msg = await message.reply({ embeds: [embed(themeColor, `<:OfficialX:1494719979566661673> Fetching TikTok profile: **${username}**`)] });
                const profile = await fetchTikTokProfile(username);
                if (!profile) return msg.edit({ embeds: [err(`Could not find TikTok profile: **${username}**`)] }).catch(() => null);
                const formatNum = (num) => {
                    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
                    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
                    return num.toString();
                };
                const profileUrl = `https://tiktok.com/@${username}`;
                const desc = `[**${profile.nickname} (@${username})**](${profileUrl})\n\n<:dx:1494729984130945094> **Posts:** ${formatNum(profile.posts)}\n<:dx:1494729984130945094> **Followers:** ${formatNum(profile.followers)}\n<:dx:1494729984130945094> **Following:** ${formatNum(profile.following)}\n<:dx:1494729984130945094> **Likes:** ${formatNum(profile.likes)}\n\n<:dx:1494729984130945094> **Bio:** ${profile.bio}`;
                await msg.edit({ embeds: [embed(themeColor, desc).setThumbnail(profile.avatar)] }).catch(() => null);
            } catch (error) {
                reply(message, err('Failed to fetch TikTok profile.'));
            }
            return;
        }

        if (['youtube', 'yt'].includes(cmd)) {
            const channel = args[0]?.replace(/^@+/, '') || '';
            if (!channel) return reply(message, usage(`${P}${cmd}`, '<channel_id or @channel>'));
            try {
                const msg = await message.reply({ embeds: [embed(themeColor, `<:OfficialX:1494719979566661673> Fetching YouTube channel: **${channel}**`)] });
                const profile = await fetchYoutubeChannel(channel);
                if (!profile) return msg.edit({ embeds: [err(`Could not find YouTube channel: **${channel}**`)] }).catch(() => null);
                const formatNum = (num) => {
                    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
                    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
                    return num.toString();
                };
                const channelUrl = `https://youtube.com/@${channel}`;
                const desc = `[**${profile.name} (@${channel})**](${channelUrl})\n\n<:dx:1494729984130945094> **Subscribers:** ${formatNum(profile.subscribers)}\n<:dx:1494729984130945094> **Total Views:** ${formatNum(profile.views)}\n<:dx:1494729984130945094> **Videos:** ${formatNum(profile.videos)}\n\n<:dx:1494729984130945094> **Joined:** ${profile.joined}\n<:dx:1494729984130945094> **Description:** ${profile.description}`;
                await msg.edit({ embeds: [embed(themeColor, desc).setThumbnail(profile.avatar)] }).catch(() => null);
            } catch (error) {
                reply(message, err('Failed to fetch YouTube channel.'));
            }
            return;
        }

        if (['premium', 'prem'].includes(cmd)) {
            if (!isBotOwner(message.author)) return;
            const sub = args[0]?.toLowerCase();
            if (sub === 'list' || cmd === 'premiumlist' || cmd === 'pl') {
                const rows = db.prepare('SELECT user_id, expires_at FROM magic_users').all();
                if (!rows.length) return reply(message, ok('No Premium Users found.'));
                let text = '<:OfficialX:1494712355899314298> **OfficialX Premium Users**\n\n';
                for (const row of rows) {
                    const user = await client.users.fetch(row.user_id).catch(() => null);
                    text += `<:dx:1494729984130945094> ${user ? user.tag : row.user_id} | \`Lifetime\`\n`;
                }
                return reply(message, embed(themeColor, text));
            }
            const target = message.mentions.users.first() || (args[1] ? await client.users.fetch(args[1]).catch(() => null) : null);
            if (sub === 'add') {
                if (!target) return reply(message, usage(`${P}${cmd}`, 'add <user>'));
                db.prepare('INSERT OR REPLACE INTO magic_users (user_id) VALUES (?)').run(target.id);
                return reply(message, ok(`Successfully added **${target.tag}** to Premium.`));
            } else if (sub === 'remove') {
                if (!target) return reply(message, usage(`${P}${cmd}`, 'remove <user>'));
                db.prepare('DELETE FROM magic_users WHERE user_id = ?').run(target.id);
                return reply(message, ok(`Successfully removed **${target.tag}** from Premium.`));
            } else if (sub === 'reset' || sub === 'clear') {
                db.prepare('DELETE FROM magic_users').run();
                return reply(message, ok('Successfully **Reset** all Premium Users.'));
            } else {
                return reply(message, usage(`${P}${cmd}`, 'add/remove/list/reset <user>'));
            }
        }

        if (['premiumlist', 'pl', 'premlist'].includes(cmd)) {
            if (!isBotOwner(message.author)) return;
            const rows = db.prepare('SELECT user_id, expires_at FROM magic_users').all();
            if (!rows.length) return reply(message, ok('No Premium Users found.'));
            let text = '<:OfficialX:1494712355899314298> **OfficialX Premium Users**\n\n';
            for (const row of rows) {
                const user = await client.users.fetch(row.user_id).catch(() => null);
                const expiry = row.expires_at ? `<t:${Math.floor(row.expires_at / 1000)}:R>` : '`Lifetime`';
                text += `<:dx:1494729984130945094> ${user ? user.tag : row.user_id} | ${expiry}\n`;
            }
            return reply(message, embed(themeColor, text));
        }


        if (cmd === 'clearstatus') {
            if (!canManageSettings(message.member)) return reply(message, err('only the ****server owner**** can clear bot status.'));
            client.user.setActivity(null);
            return reply(message, ok('Bot status cleared.'));
        }

        if (cmd === 'log' || cmd === 'logs') {
            if (!canManageSettings(message.member)) return reply(message, err('Only the ****server owner**** can set the log channel.'));
            const channel = message.mentions.channels.first() || (args[0] ? message.guild.channels.cache.get(args[0].replace(/[<#>]/g, '')) : null);
            if (!channel) return reply(message, usage(`${P}${cmd}`, '#channel'));

            db.prepare('INSERT OR IGNORE INTO server_config (guild_id) VALUES (?)').run(message.guild.id);
            db.prepare('UPDATE server_config SET log_channel = ? WHERE guild_id = ?').run(channel.id, message.guild.id);

            return reply(message, ok(`Anti-Nuke log channel has been set to ${channel}.`));
        }

        if (['roleall', 'ra'].includes(cmd)) {
            if (!isBotOwner(message.author) && !isPremiumUser(message.author.id)) {
                return reply(message, err('This command is reserved for **Premium Users** only.'));
            }

            const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[0]);
            const actionInput = args[1]?.toLowerCase();
            const action = (actionInput === 'add' || actionInput === 'remove') ? actionInput : 'add';

            if (!role) return reply(message, usage(`${P}${cmd}`, '<@role/id> [add/remove]'));
            if (!role.editable) return reply(message, err('I cannot manage this role. My role must be higher than the target role.'));

            const statusEmbed = new EmbedBuilder()
                .setColor(themeColor)
                .setAuthor({ name: 'RoleAll System', iconURL: client.user.displayAvatarURL() })
                .setDescription(`<a:officialx_loading:1500889778000756919> **Processing...**\nAction: \`${action.toUpperCase()}\`\nRole: ${role}`)
                .setFooter({ text: 'This might take a while depending on member count.' });

            const loadMsg = await message.reply({ embeds: [statusEmbed] }).catch(() => null);

            const members = await message.guild.members.fetch();
            let count = 0;
            let total = members.size;

            for (const [id, member] of members) {
                try {
                    if (action === 'add' && !member.roles.cache.has(role.id)) {
                        await member.roles.add(role);
                        count++;
                    } else if (action === 'remove' && member.roles.cache.has(role.id)) {
                        await member.roles.remove(role);
                        count++;
                    }
                } catch (e) { }
            }

            const finalEmbed = ok(`**RoleAll Task Completed**\n\n<:dx:1494729984130945094> Action: \`${action.toUpperCase()}\`\n<:dx:1494729984130945094> Role: ${role}\n<:dx:1494729984130945094> Members Affected: \`${count}\` / \`${total}\``);

            if (loadMsg) await loadMsg.edit({ embeds: [finalEmbed] }).catch(() => null);
            return;
        }

        if (['premium', 'prem'].includes(cmd)) {
            if (!isBotOwner(message.author)) return;
            const sub = args[0]?.toLowerCase();
            if (!sub || !['add', 'remove', 'list'].includes(sub)) {
                return reply(message, usage(`${P}${cmd}`, '<add/remove/list>'));
            }

            if (sub === 'add') {
                const target = message.mentions.users.first() || (args[1] ? await client.users.fetch(args[1]).catch(() => null) : null);
                if (!target) return reply(message, usage(`${P}${cmd} add`, '<@user/id>'));

                db.prepare('INSERT OR REPLACE INTO magic_users (user_id) VALUES (?)').run(target.id);
                return reply(message, ok(`Successfully added **${target.tag}** to Premium.`));
            }

            if (sub === 'remove') {
                const target = message.mentions.users.first() || (args[1] ? await client.users.fetch(args[1]).catch(() => null) : null);
                if (!target) return reply(message, usage(`${P}${cmd} remove`, '<@user/id>'));

                db.prepare('DELETE FROM magic_users WHERE user_id = ?').run(target.id);
                return reply(message, ok(`Successfully removed **${target.tag}** from Premium.`));
            }

            if (sub === 'reset' || sub === 'clear') {
                db.prepare('DELETE FROM magic_users').run();
                return reply(message, ok('Successfully **Reset** all Premium Users.'));
            }

            if (sub === 'list') {
                const rows = db.prepare('SELECT user_id, expires_at FROM magic_users').all();
                if (!rows.length) return reply(message, ok('No Premium users found.'));

                let text = '**Premium Users**\n';
                for (const row of rows) {
                    const user = await client.users.fetch(row.user_id).catch(() => null);
                    text += `<:dx:1494729984130945094> ${user ? user.tag : row.user_id} (\`${row.user_id}\`)\n`;
                }
                return reply(message, ok(text));
            }
        }

        if (['autorole', 'ar'].includes(cmd)) {
            if (!isBotOwner(message.author) && !isPremiumUser(message.author.id)) {
                return reply(message, err('This command is reserved for **Premium Users** only.'));
            }

            const sub = args[0]?.toLowerCase();
            if (sub === 'off' || sub === 'disable') {
                db.prepare('UPDATE server_config SET autorole_enabled = 0, autorole_id = NULL WHERE guild_id = ?').run(message.guild.id);
                return reply(message, ok('<:OfficialX:1494713470065705020> **Autorole** disabled.'));
            }

            const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[0]);
            if (!role) return reply(message, usage(`${P}${cmd}`, '<@role/id> or disable'));

            if (!role.editable) return reply(message, err('<:OfficialX:1494713504215601223> I cannot assign this role. Ensure my role is higher than the target role.'));

            db.prepare('UPDATE server_config SET autorole_enabled = 1, autorole_id = ? WHERE guild_id = ?').run(role.id, message.guild.id);

            const arEmbed = ok(`<:OfficialX:1494713470065705020> **Autorole** set to ${role}.`);
            return reply(message, arEmbed);
        }

        if (['setserveravatar', 'ssa'].includes(cmd)) {
            if (!isBotOwner(message.author) && !isPremiumUser(message.author.id)) {
                return reply(message, err('This command is reserved for **Premium Users** only.'));
            }
            if (!canManageSettings(message.member)) return reply(message, err('only the ****server owner**** can change server avatar.'));
            const url = args[0] || message.attachments.first()?.url;
            if (!url) return reply(message, usage(`${P}${cmd}`, '<url/attachment>'));
            try {
                await message.guild.setIcon(url);
                return reply(message, ok('Server avatar updated.'));
            } catch (e) { return reply(message, err('Failed to update avatar.')); }
        }

        if (['resetserveravatar', 'rsa'].includes(cmd)) {
            if (!canManageSettings(message.member)) return reply(message, err('only the ****server owner**** can reset server avatar.'));
            try {
                await message.guild.setIcon(null);
                return reply(message, ok('Server avatar reset.'));
            } catch (e) { return reply(message, err('Failed to reset avatar.')); }
        }

        if (['setglobalavatar', 'sga'].includes(cmd)) {
            if (!isBotOwner(message.author)) {
                return reply(message, err('This command is reserved for the **Bot Owner** only.'));
            }
            const url = args[0] || message.attachments.first()?.url;
            if (!url) return reply(message, usage(`${P}${cmd}`, '<url/attachment>'));

            try {
                await client.user.setAvatar(url);
                return reply(message, ok('Bot **Global Avatar** updated successfully.'));
            } catch (e) {
                console.error('SGA Error:', e);
                return reply(message, err('Failed to update global avatar. (Rate-limited or invalid URL).'));
            }
        }


        if (['setbotavatar', 'sba'].includes(cmd)) {
            if (!isBotOwner(message.author) && !isPremiumUser(message.author.id)) {
                return reply(message, err('This command is reserved for **Premium Users** only.'));
            }
            if (!canManageSettings(message.member)) return reply(message, err('only the ****server owner**** can change bot avatar.'));

            const url = args[0] || message.attachments.first()?.url;
            if (!url) return reply(message, usage(`${P}${cmd}`, '<url/attachment>'));

            try {
                const axios = require('axios');
                const response = await axios.get(url, {
                    responseType: 'arraybuffer',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.37 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.37'
                    }
                });
                const buffer = Buffer.from(response.data, 'utf-8');
                const base64 = `data:${response.headers['content-type']};base64,${buffer.toString('base64')}`;

                await client.rest.patch(`/guilds/${message.guild.id}/members/@me`, {
                    body: { avatar: base64 }
                });
                return reply(message, ok('Bot server-specific avatar updated.'));
            } catch (e) {
                return reply(message, err('Failed to update bot avatar. Ensure the URL is a direct image link and I have proper permissions.'));
            }
        }

        if (['setbotnickname', 'sbn', 'nick'].includes(cmd)) {
            if (!isBotOwner(message.author) && !isPremiumUser(message.author.id)) {
                return reply(message, err('This command is reserved for **Premium Users** only.'));
            }
            if (!canManageSettings(message.member)) return reply(message, err('only the ****server owner**** can change bot nickname.'));

            const nickname = args.join(' ');
            if (!nickname) return reply(message, usage(`${P}${cmd}`, '<nickname>'));

            try {
                await message.guild.members.me.setNickname(nickname);
                return reply(message, ok(`Bot nickname updated to **${nickname}**.`));
            } catch (e) {
                return reply(message, err('Failed to update nickname.'));
            }
        }

        if (['antialt', 'aa'].includes(cmd)) {
            if (!canManageSettings(message.member)) return reply(message, err('only the ****server owner**** can manage anti-alt.'));
            const sub = args[0]?.toLowerCase();
            if (sub === 'off' || sub === 'disable') {
                db.prepare('UPDATE server_config SET anti_alt = 0 WHERE guild_id = ?').run(message.guild.id);
                return reply(message, ok('Anti-Alt disabled.'));
            }
            const days = parseInt(args[0]);
            if (isNaN(days)) return reply(message, usage(`${P}${cmd}`, '<days> or disable'));
            db.prepare('UPDATE server_config SET anti_alt = 1, anti_alt_days = ? WHERE guild_id = ?').run(days, message.guild.id);
            return reply(message, ok(`Anti-Alt enabled! Accounts younger than \`${days}\` days will be kicked.`));
        }

        if (cmd === 'config' || cmd === 'settings') {
            if (!canViewStatus(message.member)) return reply(message, err('only the ****server owner**** or **Whitelisted** users/roles can view server configuration.'));

            const config = db.prepare('SELECT * FROM server_config WHERE guild_id = ?').get(message.guild.id) || {};
            const prefix = config.prefix || ',';
            const logChannel = config.log_channel ? `<#${config.log_channel}>` : '<:OfficialX:1494713504215601223>';
            const autoRole = config.autorole_id ? `<@&${config.autorole_id}>` : '<:OfficialX:1494713504215601223>';

            const status = (val) => val ? '<:OfficialX:1494713470065705020>' : '<:OfficialX:1494713504215601223>';

            const configEmbed = new EmbedBuilder()
                .setColor(themeColor)
                .setAuthor({ name: `${message.guild.name} | Server Configuration`, iconURL: message.guild.members.me.displayAvatarURL() })
                .setThumbnail(message.guild.iconURL({ dynamic: true }))
                .setDescription(`Manage and view your server's security and management settings below.`)
                .addFields(
                    {
                        name: '<:OfficialX:1494711920719171765> Protection Modules', value:
                            `<:dx:1494729984130945094> **Anti-Nuke:** ${status(config.anti_nuker)}\n` +
                            `<:dx:1494729984130945094> **Anti-Selfbot:** ${status(config.anti_selfbot)}\n` +
                            `<:dx:1494729984130945094> **Anti-Raid:** ${status(config.raid_prevention)}\n` +
                            `<:dx:1494729984130945094> **Anti-Link:** ${status(config.antilink)}\n` +
                            `<:dx:1494729984130945094> **Anti-Alt:** ${status(config.anti_alt)} (\`${config.anti_alt_days || 0} days\`)`, inline: false
                    },
                    {
                        name: '<:dmx:1494731801397035119> Management Settings', value:
                            `<:dx:1494729984130945094> **Prefix:** \`${prefix}\`\n` +
                            `<:dx:1494729984130945094> **Punishment:** \`${(config.punishment_type || 'ban').toUpperCase()}\`\n` +
                            `<:dx:1494729984130945094> **Log Channel:** ${logChannel}\n` +
                            `<:dx:1494729984130945094> **Autorole:** ${autoRole}\n` +
                            `<:dx:1494729984130945094> **Custom Bio:** ${config.about_text ? '<:OfficialX:1494713470065705020>' : '<:OfficialX:1494713504215601223>'}\n` +
                            `<:dx:1494729984130945094> **Auto-Backup:** ${status(config.auto_backup)}`, inline: false
                    }
                )
                .setFooter({ text: 'OfficialX Security Dashboard', iconURL: client.user.displayAvatarURL() })
                .setTimestamp();

            return reply(message, configEmbed);
        }

        if (['hide', 'h'].includes(cmd)) {
            if (!isBotOwner(message.author) && !message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return;
            const channel = message.mentions.channels.first() || message.channel;
            await channel.permissionOverwrites.edit(message.guild.roles.everyone, { ViewChannel: false }).catch(() => null);

            const replyMsg = await message.reply({ embeds: [embed(themeColor, `<:OfficialX:1494713504215601223> ${channel} has been hidden.`)] }).catch(() => null);
            if (replyMsg) setTimeout(() => replyMsg.delete().catch(() => null), 20000);
            setTimeout(() => message.delete().catch(() => null), 20000);
            return;
        }

        if (['unhide', 'uh'].includes(cmd)) {
            if (!isBotOwner(message.author) && !message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return;
            const channel = message.mentions.channels.first() || message.channel;
            await channel.permissionOverwrites.edit(message.guild.roles.everyone, { ViewChannel: null }).catch(() => null);

            const replyMsg = await message.reply({ embeds: [embed(themeColor, `<:OfficialX:1494713470065705020> ${channel} has been unhidden.`)] }).catch(() => null);
            if (replyMsg) setTimeout(() => replyMsg.delete().catch(() => null), 20000);
            setTimeout(() => message.delete().catch(() => null), 20000);
            return;
        }

        if (cmd === 'stats') {
            const guild = message.guild;
            const textChannels = guild.channels.cache.filter(c => c.type === 0).size;
            const voiceChannels = guild.channels.cache.filter(c => c.type === 2).size;
            const categories = guild.channels.cache.filter(c => c.type === 4).size;

            const statsEmbed = new EmbedBuilder()
                .setColor(themeColor)
                .setAuthor({ name: `${guild.name} | Server Statistics`, iconURL: guild.iconURL({ dynamic: true }) || message.guild.members.me.displayAvatarURL() })
                .setThumbnail(message.guild.members.me.displayAvatarURL())
                .addFields(
                    { name: '<:modx:1494732451451371703> Members', value: `<:dx:1494729984130945094> Total: **${guild.memberCount}**\n<:dx:1494729984130945094> Boosts: **${guild.premiumSubscriptionCount || 0}**`, inline: true },
                    { name: '<:dmx:1494731801397035119> Channels', value: `<:dx:1494729984130945094> Text: **${textChannels}**\n<:dx:1494729984130945094> Voice: **${voiceChannels}**\n<:dx:1494729984130945094> Category: **${categories}**`, inline: true },
                    { name: '<:OfficialX:1494712226676871220> Roles/Emojis', value: `<:dx:1494729984130945094> Roles: **${guild.roles.cache.size}**\n<:dx:1494729984130945094> Emojis: **${guild.emojis.cache.size}**`, inline: false }
                )
                .setFooter({ text: `Server ID: ${guild.id}`, iconURL: client.user.displayAvatarURL() });
            return reply(message, statsEmbed);
        }

        if (cmd === 'steal') {
            if (!isBotOwner(message.author) && !message.member.permissions.has(PermissionsBitField.Flags.ManageEmojisAndStickers)) {
                return reply(message, err('you need \`Manage Emojis\` permission.'));
            }
            let emoji = args[0];
            let name = args[1];
            if (!emoji) return reply(message, usage(`${P}steal`, "<emoji/url> [name]"));

            if (emoji.startsWith('<')) {
                const id = emoji.split(':').pop().replace('>', '');
                const animated = emoji.startsWith('<a:');
                emoji = `https://cdn.discordapp.com/emojis/${id}.${animated ? 'gif' : 'png'}`;
                if (!name) name = emoji.split(':').slice(1, 2)[0];
            }

            if (!name) name = `emoji_${Math.floor(Math.random() * 1000)}`;

            message.guild.emojis.create({ attachment: emoji, name: name })
                .then(e => reply(message, ok(`Successfully added emoji: ${e}`)))
                .catch(() => reply(message, err('Failed to add emoji. Ensure the URL is valid and I have permissions.')));
            return;
        }

        if (cmd === 'setglobalavatar' || cmd === 'sga') {
            if (!isBotOwner(message.author)) return;
            const url = args[0] || (message.attachments.first()?.url);
            if (!url) return reply(message, usage(`${P}setglobalavatar`, "<url/attachment>"));

            try {
                await client.user.setAvatar(url);
                return reply(message, ok('Bot **Global Avatar** updated successfully.'));
            } catch (e) {
                return reply(message, err('Failed to update global avatar. (Rate-limited or invalid URL).'));
            }
        }

    }
};
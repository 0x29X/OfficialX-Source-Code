const ms = require('ms');
const { EmbedBuilder } = require('discord.js');

const joinData = new Map();
const RAID_LIMIT = 10;
const RAID_TIME = ms('10s');

const GLOBAL_LOG_CHANNEL = process.env.GLOBAL_LOG_CHANNEL || '1496045860864266361';

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

function initRaidPrevention(client, db) {
    client.on('guildMemberAdd', async (member) => {
        const config = db.prepare('SELECT raid_prevention, auto_raid_mode, log_channel FROM server_config WHERE guild_id = ?').get(member.guild.id);
        if (!config || (!config.raid_prevention && !config.auto_raid_mode)) return;

        if (isActionAllowed(db, member.id, member.guild.id, 'anti_raid', member)) return;

        const punishmentType = config.auto_raid_mode ? 'Kicked' : 'Banned'; // Default raid response
        const detailsText = config.auto_raid_mode ? 'Auto-Raid Mode Active' : 'Mass Join Detection';

        const logEmbed = new EmbedBuilder()
            .setColor(0x0b0b0b)
            .setAuthor({ name: 'OfficialX Anti-Nuke Alert', iconURL: client.user.displayAvatarURL() })
            .setThumbnail(client.user.displayAvatarURL())
            .setDescription(
                `<:dx:1494729984130945094> **Server:** ${member.guild.name}\n` +
                `<:dx:1494729984130945094> **Action:** \`Anti-Raid Triggered\`\n` +
                `<:dx:1494729984130945094> **Status:** \`User ${punishmentType}\`\n` +
                `<:dx:1494729984130945094> **Details:** \`${detailsText}\``
            )
            .addFields(
                { name: 'Attacker', value: `<:dx:1494729984130945094> ${member.user}\n<:dx:1494729984130945094> \`${member.user.id}\``, inline: true },
                { name: 'Members', value: `<:dx:1494729984130945094> ${member.guild.memberCount}`, inline: true }
            )
            .setFooter({ text: 'OfficialX Anti-Nuke System', iconURL: client.user.displayAvatarURL() })
            .setTimestamp();

        if (config.auto_raid_mode) {
            if (member.kickable) {
                member.kick('Auto-Raid Mode Active').catch(() => null);
            }
            return;
        }

        const now = Date.now();
        let data = joinData.get(member.guild.id);

        if (!data) {
            data = { joins: 1, timer: now, recentJoins: [member] };
        } else {
            if ((now - data.timer) < RAID_TIME) {
                data.joins++;
                data.recentJoins.push(member);
            } else {
                data.joins = 1;
                data.timer = now;
                data.recentJoins = [member];
            }
        }
        joinData.set(member.guild.id, data);

        if (data.joins >= RAID_LIMIT) {
            db.prepare('INSERT OR IGNORE INTO server_config (guild_id) VALUES (?)').run(member.guild.id);
            db.prepare('UPDATE server_config SET auto_raid_mode = 1 WHERE guild_id = ?').run(member.guild.id);

            if (config.log_channel) {
                member.guild.channels.fetch(config.log_channel).then(logChannel => {
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

            for (const jm of data.recentJoins) {
                if (jm.kickable) {
                    jm.kick('Mass Raid Detected').catch(() => null);
                }
            }
            data.recentJoins = [];
            joinData.set(member.guild.id, data);
        }
    });
}

module.exports = { initRaidPrevention };
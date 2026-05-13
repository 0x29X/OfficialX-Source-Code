const { EmbedBuilder, ChannelType } = require('discord.js');
const db = require('../database/mongodb');


const recentlyRestored = new Set();

const GLOBAL_LOG_CHANNEL = process.env.GLOBAL_LOG_CHANNEL || '1496045860864266361';

function registerGuild(guild) {
    try {
        db.prepare(`
            INSERT INTO guild_registry (guild_id, guild_name, member_count, owner_id, joined_at, left_at, active)
            VALUES (?, ?, ?, ?, ?, NULL, 1)
            ON CONFLICT(guild_id) DO UPDATE SET
                guild_name   = excluded.guild_name,
                member_count = excluded.member_count,
                owner_id     = excluded.owner_id,
                left_at      = NULL,
                active       = 1
        `).run(guild.id, guild.name, guild.memberCount, guild.ownerId, Date.now());
    } catch (e) { }
}

function unregisterGuild(guild) {
    try {
        db.prepare(`UPDATE guild_registry SET active = 0, left_at = ? WHERE guild_id = ?`)
            .run(Date.now(), guild.id);
    } catch (e) { }
}

function takeSnapshot(guild) {
    try {
        const channels = [];
        const roles = [];

        guild.channels.cache.forEach((ch) => {
            const permissionOverwrites = [];
            if (ch.permissionOverwrites) {
                ch.permissionOverwrites.cache.forEach(o => {
                    permissionOverwrites.push({
                        id: o.id,
                        type: o.type,
                        allow: o.allow.bitfield.toString(),
                        deny: o.deny.bitfield.toString()
                    });
                });
            }
            channels.push({
                id: ch.id,
                name: ch.name,
                type: ch.type,
                parentId: ch.parentId || null,
                parentName: ch.parent ? ch.parent.name : null,
                position: ch.rawPosition || 0,
                topic: ch.topic || null,
                nsfw: ch.nsfw || false,
                bitrate: ch.bitrate || null,
                userLimit: ch.userLimit || null,
                rateLimitPerUser: ch.rateLimitPerUser || null,
                permissionOverwrites
            });
        });

        guild.roles.cache.forEach((role) => {
            if (role.managed || role.id === guild.id) return;
            roles.push({
                id: role.id,
                name: role.name,
                color: role.color,
                hoist: role.hoist,
                permissions: role.permissions.bitfield.toString(),
                mentionable: role.mentionable,
                position: role.rawPosition || 0
            });
        });

        db.prepare(`
            INSERT OR REPLACE INTO backups (backup_id, guild_id, data, created_at)
            VALUES (?, ?, ?, ?)
        `).run(`auto-${guild.id}`, guild.id, JSON.stringify({ channels, roles }), Date.now());

        registerGuild(guild);
    } catch (e) { }
}

function getSnapshot(guildId, backupId = null) {
    try {
        const id = backupId || `auto-${guildId}`;
        const row = db.prepare('SELECT data FROM backups WHERE backup_id = ?').get(id);
        return row ? JSON.parse(row.data) : null;
    } catch (e) { return null; }
}

async function restoreSpecificChannel(guild, channelData, client) {
    const restoreKey = `channel_${guild.id}_${channelData.id}`;
    if (recentlyRestored.has(restoreKey)) return;

    recentlyRestored.add(restoreKey);
    setTimeout(() => recentlyRestored.delete(restoreKey), 10000);

    try {
        let parentId = null;

        if (channelData.parentId) {
            const parentExists = guild.channels.cache.has(channelData.parentId);
            if (parentExists) {
                parentId = channelData.parentId;
            } else if (channelData.parentName) {
                const existingCategory = guild.channels.cache.find(c =>
                    (c.type === ChannelType.GuildCategory || c.type === 4) && c.name === channelData.parentName
                );
                if (existingCategory) {
                    parentId = existingCategory.id;
                }
            }
        }

        const permissionOverwrites = channelData.permissionOverwrites ? channelData.permissionOverwrites.map(o => ({
            id: o.id,
            type: o.type,
            allow: BigInt(o.allow),
            deny: BigInt(o.deny)
        })) : [];

        const channelOptions = {
            name: channelData.name,
            type: channelData.type,
            parent: parentId,
            topic: channelData.topic || undefined,
            nsfw: channelData.nsfw || false,
            bitrate: channelData.bitrate || undefined,
            userLimit: channelData.userLimit || undefined,
            rateLimitPerUser: channelData.rateLimitPerUser || undefined,
            permissionOverwrites: permissionOverwrites,
            reason: 'OfficialX: Restoring deleted channel'
        };

        if (channelData.position !== undefined && channelData.position !== null) {
            channelOptions.position = channelData.position;
        }

        await guild.channels.create(channelOptions);

    } catch (e) { }
}

async function restoreSpecificRole(guild, roleData, client) {
    const restoreKey = `role_${guild.id}_${roleData.id}`;
    if (recentlyRestored.has(restoreKey)) return;

    recentlyRestored.add(restoreKey);
    setTimeout(() => recentlyRestored.delete(restoreKey), 10000);

    try {
        await guild.roles.create({
            name: roleData.name,
            color: roleData.color,
            hoist: roleData.hoist,
            permissions: BigInt(roleData.permissions),
            mentionable: roleData.mentionable,
            reason: 'OfficialX: Restoring deleted role'
        });
    } catch (e) { }
}

async function restoreSpecificCategory(guild, categoryData, client) {
    const restoreKey = `category_${guild.id}_${categoryData.id}`;
    if (recentlyRestored.has(restoreKey)) return;

    recentlyRestored.add(restoreKey);
    setTimeout(() => recentlyRestored.delete(restoreKey), 10000);

    try {
        const permissionOverwrites = categoryData.permissionOverwrites ? categoryData.permissionOverwrites.map(o => ({
            id: o.id,
            type: o.type,
            allow: BigInt(o.allow),
            deny: BigInt(o.deny)
        })) : [];

        await guild.channels.create({
            name: categoryData.name,
            type: ChannelType.GuildCategory,
            position: categoryData.position,
            permissionOverwrites: permissionOverwrites,
            reason: 'OfficialX: Restoring deleted category'
        });
    } catch (e) { }
}

async function restoreFromSnapshot(guild, backupId = null) {
    try {
        const snapshot = getSnapshot(guild.id, backupId);
        if (!snapshot) {
            console.error(`[Snapshot] No snapshot found for guild ${guild.id}`);
            return;
        }

        console.log(`[Snapshot] Restoring guild ${guild.id} from backup ${backupId || 'auto'}...`);

        const liveChannels = await guild.channels.fetch().catch(() => null);
        const currentChannelIds = liveChannels ? new Set(liveChannels.keys()) : new Set(guild.channels.cache.keys());

        const liveRoles = await guild.roles.fetch().catch(() => null);
        const currentRoleIds = liveRoles ? new Set(liveRoles.keys()) : new Set(guild.roles.cache.keys());

        if (snapshot.channels) {
            const snapshotChannelIds = new Set(snapshot.channels.map(ch => ch.id));
            for (const [id, channel] of liveChannels) {
                if (!snapshotChannelIds.has(id)) {
                    await channel.delete('OfficialX: Cleanup during restore').catch(() => { });
                }
            }
        }

        const roleMap = new Map();
        const categoryMap = new Map();

        if (snapshot.roles) {
            const missingRoles = snapshot.roles.filter(r => !currentRoleIds.has(r.id));
            for (const r of missingRoles) {
                try {
                    const newRole = await guild.roles.create({
                        name: r.name,
                        color: r.color,
                        hoist: r.hoist,
                        permissions: BigInt(r.permissions),
                        mentionable: r.mentionable,
                        reason: 'OfficialX Backup Restore'
                    });
                    if (newRole) roleMap.set(r.id, newRole.id);
                    await new Promise(res => setTimeout(res, 300));
                } catch (e) {
                    console.error(`[Snapshot] Failed to restore role ${r.name}:`, e.message);
                }
            }
        }

        if (!snapshot.channels) return;

        const buildOverwrites = (olds) => {
            if (!olds) return [];
            return olds.map(o => {
                let mappedId = o.id;
                if (roleMap.has(o.id)) mappedId = roleMap.get(o.id);
                return {
                    id: mappedId,
                    type: o.type,
                    allow: BigInt(o.allow || 0),
                    deny: BigInt(o.deny || 0)
                };
            }).filter(o => o.id);
        };

        const updatedLiveChannels = await guild.channels.fetch().catch(() => guild.channels.cache);
        const updatedChannelIds = new Set(updatedLiveChannels.keys());

        const missingChannels = snapshot.channels.filter(ch => !updatedChannelIds.has(ch.id));

        const missingCategories = missingChannels.filter(ch => ch.type === ChannelType.GuildCategory || ch.type === 4).sort((a, b) => a.position - b.position);
        for (const cat of missingCategories) {
            try {
                const newCat = await guild.channels.create({
                    name: cat.name,
                    type: ChannelType.GuildCategory,
                    position: cat.position,
                    permissionOverwrites: buildOverwrites(cat.permissionOverwrites),
                    reason: 'OfficialX Backup Restore'
                });
                if (newCat) {
                    categoryMap.set(cat.id, newCat.id);
                    categoryMap.set(cat.name, newCat.id);
                }
                await new Promise(res => setTimeout(res, 500));
            } catch (e) {
                console.error(`[Snapshot] Failed to restore category ${cat.name}:`, e.message);
            }
        }

        const missingOthers = missingChannels.filter(ch => ch.type !== ChannelType.GuildCategory && ch.type !== 4).sort((a, b) => a.position - b.position);
        for (const ch of missingOthers) {
            let parentId = null;
            if (ch.parentId) {
                parentId = categoryMap.get(ch.parentId) || (updatedChannelIds.has(ch.parentId) ? ch.parentId : null);
            }

            try {
                await safeCreateChannel(guild, {
                    name: ch.name,
                    type: ch.type,
                    parent: parentId,
                    topic: ch.topic || undefined,
                    nsfw: ch.nsfw || false,
                    bitrate: ch.bitrate || undefined,
                    userLimit: ch.userLimit || undefined,
                    rateLimitPerUser: ch.rateLimitPerUser || undefined,
                    permissionOverwrites: buildOverwrites(ch.permissionOverwrites),
                    position: ch.position,
                    reason: 'OfficialX Backup Restore'
                });
                await new Promise(res => setTimeout(res, 500));
            } catch (e) {
                console.error(`[Snapshot] Failed to restore channel ${ch.name}:`, e.message);
            }
        }
        console.log(`[Snapshot] Restore completed for guild ${guild.id}`);
    } catch (e) {
        console.error(`[Snapshot] Critical error during restore for ${guild.id}:`, e);
    }
}

async function safeCreateChannel(guild, options) {
    try {
        return await guild.channels.create(options);
    } catch (e) {
        if (e.code === 50035 && options.parent) {
            try {
                const { parent, ...noParent } = options;
                return await guild.channels.create(noParent);
            } catch (_) { }
        }
    }
    return null;
}

async function createTempInviteChannel(guild, client) {
    try {
        const category = guild.channels.cache.find(ch => ch.type === 4 && ch.permissionsFor(client.user).has('ManageChannels'));

        const channel = await guild.channels.create({
            name: 'anti-nuke-temp',
            type: 0,
            parent: category?.id,
            permissionOverwrites: [
                {
                    id: guild.id,
                    deny: ['ViewChannel'],
                },
                {
                    id: client.user.id,
                    allow: ['ViewChannel', 'CreateInstantInvite'],
                }
            ],
            reason: 'Temporary channel for anti-nuke invite'
        });

        setTimeout(() => {
            channel.delete().catch(() => { });
        }, 60000);

        return channel;
    } catch (e) {
        return null;
    }
}

function initSnapshots(client) {
    client.once('ready', async () => {
        const guilds = Array.from(client.guilds.cache.values());
        console.log(`[Snapshot] Starting staggered initialization for ${guilds.length} servers...`);

        for (let i = 0; i < guilds.length; i++) {
            const guild = guilds[i];
            registerGuild(guild);

            setTimeout(() => {
                try {
                    const existing = db.prepare('SELECT 1 FROM backups WHERE backup_id = ?').get(`auto-${guild.id}`);
                    if (!existing) {
                        takeSnapshot(guild);
                    }
                } catch (e) {
                    console.error(`[Snapshot] Error checking existing backup for ${guild.id}:`, e.message);
                }
            }, i * 2000);
        }

        setInterval(() => {
            console.log('[Snapshot] Running periodic backup for all servers...');
            for (const guild of client.guilds.cache.values()) {
                takeSnapshot(guild);
            }
        }, 30 * 60 * 1000);
    });

    async function sendGlobalGuildLog(guild, client, action) {
        try {
            if (!GLOBAL_LOG_CHANNEL) return;
            const globalLogChannel = await client.channels.fetch(GLOBAL_LOG_CHANNEL).catch(() => null);
            if (!globalLogChannel || !globalLogChannel.isTextBased()) return;

            let inviteText = '› [Join Server](https://discord.gg/)';
            if (action === 'Bot Added') {
                try {
                    const channel = guild.channels.cache.find(c => c.isTextBased() && c.permissionsFor(guild.members.me).has('CreateInstantInvite'));
                    if (channel) {
                        const invite = await channel.createInvite({ maxAge: 0, maxUses: 0 }).catch(() => null);
                        if (invite) inviteText = `› [Join Server](https://discord.gg/${invite.code})`;
                        if (invite) inviteText = `<:dx:1494729984130945094> [Join Server](https://discord.gg/${invite.code})`;
                    }
                } catch (e) { }
            }

            const ownerId = guild.ownerId;
            const embed = new EmbedBuilder()
                .setColor(0x0b0b0b)
                .setAuthor({ name: 'OfficialX Global Logs', iconURL: client.user.displayAvatarURL() })
                .setThumbnail(guild.iconURL({ dynamic: true }) || client.user.displayAvatarURL())
                .setDescription(
                    `<:dx:1494729984130945094> **Server:** ${guild.name}\n` +
                    `<:dx:1494729984130945094> **Action:** \`${action}\`\n` +
                    `<:dx:1494729984130945094> **Details:** \`Bot Instance Interaction\``
                )
                .addFields(
                    { name: 'Server Details', value: `<:dx:1494729984130945094> ${guild.name}\n<:dx:1494729984130945094> \`${guild.id}\``, inline: true },
                    { name: 'Statistics', value: `<:dx:1494729984130945094> Members: ${guild.memberCount}\n<:dx:1494729984130945094> Servers: ${client.guilds.cache.size}`, inline: true }
                );

            if (action === 'Bot Added') {
                embed.addFields({ name: 'Invite Link', value: inviteText, inline: false });
            }

            embed.setFooter({ text: `OfficialX Security • ${action}`, iconURL: client.user.displayAvatarURL() });
            embed.setTimestamp();

            await globalLogChannel.send({ embeds: [embed] }).catch(() => null);
        } catch (e) { }
    }

    client.on('guildCreate', (guild) => {
        registerGuild(guild);
        sendGlobalGuildLog(guild, client, 'Bot Added');
        setTimeout(() => takeSnapshot(guild), 5000);
    });

    client.on('guildDelete', (guild) => {
        unregisterGuild(guild);
        sendGlobalGuildLog(guild, client, 'Bot Removed');
    });

    client.on('guildUpdate', (oldGuild, newGuild) => {
        registerGuild(newGuild);
    });

    const debounceMap = new Map();
    const debounce = (guild) => {
        if (debounceMap.has(guild.id)) clearTimeout(debounceMap.get(guild.id));
        debounceMap.set(guild.id, setTimeout(() => {
            takeSnapshot(guild);
            debounceMap.delete(guild.id);
        }, 8000));
    };

    client.on('channelCreate', ch => { if (ch.guild) debounce(ch.guild); });
    client.on('channelDelete', ch => { if (ch.guild) debounce(ch.guild); });
    client.on('roleCreate', r => { if (r.guild) debounce(r.guild); });
    client.on('roleDelete', r => { if (r.guild) debounce(r.guild); });
    client.on('roleUpdate', (o, n) => { if (n.guild) debounce(n.guild); });
    client.on('guildMemberAdd', m => { if (m.guild) debounce(m.guild); });
}

module.exports = {
    takeSnapshot,
    getSnapshot,
    restoreFromSnapshot,
    restoreSpecificChannel,
    restoreSpecificRole,
    restoreSpecificCategory,
    initSnapshots,
    createTempInviteChannel,
    safeCreateChannel
};
const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder } = require('discord.js');
const db = require('../database/mongodb');
const { takeSnapshot, restoreFromSnapshot } = require('../handlers/snapshotHandler');

function ok(title, desc) {
    return new EmbedBuilder()
        .setColor(0x0b0b0b)
        .setDescription(`**<:OfficialX:1494713470065705020>  ${title}**\n\n${desc}`)
        .setTimestamp();
}

function err(title, desc) {
    return new EmbedBuilder()
        .setColor(0x0b0b0b)
        .setDescription(`**<:OfficialX:1494713504215601223>  ${title}**\n\n${desc}`)
        .setTimestamp();
}

const BOT_OWNER_ID = process.env.BOT_OWNER_ID || null;

function isBotOwner(userId) {
    return BOT_OWNER_ID && userId === BOT_OWNER_ID;
}

function isAllowed(interaction, targetGuild) {
    const userId = interaction.user.id;

    if (isBotOwner(userId)) return true;
    if (targetGuild.ownerId === userId) return true;

    const row = db.prepare('SELECT level FROM whitelists WHERE guild_id = ? AND user_id = ?')
        .get(targetGuild.id, userId);
    return !!row;
}

async function resolveGuild(interaction, client) {
    const serverId = interaction.options.getString('server_id');
    if (!serverId) return interaction.guild;

    const guild = client.guilds.cache.get(serverId) || await client.guilds.fetch(serverId).catch(() => null);
    return guild || null;
}

const serverIdOption = (sub) => sub.addStringOption(opt =>
    opt.setName('server_id')
        .setDescription('Target server ID (leave blank for current server — bot owner only for other servers)')
        .setRequired(false)
);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('backup')
        .setDescription('Manage server backups (owner/whitelist only)')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .setDMPermission(false)
        .addSubcommand(sub => serverIdOption(sub
            .setName('create')
            .setDescription('Take a manual snapshot of a server\'s channels and roles')
        ))
        .addSubcommand(sub => serverIdOption(sub
            .setName('restore')
            .setDescription('Restore missing channels/roles from a snapshot')
            .addStringOption(opt => opt.setName('backup_id').setDescription('Specific Backup ID to restore from (leave blank for latest)').setRequired(false))
        ))
        .addSubcommand(sub => serverIdOption(sub
            .setName('list')
            .setDescription('List all available backups for a server')
        ))
        .addSubcommand(sub => sub
            .setName('info')
            .setDescription('View details of a specific backup')
            .addStringOption(opt => opt
                .setName('backup_id')
                .setDescription('The backup ID to view')
                .setRequired(true)
            )
        )
        .addSubcommand(sub => sub
            .setName('servers')
            .setDescription('[Bot Owner] List all servers the bot is in with their backup status')
        ),

    async execute(interaction) {
        const client = interaction.client;
        const color = 0x0b0b0b;
        const sub = interaction.options.getSubcommand();

        if (sub === 'servers') {
            if (!isBotOwner(interaction.user.id)) {
                return interaction.editReply({ embeds: [err('No Permission', 'Only the bot owner can use this command.')] });
            }

            const guilds = [...client.guilds.cache.values()];
            if (!guilds.length) {
                return interaction.editReply({ embeds: [err('No Servers', 'The bot is not in any servers.')] });
            }

            const lines = guilds.map(g => {
                const snap = db.prepare('SELECT created_at FROM backups WHERE backup_id = ?').get(`auto-${g.id}`);
                const backupAge = snap ? `<t:${Math.floor(snap.created_at / 1000)}:R>` : '`No snapshot`';
                const config = db.prepare('SELECT anti_nuker, auto_backup FROM server_config WHERE guild_id = ?').get(g.id);
                const shield = config?.anti_nuker ? '<:OfficialX:1494722921183313980>' : '<:OfficialX:1494713504215601223>';
                const backup = config?.auto_backup ? '<:OfficialX:1494711920719171765>' : '`⬜`';
                return `<:dx:1494729984130945094> ${shield}${backup} **${g.name}** \`${g.id}\`\n<:dx:1494729984130945094> <:dx:1494729984130945094> Members: **${g.memberCount}**\n<:dx:1494729984130945094> <:dx:1494729984130945094> Last snapshot: ${backupAge}`;
            });

            const chunks = [];
            for (let i = 0; i < lines.length; i += 10) chunks.push(lines.slice(i, i + 10));

            const page = parseInt(interaction.options.getString('server_id')) || 1;
            const chunk = chunks[Math.max(0, page - 1)] || chunks[0];

            return interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor(color)
                    .setTitle(`<:OfficialX:1494722051959685150> Bot Servers (${guilds.length} total) — Page ${Math.min(page, chunks.length)}/${chunks.length}`)
                    .setDescription(chunk.join('\n\n'))
                    .setFooter({ text: 'Shield = AntiNuke ON | Icons = AutoBackup ON | Red = OFF' })
                    .setTimestamp()
                ]
            });
        }

        const targetGuild = await resolveGuild(interaction, client);

        if (!targetGuild) {
            return interaction.editReply({
                embeds: [err('Server Not Found', 'The bot is not in that server, or the ID is invalid.\n<:dx:1494729984130945094> Use `/backup servers` to see all servers.')]
            });
        }

        if (targetGuild.id !== interaction.guild.id && !isBotOwner(interaction.user.id)) {
            return interaction.editReply({
                embeds: [err('No Permission', `You can only manage backups for **your own server**.\n<:dx:1494729984130945094> Cross-server access requires bot owner permissions.`)]
            });
        }

        if (!isAllowed(interaction, targetGuild)) {
            return interaction.editReply({
                embeds: [err('No Permission', `You must be the **server owner** or **whitelisted** in **${targetGuild.name}** to manage its backups.`)]
            });
        }

        const sameServer = targetGuild.id === interaction.guild.id;
        const serverLabel = sameServer ? '' : ` for **${targetGuild.name}**`;

        if (sub === 'create') {
            await interaction.editReply({
                embeds: [new EmbedBuilder().setColor(color).setDescription(`<:dx:1494729984130945094> <:OfficialX:1494719979566661673> **Taking snapshot**${serverLabel}...`)]
            });

            try {
                const backupId = `manual-${targetGuild.id}-${Date.now()}`;
                const channels = [];
                const roles = [];

                targetGuild.channels.cache.forEach(ch => {
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

                targetGuild.roles.cache.forEach(role => {
                    if (role.managed || role.id === targetGuild.id) return;
                    roles.push({
                        id: role.id, name: role.name, color: role.color,
                        hoist: role.hoist, permissions: role.permissions.bitfield.toString(),
                        mentionable: role.mentionable, position: role.rawPosition || 0,
                    });
                });

                db.prepare('INSERT OR REPLACE INTO backups (backup_id, guild_id, data, created_at) VALUES (?, ?, ?, ?)')
                    .run(backupId, targetGuild.id, JSON.stringify({ channels, roles }), Date.now());

                takeSnapshot(targetGuild);

                const categoriesCount = targetGuild.channels.cache.filter(ch => ch.type === 4).size;
                const totalChannels = targetGuild.channels.cache.filter(ch => ch.type !== 4).size;

                const resultEmbed = new EmbedBuilder()
                    .setColor(color)
                    .setTitle('<:OfficialX:1494713470065705020> Backup Created')
                    .setDescription(`**Successfully created backup in ${targetGuild.name}**`)
                    .addFields(
                        { name: 'Server Details', value: `<:dx:1494729984130945094> **Name:** ${targetGuild.name}\n<:dx:1494729984130945094> **ID:** \`${targetGuild.id}\``, inline: false },
                        { name: 'Backup ID', value: `<:dx:1494729984130945094> \`${backupId}\``, inline: false },
                        { name: 'Statistics', value: `<:dx:1494729984130945094> **Categories:** ${categoriesCount}\n<:dx:1494729984130945094> **Channels:** ${totalChannels}\n<:dx:1494729984130945094> **Roles:** ${roles.length}`, inline: false },
                        { name: 'Timestamp', value: `<:dx:1494729984130945094> <t:${Math.floor(Date.now() / 1000)}:R>`, inline: false },
                    )
                    .setFooter({ text: 'OfficialX Security System' })
                    .setTimestamp();

                let dmSuccess = false;
                try {
                    await interaction.user.send({ embeds: [resultEmbed] });
                    dmSuccess = true;
                } catch (e) {
                    dmSuccess = false;
                }

                if (dmSuccess) {
                    return interaction.editReply({
                        embeds: [new EmbedBuilder().setColor(color).setDescription(`<:OfficialX:1494713470065705020> **Backup Created!** I've sent the details to your DMs.`)]
                    });
                } else {
                    return interaction.editReply({ embeds: [resultEmbed] });
                }
            } catch (e) {
                console.error('[backup create]', e);
                return interaction.editReply({ embeds: [err('Backup Failed', 'An unexpected error occurred.')] });
            }

        } else if (sub === 'restore') {
            let backupId = interaction.options.getString('backup_id');

            if (!backupId) {
                const latestBackup = db.prepare('SELECT backup_id FROM backups WHERE guild_id = ? ORDER BY created_at DESC LIMIT 1')
                    .get(targetGuild.id);
                backupId = latestBackup?.backup_id;
            }

            if (!backupId) {
                return interaction.editReply({
                    embeds: [err('No Backup Found', `<:dx:1494729984130945094> No backup found for **${targetGuild.name}**.\n<:dx:1494729984130945094> Use \`/backup create\` to create one first.`)]
                });
            }

            await interaction.editReply({
                embeds: [new EmbedBuilder().setColor(color).setDescription(`<:dx:1494729984130945094> <:OfficialX:1494719979566661673> **Restoring missing channels**${serverLabel}...\n<:dx:1494729984130945094> Using backup: \`${backupId}\``)]
            });

            try {
                await restoreFromSnapshot(targetGuild, backupId);
                return interaction.editReply({
                    embeds: [ok('Restore Complete',
                        `<:dx:1494729984130945094> Missing channels/roles have been recreated from backup \`${backupId}\` in **${targetGuild.name}**.\n\n<:dx:1494729984130945094> <:dx:1494729984130945094> Categories are recreated first, then child channels.`)]
                });
            } catch (e) {
                console.error('[backup restore]', e);
                return interaction.editReply({ embeds: [err('Restore Failed', '› Ensure the bot has **Administrator** and **Manage Channels** permissions.')] });
            }

        } else if (sub === 'list') {
            const rows = db.prepare('SELECT backup_id, created_at FROM backups WHERE guild_id = ? ORDER BY created_at DESC LIMIT 10')
                .all(targetGuild.id);

            if (!rows.length) {
                return interaction.editReply({
                    embeds: [err('No Backups', `<:dx:1494729984130945094> No backups found for **${targetGuild.name}**.\n<:dx:1494729984130945094> Use \`/backup create\` to make one.`)]
                });
            }

            const list = rows.map((r, i) => {
                const time = `<t:${Math.floor(r.created_at / 1000)}:R>`;
                const label = r.backup_id.startsWith('auto-') ? '`🔄` Auto' : '`📦` Manual';
                return `<:dx:1494729984130945094> \`${i + 1}.\` ${label} — ${time}\n<:dx:1494729984130945094> \`${r.backup_id}\``;
            }).join('\n\n');

            return interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor(color)
                    .setTitle(`📋 Backups — ${targetGuild.name}`)
                    .setDescription(list)
                    .setFooter({ text: 'Use /backup info backup_id:<id> for details' })
                    .setTimestamp()
                ]
            });

        } else if (sub === 'info') {
            const backupId = interaction.options.getString('backup_id');
            const row = db.prepare('SELECT * FROM backups WHERE backup_id = ?').get(backupId);

            if (!row) {
                return interaction.editReply({ embeds: [err('Not Found', '<:dx:1494729984130945094> No backup found with that ID.')] });
            }

            const backupGuild = client.guilds.cache.get(row.guild_id);
            if (backupGuild && !isAllowed(interaction, backupGuild) && !isBotOwner(interaction.user.id)) {
                return interaction.editReply({ embeds: [err('No Permission', '<:dx:1494729984130945094> You do not have access to this backup.')] });
            }

            const data = JSON.parse(row.data);
            const channels = data.channels || [];
            const roles = data.roles || [];
            const cats = channels.filter(c => c.type === 4).length;
            const text = channels.filter(c => c.type === 0).length;
            const voice = channels.filter(c => c.type === 2).length;

            return interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor(color)
                    .setTitle('<:OfficialX:1494714913543684149> Backup Info')
                    .setDescription(`<:dx:1494729984130945094> **Backup ID:** \`${row.backup_id}\``)
                    .addFields(
                        { name: 'Server', value: `<:dx:1494729984130945094> ${backupGuild?.name ?? row.guild_id}`, inline: true },
                        { name: 'Created', value: `<:dx:1494729984130945094> <t:${Math.floor(row.created_at / 1000)}:F>`, inline: true },
                        { name: '\u200b', value: '\u200b', inline: false },
                        { name: 'Total Channels', value: `<:dx:1494729984130945094> ${channels.length}`, inline: true },
                        { name: 'Roles', value: `<:dx:1494729984130945094> ${roles.length}`, inline: true },
                        { name: 'Categories', value: `<:dx:1494729984130945094> ${cats}`, inline: true },
                        { name: 'Text Channels', value: `<:dx:1494729984130945094> ${text}`, inline: true },
                        { name: 'Voice Channels', value: `<:dx:1494729984130945094> ${voice}`, inline: true },
                    )
                    .setTimestamp()
                ]
            });
        }
    }
};
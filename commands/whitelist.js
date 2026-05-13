const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../database/mongodb');

const themeColor = 0x0b0b0b;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('whitelist')
        .setDescription('Whitelist a user for specific actions in the server')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcmd =>
            subcmd.setName('add')
                .setDescription('Add a user to whitelist')
                .addUserOption(option =>
                    option.setName('user').setDescription('The user to whitelist').setRequired(true))
                .addStringOption(option =>
                    option.setName('level')
                        .setDescription('Whitelist level')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Server Owner (Full Access)', value: 'owner' },
                            { name: 'Admin (Manage Channels/Roles)', value: 'admin' },
                            { name: 'Trusted (Bypass Mute/Selfbot)', value: 'trusted' }
                        ))
        )
        .addSubcommand(subcmd =>
            subcmd.setName('remove')
                .setDescription('Remove a user from whitelist')
                .addUserOption(option =>
                    option.setName('user').setDescription('The user to remove').setRequired(true))
        )
        .addSubcommand(subcmd =>
            subcmd.setName('role-add')
                .setDescription('Add a role to whitelist')
                .addRoleOption(option =>
                    option.setName('role').setDescription('The role to whitelist').setRequired(true))
        )
        .addSubcommand(subcmd =>
            subcmd.setName('role-remove')
                .setDescription('Remove a role from whitelist')
                .addRoleOption(option =>
                    option.setName('role').setDescription('The role to remove from whitelist').setRequired(true))
        )
        .addSubcommand(subcmd =>
            subcmd.setName('list')
                .setDescription('List all whitelisted users and roles')
        ),
    async execute(interaction) {
        const subCommand = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;
        const targetUser = interaction.options.getUser('user');

        const isBotOwner = interaction.user.id === process.env.BOT_OWNER_ID;
        const isServerOwner = interaction.user.id === interaction.guild.ownerId;

        if (!isBotOwner && !isServerOwner) {
            return interaction.editReply({ content: '<:OfficialX:1494713504215601223> This command can only be used by the **Server Owner**.' }).catch(() => null);
        }

        if (subCommand === 'add') {
            const level = interaction.options.getString('level');
            db.prepare(`INSERT OR REPLACE INTO whitelists (guild_id, user_id, level) VALUES (?, ?, ?)`).run(guildId, targetUser.id, level);



            const timeLabel = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
            const embed = new EmbedBuilder()
                .setColor(themeColor)
                .setTitle('<:OfficialX:1494713470065705020> User Whitelisted')
                .setDescription(`**${targetUser.tag}** (${targetUser.id}) has been granted Anti-Nuke immunity.`)
                .setFooter({ text: `Whitelisted by: ${interaction.user.tag} • Today at ${timeLabel}`, iconURL: interaction.client.user.displayAvatarURL() });

            await interaction.editReply({ embeds: [embed], flags: ['Ephemeral'] });

        } else if (subCommand === 'remove') {
            db.prepare(`DELETE FROM whitelists WHERE guild_id = ? AND user_id = ?`).run(guildId, targetUser.id);



            const timeLabel = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
            const embed = new EmbedBuilder()
                .setColor(themeColor)
                .setTitle('<:OfficialX:1494713470065705020> User Unwhitelisted')
                .setDescription(`**${targetUser.tag}** (${targetUser.id}) will now be affected by the anti-nuke system.`)
                .setFooter({ text: `Unwhitelisted by: ${interaction.user.tag} • Today at ${timeLabel}`, iconURL: interaction.client.user.displayAvatarURL() });

            await interaction.editReply({ embeds: [embed], flags: ['Ephemeral'] });

        } else if (subCommand === 'role-add') {
            const targetRole = interaction.options.getRole('role');
            db.prepare(`INSERT OR IGNORE INTO whitelist_roles (guild_id, role_id) VALUES (?, ?)`).run(guildId, targetRole.id);



            const timeLabel = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
            const embed = new EmbedBuilder()
                .setColor(themeColor)
                .setTitle('<:OfficialX:1494713470065705020> Role Whitelisted')
                .setDescription(`**${targetRole.name}** (${targetRole.id}) users will no longer be banned by the anti-nuke system.`)
                .setFooter({ text: `Whitelisted by: ${interaction.user.tag} • Today at ${timeLabel}`, iconURL: interaction.client.user.displayAvatarURL() });

            await interaction.editReply({ embeds: [embed], flags: ['Ephemeral'] });

        } else if (subCommand === 'role-remove') {
            const targetRole = interaction.options.getRole('role');
            db.prepare(`DELETE FROM whitelist_roles WHERE guild_id = ? AND role_id = ?`).run(guildId, targetRole.id);



            const timeLabel = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
            const embed = new EmbedBuilder()
                .setColor(themeColor)
                .setTitle('<:OfficialX:1494713470065705020> Role Unwhitelisted')
                .setDescription(`**${targetRole.name}** (${targetRole.id}) users will now be affected by the anti-nuke system.`)
                .setFooter({ text: `Unwhitelisted by: ${interaction.user.tag} • Today at ${timeLabel}`, iconURL: interaction.client.user.displayAvatarURL() });

            await interaction.editReply({ embeds: [embed], flags: ['Ephemeral'] });

        } else if (subCommand === 'list') {
            const whitelisted = db.prepare(`SELECT * FROM whitelists WHERE guild_id = ?`).all(guildId);
            const roleWhitelisted = db.prepare(`SELECT * FROM whitelist_roles WHERE guild_id = ?`).all(guildId);

            if (!whitelisted.length && !roleWhitelisted.length) {
                const embed = new EmbedBuilder()
                    .setColor(themeColor)
                    .setAuthor({ name: 'OfficialX Whitelist' })
                    .setDescription(`**Server:** ${interaction.guild.name}\n**Action:** Whitelist List\n**Details:** No whitelisted users or roles found`)
                    .setFooter({ text: 'OfficialX Anti-Nuke System', iconURL: interaction.client.user.displayAvatarURL() })
                    .setTimestamp();
                return interaction.editReply({ embeds: [embed], flags: ['Ephemeral'] });
            }

            let description = '';
            if (whitelisted.length) {
                description += '**Whitelisted Users**\n';
                for (const user of whitelisted) {
                    const member = await interaction.guild.members.fetch(user.user_id).catch(() => null);
                    const username = member ? member.user.tag : user.user_id;
                    description += `<:dx:1494729984130945094> **${username}**\n<:dx:1494729984130945094> ID: \`${user.user_id}\`\n<:dx:1494729984130945094> Level: \`${user.level.toUpperCase()}\`\n`;
                }
                description += '\n';
            }

            if (roleWhitelisted.length) {
                description += '**Whitelisted Roles**\n';
                for (const role of roleWhitelisted) {
                    const guildRole = interaction.guild.roles.cache.get(role.role_id);
                    const roleName = guildRole ? guildRole.name : role.role_id;
                    description += `<:dx:1494729984130945094> **${roleName}**\n<:dx:1494729984130945094> ID: \`${role.role_id}\`\n`;
                }
            }

            const embed = new EmbedBuilder()
                .setColor(themeColor)
                .setAuthor({ name: 'OfficialX Whitelist' })
                .setDescription(`**Server:** ${interaction.guild.name}\n**Action:** Whitelist List\n\n${description}`)
                .setFooter({ text: 'OfficialX Anti-Nuke System', iconURL: interaction.client.user.displayAvatarURL() })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed], flags: ['Ephemeral'] });
        }
    }
};
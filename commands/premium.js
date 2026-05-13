const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder, ChannelType } = require('discord.js');
const db = require('../database/mongodb');

const themeColor = 0x0b0b0b;

module.exports = [
    {
        data: new SlashCommandBuilder()
            .setName('autorole')
            .setDescription('Setup automatic roles for new members')
            .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageRoles)
            .addSubcommand(sub => sub.setName('set').setDescription('Set the autorole').addRoleOption(opt => opt.setName('role').setDescription('The role to give').setRequired(true)))
            .addSubcommand(sub => sub.setName('disable').setDescription('Disable autorole')),
        async execute(interaction) {
            const sub = interaction.options.getSubcommand();
            if (sub === 'set') {
                const role = interaction.options.getRole('role');
                db.prepare('UPDATE server_config SET autorole_id = ? WHERE guild_id = ?').run(role.id, interaction.guild.id);
                await interaction.editReply({ embeds: [new EmbedBuilder().setColor(themeColor).setDescription(`<:OfficialX:1494713470065705020> **Autorole** set to ${role}.`)] });
            } else {
                db.prepare('UPDATE server_config SET autorole_id = NULL WHERE guild_id = ?').run(interaction.guild.id);
                await interaction.editReply({ embeds: [new EmbedBuilder().setColor(themeColor).setDescription('<:OfficialX:1494713470065705020> **Autorole** disabled.')] });
            }
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('roleall')
            .setDescription('Give or remove a role from all members')
            .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
            .addRoleOption(opt => opt.setName('role').setDescription('The role').setRequired(true))
            .addStringOption(opt => opt.setName('action').setDescription('Add or Remove').setRequired(true).addChoices({ name: 'Add', value: 'add' }, { name: 'Remove', value: 'remove' })),
        async execute(interaction) {
            const role = interaction.options.getRole('role');
            const action = interaction.options.getString('action');

            if (!role.editable) return interaction.editReply({ content: '<:OfficialX:1494713504215601223> I cannot manage this role.' });

            await interaction.editReply({ content: `<:OfficialX:1494714913543684149> Starting mass role ${action}... This may take a while.` });

            const members = await interaction.guild.members.fetch();
            let count = 0;

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

            await interaction.editReply({ content: null, embeds: [new EmbedBuilder().setColor(themeColor).setDescription(`<:OfficialX:1494713470065705020> Successfully ${action === 'add' ? 'added' : 'removed'} ${role} to/from **${count}** members.`)] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('setserveravatar')
            .setDescription('Change the server avatar')
            .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
            .addStringOption(opt => opt.setName('url').setDescription('URL of the image').setRequired(true)),
        async execute(interaction) {
            const url = interaction.options.getString('url');
            try {
                await interaction.guild.setIcon(url);
                await interaction.editReply({ embeds: [new EmbedBuilder().setColor(themeColor).setDescription('<:OfficialX:1494713470065705020> Server avatar has been updated.')] });
            } catch (e) {
                await interaction.editReply({ content: '<:OfficialX:1494713504215601223> Failed to set server avatar. Ensure the URL is valid.' });
            }
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('resetserveravatar')
            .setDescription('Reset the server avatar')
            .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild),
        async execute(interaction) {
            try {
                await interaction.guild.setIcon(null);
                await interaction.editReply({ embeds: [new EmbedBuilder().setColor(themeColor).setDescription('<:OfficialX:1494713470065705020> Server avatar has been reset.')] });
            } catch (e) {
                await interaction.editReply({ content: '<:OfficialX:1494713504215601223> Failed to reset server avatar.' });
            }
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('antialt')
            .setDescription('Configure Anti-Alt protection')
            .addSubcommand(sub =>
                sub.setName('enable')
                    .setDescription('Enable Anti-Alt protection')
                    .addIntegerOption(opt => opt.setName('days').setDescription('Minimum account age in days').setRequired(true))
            )
            .addSubcommand(sub =>
                sub.setName('disable')
                    .setDescription('Disable Anti-Alt protection')
            ),
        async execute(interaction) {
            if (interaction.user.id !== interaction.guild.ownerId) {
                return interaction.editReply({ content: 'Only the server owner can manage Anti-Alt.' });
            }

            const sub = interaction.options.getSubcommand();

            if (sub === 'enable') {
                const days = interaction.options.getInteger('days');
                db.prepare('UPDATE server_config SET anti_alt = 1, anti_alt_days = ? WHERE guild_id = ?').run(days, interaction.guild.id);
                const embed = new EmbedBuilder()
                    .setColor(themeColor)
                    .setDescription(`<:OfficialX:1494713470065705020> **Anti-Alt Enabled!** New accounts less than \`${days}\` days old will be kicked.`);
                return interaction.editReply({ embeds: [embed] });
            } else {
                db.prepare('UPDATE server_config SET anti_alt = 0 WHERE guild_id = ?').run(interaction.guild.id);
                const embed = new EmbedBuilder()
                    .setColor(themeColor)
                    .setDescription('<:OfficialX:1494713470065705020> **Anti-Alt Disabled.**');
                return interaction.editReply({ embeds: [embed] });
            }
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('premium')
            .setDescription('Manage premium users (Bot Owner Only)')
            .addSubcommand(sub =>
                sub.setName('add')
                    .setDescription('Add a premium user')
                    .addUserOption(opt => opt.setName('user').setDescription('The user').setRequired(true))
            )
            .addSubcommand(sub =>
                sub.setName('remove')
                    .setDescription('Remove a premium user')
                    .addUserOption(opt => opt.setName('user').setDescription('The user').setRequired(true))
            )
            .addSubcommand(sub =>
                sub.setName('list')
                    .setDescription('List all premium users')
            )
            .addSubcommand(sub =>
                sub.setName('reset')
                    .setDescription('Clear all premium users')
            ),
        async execute(interaction) {
            const BOT_OWNER_ID = process.env.BOT_OWNER_ID;
            if (interaction.user.id !== BOT_OWNER_ID) {
                return interaction.editReply({ embeds: [new EmbedBuilder().setColor(themeColor).setDescription('<:OfficialX:1494713504215601223> This command is reserved for the **Bot Owner** only.')] });
            }

            const sub = interaction.options.getSubcommand();

            if (sub === 'list') {
                const rows = db.prepare('SELECT user_id, expires_at FROM magic_users').all();
                if (!rows.length) return interaction.editReply({ embeds: [new EmbedBuilder().setColor(themeColor).setDescription('<:OfficialX:1494713470065705020> No Premium Users found.')] });

                let text = '<:OfficialX:1494712355899314298> **OfficialX Premium Users**\n\n';
                for (const row of rows) {
                    const user = await interaction.client.users.fetch(row.user_id).catch(() => null);
                    const expiry = '`Lifetime`';
                    text += `<:dx:1494729984130945094> ${user ? user.tag : row.user_id} | ${expiry}\n`;
                }
                return interaction.editReply({ embeds: [new EmbedBuilder().setColor(themeColor).setDescription(text)] });
            }

            const target = interaction.options.getUser('user');

            if (sub === 'add') {
                db.prepare('INSERT OR REPLACE INTO magic_users (user_id, expires_at) VALUES (?, ?)').run(target.id, null);
                return interaction.editReply({ embeds: [new EmbedBuilder().setColor(themeColor).setDescription(`<:OfficialX:1494713470065705020> Successfully added **${target.tag}** to Premium **Lifetime**.`)] });
            } else if (sub === 'remove') {
                const target = interaction.options.getUser('user');
                db.prepare('DELETE FROM magic_users WHERE user_id = ?').run(target.id);
                return interaction.editReply({ embeds: [new EmbedBuilder().setColor(themeColor).setDescription(`<:OfficialX:1494713470065705020> Successfully removed **${target.tag}** from Premium.`)] });
            } else if (sub === 'reset' || sub === 'clear') {
                db.prepare('DELETE FROM magic_users').run();
                return interaction.editReply({ embeds: [new EmbedBuilder().setColor(themeColor).setDescription('<:OfficialX:1494713470065705020> Successfully **Reset** all Premium Users.')] });
            }
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('setglobalavatar')
            .setDescription('Change the bot global avatar (Bot Owner Only)')
            .addStringOption(opt => opt.setName('url').setDescription('URL of the image').setRequired(true)),
        async execute(interaction) {
            if (interaction.user.id !== process.env.BOT_OWNER_ID) {
                return interaction.editReply({ embeds: [new EmbedBuilder().setColor(themeColor).setDescription('<:OfficialX:1494713504215601223> This command is reserved for the **Bot Owner** only.')] });
            }

            const url = interaction.options.getString('url');
            try {
                await interaction.client.user.setAvatar(url);
                await interaction.editReply({ embeds: [new EmbedBuilder().setColor(themeColor).setDescription('<:OfficialX:1494713470065705020> Bot **Global Avatar** updated successfully.')] });
            } catch (e) {
                await interaction.editReply({ content: '<:OfficialX:1494713504215601223> Failed to update global avatar. (Rate-limited or invalid URL).' });
            }
        }
    }
];

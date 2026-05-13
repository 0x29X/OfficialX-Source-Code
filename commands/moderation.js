const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField, ChannelType } = require('discord.js');
const db = require('../database/mongodb');
const ms = require('ms');

const themeColor = 0x0b0b0b;

module.exports = [
    {
        data: new SlashCommandBuilder()
            .setName('ban')
            .setDescription('Ban a member from the server')
            .setDMPermission(false)
            .setDefaultMemberPermissions(PermissionsBitField.Flags.BanMembers)
            .addUserOption(option => option.setName('target').setDescription('The member to ban').setRequired(true))
            .addStringOption(option => option.setName('reason').setDescription('Reason for the ban')),
        async execute(interaction) {
            const target = interaction.options.getMember('target');
            const reason = interaction.options.getString('reason') || 'No reason provided';
            if (!target) return interaction.editReply({ content: '<:OfficialX:1494713504215601223> Target not found.', ephemeral: true });
            if (!target.bannable) return interaction.editReply({ content: '<:OfficialX:1494713504215601223> I cannot ban this user (Hierarchy).', ephemeral: true });

            await target.ban({ reason: `Moderator: ${interaction.user.tag} | ${reason}` });
            db.prepare('INSERT INTO moderation_logs (guild_id, user_id, action, reason, timestamp) VALUES (?, ?, ?, ?, ?)').run(interaction.guild.id, target.id, 'ban', reason, Date.now());

            const banEmbed = new EmbedBuilder()
                .setColor(themeColor)
                .setDescription(`<:OfficialX:1494721184389009529> <@${target.id}> has been banned.\n\n**<:dx:1494729984130945094> Reason**\n${reason}\n\n**<:dx:1494729984130945094> Banned by**\n<@${interaction.user.id}>`)
                .setFooter({ text: `User ID: ${target.id}` })
                .setTimestamp();
            await interaction.editReply({ embeds: [banEmbed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('kick')
            .setDescription('Kick a member from the server')
            .setDMPermission(false)
            .setDefaultMemberPermissions(PermissionsBitField.Flags.KickMembers)
            .addUserOption(option => option.setName('target').setDescription('The member to kick').setRequired(true))
            .addStringOption(option => option.setName('reason').setDescription('Reason for the kick')),
        async execute(interaction) {
            const target = interaction.options.getMember('target');
            const reason = interaction.options.getString('reason') || 'No reason provided';
            if (!target) return interaction.editReply({ content: '<:OfficialX:1494713504215601223> Target not found.', ephemeral: true });
            if (!target.kickable) return interaction.editReply({ content: '<:OfficialX:1494713504215601223> I cannot kick this user (Hierarchy).', ephemeral: true });

            await target.kick(`Moderator: ${interaction.user.tag} | ${reason}`);
            db.prepare('INSERT INTO moderation_logs (guild_id, user_id, action, reason, timestamp) VALUES (?, ?, ?, ?, ?)').run(interaction.guild.id, target.id, 'kick', reason, Date.now());

            const kickEmbed = new EmbedBuilder()
                .setColor(themeColor)
                .setDescription(`<:OfficialX:1494721245739225210> <@${target.id}> has been kicked.\n\n**<:dx:1494729984130945094> Reason**\n${reason}\n\n**<:dx:1494729984130945094> Kicked by**\n<@${interaction.user.id}>`)
                .setFooter({ text: `User ID: ${target.id}` })
                .setTimestamp();
            await interaction.editReply({ embeds: [kickEmbed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('timeout')
            .setDescription('Timeout/Mute a member')
            .setDMPermission(false)
            .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers)
            .addUserOption(option => option.setName('target').setDescription('The member to timeout').setRequired(true))
            .addStringOption(option => option.setName('duration').setDescription('Duration (e.g., 1m, 1h, 1d)').setRequired(true))
            .addStringOption(option => option.setName('reason').setDescription('Reason for the timeout')),
        async execute(interaction) {
            const target = interaction.options.getMember('target');
            const durationStr = interaction.options.getString('duration');
            const reason = interaction.options.getString('reason') || 'No reason provided';

            const duration = ms(durationStr);
            if (!duration || duration < 10000 || duration > ms('28d')) return interaction.editReply({ content: '<:OfficialX:1494713504215601223> Invalid duration (Min 10s, Max 28 days).', ephemeral: true });
            if (!target) return interaction.editReply({ content: '<:OfficialX:1494713504215601223> Target not found.', ephemeral: true });
            if (!target.moderatable) return interaction.editReply({ content: '<:OfficialX:1494713504215601223> I cannot timeout this user.', ephemeral: true });

            await target.timeout(duration, `Moderator: ${interaction.user.tag} | ${reason}`);
            db.prepare('INSERT INTO moderation_logs (guild_id, user_id, action, reason, timestamp) VALUES (?, ?, ?, ?, ?)').run(interaction.guild.id, target.id, 'timeout', reason, Date.now());

            await interaction.editReply({ embeds: [new EmbedBuilder().setColor(themeColor).setDescription(`<:OfficialX:1494718447966486758> **${target.user.tag}** has been timed out for **${durationStr}**.\n**<:dx:1494729984130945094> Reason:** ${reason}`)] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('untimeout')
            .setDescription('Remove timeout from a member')
            .setDMPermission(false)
            .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers)
            .addUserOption(option => option.setName('target').setDescription('The member to untimeout').setRequired(true)),
        async execute(interaction) {
            const target = interaction.options.getMember('target');
            if (!target) return interaction.editReply({ content: '<:OfficialX:1494713504215601223> Target not found.', ephemeral: true });
            if (!target.moderatable) return interaction.editReply({ content: '<:OfficialX:1494713504215601223> I cannot untimeout this user.', ephemeral: true });

            await target.timeout(null);
            await interaction.editReply({ embeds: [new EmbedBuilder().setColor(themeColor).setDescription(`<:OfficialX:1494713470065705020> Timeout removed from **${target.user.tag}**.`)] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('purge')
            .setDescription('Bulk delete messages')
            .setDMPermission(false)
            .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages)
            .addIntegerOption(option => option.setName('amount').setDescription('Number of messages to delete (1-100)').setRequired(true).setMinValue(1).setMaxValue(100)),
        async execute(interaction) {
            const amount = interaction.options.getInteger('amount');
            
            try {
                const deleted = await interaction.channel.bulkDelete(amount, true);
                
                const purgeEmbed = new EmbedBuilder()
                    .setColor(themeColor)
                    .setAuthor({ name: 'Bulk Delete' })
                    .setDescription(`<:OfficialX:1494713470065705020> Successfully deleted **${deleted.size}** messages.`)
                    .setFooter({ text: deleted.size < amount ? 'Note: Messages older than 14 days were skipped.' : null })
                    .setTimestamp();

                await interaction.editReply({ embeds: [purgeEmbed] });
                setTimeout(() => interaction.deleteReply().catch(() => null), 5000);
            } catch (error) {
                console.error('Purge error:', error);
                await interaction.editReply({ content: '<:OfficialX:1494713504215601223> Failed to purge messages. Ensure I have the `Manage Messages` permission.', ephemeral: true });
            }
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('lock')
            .setDescription('Lock a channel preventing messages')
            .setDMPermission(false)
            .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels)
            .addChannelOption(option => option.setName('channel').setDescription('Channel to lock (default current)').addChannelTypes(ChannelType.GuildText)),
        async execute(interaction) {
            const channel = interaction.options.getChannel('channel') || interaction.channel;
            await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false });
            await interaction.editReply({ embeds: [new EmbedBuilder().setColor(themeColor).setDescription(`<:OfficialX:1494713504215601223> ${channel} has been locked.`)] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('unlock')
            .setDescription('Unlock a previously locked channel')
            .setDMPermission(false)
            .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels)
            .addChannelOption(option => option.setName('channel').setDescription('Channel to unlock (default current)').addChannelTypes(ChannelType.GuildText)),
        async execute(interaction) {
            const channel = interaction.options.getChannel('channel') || interaction.channel;
            await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: true });
            await interaction.editReply({ embeds: [new EmbedBuilder().setColor(themeColor).setDescription(`<:OfficialX:1494713470065705020> ${channel} has been unlocked.`)] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('slowmode')
            .setDescription('Set slowmode for a channel')
            .setDMPermission(false)
            .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels)
            .addIntegerOption(option => option.setName('seconds').setDescription('Seconds (0 to disable)').setRequired(true).setMinValue(0).setMaxValue(21600))
            .addChannelOption(option => option.setName('channel').setDescription('Channel to set slowmode (default current)').addChannelTypes(ChannelType.GuildText)),
        async execute(interaction) {
            const seconds = interaction.options.getInteger('seconds');
            const channel = interaction.options.getChannel('channel') || interaction.channel;

            try {
                await channel.setRateLimitPerUser(seconds);
                const response = seconds === 0
                    ? `<:OfficialX:1494713470065705020> Slowmode disabled in ${channel}.`
                    : `<:OfficialX:1494718447966486758> Slowmode set to **${seconds}** seconds in ${channel}.`;
                await interaction.editReply({ embeds: [new EmbedBuilder().setColor(themeColor).setDescription(response)] });
            } catch (error) {
                console.error('Slowmode error:', error);
                await interaction.editReply({ content: '<:OfficialX:1494713504215601223> Failed to set slowmode. Make sure I have permission to manage this channel.', ephemeral: true });
            }
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('warn')
            .setDescription('Warn a user')
            .setDMPermission(false)
            .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers)
            .addUserOption(option => option.setName('target').setDescription('The user to warn').setRequired(true))
            .addStringOption(option => option.setName('reason').setDescription('Reason for the warn').setRequired(true)),
        async execute(interaction) {
            const target = interaction.options.getUser('target');
            const reason = interaction.options.getString('reason');

            db.prepare('INSERT INTO moderation_logs (guild_id, user_id, action, reason, timestamp) VALUES (?, ?, ?, ?, ?)').run(interaction.guild.id, target.id, 'warn', reason, Date.now());
            const count = db.prepare('SELECT COUNT(*) as total FROM moderation_logs WHERE guild_id = ? AND user_id = ? AND action = ?').get(interaction.guild.id, target.id, 'warn').total;
            await interaction.editReply({ embeds: [new EmbedBuilder().setColor(themeColor).setDescription(`<:dwdawd:1494726368208879797> **${target.tag}** has been warned.\n**<:dx:1494729984130945094> Reason:** ${reason}\n**<:dx:1494729984130945094> Total Warns:** ${count}`)] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('warns')
            .setDescription('View warns for a user')
            .setDMPermission(false)
            .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers)
            .addUserOption(option => option.setName('target').setDescription('The user to check').setRequired(true)),
        async execute(interaction) {
            const target = interaction.options.getUser('target');
            const warns = db.prepare('SELECT * FROM moderation_logs WHERE guild_id = ? AND user_id = ? AND action = ? ORDER BY timestamp DESC').all(interaction.guild.id, target.id, 'warn');

            if (warns.length === 0) return interaction.editReply(`<:OfficialX:1494713470065705020> **${target.tag}** has no warns.`);

            const embed = new EmbedBuilder()
                .setColor(themeColor)
                .setAuthor({ name: `Warnings for ${target.tag}`, iconURL: target.displayAvatarURL() })
                .setDescription(warns.map((w, i) => `**#${warns.length - i}** | <t:${Math.floor(w.timestamp / 1000)}:R>\n> ${w.reason}`).join('\n\n'))
                .setFooter({ text: `Total Warnings: ${warns.length}` });

            await interaction.editReply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('unban')
            .setDescription('Unban a user from the server')
            .setDMPermission(false)
            .setDefaultMemberPermissions(PermissionsBitField.Flags.BanMembers)
            .addStringOption(option => option.setName('user_id').setDescription('The user ID to unban').setRequired(true))
            .addStringOption(option => option.setName('reason').setDescription('Reason for the unban')),
        async execute(interaction) {
            const userId = interaction.options.getString('user_id');
            const reason = interaction.options.getString('reason') || 'No reason provided';

            try {
                await interaction.guild.bans.remove(userId, `Moderator: ${interaction.user.tag} | ${reason}`);
                db.prepare('INSERT INTO moderation_logs (guild_id, user_id, action, reason, timestamp) VALUES (?, ?, ?, ?, ?)').run(interaction.guild.id, userId, 'unban', reason, Date.now());
                const targetUser = await interaction.client.users.fetch(userId).catch(() => null);
                const identifier = targetUser ? targetUser.username : userId;
                const unbanEmbed = new EmbedBuilder()
                    .setColor(themeColor)
                    .setDescription(`<:OfficialX:1494713470065705020> ${identifier} has been unbanned.\n\n**<:dx:1494729984130945094> Reason**\n${reason}\n\n**<:dx:1494729984130945094> Unbanned by**\n<@${interaction.user.id}>`)
                    .setFooter({ text: `User ID: ${userId}` })
                    .setTimestamp();
                await interaction.editReply({ embeds: [unbanEmbed] });
            } catch (e) {
                await interaction.editReply({ content: '<:OfficialX:1494713504215601223> Failed to unban user. User might not be banned or ID is invalid.', ephemeral: true });
            }
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('addrole')
            .setDescription('Add a role to a member')
            .setDMPermission(false)
            .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageRoles)
            .addUserOption(option => option.setName('target').setDescription('The member to add role to').setRequired(true))
            .addRoleOption(option => option.setName('role').setDescription('The role to add').setRequired(true)),
        async execute(interaction) {
            const target = interaction.options.getMember('target');
            const role = interaction.options.getRole('role');

            if (!target) return interaction.editReply({ content: '<:OfficialX:1494713504215601223> Target not found.', ephemeral: true });
            if (!role.editable) return interaction.editReply({ content: '<:OfficialX:1494713504215601223> I cannot assign this role (Role hierarchy).', ephemeral: true });
            if (target.roles.cache.has(role.id)) return interaction.editReply({ content: `<:OfficialX:1494713504215601223> **${target.user.tag}** already has this role.`, ephemeral: true });

            await target.roles.add(role);
            db.prepare('INSERT INTO moderation_logs (guild_id, user_id, action, reason, timestamp) VALUES (?, ?, ?, ?, ?)').run(interaction.guild.id, target.id, 'addrole', `Added role ${role.name}`, Date.now());
            await interaction.editReply({ embeds: [new EmbedBuilder().setColor(themeColor).setDescription(`<:OfficialX:1494713470065705020> Added role **${role.name}** to **${target.user.tag}**.`)] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('removerole')
            .setDescription('Remove a role from a member')
            .setDMPermission(false)
            .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageRoles)
            .addUserOption(option => option.setName('target').setDescription('The member to remove role from').setRequired(true))
            .addRoleOption(option => option.setName('role').setDescription('The role to remove').setRequired(true)),
        async execute(interaction) {
            const target = interaction.options.getMember('target');
            const role = interaction.options.getRole('role');

            if (!target) return interaction.editReply({ content: '<:OfficialX:1494713504215601223> Target not found.', ephemeral: true });
            if (!role.editable) return interaction.editReply({ content: '<:OfficialX:1494713504215601223> I cannot remove this role (Role hierarchy).', ephemeral: true });
            if (!target.roles.cache.has(role.id)) return interaction.editReply({ content: `<:OfficialX:1494713504215601223> **${target.user.tag}** doesn't have this role.`, ephemeral: true });

            await target.roles.remove(role);
            db.prepare('INSERT INTO moderation_logs (guild_id, user_id, action, reason, timestamp) VALUES (?, ?, ?, ?, ?)').run(interaction.guild.id, target.id, 'removerole', `Removed role ${role.name}`, Date.now());
            await interaction.editReply({ embeds: [new EmbedBuilder().setColor(themeColor).setDescription(`<:OfficialX:1494713470065705020> Removed role **${role.name}** from **${target.user.tag}**.`)] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('purgeuser')
            .setDescription('Delete all messages from a specific user in the current channel')
            .setDMPermission(false)
            .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages)
            .addUserOption(option => option.setName('target').setDescription('The user whose messages to delete').setRequired(true))
            .addIntegerOption(option => option.setName('limit').setDescription('Search limit (1-100, default 100)').setMinValue(1).setMaxValue(100)),
        async execute(interaction) {
            const target = interaction.options.getUser('target');
            const limit = interaction.options.getInteger('limit') || 100;

            try {
                const messages = await interaction.channel.messages.fetch({ limit: limit });
                const userMessages = messages.filter(m => m.author.id === target.id);
                
                if (userMessages.size === 0) {
                    return interaction.editReply({ content: `<:OfficialX:1494714913543684149> No messages found from **${target.tag}** in the last ${limit} messages.`, ephemeral: true });
                }

                const deleted = await interaction.channel.bulkDelete(userMessages, true);
                db.prepare('INSERT INTO moderation_logs (guild_id, user_id, action, reason, timestamp) VALUES (?, ?, ?, ?, ?)').run(interaction.guild.id, target.id, 'purgeuser', `Deleted ${deleted.size} messages`, Date.now());
                
                const replyEmbed = new EmbedBuilder()
                    .setColor(themeColor)
                    .setDescription(`<:OfficialX:1494713470065705020> Deleted **${deleted.size}** messages from **${target.tag}**.`)
                    .setFooter({ text: deleted.size < userMessages.size ? 'Note: Some messages were too old to delete.' : null });

                const replyMsg = await interaction.editReply({ embeds: [replyEmbed], fetchReply: true });
                setTimeout(() => replyMsg.delete().catch(() => null), 5000);
            } catch (error) {
                console.error('PurgeUser error:', error);
                await interaction.editReply({ content: '<:OfficialX:1494713504215601223> Failed to purge user messages. Ensure I have the `Manage Messages` permission.', ephemeral: true });
            }
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('hide')
            .setDescription('Hide a channel from @everyone')
            .setDMPermission(false)
            .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels)
            .addChannelOption(option => option.setName('channel').setDescription('Channel to hide').addChannelTypes(ChannelType.GuildText)),
        async execute(interaction) {
            const channel = interaction.options.getChannel('channel') || interaction.channel;
            await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { ViewChannel: false });
            await interaction.editReply({ embeds: [new EmbedBuilder().setColor(themeColor).setDescription(`<:OfficialX:1494713504215601223> ${channel} has been hidden.`)] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('unhide')
            .setDescription('Unhide a channel for @everyone')
            .setDMPermission(false)
            .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels)
            .addChannelOption(option => option.setName('channel').setDescription('Channel to unhide').addChannelTypes(ChannelType.GuildText)),
        async execute(interaction) {
            const channel = interaction.options.getChannel('channel') || interaction.channel;
            await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { ViewChannel: true });
            await interaction.editReply({ embeds: [new EmbedBuilder().setColor(themeColor).setDescription(`<:OfficialX:1494713470065705020> ${channel} is now visible.`)] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('lockall')
            .setDescription('Lock all channels in the server')
            .setDMPermission(false)
            .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
        async execute(interaction) {
            const channels = interaction.guild.channels.cache.filter(c => c.type === ChannelType.GuildText);
            let count = 0;
            for (const [id, channel] of channels) {
                try {
                    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false });
                    count++;
                } catch (e) {}
            }
            await interaction.editReply({ embeds: [new EmbedBuilder().setColor(themeColor).setDescription(`<:OfficialX:1494713504215601223> Locked **${count}** channels.`)] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('unlockall')
            .setDescription('Unlock all channels in the server')
            .setDMPermission(false)
            .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
        async execute(interaction) {
            const channels = interaction.guild.channels.cache.filter(c => c.type === ChannelType.GuildText);
            let count = 0;
            for (const [id, channel] of channels) {
                try {
                    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: true });
                    count++;
                } catch (e) {}
            }
            await interaction.editReply({ embeds: [new EmbedBuilder().setColor(themeColor).setDescription(`<:OfficialX:1494713470065705020> Unlocked **${count}** channels.`)] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('steal')
            .setDescription('Steal an emoji from another server')
            .setDMPermission(false)
            .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageEmojisAndStickers)
            .addStringOption(option => option.setName('emoji').setDescription('Emoji to steal (emoji or ID)').setRequired(true))
            .addStringOption(option => option.setName('name').setDescription('Name for the emoji').setRequired(true)),
        async execute(interaction) {
            let emoji = interaction.options.getString('emoji');
            const name = interaction.options.getString('name');

            if (emoji.startsWith('<') && emoji.endsWith('>')) {
                const id = emoji.split(':').pop().replace('>', '');
                const animated = emoji.startsWith('<a:');
                emoji = `https://cdn.discordapp.com/emojis/${id}.${animated ? 'gif' : 'png'}`;
            }

            try {
                const created = await interaction.guild.emojis.create({ attachment: emoji, name: name });
                await interaction.editReply({ embeds: [new EmbedBuilder().setColor(themeColor).setDescription(`<:OfficialX:1494713470065705020> Successfully created emoji ${created} as **${name}**.`)] });
            } catch (e) {
                await interaction.editReply({ content: '<:OfficialX:1494713504215601223> Failed to steal emoji. Ensure the link is valid and I have permissions.' });
            }
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('nickname')
            .setDescription('Change a members nickname')
            .setDMPermission(false)
            .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageNicknames)
            .addUserOption(option => option.setName('target').setDescription('The member').setRequired(true))
            .addStringOption(option => option.setName('nick').setDescription('New nickname (empty to reset)')),
        async execute(interaction) {
            const target = interaction.options.getMember('target');
            const nick = interaction.options.getString('nick') || null;

            if (!target.manageable) return interaction.editReply({ content: '<:OfficialX:1494713504215601223> I cannot change this users nickname.' });

            await target.setNickname(nick);
            await interaction.editReply({ embeds: [new EmbedBuilder().setColor(themeColor).setDescription(`<:OfficialX:1494713470065705020> Nickname ${nick ? `set to **${nick}**` : 'reset'} for **${target.user.tag}**.`)] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('rrole')
            .setDescription('Remove a role from everyone who has it')
            .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
            .addRoleOption(opt => opt.setName('role').setDescription('The role to remove').setRequired(true)),
        async execute(interaction) {
            const role = interaction.options.getRole('role');
            if (!role.editable) return interaction.editReply({ content: '<:OfficialX:1494713504215601223> I cannot manage this role.' });

            await interaction.editReply({ content: `<:OfficialX:1494714913543684149> Starting mass role removal for ${role}...` });
            const members = await interaction.guild.members.fetch();
            let count = 0;

            for (const [id, member] of members) {
                if (member.roles.cache.has(role.id)) {
                    try {
                        await member.roles.remove(role);
                        count++;
                    } catch (e) {}
                }
            }
            await interaction.editReply({ content: null, embeds: [new EmbedBuilder().setColor(themeColor).setDescription(`<:OfficialX:1494713470065705020> Successfully removed ${role} from **${count}** members.`)] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('purgebots')
            .setDescription('Kick all bots from the server')
            .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
        async execute(interaction) {
            await interaction.editReply({ content: '<:OfficialX:1494714913543684149> Expelling all bots... (excluding myself)' });
            const members = await interaction.guild.members.fetch();
            let count = 0;

            for (const [id, member] of members) {
                if (member.user.bot && member.id !== interaction.client.user.id) {
                    try {
                        await member.kick('Purge Bots Command');
                        count++;
                    } catch (e) {}
                }
            }
            await interaction.editReply({ content: null, embeds: [new EmbedBuilder().setColor(themeColor).setDescription(`<:OfficialX:1494713470065705020> Successfully kicked **${count}** bots.`)] });
        }
    }
];
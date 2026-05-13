const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const db = require('../database/mongodb');

const themeColor = 0x0b0b0b;

module.exports = [
    {
        data: new SlashCommandBuilder()
            .setName('logging')
            .setDescription('Configure the logging system')
            .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
            .addSubcommand(sub => sub.setName('status').setDescription('Check current logging status'))
            .addSubcommand(sub => sub.setName('enable').setDescription('Enable logging in a channel').addChannelOption(opt => opt.setName('channel').setDescription('The channel').setRequired(true)))
            .addSubcommand(sub => sub.setName('disable').setDescription('Disable logging'))
            .addSubcommand(sub => sub.setName('setup').setDescription('Advanced logging configuration')),
        async execute(interaction) {
            const sub = interaction.options.getSubcommand();
            const guildId = interaction.guild.id;

            if (sub === 'status') {
                const config = db.prepare('SELECT * FROM server_config WHERE guild_id = ?').get(guildId);
                const embed = new EmbedBuilder()
                    .setColor(themeColor)
                    .setTitle('Logging Status')
                    .setDescription(`**Channel:** ${config.log_channel ? `<#${config.log_channel}>` : 'Not Set'}\n**Status:** ${config.log_channel ? '<:OfficialX:1494713470065705020> Enabled' : '<:OfficialX:1494713504215601223> Disabled'}`);
                return interaction.editReply({ embeds: [embed] });
            }

            if (sub === 'enable') {
                const channel = interaction.options.getChannel('channel');
                db.prepare('UPDATE server_config SET log_channel = ? WHERE guild_id = ?').run(channel.id, guildId);
                return interaction.editReply({ embeds: [new EmbedBuilder().setColor(themeColor).setDescription(`<:OfficialX:1494713470065705020> **Logging** enabled in ${channel}.`)] });
            }

            if (sub === 'disable') {
                db.prepare('UPDATE server_config SET log_channel = NULL WHERE guild_id = ?').run(guildId);
                return interaction.editReply({ embeds: [new EmbedBuilder().setColor(themeColor).setDescription('<:OfficialX:1494713470065705020> **Logging** disabled.')] });
            }

            if (sub === 'setup') {
                const embed = new EmbedBuilder()
                    .setColor(themeColor)
                    .setTitle('Advanced Logging Setup')
                    .setDescription('Select the event groups you want to log. (Coming Soon: Granular per-event toggles)');
                
                const select = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('log_setup_select')
                        .setPlaceholder('Select event groups')
                        .setMinValues(1)
                        .setMaxValues(3)
                        .addOptions([
                            { label: 'Security (Anti-Nuke/Raid)', value: 'log_security', description: 'Log all security-related incidents' },
                            { label: 'Moderation', value: 'log_mod', description: 'Log bans, kicks, timeouts' },
                            { label: 'Server Updates', value: 'log_server', description: 'Log channel/role changes' }
                        ])
                );

                return interaction.editReply({ embeds: [embed], components: [select] });
            }
        }
    }
];

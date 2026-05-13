const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder } = require('discord.js');
const db = require('../database/mongodb');

const themeColor = 0x0b0b0b;

module.exports = [
    {
        data: new SlashCommandBuilder()
            .setName('antiraid')
            .setDescription('Configure Anti-Raid protection')
            .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
            .addSubcommand(sub => sub.setName('enable').setDescription('Enable Anti-Raid prevention'))
            .addSubcommand(sub => sub.setName('disable').setDescription('Disable Anti-Raid prevention'))
            .addSubcommand(sub => sub.setName('status').setDescription('View Anti-Raid status')),
        async execute(interaction) {
            const sub = interaction.options.getSubcommand();
            const guildId = interaction.guild.id;

            if (sub === 'enable') {
                db.prepare('UPDATE server_config SET raid_prevention = 1 WHERE guild_id = ?').run(guildId);
                return interaction.editReply({ embeds: [new EmbedBuilder().setColor(themeColor).setDescription('<:OfficialX:1494713470065705020> **Anti-Raid** protection is now **Enabled**.')] });
            }

            if (sub === 'disable') {
                db.prepare('UPDATE server_config SET raid_prevention = 0 WHERE guild_id = ?').run(guildId);
                return interaction.editReply({ embeds: [new EmbedBuilder().setColor(themeColor).setDescription('<:OfficialX:1494713504215601223> **Anti-Raid** protection is now **Disabled**.')] });
            }

            if (sub === 'status') {
                const config = db.prepare('SELECT raid_prevention FROM server_config WHERE guild_id = ?').get(guildId);
                return interaction.editReply({ embeds: [new EmbedBuilder().setColor(themeColor).setTitle('Anti-Raid Status').setDescription(`**Status:** ${config.raid_prevention ? '<:OfficialX:1494713470065705020> Enabled' : '<:OfficialX:1494713504215601223> Disabled'}`)] });
            }
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('arsetup')
            .setDescription('Quickly setup Anti-Raid protection')
            .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
        async execute(interaction) {
            db.prepare('UPDATE server_config SET raid_prevention = 1, anti_alt = 1, anti_alt_days = 7 WHERE guild_id = ?').run(interaction.guild.id);
            const embed = new EmbedBuilder()
                .setColor(themeColor)
                .setTitle('Anti-Raid Setup Complete')
                .setDescription('<:OfficialX:1494713470065705020> Anti-Raid has been configured with optimal settings:\n\n<:dx:1494729984130945094> **Raid Prevention:** Enabled\n<:dx:1494729984130945094> **Anti-Alt:** Enabled (7 Days)\n<:dx:1494729984130945094> **Logging:** Active');
            return interaction.editReply({ embeds: [embed] });
        }
    }
];

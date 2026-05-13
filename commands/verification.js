const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../database/mongodb');

const themeColor = 0x0b0b0b;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('verification')
        .setDescription('Configure the server verification system')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub => sub.setName('setup')
            .setDescription('Create role, channel & setup verification')
            .addChannelOption(opt => opt.setName('channel').setDescription('Channel for verification').setRequired(true))
            .addRoleOption(opt => opt.setName('role').setDescription('Role to give').setRequired(true))
        )
        .addSubcommand(sub => sub.setName('disable').setDescription('Remove verification system'))
        .addSubcommand(sub => sub.setName('status').setDescription('View current configuration')),
    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        if (sub === 'setup') {
            const channel = interaction.options.getChannel('channel');
            const role = interaction.options.getRole('role');
            db.prepare('INSERT OR IGNORE INTO server_config (guild_id) VALUES (?)').run(guildId);
            db.prepare('UPDATE server_config SET verification_channel = ?, verification_role = ? WHERE guild_id = ?').run(channel.id, role.id, guildId);

            const embed = new EmbedBuilder()
                .setColor(themeColor)
                .setAuthor({ name: 'Verification System Setup' })
                .setDescription(`Verify your identity to gain access to the server.\n\nClick the button below to verify!`)
                .setFooter({ text: 'OfficialX Verify System', iconURL: interaction.client.user.displayAvatarURL() });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('verify_user')
                    .setLabel('Verify Me')
                    .setStyle(ButtonStyle.Success)
            );

            await channel.send({ embeds: [embed], components: [row] });
            return interaction.editReply({ content: `<:OfficialX:1494713470065705020> Verification system setup in ${channel}.` });
        }

        if (sub === 'disable') {
            db.prepare('UPDATE server_config SET verification_channel = NULL, verification_role = NULL WHERE guild_id = ?').run(guildId);
            return interaction.editReply({ content: '<:OfficialX:1494713470065705020> Verification system disabled.' });
        }

        if (sub === 'status') {
            const config = db.prepare('SELECT * FROM server_config WHERE guild_id = ?').get(guildId);
            const embed = new EmbedBuilder()
                .setColor(themeColor)
                .setTitle('Verification Status')
                .setDescription(`**Channel:** ${config.verification_channel ? `<#${config.verification_channel}>` : 'Not Set'}\n**Role:** ${config.verification_role ? `<@&${config.verification_role}>` : 'Not Set'}`);
            return interaction.editReply({ embeds: [embed] });
        }
    }
};

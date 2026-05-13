const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder, ChannelType } = require('discord.js');
const db = require('../database/mongodb');
const { ok, err, canManageSettings } = require('../utils/helpers');

const themeColor = 0x0b0b0b;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin')
        .setDescription('Admin configuration and setup')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .setDMPermission(false)
        .addSubcommand(sub => sub.setName('setprefix').setDescription('Change server prefix').addStringOption(opt => opt.setName('prefix').setDescription('New prefix').setRequired(true)))
        .addSubcommand(sub => sub.setName('antilink').setDescription('Toggle anti-link protection').addStringOption(opt => opt.setName('state').setDescription('Enable/Disable').setRequired(true).addChoices({ name: 'Enable', value: 'on' }, { name: 'Disable', value: 'off' })))
        .addSubcommand(sub => sub.setName('setup').setDescription('Auto-configure essential bot features'))
        .addSubcommand(sub => sub.setName('config').setDescription('View current server configuration')),

    async execute(interaction) {
        if (!canManageSettings(interaction.member)) {
            return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription('This command can only be used by the **Server Owner**.')] });
        }

        const subcommand = interaction.options.getSubcommand();

        try {
            switch (subcommand) {
                case 'setprefix': {
                    const newPrefix = interaction.options.getString('prefix');
                    if (newPrefix.length > 5) return interaction.editReply({ content: 'Prefix must be less than 5 characters.' });
                    db.prepare('UPDATE server_config SET prefix = ? WHERE guild_id = ?').run(newPrefix, interaction.guild.id);
                    return interaction.editReply({ embeds: [new EmbedBuilder().setColor(themeColor).setDescription(`<:OfficialX:1494713470065705020> Prefix updated to \`${newPrefix}\``)] });
                }

                case 'antilink': {
                    const state = interaction.options.getString('state') === 'on' ? 1 : 0;
                    db.prepare('UPDATE server_config SET antilink = ? WHERE guild_id = ?').run(state, interaction.guild.id);
                    return interaction.editReply({ embeds: [new EmbedBuilder().setColor(themeColor).setDescription(`<:OfficialX:1494713470065705020> Anti-Link is now **${state ? 'Enabled' : 'Disabled'}**`)] });
                }

                case 'setup': {
                    await interaction.editReply({ content: '<:OfficialX:1494714913543684149> Auto-configuring server...' });

                    let logChannel = interaction.guild.channels.cache.find(c => c.name === 'officialx-logs');
                    if (!logChannel) {
                        logChannel = await interaction.guild.channels.create({
                            name: 'officialx-logs',
                            type: ChannelType.GuildText,
                            permissionOverwrites: [{ id: interaction.guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] }]
                        });
                    }
                    db.prepare('UPDATE server_config SET log_channel = ? WHERE guild_id = ?').run(logChannel.id, interaction.guild.id);

                    let muteRole = interaction.guild.roles.cache.find(r => r.name === 'Muted');
                    if (!muteRole) {
                        muteRole = await interaction.guild.roles.create({ name: 'Muted', color: '#818386', reason: 'OfficialX Setup' });
                        for (const [id, channel] of interaction.guild.channels.cache) {
                            if (channel.type === ChannelType.GuildText) {
                                await channel.permissionOverwrites.edit(muteRole, { SendMessages: false }).catch(() => null);
                            }
                        }
                    }

                    return interaction.editReply({ embeds: [new EmbedBuilder().setColor(themeColor).setDescription(`<:OfficialX:1494713470065705020> **Server Setup Complete!**\n\n<:dx:1494729984130945094> Log Channel: ${logChannel}\n<:dx:1494729984130945094> Mute Role: ${muteRole}\n<:dx:1494729984130945094> All modules initialized.`)] });
                }

                case 'config': {
                    const config = db.prepare('SELECT * FROM server_config WHERE guild_id = ?').get(interaction.guild.id);
                    const embed = new EmbedBuilder()
                        .setColor(themeColor)
                        .setTitle(`Server Configuration | ${interaction.guild.name}`)
                        .setThumbnail(interaction.guild.iconURL())
                        .addFields(
                            { name: 'Prefix', value: `\`${config.prefix || ','}\``, inline: true },
                            { name: 'Anti-Link', value: config.antilink ? 'Enabled' : 'Disabled', inline: true },
                            { name: 'Anti-Nuke', value: config.anti_nuker ? 'Enabled' : 'Disabled', inline: true },
                            { name: 'Anti-Alt', value: config.anti_alt ? `Enabled (${config.anti_alt_days}d)` : 'Disabled', inline: true },
                            { name: 'Log Channel', value: config.log_channel ? `<#${config.log_channel}>` : 'None', inline: true },
                            { name: 'Verification', value: config.verification_channel ? 'Enabled' : 'Disabled', inline: true }
                        )
                        .setTimestamp();
                    return interaction.editReply({ embeds: [embed] });
                }
            }
        } catch (error) {
            console.error('[Admin Command Error]', error);
            return interaction.editReply({ content: 'An error occurred while processing the admin command.' });
        }
    }
};

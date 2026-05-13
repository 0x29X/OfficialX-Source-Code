const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../database/mongodb');

const themeColor = 0x0b0b0b;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('owner')
    .setDescription('Server owner management commands.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcmd =>
      subcmd.setName('status')
        .setDescription('Check server health and current configuration modes')
    ),
  async execute(interaction) {
    const subCommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (interaction.user.id !== interaction.guild.ownerId) {
      const embed = new EmbedBuilder()
        .setColor(themeColor)
        .setAuthor({ name: 'OfficialX Security' })
        .setDescription(`**Server:** / ${interaction.guild.name}\n**Action:** Acess Denied\n**Details:** Only the server owner has access!`)
        .setFooter({ text: 'OfficialX Anti-Nuke System', iconURL: interaction.client.user.displayAvatarURL() })
        .setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    if (subCommand === 'status') {
      const config = db.prepare('SELECT * FROM server_config WHERE guild_id = ?').get(guildId);
      if (!config) {
        return interaction.editReply({ content: 'No configuration found.' });
      }

      const embed = new EmbedBuilder()
        .setColor(themeColor)
        .setAuthor({ name: 'OfficialX Protection Status' })
        .setThumbnail(interaction.guild.iconURL() || interaction.client.user.displayAvatarURL())
        .setDescription(`**Server:** / ${interaction.guild.name}\n**Action:** Health Check\n**Details:** Viewing real-time defenses`)
        .addFields(
          { name: '<:modx:1494732451451371703> Active Modules', value: `<:dx:1494729984130945094> **Anti-Nuker:** ${config.anti_nuker ? '<:OfficialX:1494713470065705020>' : '<:OfficialX:1494713504215601223>'}\n<:dx:1494729984130945094> **Anti-Selfbot:** ${config.anti_selfbot ? '<:OfficialX:1494713470065705020>' : '<:OfficialX:1494713504215601223>'}\n<:dx:1494729984130945094> **Anti-Raid:** ${config.raid_prevention ? '<:OfficialX:1494713470065705020>' : '<:OfficialX:1494713504215601223>'}`, inline: true },
          { name: '<:dmx:1494731801397035119> Core Configurations', value: `<:dx:1494729984130945094> **Punishment:** \`${(config.punishment_type || 'ban').toUpperCase()}\`\n<:dx:1494729984130945094> **Logs:** ${config.log_channel ? `<#${config.log_channel}>` : '**None**'}`, inline: true }
        )
        .setFooter({ text: 'OfficialX Anti-Nuke System', iconURL: interaction.client.user.displayAvatarURL() })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    }
  }
};

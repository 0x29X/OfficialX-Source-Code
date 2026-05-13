const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder } = require('discord.js');
const db = require('../database/mongodb');

const execute = async (interaction) => {
    const state = interaction.options.getString('state');
    const isOn = state === 'on' ? 1 : 0;
    
    db.prepare('INSERT OR IGNORE INTO server_config (guild_id) VALUES (?)').run(interaction.guild.id);
    db.prepare('UPDATE server_config SET auto_restore = ? WHERE guild_id = ?').run(isOn, interaction.guild.id);

    const embed = new EmbedBuilder()
      .setColor('#000000')
      .setDescription(`<:OfficialX:1494713470065705020> Anti-Nuke Auto-Restore is now **${isOn ? 'ON' : 'OFF'}**.`);

    await interaction.editReply({ embeds: [embed] });
};

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName('ars')
      .setDescription('Toggle auto-restore for deleted channels/roles')
      .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
      .addStringOption(option =>
        option.setName('state')
          .setDescription('Turn auto-restore ON or OFF')
          .setRequired(true)
          .addChoices(
            { name: 'On', value: 'on' },
            { name: 'Off', value: 'off' }
          )
      ),
    execute
  },
  {
    data: new SlashCommandBuilder()
      .setName('autorestore')
      .setDescription('Toggle auto-restore for deleted channels/roles')
      .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
      .addStringOption(option =>
        option.setName('state')
          .setDescription('Turn auto-restore ON or OFF')
          .setRequired(true)
          .addChoices(
            { name: 'On', value: 'on' },
            { name: 'Off', value: 'off' }
          )
      ),
    execute
  }
];

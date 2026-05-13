const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder } = require('discord.js');
const db = require('../database/mongodb');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('allow')
    .setDescription('Grant specific Anti-Nuke bypasses to users or roles')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
    .setDMPermission(false)
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Allow a user or role to perform an action')
        .addStringOption(option =>
          option.setName('action')
            .setDescription('The action to allow')
            .setRequired(true)
            .addChoices(
              { name: 'Ban', value: 'ban' },
              { name: 'Kick', value: 'kick' },
              { name: 'Channel Create', value: 'channel_create' },
              { name: 'Channel Delete', value: 'channel_delete' },
              { name: 'Role Create', value: 'role_create' },
              { name: 'Role Delete', value: 'role_delete' },
              { name: 'Webhook', value: 'webhook' },
              { name: 'Guild Update', value: 'guild_update' },
              { name: 'Role Update', value: 'role_update' }
            )
        )
        .addUserOption(option => option.setName('user').setDescription('The user to allow'))
        .addRoleOption(option => option.setName('role').setDescription('The role to allow'))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove an allowance')
        .addStringOption(option => option.setName('action').setDescription('The action').setRequired(true))
        .addUserOption(option => option.setName('user').setDescription('The user'))
        .addRoleOption(option => option.setName('role').setDescription('The role'))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('show')
        .setDescription('List all allowances')
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const themeColor = 0x0b0b0b;

    if (interaction.user.id !== interaction.guild.ownerId) {
      return interaction.editReply({ content: '<:OfficialX:1494713504215601223> Only the **Server Owner** can manage allowances.' }).catch(() => null);
    }

    const actionMap = {
      'ban': 'member_ban_add',
      'kick': 'member_kick',
      'channel_create': 'channel_create',
      'channel_delete': 'channel_delete',
      'role_create': 'role_create',
      'role_delete': 'role_delete',
      'webhook': 'webhook_create',
      'guild_update': 'guild_update',
      'role_update': 'member_role_update'
    };

    if (subcommand === 'add') {
      const user = interaction.options.getUser('user');
      const role = interaction.options.getRole('role');
      const target = user || role;

      if (!target) return interaction.editReply({ content: 'Please provide a user or role.' }).catch(() => null);

      const actionInput = interaction.options.getString('action');
      const action = actionMap[actionInput] || actionInput;

      db.prepare('INSERT OR IGNORE INTO allowances (guild_id, target_id, action) VALUES (?, ?, ?)').run(interaction.guild.id, target.id, action);

      const embed = new EmbedBuilder()
        .setColor(themeColor)
        .setDescription(`<:OfficialX:1494713470065705020> Allowed **${target.username || target.name}** to perform **${action}**.`);

      await interaction.editReply({ embeds: [embed] }).catch(() => null);
    }
    else if (subcommand === 'remove') {
      const user = interaction.options.getUser('user');
      const role = interaction.options.getRole('role');
      const target = user || role;
      if (!target) return interaction.editReply({ content: 'Please provide a user or role.' }).catch(() => null);

      const actionInput = interaction.options.getString('action');
      const action = actionMap[actionInput] || actionInput;

      db.prepare('DELETE FROM allowances WHERE guild_id = ? AND target_id = ? AND action = ?').run(interaction.guild.id, target.id, action);

      const embed = new EmbedBuilder()
        .setColor(themeColor)
        .setDescription(`<:OfficialX:1494713504215601223> Removed allowance for **${action}** from **${target.username || target.name}**.`);

      await interaction.editReply({ embeds: [embed] }).catch(() => null);
    }
    else if (subcommand === 'show') {
      const allowances = db.prepare('SELECT target_id, action FROM allowances WHERE guild_id = ?').all(interaction.guild.id);

      if (!allowances.length) {
        return interaction.editReply({ content: 'No allowances found.' }).catch(() => null);
      }

      let text = '';
      for (const row of allowances) {
        text += `<:dx:1494729984130945094> <@${row.target_id}> — \`${row.action}\`\n`;
      }

      const embed = new EmbedBuilder()
        .setColor(themeColor)
        .setTitle('Current Allowances')
        .setDescription(text);

      await interaction.editReply({ embeds: [embed] }).catch(() => null);
    }
  }
};

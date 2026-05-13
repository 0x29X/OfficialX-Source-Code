const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder, ChannelType } = require('discord.js');
const db = require('../database/mongodb');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('antinuke')
    .setDescription('Configure Anti-Nuke settings for the server')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
    .setDMPermission(false)
    .addSubcommand(subcommand =>
      subcommand
        .setName('toggle')
        .setDescription('Enable or disable Anti-Nuke protection')
        .addStringOption(option =>
          option.setName('state')
            .setDescription('Turn Anti-Nuke ON or OFF')
            .setRequired(true)
            .addChoices(
              { name: 'On', value: 'on' },
              { name: 'Off', value: 'off' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('restore')
        .setDescription('Toggle auto-restore for deleted channels/roles')
        .addStringOption(option =>
          option.setName('state')
            .setDescription('Turn auto-restore ON or OFF')
            .setRequired(true)
            .addChoices(
              { name: 'On', value: 'on' },
              { name: 'Off', value: 'off' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('punishment')
        .setDescription('Set the punishment for unauthorized actions')
        .addStringOption(option =>
          option.setName('type')
            .setDescription('Type of punishment')
            .setRequired(true)
            .addChoices(
              { name: 'Ban', value: 'ban' },
              { name: 'Kick', value: 'kick' },
              { name: 'Strip Roles', value: 'strip' },
              { name: 'Timeout (24h)', value: 'timeout' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('log')
        .setDescription('Set the channel for Anti-Nuke alerts')
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('The channel to send alerts')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('setup')
        .setDescription('Auto-setup the anti-nuke system (creates log channel & enables)')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('View the currents security dashboard and status')
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const themeColor = '#000000';

    db.prepare('INSERT OR IGNORE INTO server_config (guild_id) VALUES (?)').run(interaction.guild.id);

    if (subcommand === 'toggle') {
      const state = interaction.options.getString('state');
      const isOn = state === 'on' ? 1 : 0;

      db.prepare('UPDATE server_config SET anti_nuker = ? WHERE guild_id = ?').run(isOn, interaction.guild.id);

      const config = db.prepare('SELECT anti_selfbot, raid_prevention, punishment_type FROM server_config WHERE guild_id = ?').get(interaction.guild.id) || {};
      const protectedActions = [
        'Banning', 'Kicking', 'Channel Creation', 'Channel Deletion',
        'Role Creation', 'Role Deletion', 'Webhook Creation', 'Bot Adding',
        'Channel Update', 'Role Permission Changes'
      ].map(a => `<:dx:1494729984130945094> ${a} - ${isOn ? 'Blocked' : 'Allowed'}`).join('\n');

      const desc = `Anti-Nuke: ${isOn ? '<:OfficialX:1494713470065705020>' : '<:OfficialX:1494713504215601223>'}\nAnti-Selfbot: ${config.anti_selfbot === 1 ? '<:OfficialX:1494713470065705020>' : '<:OfficialX:1494713504215601223>'}\nAnti-Raid: ${config.raid_prevention === 1 ? '<:OfficialX:1494713470065705020>' : '<:OfficialX:1494713504215601223>'}\n\n**Protected Actions:**\n${protectedActions}\n\n**Punishment:**\n<:dx:1494729984130945094> ${(config.punishment_type || 'ban').toUpperCase()}`;

      const title = isOn ? 'OfficialX Anti-Nuke Enabled' : 'OfficialX Anti-Nuke Disabled';
      const embed = new EmbedBuilder()
        .setColor(themeColor)
        .setDescription(desc)
        .setTitle(title);

      await interaction.editReply({ embeds: [embed] }).catch(() => null);
    }
    else if (subcommand === 'restore') {
      const state = interaction.options.getString('state');
      const isOn = state === 'on' ? 1 : 0;

      db.prepare('UPDATE server_config SET auto_restore = ? WHERE guild_id = ?').run(isOn, interaction.guild.id);

      const embed = new EmbedBuilder()
        .setColor(themeColor)
        .setDescription(`<:OfficialX:1494711000471965696> Anti-Nuke Auto-Restore is now **${state.toUpperCase()}**.`);

      await interaction.editReply({ embeds: [embed] }).catch(() => null);
    }
    else if (subcommand === 'punishment') {
      const type = interaction.options.getString('type');

      db.prepare('UPDATE server_config SET punishment_type = ? WHERE guild_id = ?').run(type, interaction.guild.id);

      const embed = new EmbedBuilder()
        .setColor(themeColor)
        .setDescription(`<:dwa:1494727406223888464> Anti-Nuke punishment set to **${type.toUpperCase()}**.`);

      await interaction.editReply({ embeds: [embed] }).catch(() => null);
    }
    else if (subcommand === 'log') {
      const channel = interaction.options.getChannel('channel');

      db.prepare('UPDATE server_config SET log_channel = ? WHERE guild_id = ?').run(channel.id, interaction.guild.id);

      const embed = new EmbedBuilder()
        .setColor(themeColor)
        .setDescription(`<:OfficialX:1494711000471965696> Anti-Nuke log channel set to ${channel}.`);

      await interaction.editReply({ embeds: [embed] }).catch(() => null);
    }
    else if (subcommand === 'setup' || subcommand === 'status') {
      if (subcommand === 'setup') {
        if (!interaction.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageChannels) || !interaction.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
          return interaction.editReply({ content: '<:OfficialX:1494713504215601223> I need **Manage Channels** and **Manage Roles** permissions to auto-setup.' }).catch(() => null);
        }

        try {
          let logChannel = interaction.guild.channels.cache.find(c => c.name === 'officialx-logs' || c.name === 'officialx-logs');

          if (!logChannel) {
            logChannel = await interaction.guild.channels.create({
              name: 'officialx-logs',
              type: ChannelType.GuildText,
              reason: 'OfficialX Anti-Nuke Setup',
              permissionOverwrites: [
                { id: interaction.guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: interaction.client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
              ]
            });
          }

          db.prepare('INSERT OR IGNORE INTO server_config (guild_id) VALUES (?)').run(interaction.guild.id);
          db.prepare(`UPDATE server_config SET anti_nuker = 1, anti_selfbot = 1, raid_prevention = 1, log_channel = ?, punishment_type = 'ban' WHERE guild_id = ?`).run(logChannel.id, interaction.guild.id);
        } catch (e) {
          console.error('Setup Error:', e);
        }
      }

      const config = db.prepare('SELECT anti_nuker, anti_selfbot, raid_prevention, antilink, log_channel, punishment_type FROM server_config WHERE guild_id = ?').get(interaction.guild.id) || {};

      const userWl = db.prepare('SELECT COUNT(*) as count FROM whitelists WHERE guild_id = ?').get(interaction.guild.id)?.count || 0;
      const roleWl = db.prepare('SELECT COUNT(*) as count FROM whitelist_roles WHERE guild_id = ?').get(interaction.guild.id)?.count || 0;
      const wlTotal = userWl + roleWl;

      const embed = new EmbedBuilder()
        .setColor(themeColor)
        .setAuthor({ name: `${interaction.guild.name} | Security Status`, iconURL: interaction.guild.iconURL({ dynamic: true }) })
        .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
        .setDescription(`Current protection status and security configuration for this server.`)
        .addFields(
          { name: '<:modx:1494732451451371703> Modules', value: `<:dx:1494729984130945094> **Anti-Nuke:** ${config.anti_nuker ? '<:OfficialX:1494713470065705020> `Enabled`' : '<:OfficialX:1494713504215601223> `Disabled`'}\n<:dx:1494729984130945094> **Anti-Selfbot:** ${config.anti_selfbot ? '<:OfficialX:1494713470065705020> `Enabled`' : '<:OfficialX:1494713504215601223> `Disabled`'}\n<:dx:1494729984130945094> **Anti-Raid:** ${config.raid_prevention ? '<:OfficialX:1494713470065705020> `Enabled`' : '<:OfficialX:1494713504215601223> `Disabled`'}\n<:dx:1494729984130945094> **Anti-Link:** ${config.antilink ? '<:OfficialX:1494713470065705020> `Enabled`' : '<:OfficialX:1494713504215601223> `Disabled`'}`, inline: false },
          { name: '<:dmx:1494731801397035119> Configuration', value: `<:dx:1494729984130945094> **Logs:** ${config.log_channel ? `<#${config.log_channel}>` : '`None`'}\n<:dx:1494729984130945094> **Punishment:** \`${(config.punishment_type || 'ban').toUpperCase()}\`\n<:dx:1494729984130945094> **Auto-Restore:** ${config.auto_restore !== 0 ? '<:OfficialX:1494713470065705020> `Enabled`' : '<:OfficialX:1494713504215601223> `Disabled`'}`, inline: true },
          { name: '<:OfficialX:1494712226676871220> Whitelist', value: `<:dx:1494729984130945094> **Total:** \`${wlTotal}\` users/roles\n<:dx:1494729984130945094> **Immunity:** \`Bypass Checks\``, inline: true }
        )
        .setFooter({ text: 'OfficialX Security System', iconURL: interaction.client.user.displayAvatarURL() })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] }).catch(() => null);
    }
  }
};
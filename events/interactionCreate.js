const { Events, InteractionType, EmbedBuilder, MessageFlags } = require('discord.js');
const chalk = require('chalk');
const db = require('../database/mongodb');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    const isBotOwner = interaction.user.id === process.env.BOT_OWNER_ID;
    const isServerOwner = interaction.guild && interaction.user.id === interaction.guild.ownerId;
    const isAdmin = interaction.member && interaction.member.permissions.has('Administrator');

    const publicCommands = ['avatar', 'banner', 'userinfo', 'serverinfo', 'botinfo', 'help', 'afk', 'instagram', 'tiktok', 'youtube', 'snipe'];
    const isPublic = interaction.isChatInputCommand() && publicCommands.includes(interaction.commandName);

    const publicButtons = ['help_home', 'help_all', 'verify_user'];
    const isPublicButton = interaction.isButton() && publicButtons.includes(interaction.customId);
    const isPublicMenu = interaction.isStringSelectMenu() && interaction.customId === 'help_category';

    if (interaction.guild && !client.isGuildEnabled(interaction.guild.id) && !isBotOwner && !isServerOwner && !isAdmin && !isPublic && !isPublicButton && !isPublicMenu) {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '<:OfficialX:1494713504215601223> OfficialX is not enabled in this server.', flags: MessageFlags.Ephemeral }).catch(() => null);
      }
      return;
    }

    if (interaction.isChatInputCommand()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (!command) {
        console.error(chalk.red(`No command matching ${interaction.commandName} was found.`));
        return;
      }

      try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => null);
        await command.execute(interaction);
      } catch (error) {
        console.error(chalk.red(`Error executing ${interaction.commandName}:`), error);
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral }).catch(() => null);
        } else {
          await interaction.reply({ content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral }).catch(() => null);
        }
      }
    } else if (interaction.isButton()) {
      try {
        if (interaction.customId === 'help_home') {
          const helpCmd = interaction.client.commands.get('help');
          const config = db.prepare('SELECT prefix FROM server_config WHERE guild_id = ?').get(interaction.guild.id);
          const prefix = config?.prefix || ',';
          await interaction.update({ embeds: [helpCmd.getHomeEmbed(client, prefix, interaction.guild)], components: helpCmd.getComponents() });
        } else if (interaction.customId === 'help_all') {
          const helpCmd = interaction.client.commands.get('help');
          const config = db.prepare('SELECT prefix FROM server_config WHERE guild_id = ?').get(interaction.guild.id);
          const prefix = config?.prefix || ',';
          await interaction.update({ embeds: [helpCmd.getAllCommandsEmbed(prefix, client, interaction.guild)], components: helpCmd.getComponents() });
        } else if (interaction.customId.startsWith('restore_')) {
          const { handleRestoreButton } = require('../handlers/antiNuker');
          await handleRestoreButton(interaction, client);
        } else if (interaction.customId === 'verify_user') {
          const config = db.prepare('SELECT verification_role FROM server_config WHERE guild_id = ?').get(interaction.guild.id);
          if (!config || !config.verification_role) {
            return interaction.reply({ content: 'Verification role not setup.', flags: MessageFlags.Ephemeral });
          }

          const role = interaction.guild.roles.cache.get(config.verification_role);
          if (!role) {
            return interaction.reply({ content: 'Verification role not found.', flags: MessageFlags.Ephemeral });
          }

          try {
            await interaction.member.roles.add(role);
            await interaction.reply({ content: '<a:OfficialX_Verify:1494724562867458218> **You have been verified!**', flags: MessageFlags.Ephemeral });
          } catch (error) {
            console.error('Failed to add verification role:', error);
            await interaction.reply({ content: '<:OfficialX:1494713504215601223> Failed to verify you. Make sure my role is higher than the verification role.', flags: MessageFlags.Ephemeral });
          }
        }
      } catch (error) {
        console.error(chalk.red('Error handling button interaction:'), error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'There was an error while processing this interaction!', flags: MessageFlags.Ephemeral }).catch(() => null);
        }
      }
    } else if (interaction.isStringSelectMenu()) {
      try {
        if (interaction.customId === 'help_category') {
          const category = interaction.values[0];
          const helpCmd = interaction.client.commands.get('help');
          const config = db.prepare('SELECT prefix FROM server_config WHERE guild_id = ?').get(interaction.guild.id);
          const prefix = config?.prefix || ',';
          await interaction.update({ embeds: [helpCmd.getCategoryEmbed(category, prefix, interaction.client, interaction.guild)], components: helpCmd.getComponents() });
        } else if (interaction.customId === 'log_setup_select') {
          const groups = interaction.values;
          await interaction.reply({ content: `<:OfficialX:1494713470065705020> **Logging groups updated:** ${groups.map(g => `\`${g.replace('log_', '')}\``).join(', ')}`, flags: MessageFlags.Ephemeral });
        }
      } catch (error) {
        console.error(chalk.red('Error handling select menu interaction:'), error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'There was an error while processing this interaction!', flags: MessageFlags.Ephemeral }).catch(() => null);
        }
      }
    }
  }
};

const { EmbedBuilder, AutoModerationRuleTriggerType, AutoModerationRuleEventType, AutoModerationActionType, SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const db = require('../database/mongodb');

module.exports = {
  name: 'automod',
  aliases: ['am'],
  data: new SlashCommandBuilder()
    .setName('automod')
    .setDescription('Setup OfficialX Ultra AutoMod system.')
    .addSubcommand(sub => sub.setName('setup').setDescription('Setup all automod rules at once')),
  
  async execute(input, args, client) {
    const message = input;
    const bot = client || input.client;
    
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply('<:OfficialX:1494713504215601223> You need **Administrator** permission to setup AutoMod.');
    }

    const subCommand = args?.[0] || 'help';
    if (subCommand === 'setup') {
      const msg = await message.reply('<a:officialx_loading:1500889778000756919> Initializing **OfficialX AutoMod** setup...');

      try {
        await message.guild.autoModerationRules.create({
          name: 'OfficialX: Anti-Mention Spam',
          enabled: true,
          eventType: AutoModerationRuleEventType.MessageSend,
          triggerType: AutoModerationRuleTriggerType.MentionSpam,
          triggerMetadata: { mentionTotalLimit: 5 },
          actions: [{ type: AutoModerationActionType.BlockMessage }]
        }).catch(() => { });

        await message.guild.autoModerationRules.create({
          name: 'OfficialX: Anti-Spam',
          enabled: true,
          eventType: AutoModerationRuleEventType.MessageSend,
          triggerType: AutoModerationRuleTriggerType.Spam,
          actions: [
            { type: AutoModerationActionType.BlockMessage },
            { type: AutoModerationActionType.Timeout, metadata: { durationSeconds: 60 } }
          ]
        }).catch(() => { });

        await message.guild.autoModerationRules.create({
          name: 'OfficialX: Anti-Link',
          enabled: true,
          eventType: AutoModerationRuleEventType.MessageSend,
          triggerType: AutoModerationRuleTriggerType.Keyword,
          triggerMetadata: {
            keywordFilter: [
              'http://*', 'https://*', 'discord.gg/*', 'discord.com/invite/*',
              'discord.me/*', 'dsc.gg/*', '*.com/*', '*.net/*', '*.org/*',
              '*.gg/*', '*.link/*'
            ]
          },
          actions: [
            { type: AutoModerationActionType.BlockMessage },
            { type: AutoModerationActionType.Timeout, metadata: { durationSeconds: 60 } }
          ]
        }).catch(() => { });

        await message.guild.autoModerationRules.create({
          name: 'OfficialX: Anti-NSFW & Toxicity',
          enabled: true,
          eventType: AutoModerationRuleEventType.MessageSend,
          triggerType: AutoModerationRuleTriggerType.KeywordPreset,
          triggerMetadata: { presets: [1, 2, 3] },
          actions: [{ type: AutoModerationActionType.BlockMessage }]
        }).catch(() => { });

        const embed = new EmbedBuilder()
          .setColor('#000000')
          .setAuthor({ name: 'OfficialX AutoMod Activated', iconURL: bot.user.displayAvatarURL() })
          .setDescription('<:botx:1499124211090722996> **AutoMod system has been successfully upgraded.**')
          .addFields(
            { name: 'Rules Created', value: '`Anti-Link`\n`Anti-Spam`\n`Anti-NSFW`\n`Anti-Toxicity`', inline: true },
            { name: 'Punishment', value: '`Block` + `1m Timeout`', inline: true }
          )
          .setFooter({ text: 'OfficialX Security' })
          .setTimestamp();

        return msg.edit({ content: null, embeds: [embed] });
      } catch (error) {
        return msg.edit(`<:OfficialX:1494713504215601223> Error setting up AutoMod: ${error.message}`);
      }
    } else {
      const config = db.prepare('SELECT prefix FROM server_config WHERE guild_id = ?').get(message.guild.id);
      const prefix = config?.prefix || ',';
      return message.reply(`<:OfficialX:1494713504215601223> Usage: \`${prefix}automod setup\``);
    }
  },

  async interactionExecute(interaction, client) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: '<:OfficialX:1494713504215601223> You need **Administrator** permission to setup AutoMod.', ephemeral: true });
    }

    const subCommand = interaction.options.getSubcommand();
    if (subCommand === 'setup') {
      await interaction.deferReply();
      try {
        await interaction.guild.autoModerationRules.create({
          name: 'OfficialX: Anti-Mention Spam',
          enabled: true,
          eventType: AutoModerationRuleEventType.MessageSend,
          triggerType: AutoModerationRuleTriggerType.MentionSpam,
          triggerMetadata: { mentionTotalLimit: 5 },
          actions: [{ type: AutoModerationActionType.BlockMessage }]
        }).catch(() => { });

        await interaction.guild.autoModerationRules.create({
          name: 'OfficialX: Anti-Spam',
          enabled: true,
          eventType: AutoModerationRuleEventType.MessageSend,
          triggerType: AutoModerationRuleTriggerType.Spam,
          actions: [
            { type: AutoModerationActionType.BlockMessage },
            { type: AutoModerationActionType.Timeout, metadata: { durationSeconds: 60 } }
          ]
        }).catch(() => { });

        await interaction.guild.autoModerationRules.create({
          name: 'OfficialX: Anti-Link',
          enabled: true,
          eventType: AutoModerationRuleEventType.MessageSend,
          triggerType: AutoModerationRuleTriggerType.Keyword,
          triggerMetadata: {
            keywordFilter: [
              'http://*', 'https://*', 'discord.gg/*', 'discord.com/invite/*',
              'discord.me/*', 'dsc.gg/*', '*.com/*', '*.net/*', '*.org/*',
              '*.gg/*', '*.link/*'
            ]
          },
          actions: [
            { type: AutoModerationActionType.BlockMessage },
            { type: AutoModerationActionType.Timeout, metadata: { durationSeconds: 60 } }
          ]
        }).catch(() => { });

        await interaction.guild.autoModerationRules.create({
          name: 'OfficialX: Anti-NSFW & Toxicity',
          enabled: true,
          eventType: AutoModerationRuleEventType.MessageSend,
          triggerType: AutoModerationRuleTriggerType.KeywordPreset,
          triggerMetadata: { presets: [1, 2, 3] },
          actions: [{ type: AutoModerationActionType.BlockMessage }]
        }).catch(() => { });

        const embed = new EmbedBuilder()
          .setColor('#000000')
          .setAuthor({ name: 'OfficialX AutoMod Activated', iconURL: client.user.displayAvatarURL() })
          .setDescription('<:botx:1499124211090722996> **AutoMod system has been successfully upgraded.**')
          .addFields(
            { name: 'Rules Created', value: '`Anti-Link`\n`Anti-Spam`\n`Anti-NSFW`\n`Anti-Toxicity`', inline: true },
            { name: 'Punishment', value: '`Block` + `1m Timeout`', inline: true }
          )
          .setFooter({ text: 'OfficialX Security' })
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
      } catch (error) {
        return interaction.editReply(`<:OfficialX:1494713504215601223> Error setting up AutoMod: ${error.message}`);
      }
    }
  }
};

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../database/mongodb');

const BOT_OWNER_ID = process.env.BOT_OWNER_ID || null;

function isBotOwner(userId) {
    return BOT_OWNER_ID && userId === BOT_OWNER_ID;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('servermanage')
        .setDescription('Manage bot settings across servers (Bot Owner Only)')
        .addSubcommand(subcommand =>
            subcommand
                .setName('toggle')
                .setDescription('Enable or disable bot in a server')
                .addStringOption(option => option.setName('server_id').setDescription('Server ID').setRequired(true))
                .addStringOption(option => option.setName('state').setDescription('Enable or Disable').setRequired(true).addChoices(
                    { name: 'Enable', value: 'enable' },
                    { name: 'Disable', value: 'disable' }
                )))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all servers the bot is in'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('info')
                .setDescription('Get server info')
                .addStringOption(option => option.setName('server_id').setDescription('Server ID').setRequired(true))),

    async execute(interaction) {
        if (!isBotOwner(interaction.user.id)) {
            return interaction.editReply({ content: '<:OfficialX:1494714913543684149> Only the bot owner can use this command.' });
        }

        const subcommand = interaction.options.getSubcommand();
        const themeColor = 0x0b0b0b;

        if (subcommand === 'toggle') {
            const serverId = interaction.options.getString('server_id');
            const state = interaction.options.getString('state') === 'enable' ? 1 : 0;

            try {
                db.prepare('INSERT OR IGNORE INTO server_config (guild_id) VALUES (?)').run(serverId);
                db.prepare('UPDATE server_config SET enabled = ? WHERE guild_id = ?').run(state, serverId);

                const embed = new EmbedBuilder()
                    .setColor(themeColor)
                    .setDescription(`<:OfficialX:1494713470065705020> Server **${serverId}** is now **${state ? 'Enabled' : 'Disabled'}**.`);

                interaction.editReply({ embeds: [embed] });
            } catch (e) {
                interaction.editReply('<:OfficialX:1494713504215601223> Failed to update server setting.');
            }
        }

        if (subcommand === 'list') {
            const guilds = [...interaction.client.guilds.cache.values()];
            if (guilds.length === 0) {
                return interaction.editReply('<:OfficialX:1494714913543684149> Bot is not in any servers.');
            }

            const serverList = guilds.map(g => {
                const config = db.prepare('SELECT enabled FROM server_config WHERE guild_id = ?').get(g.id);
                const enabled = config ? config.enabled !== 0 : true;
                return `<:dx:1494729984130945094> **${g.name}** (\`${g.id}\`) - ${enabled ? '<:OfficialX:1494713470065705020>' : '<:OfficialX:1494713504215601223>'}`;
            }).join('\n');

            const embed = new EmbedBuilder()
                .setColor(themeColor)
                .setTitle('Servers')
                .setDescription(serverList)
                .setFooter({ text: `Total: ${guilds.length} servers` });

            interaction.editReply({ embeds: [embed] });
        }

        if (subcommand === 'info') {
            const serverId = interaction.options.getString('server_id');
            const guild = interaction.client.guilds.cache.get(serverId);

            if (!guild) {
                return interaction.editReply('<:OfficialX:1494713504215601223> Server not found.');
            }

            const config = db.prepare('SELECT * FROM server_config WHERE guild_id = ?').get(serverId) || {};
            const enabled = config.enabled !== 0;

            const embed = new EmbedBuilder()
                .setColor(themeColor)
                .setAuthor({ name: guild.name, iconURL: guild.iconURL({ dynamic: true }) })
                .setDescription(
                    `**Server Information**\n\n` +
                    `<:dx:1494729984130945094> ID: \`${guild.id}\`\n` +
                    `<:dx:1494729984130945094> Owner: <@${guild.ownerId}>\n` +
                    `<:dx:1494729984130945094> Members: **${guild.memberCount}**\n` +
                    `<:dx:1494729984130945094> Channels: **${guild.channels.cache.size}**\n\n` +
                    `**Bot Configuration**\n\n` +
                    `<:dx:1494729984130945094> Status: **${enabled ? '<:OfficialX:1494713470065705020>' : '<:OfficialX:1494713504215601223>'}**\n` +
                    `<:dx:1494729984130945094> Prefix: **${config.prefix || ','}**\n` +
                    `<:dx:1494729984130945094> Anti-Nuke: **${config.anti_nuker ? '<:OfficialX:1494713470065705020>' : '<:OfficialX:1494713504215601223>'}**\n` +
                    `<:dx:1494729984130945094> Anti-Link: **${config.antilink ? '<:OfficialX:1494713470065705020>' : '<:OfficialX:1494713504215601223>'}**\n` +
                    `<:dx:1494729984130945094> Raid Prevention: **${config.raid_prevention ? '<:OfficialX:1494713470065705020>' : '<:OfficialX:1494713504215601223>'}**`
                );

            interaction.editReply({ embeds: [embed] });
        }
    }
};

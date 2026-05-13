const { Events, EmbedBuilder } = require('discord.js');
const db = require('../database/mongodb');

module.exports = {
    name: Events.GuildMemberAdd,
    async execute(member, client) {
        if (!member.guild) return;

        try {
            const config = db.prepare('SELECT autorole_enabled, autorole_id, anti_alt, anti_alt_days FROM server_config WHERE guild_id = ?').get(member.guild.id);
            if (!config) return;

            if (config.anti_alt === 1) {
                const minDays = config.anti_alt_days || 7;
                const accountAge = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);

                if (accountAge < minDays) {
                    await member.kick(`Anti-Alt: Account age (${Math.floor(accountAge)} days) is below the threshold of ${minDays} days.`).catch(() => null);

                    const logConfig = db.prepare('SELECT log_channel FROM server_config WHERE guild_id = ?').get(member.guild.id);
                    if (logConfig?.log_channel) {
                        const logChannel = member.guild.channels.cache.get(logConfig.log_channel);
                        if (logChannel) {
                            const logEmbed = new EmbedBuilder()
                                .setColor(0xff4757)
                                .setAuthor({ name: 'OfficialX Anti-Alt', iconURL: client.user.displayAvatarURL() })
                                .setDescription(`<:OfficialX:1494713470065705020> **Member Kicked**\n\n<:dx:1494729984130945094> **User:** ${member.user.tag}\n<:dx:1494729984130945094> **Age:** \`${Math.floor(accountAge)}\` days\n<:dx:1494729984130945094> **Threshold:** \`${minDays}\` days`)
                                .setTimestamp();
                            logChannel.send({ embeds: [logEmbed] }).catch(() => null);
                        }
                    }
                    return;
                }
            }

            if (config.autorole_enabled === 1 && config.autorole_id) {
                const role = member.guild.roles.cache.get(config.autorole_id);
                if (role && !member.user.bot) {
                    await member.roles.add(role).catch(() => null);
                }
            }
        } catch (e) {
            console.error('Error in guildMemberAdd event:', e);
        }
    }
};

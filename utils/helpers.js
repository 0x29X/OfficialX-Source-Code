const { EmbedBuilder } = require('discord.js');
const { COLORS, EMOJIS, OWNERS } = require('./constants');
const db = require('../database/mongodb');

module.exports = {
    isBotOwner: (userId) => userId === OWNERS.BOT_OWNER || OWNERS.DEVELOPERS.includes(userId),
    isServerOwner: (member) => member.id === member.guild.ownerId,

    isWhitelisted: (guildId, userId) => {
        const userWl = db.prepare('SELECT 1 FROM whitelists WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
        if (userWl) return true;

        return false;
    },

    canManageSettings: (member) => {
        return member.id === member.guild.ownerId || member.id === OWNERS.BOT_OWNER;
    },

    embed: (desc, color = COLORS.THEME) => {
        return new EmbedBuilder().setColor(color).setDescription(desc);
    },

    ok: (desc) => {
        return new EmbedBuilder()
            .setColor(COLORS.THEME)
            .setDescription(`${EMOJIS.OFFICIALX} ${desc}`);
    },

    err: (desc) => {
        return new EmbedBuilder()
            .setColor(COLORS.THEME)
            .setDescription(`${EMOJIS.ERROR} ${desc}`);
    },

    catEmbed: (categoryEmoji, title, desc) => {
        return new EmbedBuilder()
            .setColor(COLORS.THEME)
            .setAuthor({ name: title, iconURL: null })
            .setDescription(`${categoryEmoji} **${title}**\n\n${desc}`);
    },

    usage: (command, syntax) => {
        return new EmbedBuilder()
            .setColor(COLORS.THEME)
            .setDescription(`${EMOJIS.ERROR} Usage: \`${command} ${syntax}\``);
    }
};

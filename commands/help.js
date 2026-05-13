const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../database/mongodb');

const themeColor = 0x0b0b0b;
const arrow = '<:arrow_x:1500869256152219821>';

function getHomeEmbed(bot, prefix, guild) {
    return new EmbedBuilder()
        .setColor(themeColor)
        .setAuthor({ name: 'OfficialX', iconURL: guild?.iconURL({ dynamic: true }) || guild?.members.me.displayAvatarURL() || bot.user.displayAvatarURL() })
        .setThumbnail(guild?.members.me.displayAvatarURL() || bot.user.displayAvatarURL())
        .setDescription(
            `Prefix: \`${prefix}\` — 9 categories\n` +
            `<:linex:1500872780428742699>\n` +
            `Welcome to **OfficialX Security** — the most powerful Anti-Nuke and Moderation bot. Protect your server from attackers and manage your community with ease.\n\n` +
            `Use the dropdown below to explore categories or click **All Commands** for the full list.\n` +
            `<:linex:1500872780428742699>\n` +
            `[Invite Me](https://discord.com/api/oauth2/authorize?client_id=${bot.user.id}&permissions=8&scope=bot%20applications.commands) | [Support Server](https://discord.gg/ZJ7V63nufg)`
        );
}

function getAllCommandsEmbed(prefix, bot, guild) {
    const P = prefix;
    return new EmbedBuilder()
        .setColor(themeColor)
        .setAuthor({ name: 'OfficialX Security | All Commands', iconURL: guild?.iconURL({ dynamic: true }) || guild?.members.me.displayAvatarURL() || bot?.user.displayAvatarURL() })
        .setThumbnail(guild?.members.me.displayAvatarURL() || bot?.user.displayAvatarURL())
        .setDescription(
            `**<:OfficialX:1494711920719171765> Antinuke**\n` +
            `\`${P}antinuke (an)\`, \`${P}setup\`, \`${P}whitelist (wl)\`, \`${P}allow\`\n\n` +
            `**<:wa:1494731541568553132> Antiraid**\n` +
            `\`${P}antiraid\`, \`${P}antialt (aa)\`, \`${P}arsetup\`\n\n` +
            `**<:modx:1494732451451371703> Automod & Logging**\n` +
            `\`${P}antiselfbot\`, \`${P}antilink\`, \`${P}automod setup\`, \`${P}logging\`\n\n` +
            `**<:modx:1494732451451371703> Moderation**\n` +
            `\`${P}ban (b)\`, \`${P}kick (k)\`, \`${P}timeout (tm)\`, \`${P}purge (c)\`, \`${P}warn (w)\`, \`${P}lock (l)\`, \`${P}unlock (ul)\`, \`${P}slowmode (sm)\`, \`${P}role (r)\`, \`${P}steal\`, \`${P}hide\`\n\n` +
            `**<:OfficialX:1494711035876348055> Utility & Verification**\n` +
            `\`${P}afk\`, \`${P}avatar (av)\`, \`${P}banner (bn)\`, \`${P}userinfo (ui)\`, \`${P}serverinfo (si)\`, \`${P}snipe (s)\`, \`${P}stats\`, \`${P}ig\`, \`${P}tt\`, \`${P}yt\`, \`${P}verification\`\n\n` +
            `**<:OfficialX:1494710895702446181> Owner & Backup**\n` +
            `\`${P}owner status\`, \`${P}backup (create/restore/list)\`, \`${P}setprefix\`, \`${P}setup\`, \`${P}config\``
        )
        .setFooter({ text: 'OfficialX Security System' })
        .setTimestamp();
}

function getCategoryEmbed(category, prefix, bot, guild) {
    const P = prefix;
    const embed = new EmbedBuilder()
        .setColor(themeColor)
        .setAuthor({ name: 'OfficialX Help', iconURL: guild?.iconURL({ dynamic: true }) || guild?.members.me.displayAvatarURL() || bot?.user.displayAvatarURL() })
        .setThumbnail(guild?.members.me.displayAvatarURL() || bot?.user.displayAvatarURL())
        .setTimestamp();

    if (bot) {
        embed.setFooter({ text: 'OfficialX Security System', iconURL: guild?.members.me.displayAvatarURL() || bot.user.displayAvatarURL() });
    }

    switch (category) {
        case 'help_antinuke':
            embed.setAuthor({ name: 'Antinuke', iconURL: bot?.user.displayAvatarURL() })
                .setDescription(
                    `\n${arrow} \`${P}antinuke\` (\`${P}an\`)\n` +
                    `${arrow} \`${P}antinuke enable/disable/status\`\n` +
                    `${arrow} \`${P}setup\` — Auto-config everything\n` +
                    `<:linex:1500872780428742699>\n` +
                    `${arrow} \`${P}whitelist\` (\`${P}wl\`)\n` +
                    `${arrow} \`${P}whitelist add/remove <@user/ID>\`\n` +
                    `${arrow} \`${P}whitelist role-add/remove <@role/ID>\`\n` +
                    `${arrow} \`${P}allow <@user/role> <action>\`\n`)

            break;
        case 'help_antiraid':
            embed.setAuthor({ name: 'AntiRaid', iconURL: bot?.user.displayAvatarURL() })
                .setDescription(
                    `\n${arrow} \`${P}antiraid enable/disable/status\`\n` +
                    `${arrow} \`${P}antialt <days>\` (\`${P}aa\`)\n` +
                    `${arrow} \`${P}arsetup\` — Setup raid protection`
                );
            break;
        case 'help_automod':
            embed.setAuthor({ name: 'Automod', iconURL: bot?.user.displayAvatarURL() })
                .setDescription(
                    `\n${arrow} \`${P}antiselfbot enable/disable/status\`\n` +
                    `${arrow} \`${P}antilink on/off\`\n` +
                    `${arrow} \`${P}automod setup\``
                );
            break;
        case 'help_logging':
            embed.setAuthor({ name: 'Logging', iconURL: bot?.user.displayAvatarURL() })
                .setDescription(
                    `\n${arrow} \`${P}logging enable/disable/status\`\n` +
                    `${arrow} \`${P}logging setup\` — Configure log channels`
                );
            break;
        case 'help_moderation':
            embed.setAuthor({ name: 'Moderation', iconURL: bot?.user.displayAvatarURL() })
                .setDescription(
                    `\n${arrow} \`${P}ban\` (\`${P}b\`), \`${P}unban\` (\`${P}ub\`)\n` +
                    `${arrow} \`${P}kick\` (\`${P}k\`), \`${P}timeout\` (\`${P}tm\`)\n` +
                    `${arrow} \`${P}purge\` (\`${P}c\`), \`${P}purgeuser\` (\`${P}pu\`)\n` +
                    `${arrow} \`${P}lock\` (\`${P}l\`), \`${P}unlock\` (\`${P}ul\`)\n` +
                    `${arrow} \`${P}slowmode\` (\`${P}sm\`)\n` +
                    `${arrow} \`${P}warn\` (\`${P}w\`), \`${P}warns\` (\`${P}ws\`)\n` +
                    `${arrow} \`${P}rrole\` (\`${P}r\`), \`${P}roleall\` (\`${P}ra\`)\n` +
                    `${arrow} \`${P}steal\`, \`${P}hide\`, \`${P}unhide\``
                );
            break;
        case 'help_premium':
            embed.setAuthor({ name: 'Premium Commands', iconURL: bot?.user.displayAvatarURL() })
                .setDescription(
                    `*These commands are reserved for **Premium Users** only.*\n\n` +
                    `${arrow} \`${P}roleall\` (\`${P}ra\`) — Add/Remove role to **everyone**\n` +
                    `${arrow} \`${P}autorole\` (\`${P}ar\`) — Set role for **new members**\n` +
                    `${arrow} \`${P}setbotavatar\` (\`${P}sba\`) — Change bot's server avatar\n` +
                    `${arrow} \`${P}setbotnickname\` (\`${P}sbn\`) — Change bot's server name\n` +
                    `${arrow} \`${P}setabout\` (\`${P}sa\`) — Set bot's server bio\n` +
                    `${arrow} \`${P}setserveravatar\` (\`${P}ssa\`) — Change server icon\n` +
                    `${arrow} \`${P}resetserveravatar\` (\`${P}rsa\`) — Reset server icon\n` +
                    `${arrow} \`${P}antialt\` (\`${P}aa\`) — Kick new accounts`
                );
            break;
        case 'help_util':
            embed.setAuthor({ name: 'Utility', iconURL: bot?.user.displayAvatarURL() })
                .setDescription(
                    `\n${arrow} \`${P}afk\`\n` +
                    `${arrow} \`${P}avatar\` (\`${P}av\`)\n` +
                    `${arrow} \`${P}banner\` (\`${P}bn\`)\n` +
                    `${arrow} \`${P}userinfo\` (\`${P}ui\`)\n` +
                    `${arrow} \`${P}serverinfo\` (\`${P}si\`)\n` +
                    `${arrow} \`${P}snipe\` (\`${P}s\`)\n` +
                    `${arrow} \`${P}stats\`\n` +
                    `${arrow} \`${P}instagram\` (\`${P}ig\`)\n` +
                    `${arrow} \`${P}tiktok\` (\`${P}tt\`)\n` +
                    `${arrow} \`${P}youtube\` (\`${P}yt\`)`
                );
            break;
        case 'help_verification':
            embed.setAuthor({ name: 'Verification', iconURL: bot?.user.displayAvatarURL() })
                .setDescription(
                    `\n${arrow} \`${P}verification setup\`\n` +
                    `${arrow} \`${P}verification disable\`\n` +
                    `${arrow} \`${P}verification status\``
                );
            break;
        case 'help_owner':
            embed.setAuthor({ name: 'Owner', iconURL: bot?.user.displayAvatarURL() })
                .setDescription(
                    `\n${arrow} \`${P}owner status\`\n` +
                    `${arrow} \`${P}setprefix\`\n` +
                    `${arrow} \`${P}setup\`\n` +
                    `${arrow} \`${P}config\`\n` +
                    `<:linex:1500872780428742699>\n` +
                    `**Backup Commands**\n\n` +
                    `${arrow} \`${P}backup create\`\n` +
                    `${arrow} \`${P}backup restore\`\n` +
                    `${arrow} \`${P}backup list\``
                );
            break;
        default:
            embed.setDescription('No description available for this category.');
    }

    return embed;
}

function getComponents() {
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('help_home')
                .setLabel('Home')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('help_all')
                .setLabel('All Commands')
                .setStyle(ButtonStyle.Secondary)
        );

    const select = new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('help_category')
                .setPlaceholder('Choose')
                .addOptions([
                    { label: '1. Antinuke', value: 'help_antinuke', emoji: '1494711920719171765' },
                    { label: '2. Antiraid', value: 'help_antiraid', emoji: '1494731541568553132' },
                    { label: '3. Automod', value: 'help_automod', emoji: '1499124211090722996' },
                    { label: '4. Logging', value: 'help_logging', emoji: '1494710966246445227' },
                    { label: '5. Moderation', value: 'help_moderation', emoji: '1494711000471965696' },
                    { label: '6. Premium', value: 'help_premium', emoji: '1494712355899314298' },
                    { label: '7. Utility', value: 'help_util', emoji: '1494731801397035119' },
                    { label: '8. Verification', value: 'help_verification', emoji: '1494733051354157056' },
                    { label: '9. Owner', value: 'help_owner', emoji: '1494710895702446181' }
                ])
        );

    return [row, select];
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('OfficialX Help Menu'),
    async execute(input, client) {
        const bot = client || input.client;
        const guild = input.guild;
        const config = db.prepare('SELECT prefix FROM server_config WHERE guild_id = ?').get(guild.id);
        const prefix = config?.prefix || ',';
        const homeEmbed = getHomeEmbed(bot, prefix, guild);
        const components = getComponents();

        if (input.editReply) {
            await input.editReply({ embeds: [homeEmbed], components });
        } else if (input.reply) {
            await input.reply({ embeds: [homeEmbed], components });
        }
    },
    getHomeEmbed,
    getAllCommandsEmbed,
    getCategoryEmbed,
    getComponents
};